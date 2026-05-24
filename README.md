# Financial Wellness

A locally-run personal finance web app. Monitor your stock watchlist with live indicators and pattern alerts, plan your dividend income portfolio, and track your mortgage payoff progress — all from a single dashboard running entirely on your laptop via Docker.

---

## Project File Structure

```
stock-tracker/
├── .devcontainer/
│   └── devcontainer.json           # VS Code devcontainer config
├── backend/
│   ├── Dockerfile                  # Python container
│   ├── requirements.txt            # Python dependencies
│   ├── main.py                     # FastAPI app entry point
│   ├── database.py                 # SQLite engine + session
│   ├── models/
│   │   ├── __init__.py
│   │   └── db.py                   # DB tables + request/response schemas
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── tickers.py              # Watchlist CRUD + indicator fetch
│   │   ├── alerts.py               # Alert rules, events, notifications
│   │   └── dividends.py            # Dividend snapshot + holdings endpoints
│   └── services/
│       ├── __init__.py
│       ├── indicators.py           # yfinance + pandas-ta + MMBM/MMSM/SKS detection
│       ├── dividends.py            # Parallel dividend data fetcher (~120 tickers)
│       └── scheduler.py            # APScheduler (5-min checks) + email notifications
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.jsx                # React entry point + routing
│       ├── index.css               # Global styles + Tailwind
│       ├── api.js                  # API client
│       ├── components/
│       │   ├── Layout.jsx          # App shell + nav
│       │   ├── RuleBuilder.jsx     # Visual if/and/or condition builder
│       │   └── ToastContainer.jsx  # In-app alert pop-ups
│       ├── hooks/
│       │   └── useAlertNotifications.js  # Polls backend, fires browser notifications
│       └── pages/
│           ├── Dashboard.jsx       # Stock watchlist rows + mini sparkline charts
│           ├── AlertsPage.jsx      # Rule management + alert history log
│           ├── DividendPage.jsx    # Dividend income planner + portfolio tracker
│           └── MortgagePage.jsx    # Mortgage payoff + extra payment calculator
├── .env.example                    # Environment variable template
├── .gitignore
├── CLAUDE.md                       # Project context for Claude
├── docker-compose.yml              # Orchestrates backend + frontend containers
├── Makefile                        # Easy start/stop commands
└── README.md
```

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — runs the containers
- [VS Code](https://code.visualstudio.com/) — recommended editor
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) — for one-click devcontainer support (optional)
- `make` — pre-installed on macOS/Linux; on Windows use [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) or [Git Bash](https://gitforwindows.org/)

---

## Quick Start

### 1. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` if you want email alerts (optional — browser pop-ups work without it):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your_app_password
ALERT_EMAIL_TO=you@gmail.com
```

> **Gmail tip:** Use an [App Password](https://myaccount.google.com/apppasswords) — regular credentials are blocked by Google.

### 2. Start the app

```bash
make start
```

### 3. Open the app

- **Web app:** http://localhost:5173
- **API docs:** http://localhost:8000/docs

---

## Make Commands

| Command | Description |
|---|---|
| `make start` | Start the app in the background |
| `make start-watch` | Start and follow logs live |
| `make stop` | Stop the app (data is preserved) |
| `make restart` | Restart all services |
| `make build` | Rebuild images (run after changing requirements) |
| `make logs` | Tail logs from all services |
| `make logs-backend` | Backend logs only |
| `make logs-frontend` | Frontend logs only |
| `make ps` | Show running container status |
| `make clean` | Stop containers and wipe all data (prompts first) |
| `make` | Show help menu |

---

## Pages

### Stock Watchlist (`/`)

- Add ticker symbols (e.g. `AAPL`) to your personal watchlist
- Each row shows: current price, daily % change, a 90-day sparkline chart, and key indicators
- Pattern detection flags: **MMBM**, **MMSM**, and **SKS** (Someone Knows Something)
- Click **↻** to manually refresh a ticker's data

### Stock Alerts (`/alerts`)

**Alert Rules**
- Click **New Rule** to open the visual rule builder
- Pick a ticker, name the rule, and build conditions using **AND / OR blocks** — nest groups for complex logic
- Quick-start presets: MMBM Signal, MMSM Signal, RSI Oversold Dip, Volume Spike Down, MACD Bullish Cross
- Set a **cooldown** (minutes) to prevent repeated alerts during volatile sessions
- Toggle rules **on/off** without deleting them
- Click **Run Now** to test a check immediately (bypasses the market-hours gate)

**Alert History**
- Every fired alert is logged below the rules with a full indicator snapshot at the time of firing

### Dividend Income Planner (`/dividends`)

- Screens ~120 dividend-paying stocks and ETFs from Yahoo Finance (yields ≥ 5%)
- Ranks by dividend-to-cost ratio — a $10 stock paying $1/yr beats a $100 stock paying $5/yr
- **Goal:** $100,000/yr in passive income, with milestone tracking at $25K / $50K / $75K / $100K
- **Income Goal Progress bar** — gradient from red (0) → orange ($25K) → yellow ($50K) → green ($100K)
- **Milestone cards** — each shows total portfolio needed, amount you've invested so far, and how much to go
- **Shares Owned column** — enter shares as you buy them; Shares Goal and Projected Income update instantly
- Holdings persist to the database and survive container restarts

### Mortgage Payoff Calculator (`/mortgage`)

- Enter your original start date, loan term, interest rate, and principal balance
- Displays monthly payment, standard payoff date, and total interest owed
- **Amortization chart** — two overlapping area curves: standard payoff (grey) vs. accelerated payoff (green)
- **Amortization schedule** — expandable year rows → month rows with an **Extra Payment** field
- Enter extra payments on any month and the payoff date, interest saved, and chart update instantly
- All data persists in browser `localStorage` (never touches git or the Docker volume)
- **Clear All** button wipes the form and all extra payments to start fresh

---

## Alert Conditions — Available Indicators

| Key | Description |
|---|---|
| `price` | Latest closing price |
| `open`, `high`, `low` | Day OHLC values |
| `volume` | Today's volume |
| `volume_ratio` | Today's volume ÷ 20-day average |
| `rsi` | RSI (14-period) |
| `macd`, `macd_signal`, `macd_hist` | MACD line, signal, histogram |
| `sma_20`, `sma_50`, `sma_200` | Simple moving averages |
| `ema_12`, `ema_26` | Exponential moving averages |
| `bb_upper`, `bb_mid`, `bb_lower` | Bollinger Bands (20-period, 2σ) |
| `sks_ratio` | Volume today ÷ 20-day average (raw ratio) |
| `sks_signal` | 1 if volume is ≥ 130% of average ("Someone Knows Something"), else 0 |
| `mmbm_sweep` | MMBM: sell-side liquidity sweep detected |
| `mmbm_mss` | MMBM: bullish market structure shift |
| `mmbm_signal` | MMBM: full pattern (sweep + MSS) |
| `mmsm_sweep` | MMSM: buy-side liquidity sweep detected |
| `mmsm_mss` | MMSM: bearish market structure shift |
| `mmsm_signal` | MMSM: full pattern (sweep + MSS) |

Boolean flags (`mmbm_signal`, `mmsm_signal`, `sks_signal`) are `1` when active — use `>= 1` as the operator in the rule builder.

---

## Notifications

### Browser pop-up (always on)
The frontend polls the backend every 30 seconds. When an alert fires, a toast appears in the bottom-right corner. If you grant browser notification permission, a native OS notification also fires — even if the tab is in the background.

### Email (optional)
Fill in the `SMTP_*` variables in `.env`. The backend sends a plain-text email on every trigger using Python's built-in `smtplib` — no extra dependencies. Works with any SMTP provider (Gmail, Outlook, Fastmail, iCloud Mail, etc.).

---

## Data & Privacy

| Data | Storage | Persists across `make stop`? |
|---|---|---|
| Tickers, alert rules, alert history | `backend/data/stocks.db` (Docker named volume) | ✅ Yes |
| Dividend holdings (shares owned) | Same SQLite database | ✅ Yes |
| Mortgage details + extra payments | Browser `localStorage` | ✅ Yes (browser only) |

`make clean` is the only command that wipes the database — it prompts before doing so. Nothing is ever committed to git (`backend/data/` and `.env` are in `.gitignore`).
