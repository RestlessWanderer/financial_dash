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


class DividendHolding(SQLModel, table=True):
    """Tracks how many shares of each dividend stock the user actually owns."""
    symbol:       str      = Field(primary_key=True)
    shares_owned: float    = Field(default=0.0)
    user_added:   bool     = Field(default=False)   # True = manually added by user
    updated_at:   datetime = Field(default_factory=datetime.utcnow)


class DividendSnapshot(SQLModel, table=True):
    """One row per ticker — refreshed in bulk, queried sorted by yield."""
    symbol:           str            = Field(primary_key=True)
    name:             str            = Field(default="")
    sector:           str            = Field(default="—")
    price:            float          = Field(default=0.0)
    annual_dividend:  float          = Field(default=0.0)
    dividend_yield:   float          = Field(default=0.0)  # decimal, e.g. 0.05 = 5 %
    payout_ratio:     Optional[float] = None
    beta:             Optional[float] = None
    ex_dividend_date: Optional[str]  = None
    fetched_at:       datetime       = Field(default_factory=datetime.utcnow)


class LiquidAccount(SQLModel, table=True):
    """A manually-tracked liquid account (checking, savings, HYSA, etc.)."""
    id:           Optional[int]   = Field(default=None, primary_key=True)
    name:         str             = Field(default="")
    account_type: str             = Field(default="Checking")  # Checking | Savings | HYSA | Money Market | CD | Other
    value:        float           = Field(default=0.0)
    apy:          Optional[float] = Field(default=None)        # Annual Percentage Yield, e.g. 4.5 = 4.5%
    updated_at:   datetime        = Field(default_factory=datetime.utcnow)


class LiquidAccountCreate(SQLModel):
    name:         str
    account_type: str            = "Checking"
    value:        float          = 0.0
    apy:          Optional[float] = None


class LiquidAccountUpdate(SQLModel):
    name:         Optional[str]   = None
    account_type: Optional[str]   = None
    value:        Optional[float] = None
    apy:          Optional[float] = None


class RetirementAccount(SQLModel, table=True):
    """A manually-tracked retirement account (401k, IRA, Roth, etc.)."""
    id:         Optional[int] = Field(default=None, primary_key=True)
    name:       str           = Field(default="")
    value:      float         = Field(default=0.0)
    updated_at: datetime      = Field(default_factory=datetime.utcnow)


class RetirementAccountCreate(SQLModel):
    name:  str
    value: float = 0.0


class RetirementAccountUpdate(SQLModel):
    name:  Optional[str]   = None
    value: Optional[float] = None


class Asset(SQLModel, table=True):
    """A manually-tracked physical or financial asset (car, property, etc.)."""
    id:         Optional[int] = Field(default=None, primary_key=True)
    name:       str           = Field(default="")
    value:      float         = Field(default=0.0)   # current market value
    debt:       float         = Field(default=0.0)   # outstanding loan/balance
    updated_at: datetime      = Field(default_factory=datetime.utcnow)


class AssetCreate(SQLModel):
    name:  str
    value: float = 0.0
    debt:  float = 0.0


class AssetUpdate(SQLModel):
    name:  Optional[str]   = None
    value: Optional[float] = None
    debt:  Optional[float] = None


class WorkStockAccount(SQLModel, table=True):
    """Manually-tracked ESPP, RSU, or other equity plan."""
    id:         Optional[int] = Field(default=None, primary_key=True)
    name:       str           = Field(default="")
    plan_type:  str           = Field(default="Other")   # "ESPP" | "RSU" | "Other"
    ticker:     Optional[str] = None
    value:      float         = Field(default=0.0)
    notes:      Optional[str] = None
    updated_at: datetime      = Field(default_factory=datetime.utcnow)


class WorkStockAccountCreate(SQLModel):
    name:      str
    plan_type: str           = "Other"
    ticker:    Optional[str] = None
    value:     float         = 0.0
    notes:     Optional[str] = None


class WorkStockAccountUpdate(SQLModel):
    name:      Optional[str]   = None
    plan_type: Optional[str]   = None
    ticker:    Optional[str]   = None
    value:     Optional[float] = None
    notes:     Optional[str]   = None


class ETradeCredential(SQLModel, table=True):
    """
    Singleton row (id=1) storing E*TRADE OAuth credentials.
    consumer_key / consumer_secret come from the E*TRADE developer portal.
    request_token / request_secret are temporary (during the OAuth handshake).
    access_token / access_secret are persisted after a successful auth.
    """
    id:             int      = Field(default=1, primary_key=True)
    consumer_key:   str      = Field(default="")
    consumer_secret: str     = Field(default="")
    # ephemeral — stored only between start-auth and complete-auth
    request_token:  str      = Field(default="")
    request_secret: str      = Field(default="")
    # durable — stored after successful OAuth
    access_token:   str      = Field(default="")
    access_secret:  str      = Field(default="")
    # True when the consumer key only works against E*TRADE's sandbox environment
    sandbox:        bool     = Field(default=False)
    updated_at:     datetime = Field(default_factory=datetime.utcnow)


class BrokerageAccount(SQLModel, table=True):
    """A manually-tracked brokerage account (taxable investment account)."""
    id:           Optional[int] = Field(default=None, primary_key=True)
    name:         str           = Field(default="")
    account_type: str           = Field(default="Taxable")  # Taxable | Crypto | HSA | Other
    value:        float         = Field(default=0.0)
    notes:        Optional[str] = None
    updated_at:   datetime      = Field(default_factory=datetime.utcnow)


class BrokerageAccountCreate(SQLModel):
    name:         str
    account_type: str           = "Taxable"
    value:        float         = 0.0
    notes:        Optional[str] = None


class BrokerageAccountUpdate(SQLModel):
    name:         Optional[str]   = None
    account_type: Optional[str]   = None
    value:        Optional[float] = None
    notes:        Optional[str]   = None


class SettingsUpdate(SQLModel):
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_from_number: Optional[str] = None
    twilio_to_number: Optional[str] = None
