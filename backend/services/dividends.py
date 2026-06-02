"""
Dividend Portfolio service.

Fetches dividend yield data for a curated universe of well-known
dividend-paying stocks in parallel and ranks them by yield.

Yield = annual_dividend / price.  A $10 stock paying $1/yr (10 %)
beats a $100 stock paying $5/yr (5 %) because the same $100 invested
buys 10× the shares of the first stock.
"""

import yfinance as yf
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Optional

# ~110 well-known dividend payers across sectors — the top 25 by live
# yield are surfaced in the UI.  Add / remove as desired.
DIVIDEND_UNIVERSE = [
    # Dividend Aristocrats & Champions
    "KO",   "PG",   "JNJ",  "MMM",  "ABT",  "ADP",  "APD",  "BDX",
    "CAT",  "CHD",  "CINF", "CL",   "CLX",  "CTAS", "CVX",  "DOV",
    "EMR",  "GPC",  "GWW",  "HRL",  "IBM",  "ITW",  "KMB",  "LOW",
    "MCD",  "MDT",  "MKC",  "NUE",  "PEP",  "PPG",  "SHW",  "SJM",
    "SWK",  "SYY",  "TGT",  "WMT",  "XOM",

    # Telecoms (historically high yield)
    "T",    "VZ",

    # REITs
    "O",    "NNN",  "VICI", "STAG", "WPC",  "ADC",  "EPRT", "KIM",
    "REG",  "SPG",  "PSA",  "EXR",  "PLD",  "VTR",  "WELL", "MPW",
    "AMT",  "CCI",

    # Business Development Companies
    "ARCC", "MAIN", "ORCC", "BXSL", "HTGC", "GBDC",

    # Utilities
    "NEE",  "D",    "SO",   "DUK",  "EXC",  "AEP",  "WEC",  "ES",
    "ETR",  "PPL",  "FE",   "PNW",  "SRE",  "XEL",  "CMS",

    # Energy & MLPs
    "OKE",  "EPD",  "ET",   "WMB",  "KMI",  "MPLX", "ENB",

    # Tobacco (highest-yield consumer staples)
    "PM",   "MO",   "BTI",

    # Consumer Staples
    "GIS",  "K",    "CPB",  "SJM",  "CAG",  "TSN",  "ADM",

    # Financials
    "JPM",  "BAC",  "WFC",  "USB",  "TFC",  "PNC",  "FITB",
    "KEY",  "CFG",  "MTB",  "HBAN", "RF",

    # Healthcare
    "ABBV", "PFE",  "MRK",  "BMY",  "AMGN", "GILD",

    # Tech (dividend payers)
    "CSCO", "INTC", "TXN",  "QCOM",

    # Materials / Chemicals
    "DOW",  "LYB",

    # Dividend & Income ETFs
    "SCHD",  # Schwab US Dividend Equity
    "VYM",   # Vanguard High Dividend Yield
    "VIG",   # Vanguard Dividend Appreciation
    "DVY",   # iShares Select Dividend (~5 %)
    "HDV",   # iShares Core High Dividend
    "DGRO",  # iShares Dividend Growth
    "SDY",   # SPDR S&P Dividend Aristocrats
    "SPHD",  # Invesco S&P 500 High Div / Low Vol
    "SPYD",  # SPDR S&P 500 High Dividend
    "FDVV",  # Fidelity High Dividend ETF
    "DIVO",  # Amplify CWP Enhanced Dividend Income (selective covered-call overlay, stable NAV)
    "PFF",   # iShares Preferred Stock & Income
    "PGX",   # Invesco Preferred ETF
    "PFFD",  # Global X U.S. Preferred ETF

    # NOTE — covered call ETFs intentionally excluded:
    # QYLD, XYLD, RYLD (Global X series) generate high stated yields by
    # systematically selling call options, but at the cost of NAV erosion —
    # the fund price depreciates steadily over time, making total return
    # negative for long-term holders despite the headline income.
    # JEPI / JEPQ are borderline (options overlay is selective, not full),
    # but excluded here for the same reason; add them manually via
    # "Add a ticker" if you want to track them as custom positions.
]


def fetch_one(symbol: str) -> Optional[dict]:
    """
    Fetch dividend info for one ticker via yfinance.
    Returns None if the ticker pays no dividend or if the fetch fails.
    """
    try:
        info = yf.Ticker(symbol).info

        # --- price ---
        price = (info.get("currentPrice")
                 or info.get("regularMarketPrice")
                 or info.get("previousClose"))
        if not price or float(price) <= 0:
            return None
        price = float(price)

        # --- dividend yield ---
        # Stocks:  trailingAnnualDividendYield is a decimal (e.g. 0.05)
        # ETFs:    trailingAnnualDividendYield is often 0.0; use 'yield' instead
        #          (also a decimal). Avoid 'dividendYield' — some ETFs return it
        #          as a whole percentage (e.g. 8.29) rather than a decimal.
        div_yield = float(
            info.get("trailingAnnualDividendYield") or
            info.get("yield") or
            0
        )
        if div_yield <= 0:
            return None

        # --- dividend rate (annual $ per share) ---
        # If not provided directly (common for ETFs), derive from yield × price.
        div_rate = float(
            info.get("trailingAnnualDividendRate") or
            info.get("dividendRate") or
            0
        )
        if div_rate <= 0:
            div_rate = div_yield * price   # derived

        # --- ex-dividend date (Unix ts → ISO string) ---
        ex_ts = info.get("exDividendDate")
        ex_date: Optional[str] = None
        if ex_ts:
            try:
                ex_date = datetime.utcfromtimestamp(int(ex_ts)).strftime("%Y-%m-%d")
            except Exception:
                pass

        payout = info.get("payoutRatio")

        return {
            "symbol":           symbol,
            "name":             info.get("longName") or info.get("shortName") or symbol,
            "sector":           info.get("sector") or info.get("category") or "—",
            "price":            round(price, 2),
            "annual_dividend":  round(div_rate, 4),
            "dividend_yield":   round(div_yield, 6),   # e.g. 0.0500 = 5.00 %
            "payout_ratio":     round(float(payout), 4) if payout else None,
            "ex_dividend_date": ex_date,
        }
    except Exception as e:
        print(f"[dividends] {symbol}: {e}")
        return None


def fetch_all_dividends(max_workers: int = 8) -> list[dict]:
    """
    Fetch the entire universe in parallel.
    Returns all valid tickers sorted by yield descending.
    """
    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_one, sym): sym for sym in DIVIDEND_UNIVERSE}
        for future in as_completed(futures):
            data = future.result()
            if data:
                results.append(data)

    results.sort(key=lambda x: x["dividend_yield"], reverse=True)
    print(f"[dividends] Fetched {len(results)} tickers with dividend data")
    return results
