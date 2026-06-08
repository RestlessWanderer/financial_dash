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

# Screened dividend universe — two yield tiers shown in the UI:
#   High yield  ≥ 5.0%  → income-focused positions
#   Mid yield   2.5–4.9% → quality dividend growers with wide/narrow moat
# Add / remove as desired.  Covered call ETFs intentionally excluded (see note below).
DIVIDEND_UNIVERSE = [
    # ── Dividend Aristocrats & Champions ──────────────────────────────────
    # Wide-moat compounders; many sit in the mid-yield tier at current prices
    "KO",   "PG",   "JNJ",  "MMM",  "ABT",  "ADP",  "APD",  "BDX",
    "CAT",  "CHD",  "CINF", "CL",   "CLX",  "CTAS", "CVX",  "DOV",
    "EMR",  "GPC",  "GWW",  "HRL",  "IBM",  "ITW",  "KMB",  "LOW",
    "MCD",  "MDT",  "MKC",  "NUE",  "PEP",  "PPG",  "SHW",  "SJM",
    "SWK",  "SYY",  "TGT",  "WMT",  "XOM",

    # ── Telecoms ──────────────────────────────────────────────────────────
    "T",    "VZ",

    # ── REITs ─────────────────────────────────────────────────────────────
    "O",    "NNN",  "VICI", "STAG", "WPC",  "ADC",  "EPRT", "KIM",
    "REG",  "SPG",  "PSA",  "EXR",  "PLD",  "VTR",  "WELL", "MPW",
    "AMT",  "CCI",

    # ── Business Development Companies ───────────────────────────────────
    "ARCC", "MAIN", "ORCC", "BXSL", "HTGC", "GBDC",

    # ── Utilities ─────────────────────────────────────────────────────────
    "NEE",  "D",    "SO",   "DUK",  "EXC",  "AEP",  "WEC",  "ES",
    "ETR",  "PPL",  "FE",   "PNW",  "SRE",  "XEL",  "CMS",

    # ── Energy & MLPs ─────────────────────────────────────────────────────
    "OKE",  "EPD",  "ET",   "WMB",  "KMI",  "MPLX", "ENB",

    # ── Tobacco ───────────────────────────────────────────────────────────
    "PM",   "MO",   "BTI",

    # ── Consumer Staples ──────────────────────────────────────────────────
    "GIS",  "K",    "CPB",  "CAG",  "TSN",  "ADM",

    # ── Financials ────────────────────────────────────────────────────────
    "JPM",  "BAC",  "WFC",  "USB",  "TFC",  "PNC",  "FITB",
    "KEY",  "CFG",  "MTB",  "HBAN", "RF",

    # ── Healthcare ────────────────────────────────────────────────────────
    "ABBV", "PFE",  "MRK",  "BMY",  "AMGN", "GILD",

    # ── Technology (dividend payers) ──────────────────────────────────────
    "CSCO", "INTC", "TXN",  "QCOM", "MSFT", "AAPL",

    # ── Industrials ───────────────────────────────────────────────────────
    "HON",  "GD",   "RTX",  "LMT",  "NOC",  "MMM",  "UPS",  "FDX",

    # ── Materials / Chemicals ─────────────────────────────────────────────
    "DOW",  "LYB",  "NEM",  "FCX",

    # ── Mid-yield quality growers (2.5–4.9% at typical valuations) ────────
    # Strong moat characteristics: pricing power, brand, network effects
    "V",    "MA",   "AXP",                          # Payment networks
    "BLK",  "GS",   "MS",                           # Asset mgmt / banking
    "TJX",  "COST",                                 # Retail compounders
    "ACN",  "PAYX", "ADP",                          # Professional services
    "WST",  "ROP",  "FAST",                         # Industrial/diversified
    "AFL",  "CB",   "AIG",  "MET",                  # Insurance
    "BX",   "KKR",  "APO",                          # Alternative asset mgmt
    "TROW", "BEN",                                  # Traditional asset mgmt
    "ECL",  "SHW",  "RPM",                          # Specialty chemicals
    "WM",   "RSG",                                  # Waste management (moat = local monopoly)
    "OTIS", "CARR",                                 # Industrial equipment
    "CHRW", "EXPD",                                 # Logistics
    "UNH",  "CVS",  "CI",                           # Healthcare / managed care
    "MCO",  "SPGI",                                 # Rating agencies / data (wide moat)

    # ── Dividend & Income ETFs ─────────────────────────────────────────────
    "SCHD",  # Schwab US Dividend Equity
    "VYM",   # Vanguard High Dividend Yield
    "VIG",   # Vanguard Dividend Appreciation
    "DVY",   # iShares Select Dividend
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

# De-duplicate (some symbols appear in multiple comment sections above)
DIVIDEND_UNIVERSE = list(dict.fromkeys(DIVIDEND_UNIVERSE))


def _compute_moat(roe, roa, gross_m, op_m, de) -> tuple[float, str]:
    """
    Compute a 0–100 moat score from quality fundamentals.

    Scoring components (each 0–100 within its dimension, then weighted):
      ROE         25 pts — ≥ 20% = full marks; scales linearly from 0 at 0%
      Gross margin 25 pts — ≥ 45% = full marks
      Op margin    20 pts — ≥ 20% = full marks
      ROA          15 pts — ≥ 10% = full marks
      D/E (inverse) 15 pts — ≤ 50 = full marks; ≥ 200 = 0

    Label:  score ≥ 65 → "Wide",  35–64 → "Narrow",  < 35 → "Weak"
    Any component that is None is treated as 0 (conservative).
    """
    def clamp(v, lo, hi): return max(lo, min(hi, v))

    roe_score   = clamp((roe  or 0) / 0.20,  0, 1) * 25
    roa_score   = clamp((roa  or 0) / 0.10,  0, 1) * 15
    gm_score    = clamp((gross_m or 0) / 0.45, 0, 1) * 25
    om_score    = clamp((op_m or 0) / 0.20,  0, 1) * 20
    # D/E: lower is better; ≤ 50 → full 15 pts; ≥ 200 → 0
    if de is None:
        de_score = 7.5   # neutral when unknown
    else:
        de_score = clamp(1 - (de - 50) / 150, 0, 1) * 15

    score = round(roe_score + roa_score + gm_score + om_score + de_score, 1)
    label = "Wide" if score >= 65 else "Narrow" if score >= 35 else "Weak"
    return score, label


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
        beta   = info.get("beta")

        # --- quality / moat metrics ---
        roe    = info.get("returnOnEquity")
        roa    = info.get("returnOnAssets")
        gm     = info.get("grossMargins")
        om     = info.get("operatingMargins")
        pm     = info.get("profitMargins")
        rev_g  = info.get("revenueGrowth")
        earn_g = info.get("earningsGrowth")
        de     = info.get("debtToEquity")
        fcf    = info.get("freeCashflow")
        mcap   = info.get("marketCap")

        def _f(v): return round(float(v), 6) if v is not None else None

        moat_score, moat_label = _compute_moat(roe, roa, gm, om, de)

        return {
            "symbol":           symbol,
            "name":             info.get("longName") or info.get("shortName") or symbol,
            "sector":           info.get("sector") or info.get("category") or "—",
            "price":            round(price, 2),
            "annual_dividend":  round(div_rate, 4),
            "dividend_yield":   round(div_yield, 6),   # e.g. 0.0500 = 5.00 %
            "payout_ratio":     round(float(payout), 4) if payout else None,
            "beta":             round(float(beta), 3)  if beta   else None,
            "ex_dividend_date": ex_date,
            # quality
            "return_on_equity":  _f(roe),
            "return_on_assets":  _f(roa),
            "gross_margins":     _f(gm),
            "operating_margins": _f(om),
            "profit_margins":    _f(pm),
            "revenue_growth":    _f(rev_g),
            "earnings_growth":   _f(earn_g),
            "debt_to_equity":    _f(de),
            "free_cashflow":     float(fcf)  if fcf  is not None else None,
            "market_cap":        float(mcap) if mcap is not None else None,
            "moat_score":        moat_score,
            "moat_label":        moat_label,
        }
    except Exception as e:
        print(f"[dividends] {symbol}: {e}")
        return None


MIN_YIELD_FLOOR = 0.025  # 2.5% — minimum to appear in either tier

def fetch_all_dividends(max_workers: int = 8) -> list[dict]:
    """
    Fetch the entire universe in parallel.
    Returns all tickers with yield >= 2.5%, sorted by yield descending.
    The frontend splits them into high (>=5%) and mid (2.5-4.9%) tiers.
    """
    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_one, sym): sym for sym in DIVIDEND_UNIVERSE}
        for future in as_completed(futures):
            data = future.result()
            if data and data["dividend_yield"] >= MIN_YIELD_FLOOR:
                results.append(data)

    results.sort(key=lambda x: x["dividend_yield"], reverse=True)
    print(f"[dividends] Fetched {len(results)} tickers with dividend yield >= {MIN_YIELD_FLOOR*100:.1f}%")
    return results
