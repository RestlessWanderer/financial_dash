# Financial Wellness

A locally-run personal finance + stock monitoring web app. Track your net worth, plan mortgage payoff, model dividend income, and monitor stock alerts — all from a single dashboard running entirely on your laptop via Docker.

---

## Project File Structure

```
financial_dash/
├── .devcontainer/
│   └── devcontainer.json               # VS Code devcontainer config
├── backend/
│   ├── Dockerfile                      # Python container
│   ├── requirements.txt                # Python dependencies
│   ├── main.py                         # FastAPI app entry point + lifespan scheduler
│   ├── database.py                     # SQLite engine, session, migrations
│   ├── models/
│   │   └── db.py                       # All DB tables + request/response schemas
│   ├── routers/
│   │   ├── tickers.py                  # Watchlist CRUD + indicator fetch
│   │   ├── alerts.py                   # Alert rules, events, pending notifications
│   │   ├── dividends.py                # Dividend snapshot, holdings, lookup
│   │   ├── retirement.py               # Retirement accounts CRUD
│   │   ├── workstock.py                # ESPP/RSU accounts + E*TRADE OAuth
│   │   ├── assets.py                   # Physical assets CRUD
│   │   ├── liquid.py                   # Liquid accounts CRUD
│   │   ├── brokerage.py                # Brokerage accounts CRUD
│   │   ├── inflation.py                # BLS CPI-U current inflation rate
│   │   └── staples.py                  # BLS consumer staples average retail prices
│   └── services/
│       ├── indicators.py               # yfinance + pandas-ta + MMBM/MMSM detection
│       ├── dividends.py                # Parallel dividend data fetcher (~120 tickers)
│       ├── scheduler.py                # APScheduler (5-min checks) + notifications
│       ├── inflation.py                # BLS CPI-U YoY rate, 24h cache
│       └── staples.py                  # BLS APU retail prices, 24h cache
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js                  # Proxies /api → backend:8000
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.jsx                    # React entry point + all routes
│       ├── index.css                   # Global styles + Tailwind + theme variables
│       ├── api.js                      # All fetch calls to /api/*
│       ├── components/
│       │   ├── Layout.jsx              # Sidebar nav + light/dark toggle
│       │   ├── RuleBuilder.jsx         # Visual AND/OR condition block editor
│       │   └── ToastContainer.jsx      # Fixed bottom-right toast stack
│       ├── hooks/
│       │   └── useAlertNotifications.js  # Polls /alerts/pending every 30s
│       └── pages/
│           ├── DashboardPage.jsx       # Net worth summary + section cards
│           ├── Dashboard.jsx           # Stock watchlist: charts + indicators
│           ├── AlertsPage.jsx          # Alert rules + history log
│           ├── RetirementPage.jsx      # Retirement accounts + per-account dividend portfolios
│           ├── WorkStockPage.jsx       # ESPP/RSU plans + E*TRADE integration
│           ├── BrokeragePage.jsx       # Taxable/crypto/HSA brokerage accounts
│           ├── AssetsPage.jsx          # Physical assets with value + debt tracking
│           ├── LiquidAssetsPage.jsx    # Liquid accounts + inflation analysis
│           ├── MortgagePage.jsx        # Amortization + extra payments + target payoff years
│           ├── PayoffVsInvestPage.jsx  # Mortgage payoff vs. invest split calculator
│           └── DividendPage.jsx        # Dividend income portfolio tracker
├── .env.example                        # Environment variable template
├── .gitignore
├── CLAUDE.md                           # Project context for Claude Code
├── docker-compose.yml                  # Orchestrates backend + frontend containers
├── Makefile                            # start / stop / build / logs / clean
└── README.md
```

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — runs the containers
- [VS Code](https://code.visualstudio.com/) — recommended editor
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) — for devcontainer support (optional)
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
| `make build` | Rebuild images (run after changing dependencies) |
| `make logs` | Tail logs from all services |
| `make logs-backend` | Backend logs only |
| `make logs-frontend` | Frontend logs only |
| `make ps` | Show running container status |
| `make clean` | Stop containers and wipe all data (prompts first) |
| `make` | Show help menu |

---

## Pages

### Dashboard (`/`)

The main overview page. Shows a **Net Worth hero card** with a full breakdown of every asset and liability, plus section cards linking to each area of the app. Cards display key metrics at a glance — balances, equity, projected income, and dividend totals.

---

### Stock Watchlist (`/watchlist`)

- Add ticker symbols (e.g. `AAPL`) to your personal watchlist
- Each row shows: current price, daily % change, a 90-day sparkline chart, and key indicators
- Pattern detection flags: **MMBM** (Market Maker Buy Model), **MMSM** (Market Maker Sell Model)
- Click **↻** to manually refresh a ticker's data

### Stock Alerts (`/alerts`)

- Build alert rules using a visual **AND / OR condition block editor** — supports nested groups
- Available indicators: price, RSI, MACD, SMA, EMA, Bollinger Bands, volume ratio, MMBM/MMSM signals
- Quick-start presets: MMBM Signal, MMSM Signal, RSI Oversold Dip, Volume Spike, MACD Bullish Cross
- Set a **cooldown** (minutes) to prevent repeated alerts during volatile sessions
- Toggle rules on/off without deleting; click **Run Now** to test immediately
- Every fired alert is logged with a full indicator snapshot at the time it fired

