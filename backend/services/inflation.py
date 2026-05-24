"""
Inflation service — fetches the current US CPI-U year-over-year rate
from the BLS public API (no API key required).

Series: CUSR0000SA0  (CPI-U, All items, not seasonally adjusted)
Rate  : (latest_cpi / cpi_12_months_ago - 1) × 100

Data is published monthly (~2 weeks after the reference month).
We cache the result for 24 hours so we never hammer the BLS endpoint.
"""

import httpx
from datetime import datetime, timedelta
from typing import Optional

_BLS_URL  = "https://api.bls.gov/publicAPI/v1/timeseries/data/CUSR0000SA0"
_CACHE_TTL = timedelta(hours=24)

_cache: dict = {"rate": None, "period": None, "fetched_at": None}

_MONTH_NAMES = {
    "M01": "Jan", "M02": "Feb", "M03": "Mar", "M04": "Apr",
    "M05": "May", "M06": "Jun", "M07": "Jul", "M08": "Aug",
    "M09": "Sep", "M10": "Oct", "M11": "Nov", "M12": "Dec",
}


def get_inflation() -> dict:
    """
    Return the current YoY CPI-U inflation rate.

    Returns a dict:
      rate       – float, e.g. 3.2  (percent)
      period     – str,   e.g. "Mar 2025"
      fetched_at – ISO timestamp of when we last called BLS
      source     – description string
      stale      – True if we returned cached data after a failed refresh
    """
    now = datetime.utcnow()

    # Return cache if still fresh
    if (
        _cache["rate"] is not None
        and _cache["fetched_at"]
        and (now - _cache["fetched_at"]) < _CACHE_TTL
    ):
        return _build_result(stale=False)

    # Try to refresh
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(_BLS_URL)
            resp.raise_for_status()
            payload = resp.json()

        series_data = payload["Results"]["series"][0]["data"]
        # Data arrives most-recent first; we need entries 0 and 12
        if len(series_data) < 13:
            raise ValueError("Not enough CPI history in BLS response")

        latest   = float(series_data[0]["value"])
        year_ago = float(series_data[12]["value"])
        rate     = round((latest / year_ago - 1) * 100, 2)

        month_code = series_data[0]["period"]          # e.g. "M03"
        year       = series_data[0]["year"]            # e.g. "2025"
        period     = f"{_MONTH_NAMES.get(month_code, month_code)} {year}"

        _cache["rate"]       = rate
        _cache["period"]     = period
        _cache["fetched_at"] = now
        print(f"[inflation] CPI-U YoY: {rate}% ({period})")
        return _build_result(stale=False)

    except Exception as exc:
        print(f"[inflation] BLS fetch failed: {exc}")
        # Return stale cache if we have it; otherwise None
        return _build_result(stale=True)


def _build_result(stale: bool) -> dict:
    return {
        "rate":       _cache["rate"],
        "period":     _cache["period"],
        "fetched_at": _cache["fetched_at"].isoformat() if _cache["fetched_at"] else None,
        "source":     "BLS CPI-U (CUSR0000SA0) — Year-over-Year",
        "stale":      stale,
    }
