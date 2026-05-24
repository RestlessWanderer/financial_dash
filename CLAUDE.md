# Stock Alert Tracker — Project Context

This file gives Claude context about this project for continued development.
Paste it at the start of a new conversation, or it will be auto-loaded by Claude Code.

---

## What This App Does

A locally-run stock monitoring web app. The user adds tickers to a watchlist, builds
alert rules using a visual if/and/or condition builder, and gets notified via in-app
browser pop-ups and optionally email when conditions are met.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, SQLModel, APScheduler |
| Database | SQLite (local, stored at `backend/data/stocks.db`) |
| Stock Data | yfinance + pandas-ta |
| Frontend | React 18, Vite, Tailwind CSS, Recharts |
| Container | Docker + Docker Compose |
| Notifications | Browser Notifications API + optional SMTP email (smtplib) |

**Removed / not present:** Twilio, SMS — these were explicitly removed. Do not re-add them.

---

## Project Structure

```
stock-tracker/
├── .devcontainer/devcontainer.json   # VS Code devcontainer
├── .env.example                      # SMTP config template (copy to .env)
├── .gitignore
├── Makefile                          # make start / make stop / etc.
├── docker-compose.yml                # backend (port 8000) + frontend (port 5173)
├── README.md
├── CLAUDE.md                         # ← this file
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                       # FastAPI app + lifespan (starts scheduler)
│   ├── database.py                   # SQLite engine, get_session, init_db
│   ├── models/
│   │   ├── __init__.py
│   │   └── db.py                     # SQLModel tables + Pydantic schemas
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── tickers.py                # GET/POST/DELETE /tickers, GET /tickers/{symbol}/indicators
│   │   └── alerts.py                 # CRUD /alerts/rules, GET /alerts/events, GET /alerts/pending, POST /alerts/run-now
│   └── services/
│       ├── __init__.py
│       ├── indicators.py             # fetch_indicators(), evaluate_rule_tree(), detect_mmbm(), detect_mmsm()
│       └── scheduler.py             # APScheduler, run_checks(), send_email(), pending_notifications list
└── frontend/
    ├── index.html
    ├── package.json                  # React 18, Vite, Tailwind, Recharts, lucide-react
    ├── vite.config.js                # Proxies /api → http://backend:8000
    ├── tailwind.config.js            # Custom palette: surface, panel, border, accent, green, red, muted
    ├── postcss.config.js
    └── src/
        ├── main.jsx                  # BrowserRouter, routes: / /alerts /history
        ├── index.css                 # Tailwind + .card, .badge-*, .animate-slide-in
        ├── api.js                    # All fetch calls to /api/*
        ├── components/
        │   ├── Layout.jsx            # Nav shell, mounts useAlertNotifications + ToastContainer
        │   ├── RuleBuilder.jsx       # Visual AND/OR block editor, recursive GroupBlock + ConditionRow
        │   └── ToastContainer.jsx    # Fixed bottom-right toast stack
        ├── hooks/
        │   └── useAlertNotifications.js  # Polls /alerts/pending every 30s, fires Notification API + toasts
        └── pages/
            ├── Dashboard.jsx         # Ticker cards, mini Recharts line chart, indicator badges, MMBM/MMSM flags
            ├── AlertsPage.jsx        # Rule list, New/Edit modal, presets, RuleBuilder, Run Now button
            └── HistoryPage.jsx       # Fired alert log with indicator snapshots
```

---

## Key Design Decisions

- **SQLite only** — no external database. Data lives in `backend/data/` which is a Docker volume so it persists across restarts. `make clean` wipes it (with a prompt).
- **No SMS / Twilio** — removed by user request. Notifications are browser pop-ups (Notification API) and optional SMTP email.
- **Notification flow** — scheduler appends to `pending_notifications` list in `scheduler.py`. Frontend polls `GET /alerts/pending` every 30s, which returns and clears the list.
- **MMBM/MMSM** — Market Maker Buy/Sell Model pattern detection in `indicators.py`. Uses a 10-bar lookback on daily candles by default. Exposed as boolean indicator keys (`mmbm_signal`, `mmsm_signal`, etc.) usable in the rule builder like any other indicator.
- **Rule tree format** — stored as JSON in SQLite. Shape: `{ op: "AND"|"OR", conditions: [leaf | group, ...] }`. Leaf: `{ indicator, operator, value }`. Evaluated recursively in `evaluate_rule_tree()`.
- **Vite proxy** — frontend calls `/api/*`, Vite proxies to `http://backend:8000`. This means the frontend never needs to know the backend's actual host.
- **Alert cooldown** — per-rule `cooldown_minutes` field prevents re-firing. Tracked via `last_fired` timestamp on the `AlertRule` table row.
- **Market hours** — scheduler only runs checks Mon–Fri 9:30–16:00 ET. The "Run Now" endpoint bypasses this for testing.

---

## Available Indicator Keys (for rule builder conditions)

`price`, `open`, `high`, `low`, `volume`, `volume_ratio`,
`rsi`, `macd`, `macd_signal`, `macd_hist`,
`sma_20`, `sma_50`, `sma_200`, `ema_12`, `ema_26`,
`bb_upper`, `bb_mid`, `bb_lower`,
`mmbm_sweep`, `mmbm_mss`, `mmbm_signal`,
`mmsm_sweep`, `mmsm_mss`, `mmsm_signal`

---

## Running Locally

```bash
cp .env.example .env   # add SMTP creds if you want email alerts
make start             # start containers (detached)
make stop              # stop containers
make logs              # follow all logs
make build             # rebuild after dependency changes
make clean             # wipe containers + SQLite data (prompts)
```

App: http://localhost:5173 — API docs: http://localhost:8000/docs

---

## User Preferences & Context

- Runs this on their **local laptop** via devcontainer / Docker Desktop
- Uses **VS Code** as their editor
- Interested in **ICT concepts** — MMBM/MMSM, liquidity sweeps, market structure shifts
- Wants a **clean web UI** they can watch during market hours, not a script runner
- No SMS. Browser pop-ups + email are the notification channels.