---

### Retirement Accounts (`/retirement`)

- Full-width expandable account banners — click to reveal the dividend portfolio for that account
- Track 401(k), IRA, Roth, and any other retirement balances manually
- **Per-account dividend portfolio:** add tickers to each account, enter shares owned, see annual dividend income per account
- Retirement dividend holdings are **isolated** from the main Dividend page — adding a ticker here does not affect the dividend portfolio tracker
- Header shows **Total Balance** + **Retirement Dividend Income/yr** when income is configured
- Dashboard Retirement card also reflects the retirement dividend income total

### Work Stock Plans (`/workstock`)

- Track ESPP and RSU equity plans manually
- Optional **E\*TRADE OAuth integration** — connect your account to pull live portfolio data automatically

### Brokerage Accounts (`/brokerage`)

- Manually track taxable brokerage, crypto, HSA, and other investment accounts
- Account type badges: Taxable, Crypto, HSA, Other
- Optional notes field per account

### Physical Assets (`/assets`)

- Track owned physical assets (vehicles, property, collectibles, etc.) with current value and any outstanding debt
- Per-card equity calculation (value − debt) shown in green/red
- Header totals: Total Value, Total Debt, Net Equity

### Liquid Assets (`/liquid`)

- Track checking, savings, HYSA, money market, CD, and other liquid accounts
- Optional APY field per account
- **Inflation Impact Summary** — shows purchasing power erosion, real return after inflation, and opportunity cost vs. investing, with 1 Year / 5 Years / 10 Years horizon toggle
- **Purchasing Power** section — shows how far your balance goes today vs. projected future for common consumer staples (eggs, milk, bread, gas, etc.) using live BLS retail price data, with the same horizon toggle

---

### Mortgage (`/mortgage`)

- Enter loan start date, term, interest rate, and principal
- Displays monthly payment, standard payoff date, and total interest
- **Amortization chart** — standard payoff (grey) vs. accelerated payoff (green)
- **Amortization schedule** — expandable year → month rows with per-month extra payment fields
- **Two Target Payoff Year fields** — calculates the flat extra payment needed to hit each target year and the total interest savings; one-click to apply that extra to the schedule
- All data persists in `localStorage` instantly on every field change — survives navigation and page reloads

### Payoff vs. Invest (`/strategy`)

- Models the optimal split of a monthly budget between extra mortgage principal and investing, based on your tax situation
- Input: filing status, state, gross income, expected investment return
- Calculates effective after-tax mortgage rate vs. after-tax investment return and suggests an optimal split
- **Monthly Planner table** — year-grouped expandable rows spanning today through your longest target payoff year
  - Override budget for any individual month
  - Two target-year column pairs: shows minimum mortgage payment needed to stay on pace, with surplus redirected to investing
  - **Carry-forward deficit logic** — if a month's budget falls short, the deficit rolls forward to the next available month

### Dividends (`/dividends`)

- Screens ~120 dividend-paying stocks and ETFs (yields ≥ 5%) from Yahoo Finance
- Ranks by dividend-to-cost ratio
- **Goal:** $100,000/yr in passive income, with milestone tracking at $25K / $50K / $75K / $100K
- Enter shares owned for any ticker; projected annual and monthly income update instantly
- Add custom tickers not in the screened universe
- Holdings persist to the database

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
| `mmbm_signal` | MMBM: full buy pattern (sweep + MSS) |
| `mmsm_sweep` | MMSM: buy-side liquidity sweep detected |
| `mmsm_mss` | MMSM: bearish market structure shift |
| `mmsm_signal` | MMSM: full sell pattern (sweep + MSS) |

Boolean flags (`mmbm_signal`, `mmsm_signal`) are `1` when active — use `>= 1` as the operator in the rule builder.

---

## Notifications

### Browser pop-up (always on)
The frontend polls the backend every 30 seconds. When an alert fires, a toast appears in the bottom-right corner. If you grant browser notification permission, a native OS notification also fires — even if the tab is in the background.

### Email (optional)
Fill in the `SMTP_*` variables in `.env`. The backend sends a plain-text email on every trigger using Python's built-in `smtplib`. Works with any SMTP provider (Gmail, Outlook, Fastmail, iCloud Mail, etc.).

---

## Data & Privacy

| Data | Storage | Persists across `make stop`? |
|---|---|---|
| Tickers, alert rules, alert history | `backend/data/stocks.db` (Docker named volume) | ✅ Yes |
| Dividend holdings (shares owned) | Same SQLite database | ✅ Yes |
| Retirement, work stock, brokerage, physical assets, liquid accounts | Same SQLite database | ✅ Yes |
| Retirement dividend holdings (per-account) | Browser `localStorage` | ✅ Yes (browser only) |
| Mortgage details, extra payments, target payoff years | Browser `localStorage` | ✅ Yes (browser only) |
| Payoff vs. Invest profile + monthly budgets | Browser `localStorage` | ✅ Yes (browser only) |
| Light/dark theme preference | Browser `localStorage` | ✅ Yes (browser only) |

`make clean` is the only command that wipes the SQLite database — it prompts before doing so. `localStorage` data is browser-local and never committed to git. Nothing sensitive is ever stored in the repository.
