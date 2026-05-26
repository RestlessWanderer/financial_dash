from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from models.db import BrokerageAccount, BrokerageAccountCreate, BrokerageAccountUpdate
from database import get_session

router = APIRouter(prefix="/brokerage", tags=["brokerage"])


@router.get("/")
def list_accounts(session: Session = Depends(get_session)):
    """Return all brokerage accounts ordered by creation."""
    return session.exec(select(BrokerageAccount).order_by(BrokerageAccount.id)).all()


@router.post("/")
def create_account(body: BrokerageAccountCreate, session: Session = Depends(get_session)):
    """Create a new brokerage account."""
    row = BrokerageAccount(
        name=body.name.strip(),
        account_type=body.account_type,
        value=body.value,
        notes=body.notes,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.patch("/{account_id}")
def update_account(
    account_id: int,
    body: BrokerageAccountUpdate,
    session: Session = Depends(get_session),
):
    """Update an existing brokerage account."""
    row = session.get(BrokerageAccount, account_id)
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    if body.name         is not None: row.name         = body.name.strip()
    if body.account_type is not None: row.account_type = body.account_type
    if body.value        is not None: row.value        = body.value
    if body.notes        is not None: row.notes        = body.notes
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.delete("/{account_id}")
def delete_account(account_id: int, session: Session = Depends(get_session)):
    """Delete a brokerage account."""
    row = session.get(BrokerageAccount, account_id)
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    session.delete(row)
    session.commit()
    return {"ok": True}
