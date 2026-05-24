"""
Consumer staples average retail prices from the BLS Average Price series (APU).

All 8 items are fetched in a single POST request (BLS v1 supports batch).
Results are cached for 24 hours — same TTL as the inflation service.

Series IDs used (national urban, not seasonally adjusted):
  APU0000708111  Eggs, grade A, large, per dozen
  APU0000709112  Milk, fresh, whole, per gallon
  APU0000702111  Bread, white, pan, per lb
  APU0000703112  Ground beef, 100% beef, per lb
  APU0000706111  Chicken, fresh, whole, per lb
  APU0000717311  Coffee, 100% ground roast, per lb
  APU000074714   Gasoline, unleaded regular, per gallon
  APU000072511   Electricity, per KWH
"""

import httpx
from datetime import datetime, timedelta

_BLS_URL   = "https://api.bls.gov/publicAPI/v1/timeseries/data/"
_CACHE_TTL = timedelta(hours=24)

STAPLES = [
    {"series_id": "APU0000708111", "name": "Eggs",        "unit": "dozen",  "emoji": "🥚"},
    {"series_id": "APU0000709112", "name": "Milk",         "unit": "gallon", "emoji": "🥛"},
    {"series_id": "APU0000702111", "name": "Bread",        "unit": "lb",     "emoji": "🍞"},
    {"series_id": "APU0000703112", "name": "Ground Beef",  "unit": "lb",     "emoji": "🥩"},
    {"series_id": "APU0000706111", "name": "Chicken",      "unit": "lb",     "emoji": "🍗"},
    {"series_id": "APU0000717311", "name": "Coffee",       "unit": "lb",     "emoji": "☕"},
    {"series_id": "APU000074714",  "name": "Gasoline",     "unit": "gallon", "emoji": "⛽"},
    {"series_id": "APU000072511",  "name": "Electricity",  "unit": "kWh",    "emoji": "⚡"},
]

_cache: dict = {"items": None, "fetched_at": None}

_MONTH_NAMES = {
    "M01": "Jan", "M02": "Feb", "M03": "Mar", "M04": "Apr",
    "M05": "May", "M06": "Jun", "M07": "Jul", "M08": "Aug",
    "M09": "Sep", "M10": "Oct", "M11": "Nov", "M12": "Dec",
}


def get_staple_prices() -> dict:
    """
    Return the latest average retail price for each tracked staple.

    Returns a dict:
      items      – list of {series_id, name, unit, emoji, price, period}
      fetched_at – ISO timestamp of last successful BLS call
      stale      – True if we returned cached data after a failed refresh
    """
    now = datetime.utcnow()

    if (
        _cache["items"] is not None
        and _cache["fetched_at"]
        and (now - _cache["fetched_at"]) < _CACHE_TTL
    ):
        return _build_result(stale=False)

    try:
        series_ids = [s["series_id"] for s in STAPLES]
        with httpx.Client(timeout=15) as client:
            resp = client.post(_BLS_URL, json={"seriesid": series_ids})
            resp.raise_for_status()
            payload = resp.json()

        # Build series_id → latest data-point lookup
        price_map: dict = {}
        for series in payload.get("Results", {}).get("series", []):
            sid  = series["seriesID"]
            data = series.get("data", [])
            if not data:
                continue
            latest     = data[0]
            month_code = latest["period"]
            year       = latest["year"]
            period     = f"{_MONTH_NAMES.get(month_code, month_code)} {year}"
            try:
                price_map[sid] = {"price": float(latest["value"]), "period": period}
            except (ValueError, KeyError):
                pass

        items = []
        for staple in STAPLES:
            entry = price_map.get(staple["series_id"])
            if entry:
                items.append({
                    "series_id": staple["series_id"],
                    "name":      staple["name"],
                    "unit":      staple["unit"],
                    "emoji":     staple["emoji"],
                    "price":     entry["price"],
                    "period":    entry["period"],
                })

        _cache["items"]      = items
        _cache["fetched_at"] = now
        print(f"[staples] Fetched {len(items)}/{len(STAPLES)} price series from BLS")
        return _build_result(stale=False)

    except Exception as exc:
        print(f"[staples] BLS fetch failed: {exc}")
        return _build_result(stale=True)


def _build_result(stale: bool) -> dict:
    return {
        "items":      _cache["items"] or [],
        "fetched_at": _cache["fetched_at"].isoformat() if _cache["fetched_at"] else None,
        "stale":      stale,
    }
