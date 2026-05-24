from datetime import datetime
from typing import Optional, List
from sqlmodel import SQLModel, Field, JSON, Column
import json


class Ticker(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(index=True, unique=True)
    name: Optional[str] = None
    added_at: datetime = Field(default_factory=datetime.utcnow)
    active: bool = True


class AlertRule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    ticker_symbol: str = Field(index=True)
    name: str
    # JSON-encoded rule tree: {"op": "AND", "conditions": [...]}
    rule_tree: str = Field(default="{}")
    cooldown_minutes: int = Field(default=60)
    enabled: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_fired: Optional[datetime] = None


class AlertEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    rule_id: int = Field(index=True)
    rule_name: str
    ticker_symbol: str
    triggered_at: datetime = Field(default_factory=datetime.utcnow)
    indicator_snapshot: str = Field(default="{}")  # JSON


class IndicatorCache(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(index=True, unique=True)
    data: str = Field(default="{}")   # JSON of latest indicators
    fetched_at: datetime = Field(default_factory=datetime.utcnow)


# ── Pydantic schemas (request/response) ──────────────────────────

class TickerCreate(SQLModel):
    symbol: str
    name: Optional[str] = None


class RuleCondition(SQLModel):
    """A single leaf condition, e.g. rsi < 35"""
    indicator: str      # e.g. "rsi", "price", "macd"
    operator: str       # "<", ">", "<=", ">=", "==", "crosses_above", "crosses_below"
    value: float        # numeric threshold


class RuleGroup(SQLModel):
    """A group of conditions joined by AND / OR, can nest"""
    op: str                                     # "AND" | "OR"
    conditions: List[dict]                      # RuleCondition | RuleGroup


class AlertRuleCreate(SQLModel):
    ticker_symbol: str
    name: str
    rule_tree: dict        # RuleGroup as dict
    cooldown_minutes: int = 60


class AlertRuleUpdate(SQLModel):
    name: Optional[str] = None
    rule_tree: Optional[dict] = None
    cooldown_minutes: Optional[int] = None
    enabled: Optional[bool] = None


class DividendSnapshot(SQLModel, table=True):
    """One row per ticker — refreshed in bulk, queried sorted by yield."""
    symbol:           str            = Field(primary_key=True)
    name:             str            = Field(default="")
    sector:           str            = Field(default="—")
    price:            float          = Field(default=0.0)
    annual_dividend:  float          = Field(default=0.0)
    dividend_yield:   float          = Field(default=0.0)  # decimal, e.g. 0.05 = 5 %
    payout_ratio:     Optional[float] = None
    ex_dividend_date: Optional[str]  = None
    fetched_at:       datetime       = Field(default_factory=datetime.utcnow)


class SettingsUpdate(SQLModel):
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_from_number: Optional[str] = None
    twilio_to_number: Optional[str] = None
