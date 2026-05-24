"""
Background scheduler — runs every 15 minutes during market hours,
evaluates all enabled alert rules, sends email notification on match.
"""

import json
import os
import smtplib
from email.mime.text import MIMEText
from datetime import datetime
from typing import Optional

import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from sqlmodel import Session, select

from models.db import AlertRule, AlertEvent, IndicatorCache
from services.indicators import fetch_indicators, evaluate_rule_tree

scheduler = BackgroundScheduler(timezone="America/New_York")


def is_market_open() -> bool:
    et  = pytz.timezone("America/New_York")
    now = datetime.now(et)
    if now.weekday() >= 5:
        return False
    open_t  = now.replace(hour=9,  minute=30, second=0, microsecond=0)
    close_t = now.replace(hour=16, minute=0,  second=0, microsecond=0)
    return open_t <= now <= close_t


def send_email(subject: str, body: str) -> bool:
    """Send an alert email via SMTP. Configure via environment variables."""
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    email_to  = os.getenv("ALERT_EMAIL_TO", smtp_user)

    if not all([smtp_host, smtp_user, smtp_pass]):
        print("[email] SMTP not configured — skipping email")
        return False

    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"]    = smtp_user
        msg["To"]      = email_to

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)

        print(f"[email] Sent: {subject}")
        return True
    except Exception as e:
        print(f"[email] Error: {e}")
        return False


# In-memory store for alerts pending browser notification
# Shape: { rule_id: [alert_dict, ...] }
pending_notifications: list[dict] = []


def run_checks(engine):
    if not is_market_open():
        print(f"[scheduler] Market closed at {datetime.now().strftime('%H:%M')} — skipping")
        return

    print(f"\n[scheduler] Running checks at {datetime.now().strftime('%H:%M:%S')}")

    with Session(engine) as session:
        rules = session.exec(
            select(AlertRule).where(AlertRule.enabled == True)
        ).all()

        if not rules:
            return

        symbols = list({r.ticker_symbol for r in rules})
        indicator_map = {}
        for sym in symbols:
            data = fetch_indicators(sym)
            if data:
                indicator_map[sym] = data
                cache = session.exec(
                    select(IndicatorCache).where(IndicatorCache.symbol == sym)
                ).first()
                payload = json.dumps({k: v for k, v in data.items() if k != "history"})
                if cache:
                    cache.data = payload
                    cache.fetched_at = datetime.utcnow()
                else:
                    cache = IndicatorCache(symbol=sym, data=payload)
                session.add(cache)

        session.commit()

        now = datetime.utcnow()
        for rule in rules:
            indicators = indicator_map.get(rule.ticker_symbol)
            if not indicators:
                continue

            if rule.last_fired:
                elapsed = (now - rule.last_fired).total_seconds() / 60
                if elapsed < rule.cooldown_minutes:
                    continue

            try:
                tree = json.loads(rule.rule_tree)
                triggered = evaluate_rule_tree(tree, indicators)
            except Exception as e:
                print(f"[scheduler] Rule eval error ({rule.name}): {e}")
                continue

            if triggered:
                snapshot = {k: v for k, v in indicators.items() if k != "history"}

                subject = f"🚨 Stock Alert: {rule.name} ({rule.ticker_symbol})"
                body = (
                    f"Alert: {rule.name}\n"
                    f"Ticker: {rule.ticker_symbol}\n"
                    f"Price:  ${indicators.get('price', 'N/A'):.2f}\n"
                    f"RSI:    {indicators.get('rsi', 'N/A')}\n"
                    f"Vol ×:  {indicators.get('volume_ratio', 'N/A')}\n"
                    f"MMBM:   {'✅' if indicators.get('mmbm_signal') else '—'}  "
                    f"MMSM: {'✅' if indicators.get('mmsm_signal') else '—'}\n"
                    f"Time:   {now.strftime('%Y-%m-%d %H:%M')} UTC"
                )
                send_email(subject, body)

                # Queue for browser pop-up notification
                pending_notifications.append({
                    "rule_name":    rule.name,
                    "ticker":       rule.ticker_symbol,
                    "price":        indicators.get("price"),
                    "triggered_at": now.isoformat(),
                })

                event = AlertEvent(
                    rule_id=rule.id,
                    rule_name=rule.name,
                    ticker_symbol=rule.ticker_symbol,
                    triggered_at=now,
                    indicator_snapshot=json.dumps(snapshot),
                )
                session.add(event)

                rule.last_fired = now
                session.add(rule)
                print(f"[scheduler] ✅ ALERT FIRED: {rule.name} ({rule.ticker_symbol})")
            else:
                print(f"[scheduler] — {rule.name} ({rule.ticker_symbol}): not triggered")

        session.commit()


def start_scheduler(engine):
    scheduler.add_job(
        run_checks,
        trigger="cron",
        minute="*/5",
        day_of_week="mon-fri",
        hour="9-16",
        args=[engine],
        id="alert_checks",
        replace_existing=True,
    )
    scheduler.start()
    print("[scheduler] Started — checks every 5 min during market hours")


def stop_scheduler():
    scheduler.shutdown(wait=False)
