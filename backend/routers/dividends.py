from datetime import datetime
from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from models.db import DividendSnapshot
from services.dividends import fetch_all_dividends
from database import get_session

router = APIRouter(prefix="/dividends", tags=["dividends"])

TOP_N = 25


@router.get("/")
def get_top_dividends(session: Session = Depends(get_session)):
    """Return the cached top-N dividend stocks sorted by yield."""
    rows = session.exec(
        select(DividendSnapshot)
        .order_by(DividendSnapshot.dividend_yield.desc())
        .limit(TOP_N)
    ).all()

    return {
        "stocks":       [r.model_dump() for r in rows],
        "last_updated": rows[0].fetched_at.isoformat() if rows else None,
        "count":        len(rows),
    }


@router.post("/refresh")
def refresh_dividends(session: Session = Depends(get_session)):
    """
    Re-fetch the entire universe and repopulate the cache.
    Takes ~15-30 s depending on network.  Returns the new top-N list.
    """
    print("[dividends] Refresh started…")
    data = fetch_all_dividends()

    # Upsert — replace each row by primary key
    now = datetime.utcnow()
    fetched_symbols = {d["symbol"] for d in data}

    # Delete tickers that are no longer in the valid set
    existing = session.exec(select(DividendSnapshot)).all()
    for row in existing:
        if row.symbol not in fetched_symbols:
            session.delete(row)

    for item in data:
        row = session.get(DividendSnapshot, item["symbol"])
        if row:
            for k, v in item.items():
                setattr(row, k, v)
            row.fetched_at = now
        else:
            row = DividendSnapshot(**item, fetched_at=now)
        session.add(row)

    session.commit()
    print(f"[dividends] Refresh complete — {len(data)} rows stored")

    top = data[:TOP_N]
    return {
        "stocks":       top,
        "last_updated": now.isoformat(),
        "count":        len(top),
    }
