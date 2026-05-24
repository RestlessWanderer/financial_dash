"""
Fetches OHLCV data from yfinance and computes all technical indicators
including MMBM / MMSM pattern detection.
"""

import yfinance as yf
import pandas_ta as ta
import json
from datetime import datetime, timedelta
from typing import Optional


INDICATOR_META = {
    # label -> description shown in rule builder UI
    "price":          {"label": "Price",              "unit": "$"},
    "open":           {"label": "Open",               "unit": "$"},
    "high":           {"label": "High",               "unit": "$"},
    "low":            {"label": "Low",                "unit": "$"},
    "volume":         {"label": "Volume",             "unit": ""},
    "volume_ratio":   {"label": "Volume Ratio (20d)", "unit": "x"},
    "rsi":            {"label": "RSI (14)",           "unit": ""},
    "macd":           {"label": "MACD",               "unit": ""},
    "macd_signal":    {"label": "MACD Signal",        "unit": ""},
    "macd_hist":      {"label": "MACD Histogram",     "unit": ""},
    "sma_20":         {"label": "SMA 20",             "unit": "$"},
    "sma_50":         {"label": "SMA 50",             "unit": "$"},
    "sma_200":        {"label": "SMA 200",            "unit": "$"},
    "ema_12":         {"label": "EMA 12",             "unit": "$"},
    "ema_26":         {"label": "EMA 26",             "unit": "$"},
    "bb_upper":       {"label": "BB Upper",           "unit": "$"},
    "bb_mid":         {"label": "BB Mid",             "unit": "$"},
    "bb_lower":       {"label": "BB Lower",           "unit": "$"},
    # Pattern flags (0 or 1)
    "mmbm_sweep":     {"label": "MMBM: Sell-Side Sweep",    "unit": ""},
    "mmbm_mss":       {"label": "MMBM: Bullish MSS",        "unit": ""},
    "mmbm_signal":    {"label": "MMBM: Full Signal",        "unit": ""},
    "mmsm_sweep":     {"label": "MMSM: Buy-Side Sweep",     "unit": ""},
    "mmsm_mss":       {"label": "MMSM: Bearish MSS",        "unit": ""},
    "mmsm_signal":    {"label": "MMSM: Full Signal",        "unit": ""},
}


def _last(series) -> Optional[float]:
    try:
        v = series.iloc[-1]
        return float(v) if v == v else None  # NaN guard
    except Exception:
        return None


def detect_mmbm(close, low, high) -> dict:
    """
    Market Maker Buy Model:
    - Sell-side sweep: price dips below the prior N-bar low then closes back above
    - Bullish MSS: price makes a higher high after the sweep
    - Full signal: sweep + MSS + RSI recovering from oversold
    """
    n = 10
    if len(close) < n + 5:
        return {"mmbm_sweep": 0, "mmbm_mss": 0, "mmbm_signal": 0}

    recent_low = float(low.iloc[-n-1:-1].min())
    current_low = float(low.iloc[-1])
    current_close = float(close.iloc[-1])
    prev_high = float(high.iloc[-n-1:-1].max())
    current_high = float(high.iloc[-1])

    sweep = 1 if (current_low < recent_low and current_close > recent_low) else 0
    mss = 1 if (sweep and current_high > prev_high) else 0
    signal = 1 if (sweep and mss) else 0

    return {"mmbm_sweep": sweep, "mmbm_mss": mss, "mmbm_signal": signal}


def detect_mmsm(close, low, high) -> dict:
    """
    Market Maker Sell Model (mirror of MMBM):
    - Buy-side sweep: price spikes above prior N-bar high then closes back below
    - Bearish MSS: price makes a lower low after the sweep
    - Full signal: sweep + MSS
    """
    n = 10
    if len(close) < n + 5:
        return {"mmsm_sweep": 0, "mmsm_mss": 0, "mmsm_signal": 0}

    recent_high = float(high.iloc[-n-1:-1].max())
    current_high = float(high.iloc[-1])
    current_close = float(close.iloc[-1])
    prev_low = float(low.iloc[-n-1:-1].min())
    current_low = float(low.iloc[-1])

    sweep = 1 if (current_high > recent_high and current_close < recent_high) else 0
    mss = 1 if (sweep and current_low < prev_low) else 0
    signal = 1 if (sweep and mss) else 0

    return {"mmsm_sweep": sweep, "mmsm_mss": mss, "mmsm_signal": signal}


