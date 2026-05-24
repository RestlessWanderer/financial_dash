# Stock Alert Tracker

A local web app for monitoring stocks with a visual alert rule builder, price charts, and browser/email notifications. Runs entirely on your laptop via Docker.

---

## Project File Structure

```
stock-tracker/
├── .devcontainer/
│   └── devcontainer.json        # VS Code devcontainer config
├── backend/
│   ├── Dockerfile               # Python container
│   ├── requirements.txt         # Python dependencies
│   ├── main.py                  # FastAPI app entry point
│   ├── database.py              # SQLite engine + session
│   ├── models/
│   │   ├── __init__.py
│   │   └── db.py                # DB tables + request/response schemas
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── tickers.py           # Watchlist CRUD + indicator fetch
│   │   └── alerts.py            # Alert rules, events, notifications
│   └── services/
│       ├── __init__.py
│       ├── indicators.py        # yfinance + pandas-ta + MMBM/MMSM detection
│       └── scheduler.py         # APScheduler + email notifications
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.jsx             # React entry point + routing
│       ├── index.css            # Global styles + Tailwind
│       ├── api.js               # API client
│       ├── components/
│       │   ├── Layout.jsx       # App shell + nav
│       │   ├── RuleBuilder.jsx  # Visual if/and/or condition builder
│       │   └── ToastContainer.jsx  # In-app alert pop-ups
│       ├── hooks/
│       │   └── useAlertNotifications.js  # Polls backend, fires browser notifications
│       └── pages/
│           ├── Dashboard.jsx    # Ticker cards + mini charts
│           ├── AlertsPage.jsx   # Rule management + rule builder modal
│           └── HistoryPage.jsx  # Fired alert history log
├── .env.example                 # Environment variable template
├── .gitignore
├── CLAUDE.md                    # Project context for Claude
├── docker-compose.yml           # Orchestrates backend + frontend containers
├── Makefile                     # Easy start/stop commands
└── README.md
```

---

## Prerequisites

Install these before getting started:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — runs the containers
- [VS Code](https://code.visualstudio.com/) — recommended editor
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) — for one-click devcontainer support (optional but recommended)
- `make` — comes pre-installed on macOS/Linux; on Windows use [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) or [Git Bash](https://gitforwindows.org/)

---

## Quick Start

### 1. Download all project files

Download every file listed in the structure above, preserving the directory layout exactly. The paths matter — Docker and Vite both rely on the folder structure.

### 2. Configure environment variables

Copy `.env.example` to `.env` in the project root:

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

> **Gmail tip:** Use an [App Password](https://myaccount.google.com/apppasswords) rather than your account password. Regular credentials are blocked by Google.

### 3. Start the app

```bash
make start
```

This builds and starts both containers in the background.

### 4. Open the app

- **Web app:** http://localhost:5173
- **API docs:** http://localhost:8000/docs

---

## Make Commands

| Command | Description |
|---|---|
| `make start` | Start the app in the background |
| `make start-watch` | Start and follow logs live |
| `make stop` | Stop the app |
| `make restart` | Restart all services |
| `make build` | Rebuild images (run after changing requirements) |
| `make logs` | Tail logs from all services |
| `make logs-backend` | Backend logs only |
| `make logs-frontend` | Frontend logs only |
| `make ps` | Show running container status |
| `make clean` | Stop containers and wipe all data (prompts first) |
| `make` | Show help menu |

---

## Using the App

### Dashboard
- Type a ticker symbol (e.g. `AAPL`) and click **Add** to start tracking it
- Each card shows current price, daily % change, a 90-day mini chart, and key indicators: RSI, MACD, SMA 50/200, Bollinger Bands, volume ratio
- MMBM and MMSM pattern flags update on every refresh
- Click **↻** to manually refresh a ticker's data

### Alerts
- Click **New Rule** to open the visual rule builder
- Pick a ticker and give the rule a name
- Use the **quick-start presets** for common setups:
  - MMBM Signal
  - MMSM Signal
  - RSI Oversold Dip
  - Volume Spike Down
  - MACD Bullish Cross
- Build your own conditions using **AND / OR blocks** — nest groups for complex logic
- Set a **cooldown** (minutes) to prevent repeated alerts during volatile sessions
- Toggle rules **on/off** without deleting them
- Click **Run Now** to test a check immediately (bypasses the market hours check)

### History
- Every fired alert is logged here with a full indicator snapshot at the time of firing

---

## Notifications

### Browser pop-up (always on)
The frontend polls the backend every 30 seconds. When an alert fires, an animated toast appears in the bottom-right corner of the app. If you grant browser notification permission, a native OS notification also appears — even if the tab is in the background or minimised.

### Email (optional)
Fill in the `SMTP_*` variables in your `.env` file. The backend will send a plain-text email on every alert trigger using Python's built-in `smtplib` — no extra dependencies needed. Works with any SMTP provider (Gmail, Outlook, Fastmail, iCloud Mail, etc.).

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
| `mmbm_sweep` | MMBM: sell-side liquidity sweep detected |
| `mmbm_mss` | MMBM: bullish market structure shift |
| `mmbm_signal` | MMBM: full pattern (sweep + MSS) |
| `mmsm_sweep` | MMSM: buy-side liquidity sweep detected |
| `mmsm_mss` | MMSM: bearish market structure shift |
| `mmsm_signal` | MMSM: full pattern (sweep + MSS) |

Pattern flags are `1` when active, `0` when not — use `>= 1` as the operator in the rule builder.

---

## Customising MMBM / MMSM Detection

The pattern logic lives in `backend/services/indicators.py` in `detect_mmbm()` and `detect_mmsm()`. The default uses a **10-bar lookback on daily candles**. To switch to intraday detection, change the `interval` parameter in `fetch_indicators()`:

```python
# Daily (default)
df = yf.download(symbol, period="6mo", interval="1d", ...)

# Hourly
df = yf.download(symbol, period="1mo", interval="1h", ...)

# 15-minute
df = yf.download(symbol, period="5d", interval="15m", ...)
```

---

## Data & Privacy

All data is stored locally in `backend/data/stocks.db` (SQLite). Nothing is sent to any external service unless you configure SMTP email alerts. Stock price data is fetched from Yahoo Finance via the `yfinance` library.
