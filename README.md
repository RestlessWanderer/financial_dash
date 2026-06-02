# Financial Journey

A locally-run personal finance + stock monitoring web app. Track your net worth, plan your path to FIRE, model dividend income, monitor mortgage payoff, manage your budget, and watch stock alerts — all from a single dashboard running entirely on your laptop via Docker.

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
│       │   ├── Layout.jsx              # Sidebar nav + profile panel + light/dark toggle
│       │   ├── RuleBuilder.jsx         # Visual AND/OR condition block editor
│       │   └── ToastContainer.jsx      # Fixed bottom-right toast stack (alerts + milestones)
│       ├── hooks/
│       │   ├── useAlertNotifications.js       # Polls /alerts/pending every 30s
│       │   └── useMilestoneNotifications.js   # Fires once-per-milestone financial toasts
│       └── pages/
│           ├── DashboardPage.jsx       # Net worth summary + history chart + section cards
│           ├── Dashboard.jsx           # Stock watchlist: charts + indicators
│           ├── AlertsPage.jsx          # Alert rules + history log
│           ├── RetirementPage.jsx      # Retirement accounts + projected values at retirement
│           ├── WorkStockPage.jsx       # ESPP/RSU plans + E*TRADE integration
│           ├── BrokeragePage.jsx       # Taxable/crypto/HSA brokerage accounts
│           ├── AssetsPage.jsx          # Physical assets with value + debt tracking
│           ├── LiquidAssetsPage.jsx    # Liquid accounts + inflation analysis
│           ├── MortgagePage.jsx        # Amortization + extra payments + target payoff years
│           ├── LoansPage.jsx           # Loan tracker with live balance + payoff progress
│           ├── BudgetPage.jsx          # Monthly income/expense budget + NE savings impact
│           ├── PayoffVsInvestPage.jsx  # Mortgage payoff vs. invest split calculator
│           ├── DividendPage.jsx        # Dividend income portfolio tracker + milestone cards
│           └── FirePage.jsx            # FIRE Journey: 4-step roadmap + projected FIRE date
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

## Profile

Click the **Profile** button above the theme toggle in the sidebar to set:

- **Current Age** — used for FIRE and retirement projections
- **Desired Retirement Age** — drives the FIRE journey and bridge capital calculation
- **Yearly Dividend Goal** — sets the target for the Dividend Income planner (default $100K/yr)
- **Withdrawal Rate (%)** — safe withdrawal rate used in retirement and FIRE calculations (default 4%)

---

## Pages

### Dashboard (`/`)

The main overview page. Shows:
- **Net Worth hero card** — full breakdown of every asset and liability with mini grid cards, plus a **daily net worth history chart** that builds over time as you visit
- **Dividend Income banner** — projected annual income, progress bar, and milestone chips toward your goal
- **Section cards** — quick links to Retirement, Work Stock, Brokerage, Physical Assets, Liquid Assets, Mortgage, and Loans with key metrics at a glance. The Loans card shows your **current outstanding balance** (not original principal) as the live liability figure.

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
- **Projected values at retirement** — based on your profile age/retirement age, projects each account at 7% annual growth and shows estimated monthly income at your chosen withdrawal rate
- **Per-account dividend portfolio:** add tickers to each account, enter shares owned, see annual dividend income per account
- Header shows **Total Balance** + **Retirement Dividend Income/yr** when income is configured

### Work Stock Plans (`/workstock`)

- Track ESPP and RSU equity plans manually
- Optional **E\*TRADE OAuth integration** — connect your account to pull live portfolio data automatically

### Brokerage Accounts (`/brokerage`)

- Manually track taxable brokerage, crypto, HSA, and other investment accounts
- Account type badges: Taxable, Crypto, HSA, Other

### Physical Assets (`/assets`)

- Track owned physical assets (vehicles, property, collectibles, etc.) with current value and any outstanding debt
- Per-row equity calculation (value − debt) shown in green/red
- Header totals: Total Value, Total Debt, Net Equity

### Liquid Assets (`/liquid`)

- Track checking, savings, HYSA, money market, CD, and other liquid accounts
- Optional APY field per account
- **Inflation Impact Summary** — purchasing power erosion, real return after inflation, and opportunity cost vs. investing
- **Purchasing Power** section — live BLS retail price data showing how far your balance goes today vs. future projections for common consumer staples

---

### Loans (`/loans`)

- Track any non-mortgage loans with name, interest type (fixed amortizing or simple), original amount, term, rate, start date, and monthly payment
- **Live current balance** — automatically amortized month-by-month from the loan start date to today; advances each calendar month without any manual input. Falls back to original amount if no start date is entered.
- **Payoff progress bar** — shows percentage paid off and estimated payoff month
- **Months remaining** — derived from start date + term
- Monthly payment field is optional; if omitted the standard calculated payment is shown with a `(calc.)` label
- Calculates total interest paid over the life of each loan
- Header totals show **Current Balance** (live), Total Interest, Total Cost
- Current balance + remaining interest are used as the liability in the Dashboard net worth calculation

### Mortgage (`/mortgage`)

- Enter loan start date, term, interest rate, and principal
- Displays monthly payment, standard payoff date, and total interest
- **Amortization chart** — standard payoff (grey) vs. accelerated payoff (green)
- **Two Target Payoff Year fields** — each banner shows:
  - The flat extra monthly payment required to hit that year
  - **Total interest saved** vs. the standard payoff schedule
  - One-click **Apply to schedule** button
- All data persists in `localStorage`

### Budget (`/budget`)