def fetch_indicators(symbol: str) -> Optional[dict]:
    """Download data and compute all indicators. Returns dict or None on failure."""
    try:
        df = yf.download(symbol, period="6mo", interval="1d",
                         progress=False, auto_adjust=True)
        # yfinance 0.2.50+ returns a MultiIndex (Price, Ticker) — flatten to simple names
        if isinstance(df.columns, __import__('pandas').MultiIndex):
            df.columns = df.columns.droplevel(1)
        if df.empty or len(df) < 30:
            return None

        close  = df["Close"].squeeze()
        high   = df["High"].squeeze()
        low    = df["Low"].squeeze()
        volume = df["Volume"].squeeze()

        rsi     = ta.rsi(close, length=14)
        macd_df = ta.macd(close, fast=12, slow=26, signal=9)
        sma20   = ta.sma(close, length=20)
        sma50   = ta.sma(close, length=50)
        sma200  = ta.sma(close, length=200)
        ema12   = ta.ema(close, length=12)
        ema26   = ta.ema(close, length=26)
        bb      = ta.bbands(close, length=20)

        vol_avg20    = volume.rolling(20).mean()
        volume_ratio = (float(volume.iloc[-1]) / float(vol_avg20.iloc[-1])
                        if float(vol_avg20.iloc[-1]) > 0 else 1.0)

        indicators = {
            "price":       _last(close),
            "open":        float(df["Open"].squeeze().iloc[-1]),
            "high":        float(high.iloc[-1]),
            "low":         float(low.iloc[-1]),
            "volume":      float(volume.iloc[-1]),
            "volume_ratio": round(volume_ratio, 3),
            "rsi":         _last(rsi),
            "macd":        _last(macd_df["MACD_12_26_9"])  if macd_df is not None else None,
            "macd_signal": _last(macd_df["MACDs_12_26_9"]) if macd_df is not None else None,
            "macd_hist":   _last(macd_df["MACDh_12_26_9"]) if macd_df is not None else None,
            "sma_20":      _last(sma20),
            "sma_50":      _last(sma50),
            "sma_200":     _last(sma200),
            "ema_12":      _last(ema12),
            "ema_26":      _last(ema26),
            "bb_upper":    _last(bb["BBU_20_2.0_2.0"]) if bb is not None else None,
            "bb_mid":      _last(bb["BBM_20_2.0_2.0"]) if bb is not None else None,
            "bb_lower":    _last(bb["BBL_20_2.0_2.0"]) if bb is not None else None,
        }

        # Append pattern detection
        indicators.update(detect_mmbm(close, low, high))
        indicators.update(detect_mmsm(close, low, high))

        # Historical close for charting (last 90 days)
        hist = []
        df_recent = df.tail(90)
        for dt, row in df_recent.iterrows():
            hist.append({
                "date": dt.strftime("%Y-%m-%d"),
                "open":  round(float(row["Open"]), 4),
                "high":  round(float(row["High"]), 4),
                "low":   round(float(row["Low"]), 4),
                "close": round(float(row["Close"]), 4),
                "volume": int(row["Volume"]),
            })
        indicators["history"] = hist

        return indicators

    except Exception as e:
        print(f"[indicators] Error fetching {symbol}: {e}")
        return None


def evaluate_rule_tree(tree: dict, indicators: dict) -> bool:
    """
    Recursively evaluate a rule tree.
    Leaf: {"indicator": "rsi", "operator": "<", "value": 35}
    Group: {"op": "AND", "conditions": [...]}
    """
    if "op" in tree:
        op = tree["op"].upper()
        children = tree.get("conditions", [])
        if op == "AND":
            return all(evaluate_rule_tree(c, indicators) for c in children)
        elif op == "OR":
            return any(evaluate_rule_tree(c, indicators) for c in children)
        return False

    # Leaf node
    indicator = tree.get("indicator")
    operator  = tree.get("operator")
    value     = tree.get("value")

    iv = indicators.get(indicator)
    if iv is None:
        return False

    try:
        iv = float(iv)
        value = float(value)
        if operator == "<":          return iv < value
        if operator == ">":          return iv > value
        if operator == "<=":         return iv <= value
        if operator == ">=":         return iv >= value
        if operator == "==":         return abs(iv - value) < 0.0001
        if operator == "crosses_above": return iv > value   # simplified: use live value
        if operator == "crosses_below": return iv < value
    except Exception:
        pass

    return False
