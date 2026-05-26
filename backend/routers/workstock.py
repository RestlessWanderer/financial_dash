"""
Work Stock Plan router.

Handles two kinds of equity plan data:
  1. Manual accounts  — ESPP / RSU / Other  (simple CRUD, like Retirement)
  2. E*TRADE OAuth    — OAuth 1.0a PIN flow → live portfolio positions

E*TRADE API notes
-----------------
• Uses OAuth 1.0a ("three-legged", PIN / out-of-band variant).
• The standard retail API returns *portfolio positions* — vested shares
  that have already been deposited into the account.
• Unvested RSU grants and active ESPP purchase-period details live in
  E*TRADE's "Equity Edge" system, which requires corporate-admin credentials
  and is NOT accessible through the individual-account API.
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
import requests
from requests_oauthlib import OAuth1Session

from models.db import (
    WorkStockAccount, WorkStockAccountCreate, WorkStockAccountUpdate,
    ETradeCredential,
)
from database import get_session

router = APIRouter(prefix="/workstock", tags=["workstock"])

import logging

# E*TRADE endpoint constants
ETRADE_BASE_PROD    = "https://api.etrade.com"
ETRADE_BASE_SAND    = "https://apisb.etrade.com"
ETRADE_AUTH_URL     = "https://us.etrade.com/e/t/etws/authorize"


def _etrade_base(sandbox: bool) -> str:
    return ETRADE_BASE_SAND if sandbox else ETRADE_BASE_PROD


# ── helpers ──────────────────────────────────────────────────────────

def _get_or_create_cred(session: Session) -> ETradeCredential:
    row = session.get(ETradeCredential, 1)
    if not row:
        row = ETradeCredential(id=1)
        session.add(row)
        session.commit()
        session.refresh(row)
    return row


# ── Manual accounts ──────────────────────────────────────────────────

@router.get("/accounts")
def list_accounts(session: Session = Depends(get_session)):
    return session.exec(select(WorkStockAccount).order_by(WorkStockAccount.id)).all()


@router.post("/accounts")
def create_account(body: WorkStockAccountCreate, session: Session = Depends(get_session)):
    row = WorkStockAccount(**body.model_dump())
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.patch("/accounts/{account_id}")
def update_account(
    account_id: int,
    body: WorkStockAccountUpdate,
    session: Session = Depends(get_session),
):
    row = session.get(WorkStockAccount, account_id)
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.delete("/accounts/{account_id}")
def delete_account(account_id: int, session: Session = Depends(get_session)):
    row = session.get(WorkStockAccount, account_id)
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    session.delete(row)
    session.commit()
    return {"ok": True}


# ── E*TRADE: credentials ─────────────────────────────────────────────

@router.get("/etrade/status")
def etrade_status(session: Session = Depends(get_session)):
    """Return whether consumer credentials and/or access tokens are stored."""
    cred = _get_or_create_cred(session)
    return {
        "has_consumer":  bool(cred.consumer_key and cred.consumer_secret),
        "has_access":    bool(cred.access_token and cred.access_secret),
        "sandbox":       bool(cred.sandbox),
    }


@router.post("/etrade/credentials")
def save_credentials(body: dict, session: Session = Depends(get_session)):
    """Save the consumer key + secret from the E*TRADE developer portal."""
    cred = _get_or_create_cred(session)
    cred.consumer_key    = body.get("consumer_key", "").strip()
    cred.consumer_secret = body.get("consumer_secret", "").strip()
    # Clear any existing access tokens and sandbox flag when credentials change
    cred.access_token  = ""
    cred.access_secret = ""
    cred.sandbox       = False
    cred.updated_at    = datetime.utcnow()
    session.add(cred)
    session.commit()
    return {"ok": True}


# ── E*TRADE: OAuth flow ──────────────────────────────────────────────

@router.post("/etrade/start-auth")
def start_auth(session: Session = Depends(get_session)):
    """
    Step 1 of the OAuth flow.
    Gets a request token from E*TRADE and returns the authorization URL
    the user must visit to approve access.
    """
    cred = _get_or_create_cred(session)
    if not (cred.consumer_key and cred.consumer_secret):
        raise HTTPException(400, "Consumer key/secret not configured")

    base = _etrade_base(cred.sandbox)
    try:
        etrade = OAuth1Session(
            cred.consumer_key,
            client_secret=cred.consumer_secret,
            callback_uri="oob",  # out-of-band / PIN-based
        )
        tokens = etrade.fetch_request_token(f"{base}/oauth/request_token")
    except Exception as e:
        raise HTTPException(502, f"E*TRADE request-token error: {e}")

    # Persist the temporary request token
    cred.request_token  = tokens["oauth_token"]
    cred.request_secret = tokens["oauth_token_secret"]
    cred.updated_at     = datetime.utcnow()
    session.add(cred)
    session.commit()

    auth_url = (
        f"{ETRADE_AUTH_URL}"
        f"?key={cred.consumer_key}"
        f"&token={cred.request_token}"
    )
    return {"auth_url": auth_url}


@router.post("/etrade/complete-auth")
def complete_auth(body: dict, session: Session = Depends(get_session)):
    """
    Step 2 of the OAuth flow.
    Exchange the request token + user-supplied PIN (verifier) for an access token.
    """
    pin = str(body.get("pin", "")).strip()
    if not pin:
        raise HTTPException(400, "PIN is required")

    cred = _get_or_create_cred(session)
    if not (cred.request_token and cred.request_secret):
        raise HTTPException(400, "No pending auth — call /start-auth first")

    base = _etrade_base(cred.sandbox)
    try:
        etrade = OAuth1Session(
            cred.consumer_key,
            client_secret=cred.consumer_secret,
            resource_owner_key=cred.request_token,
            resource_owner_secret=cred.request_secret,
            verifier=pin,
        )
        tokens = etrade.fetch_access_token(f"{base}/oauth/access_token")
    except Exception as e:
        raise HTTPException(502, f"E*TRADE access-token error: {e}")

    cred.access_token   = tokens["oauth_token"]
    cred.access_secret  = tokens["oauth_token_secret"]
    cred.request_token  = ""   # clear ephemeral tokens
    cred.request_secret = ""
    cred.updated_at     = datetime.utcnow()
    session.add(cred)
    session.commit()
    return {"ok": True}


@router.delete("/etrade/disconnect")
def disconnect(session: Session = Depends(get_session)):
    """Remove stored access tokens (keeps consumer credentials)."""
    cred = _get_or_create_cred(session)
    cred.access_token   = ""
    cred.access_secret  = ""
    cred.request_token  = ""
    cred.request_secret = ""
    cred.updated_at     = datetime.utcnow()
    session.add(cred)
    session.commit()
    return {"ok": True}


# ── E*TRADE: data ────────────────────────────────────────────────────

@router.get("/etrade/portfolio")
def etrade_portfolio(session: Session = Depends(get_session)):
    """
    Fetch account list and portfolio positions from the E*TRADE API.

    Returns the standard retail portfolio — positions currently held in the
    account, including any vested ESPP/RSU shares that have been deposited.
    Unvested grants and active ESPP purchase windows are NOT available through
    this API (those require the Equity Edge corporate-admin endpoint).
    """
    cred = _get_or_create_cred(session)
    if not (cred.access_token and cred.access_secret):
        raise HTTPException(401, "Not connected to E*TRADE — complete OAuth first")

    def _session():
        return OAuth1Session(
            cred.consumer_key,
            client_secret=cred.consumer_secret,
            resource_owner_key=cred.access_token,
            resource_owner_secret=cred.access_secret,
        )

    base = _etrade_base(cred.sandbox)

    # 1. Fetch account list
    try:
        r = _session().get(f"{base}/v1/accounts/list.json")

        # Auto-detect sandbox key used against production endpoint
        if r.status_code == 401 and "consumer_key_rejected" in r.text and not cred.sandbox:
            logging.info("E*TRADE: consumer key is sandbox-only — switching to sandbox base URL and retrying")
            cred.sandbox    = True
            cred.updated_at = datetime.utcnow()
            session.add(cred)
            session.commit()
            base = ETRADE_BASE_SAND
            r = _session().get(f"{base}/v1/accounts/list.json")

        if r.status_code == 401:
            # Genuine auth failure (expired token or bad credentials) — clear tokens
            cred.access_token  = ""
            cred.access_secret = ""
            cred.updated_at    = datetime.utcnow()
            session.add(cred)
            session.commit()
            raise HTTPException(
                401,
                "E*TRADE session expired — tokens are valid only until midnight ET each day. "
                "Please reconnect your account.",
            )

        r.raise_for_status()
        accounts_data = r.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"E*TRADE accounts error: {e}")

    accounts = (
        accounts_data.get("AccountListResponse", {})
                     .get("Accounts", {})
                     .get("Account", [])
    )
    if not isinstance(accounts, list):
        accounts = [accounts]

    # 2. Fetch portfolio for each account
    results = []
    for acct in accounts:
        key  = acct.get("accountIdKey", "")
        desc = acct.get("accountDesc", "")
        try:
            r = _session().get(
                f"{base}/v1/accounts/{key}/portfolio.json"
            )
            r.raise_for_status()
            port_data = r.json()
        except Exception:
            results.append({"accountIdKey": key, "accountDesc": desc, "positions": []})
            continue

        positions_raw = (
            port_data.get("PortfolioResponse", {})
                     .get("AccountPortfolio", [{}])[0]
                     .get("Position", [])
        )
        if not isinstance(positions_raw, list):
            positions_raw = [positions_raw]

        positions = []
        for p in positions_raw:
            pos_type = p.get("positionType", "")
            complete  = p.get("Complete", {})
            product   = p.get("Product", {})
            positions.append({
                "symbol":       product.get("symbol", ""),
                "description":  p.get("symbolDescription", ""),
                "quantity":     complete.get("quantity", 0),
                "currentPrice": complete.get("currentPrice", 0),
                "marketValue":  complete.get("marketValue", 0),
                "gainLoss":     complete.get("totalGain", 0),
                "positionType": pos_type,
            })

        total_value = sum(p["marketValue"] for p in positions)
        results.append({
            "accountIdKey": key,
            "accountDesc":  desc,
            "positions":    positions,
            "totalValue":   total_value,
        })

    return {"accounts": results}
