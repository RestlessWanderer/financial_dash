from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from models.db import LiquidAccount, LiquidAccountCreate, LiquidAccountUpdate
from database import get_session

router = APIRouter(prefix="/liquid", tags=["liquid"])


@router.get("/")
def list_accounts(session: Session = Depends(get_session)):
    """Return all liquid accounts ordered by creation."""
    return session.exec(select(LiquidAccount).order_by(LiquidAccount.id)).all()


@router.post("/")
def create_account(body: LiquidAccountCreate, session: Session = Depends(get_session)):
    """Create a new liquid account."""
    row = LiquidAccount(
        name=body.name.strip(),
        account_type=body.account_type,
        value=body.value,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.patch("/{account_id}")
def update_account(
    account_id: int,
    body: LiquidAccountUpdate,
    session: Session = Depends(get_session),
):
    """Update name, type, and/or value of an existing account."""
    row = session.get(LiquidAccount, account_id)
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    if body.name         is not None: row.name         = body.name.strip()
    if body.account_type is not None: row.account_type = body.account_type
    if body.value        is not None: row.value        = body.value
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.delete("/{account_id}")
def delete_account(account_id: int, session: Session = Depends(get_session)):
    """Delete a liquid account."""
    row = session.get(LiquidAccount, account_id)
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    session.delete(row)
    session.commit()
    return {"ok": True}
