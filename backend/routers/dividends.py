from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, SQLModel

from models.db import DividendSnapshot, DividendHolding
from services.dividends import fetch_all_dividends, fetch_one, DIVIDEND_UNIVERSE
from database import get_session


class HoldingUpdate(SQLModel):
    shares_owned: float = 0.0


class AddTickerRequest(SQLModel):
    symbol: str


router = APIRouter(prefix="/dividends", tags=["dividends"])

TOP_N = 25


@router.get("/")
def get_top_dividends(session: Session = Depends(get_session)):
    """Return the cached top-N screened stocks plus any user-added tickers."""
    # Which symbols has the user manually added?
    user_holdings = session.exec(
        select(DividendHolding).where(DividendHolding.user_added == True)
    ).all()
    user_symbols = {h.symbol for h in user_holdings}

    # Top-N screened snapshots sorted by yield
    top_rows = session.exec(
        select(DividendSnapshot)
        .order_by(DividendSnapshot.dividend_yield.desc())
        .limit(TOP_N)
    ).all()
    top_symbols = {r.symbol for r in top_rows}

    # User-added tickers not already in the top-N (e.g. low-yield custom tickers)
    extra_rows = []
    for sym in user_symbols:
        if sym not in top_symbols:
            row = session.get(DividendSnapshot, sym)
            if row:
                extra_rows.append(row)

    stocks = []
    for r in list(top_rows) + extra_rows:
        d = r.model_dump()
        d["user_added"] = r.symbol in user_symbols
        stocks.append(d)

    return {
        "stocks":       stocks,
        "last_updated": top_rows[0].fetched_at.isoformat() if top_rows else None,
        "count":        len(stocks),
    }


@router.post("/refresh")
def refresh_dividends(session: Session = Depends(get_session)):
    """
    Re-fetch the entire screened universe and repopulate the cache.
    User-added tickers are NOT deleted during a refresh.
    Takes ~15-30 s depending on network.  Returns the new top-N list.
    """
    print("[dividends] Refresh started…")
    data = fetch_all_dividends()

    # Protect user-added tickers from being swept
    user_holdings = session.exec(
        select(DividendHolding).where(DividendHolding.user_added == True)
    ).all()
    protected = {h.symbol for h in user_holdings}

    now = datetime.utcnow()
    fetched_symbols = {d["symbol"] for d in data}

    # Delete screened tickers that dropped out of the universe (but keep user-added)
    existing = session.exec(select(DividendSnapshot)).all()
    for row in existing:
        if row.symbol not in fetched_symbols and row.symbol not in protected:
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


@router.get("/lookup/{symbol}")
def lookup_ticker(symbol: str, session: Session = Depends(get_session)):
    """
    Look up dividend data for a symbol without persisting anything.
    Used by the retirement page to get dividend rates without polluting
    the dividend portfolio tracker.
    Returns the snapshot from cache if available, otherwise fetches live.
    """
    sym = symbol.strip().upper()
    if not sym:
        raise HTTPException(status_code=422, detail="Symbol cannot be empty")

    # Check cache first
    snap = session.get(DividendSnapshot, sym)
    if snap:
        return snap.model_dump()

    # Not cached — fetch live but don't store
    data = fetch_one(sym)
    if not data:
        raise HTTPException(
            status_code=404,
            detail=f"No dividend data found for '{sym}'. The ticker may not exist or may not currently pay a dividend.",
        )
    return data


@router.post("/tickers")
def add_user_ticker(body: AddTickerRequest, session: Session = Depends(get_session)):
    """
    Add a custom ticker to the dividend tracker.
    Fetches live data from yfinance and stores it. The ticker will persist
    across refreshes and always appear in the dividend table.
    """
    sym = body.symbol.strip().upper()
    if not sym:
        raise HTTPException(status_code=422, detail="Symbol cannot be empty")

    print(f"[dividends] Fetching user-added ticker: {sym}")
    data = fetch_one(sym)
    if not data:
        raise HTTPException(
            status_code=404,
            detail=f"No dividend data found for '{sym}'. The ticker may not exist or may not currently pay a dividend.",
        )

    now = datetime.utcnow()

    # Upsert snapshot
    snap = session.get(DividendSnapshot, sym)
    if snap:
        for k, v in data.items():
            setattr(snap, k, v)
        snap.fetched_at = now
    else:
        snap = DividendSnapshot(**data, fetched_at=now)
    session.add(snap)

    # Upsert holding — mark as user_added
    holding = session.get(DividendHolding, sym)
    if holding:
        holding.user_added = True
        holding.updated_at = now
    else:
        holding = DividendHolding(symbol=sym, shares_owned=0.0, user_added=True)
    session.add(holding)

    session.commit()

    result = snap.model_dump()
    result["user_added"] = True
    return result


@router.delete("/tickers/{symbol}")
def remove_user_ticker(symbol: str, session: Session = Depends(get_session)):
    """Remove a user-added custom ticker."""
    sym = symbol.upper()

    holding = session.get(DividendHolding, sym)
    if not holding or not holding.user_added:
        raise HTTPException(status_code=404, detail=f"'{sym}' is not a user-added ticker")

    session.delete(holding)

    # Only remove the snapshot if it's not part of the screened universe
    # (we don't want to wipe SCHD from the cache just because a user un-tracks it)
    if sym not in DIVIDEND_UNIVERSE:
        snap = session.get(DividendSnapshot, sym)
        if snap:
            session.delete(snap)

    session.commit()
    return {"deleted": sym}


@router.get("/holdings")
def get_holdings(session: Session = Depends(get_session)):
    """Return a dict of symbol → shares_owned for all tracked holdings."""
    rows = session.exec(select(DividendHolding)).all()
    return {r.symbol: r.shares_owned for r in rows}


@router.patch("/holdings/{symbol}")
def update_holding(symbol: str, body: HoldingUpdate, session: Session = Depends(get_session)):
    """Create or update shares owned for a single symbol."""
    sym = symbol.upper()
    row = session.get(DividendHolding, sym)
    if row:
        row.shares_owned = body.shares_owned
        row.updated_at   = datetime.utcnow()
    else:
        row = DividendHolding(symbol=sym, shares_owned=body.shares_owned)
    session.add(row)
    session.commit()
    return {"symbol": sym, "shares_owned": row.shares_owned}