- Year-grouped expandable table: **Pay 1**, **Pay 2**, Housing, Utilities, Groceries, plus up to 10 custom expense categories
- **Remaining** = income − all expenses; feeds into the Payoff vs. Invest planner
- **NE (Non-Essential) flags** — mark custom categories as non-essential; a "What if you cut these?" card shows how many years faster your FIRE bridge capital would be funded
- Custom category chips at the top — click to rename, hover to remove
- All data saved to `localStorage` automatically

### Payoff vs. Invest (`/strategy`)

- Models the optimal split of a monthly budget between extra mortgage principal and investing
- Input: filing status, state, gross income, expected investment return
- **Monthly budget auto-loaded from the Budget page**
- **Collapsible column groups** — the monthly planner table has three toggleable column groups: Standard Split, Target → Year 1, Target → Year 2. Click a group header pill to show/hide those columns, keeping the table focused on what matters.
- **Monthly Planner table** — year-grouped with carry-forward deficit logic. Target columns show the exact extra principal needed to stay on pace for each target payoff year, with the remainder allocated to investing.

### Dividends (`/dividends`)

- Screens ~120 dividend-paying stocks and ETFs (yields ≥ 5%) from Yahoo Finance — covered call ETFs (QYLD, XYLD, RYLD, JEPI, JEPQ) are intentionally excluded due to NAV erosion; add them manually via "Add a ticker" if desired
- **Goal** set from your Profile (default $100K/yr) — milestone step cards at goal/4 intervals
- **Income Goal Progress** bar, **Portfolio info card**, **Milestone step cards** (with mini progress bars), **Add a ticker**, **Portfolio breakdown** table
- **Target / yr** column — plan-based income target per position (dimmed)
- **Actual / yr** column — live income calculated from your shares owned × annual dividend per share; updates instantly as you type
- **Beta** column — price volatility vs. market: green < 0.5, yellow 0.5–1.0, red > 1.0
- **Payout %** column — dividend sustainability: green ≤ 80%, yellow 80–100%, red > 100% (normal for REITs/BDCs; caution for regular stocks)
- Add custom tickers; enter shares owned to update projected income instantly
- Holdings persist to the database; user-added tickers are preserved across screener refreshes
- Warns if you try to add a ticker already in the screened portfolio

### FIRE Journey (`/fire`)

Your step-by-step path to **Financial Independence, Early Retirement**:

1. **Eliminate Non-Essential Spending** — lists NE-flagged budget categories and monthly cost
2. **Pay Off All Loans** — shows each loan with its **current balance** and remaining interest cost
3. **Pay Off Your Mortgage** — remaining balance progress bar
4. **Fund Bridge Capital** — calculates the lump-sum needed to cover expenses between your desired retirement age and penalty-free retirement account access (age 59.5):
   - **Path A (Passive):** dividend income coverage of essential expenses
   - **Path B (Active):** monthly surplus savings rate with on-track indicator

**Projected FIRE Date card** — projects forward year by year based on your current savings rate and dividend growth (5%/yr), finds the first year you're FIRE-ready, and charts the trajectory.

Each step auto-detects completion from your data (loans cleared when current balance hits zero), with manual override available. Progress is persisted to `localStorage`.

---

## Milestone Notifications

The app automatically detects and notifies you (in-app toast + optional browser notification) the first time you cross each of these milestones:

- Loans fully cleared (triggers when total current balance reaches $0)
- Loan nearly paid off (< 10% interest remaining)
- Mortgage 25% / 50% / 75% / 100% paid
- Net worth $10K / $25K / $50K / $100K / $250K / $500K / $1M
- All non-essential spending eliminated
- FIRE profile complete (age + retirement age + dividend goal all set)

Each milestone fires exactly once and is remembered in `localStorage`.

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
The frontend polls the backend every 30 seconds. When a stock alert fires, a toast appears in the bottom-right corner. If you grant browser notification permission, a native OS notification also fires — even if the tab is in the background. Financial milestone notifications work the same way.

### Email (optional)
Fill in the `SMTP_*` variables in `.env`. The backend sends a plain-text email on every stock alert trigger using Python's built-in `smtplib`.

---

## Data & Privacy

| Data | Storage | Persists across `make stop`? |
|---|---|---|
| Tickers, alert rules, alert history | `backend/data/stocks.db` (Docker named volume) | ✅ Yes |
| Dividend holdings (shares owned) | Same SQLite database | ✅ Yes |
| Dividend snapshots (price, yield, beta, payout) | Same SQLite database | ✅ Yes |
| Retirement, work stock, brokerage, physical assets, liquid accounts | Same SQLite database | ✅ Yes |
| Retirement dividend holdings (per-account) | Browser `localStorage` | ✅ Yes (browser only) |
| Mortgage details, extra payments, target payoff years | Browser `localStorage` | ✅ Yes (browser only) |
| Loans (including start date + monthly payment) | Browser `localStorage` | ✅ Yes (browser only) |
| Budget income/expense data + custom categories + NE flags | Browser `localStorage` | ✅ Yes (browser only) |
| User profile (age, retirement age, dividend goal, withdrawal rate) | Browser `localStorage` | ✅ Yes (browser only) |
| Net worth history snapshots | Browser `localStorage` | ✅ Yes (browser only) |
| FIRE step overrides + milestone seen flags | Browser `localStorage` | ✅ Yes (browser only) |
| Light/dark theme preference | Browser `localStorage` | ✅ Yes (browser only) |

`make clean` is the only command that wipes the SQLite database — it prompts before doing so. `localStorage` data is browser-local and never committed to git. Nothing sensitive is ever stored in the repository.
