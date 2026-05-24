from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from models.db import RetirementAccount, RetirementAccountCreate, RetirementAccountUpdate
from database import get_session

router = APIRouter(prefix="/retirement", tags=["retirement"])


@router.get("/")
def list_accounts(session: Session = Depends(get_session)):
    """Return all retirement accounts ordered by creation."""
    return session.exec(select(RetirementAccount).order_by(RetirementAccount.id)).all()


@router.post("/")
def create_account(body: RetirementAccountCreate, session: Session = Depends(get_session)):
    """Create a new retirement account."""
    row = RetirementAccount(name=body.name.strip(), value=body.value)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.patch("/{account_id}")
def update_account(
    account_id: int,
    body: RetirementAccountUpdate,
    session: Session = Depends(get_session),
):
    """Update name and/or value of an existing account."""
    row = session.get(RetirementAccount, account_id)
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    if body.name is not None:
        row.name = body.name.strip()
    if body.value is not None:
        row.value = body.value
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.delete("/{account_id}")
def delete_account(account_id: int, session: Session = Depends(get_session)):
    """Delete a retirement account."""
    row = session.get(RetirementAccount, account_id)
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    session.delete(row)
    session.commit()
    return {"ok": True}
