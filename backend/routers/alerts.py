import json
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from models.db import AlertRule, AlertRuleCreate, AlertRuleUpdate, AlertEvent
from database import get_session

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/rules")
def list_rules(session: Session = Depends(get_session)):
    rules = session.exec(select(AlertRule)).all()
    return [
        {**r.dict(), "rule_tree": json.loads(r.rule_tree)}
        for r in rules
    ]


@router.post("/rules")
def create_rule(body: AlertRuleCreate, session: Session = Depends(get_session)):
    rule = AlertRule(
        ticker_symbol=body.ticker_symbol.upper(),
        name=body.name,
        rule_tree=json.dumps(body.rule_tree),
        cooldown_minutes=body.cooldown_minutes,
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return {**rule.dict(), "rule_tree": json.loads(rule.rule_tree)}


@router.patch("/rules/{rule_id}")
def update_rule(rule_id: int, body: AlertRuleUpdate, session: Session = Depends(get_session)):
    rule = session.get(AlertRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if body.name is not None:
        rule.name = body.name
    if body.rule_tree is not None:
        rule.rule_tree = json.dumps(body.rule_tree)
    if body.cooldown_minutes is not None:
        rule.cooldown_minutes = body.cooldown_minutes
    if body.enabled is not None:
        rule.enabled = body.enabled

    session.add(rule)
    session.commit()
    session.refresh(rule)
    return {**rule.dict(), "rule_tree": json.loads(rule.rule_tree)}


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, session: Session = Depends(get_session)):
    rule = session.get(AlertRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    session.delete(rule)
    session.commit()
    return {"ok": True}


@router.get("/events")
def list_events(limit: int = 50, session: Session = Depends(get_session)):
    events = session.exec(
        select(AlertEvent).order_by(AlertEvent.triggered_at.desc()).limit(limit)
    ).all()
    return [
        {**e.dict(), "indicator_snapshot": json.loads(e.indicator_snapshot)}
        for e in events
    ]


@router.get("/pending")
def get_pending():
    """
    Returns queued browser notifications and clears the queue.
    The frontend polls this every 30s to show pop-up alerts.
    """
    from services.scheduler import pending_notifications
    items = list(pending_notifications)
    pending_notifications.clear()
    return items


@router.post("/run-now")
def run_now():
    """Manually trigger an alert check (useful for testing outside market hours)."""
    from services.scheduler import run_checks
    from database import engine
    run_checks(engine)
    return {"ok": True, "message": "Alert check triggered"}
