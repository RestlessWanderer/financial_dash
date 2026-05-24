import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from models.db import Ticker, TickerCreate, IndicatorCache
from services.indicators import fetch_indicators, INDICATOR_META
from database import get_session

router = APIRouter(prefix="/tickers", tags=["tickers"])


@router.get("/")
def list_tickers(session: Session = Depends(get_session)):
    tickers = session.exec(select(Ticker).where(Ticker.active == True)).all()
    result = []
    for t in tickers:
        cache = session.exec(
            select(IndicatorCache).where(IndicatorCache.symbol == t.symbol)
        ).first()
        indicators = json.loads(cache.data) if cache else {}
        result.append({
            "id": t.id,
            "symbol": t.symbol,
            "name": t.name,
            "added_at": t.added_at,
            "indicators": indicators,
            "cache_age_minutes": (
                round((datetime.utcnow() - cache.fetched_at).total_seconds() / 60, 1)
                if cache else None
            ),
        })
    return result


@router.post("/")
def add_ticker(body: TickerCreate, session: Session = Depends(get_session)):
    symbol = body.symbol.upper().strip()
    existing = session.exec(select(Ticker).where(Ticker.symbol == symbol)).first()
    if existing:
        if not existing.active:
            existing.active = True
            session.add(existing)
            session.commit()
            session.refresh(existing)
            return existing
        raise HTTPException(status_code=400, detail=f"{symbol} already in watchlist")

    # Validate ticker exists
    data = fetch_indicators(symbol)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Could not fetch data for {symbol}")

    ticker = Ticker(symbol=symbol, name=body.name or symbol)
    session.add(ticker)
    session.commit()
    session.refresh(ticker)

    # Seed cache
    cache = IndicatorCache(
        symbol=symbol,
        data=json.dumps({k: v for k, v in data.items() if k != "history"}),
    )
    session.add(cache)
    session.commit()

    return ticker


@router.delete("/{symbol}")
def remove_ticker(symbol: str, session: Session = Depends(get_session)):
    ticker = session.exec(select(Ticker).where(Ticker.symbol == symbol.upper())).first()
    if not ticker:
        raise HTTPException(status_code=404, detail="Ticker not found")
    ticker.active = False
    session.add(ticker)
    session.commit()
    return {"ok": True}


@router.get("/{symbol}/indicators")
def get_indicators(symbol: str, session: Session = Depends(get_session)):
    """Fetch fresh indicators for a ticker (triggers yfinance download)."""
    data = fetch_indicators(symbol.upper())
    if data is None:
        raise HTTPException(status_code=404, detail="Could not fetch data")

    # Update cache
    cache = session.exec(
        select(IndicatorCache).where(IndicatorCache.symbol == symbol.upper())
    ).first()
    if cache:
        cache.data = json.dumps({k: v for k, v in data.items() if k != "history"})
        cache.fetched_at = datetime.utcnow()
    else:
        cache = IndicatorCache(
            symbol=symbol.upper(),
            data=json.dumps({k: v for k, v in data.items() if k != "history"}),
        )
    session.add(cache)
    session.commit()

    return data


@router.get("/meta/indicators")
def indicator_meta():
    """Returns the indicator metadata for the rule builder UI."""
    return INDICATOR_META
