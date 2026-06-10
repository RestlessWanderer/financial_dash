import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import {
  PiggyBank, Briefcase, Layers, Home, Landmark, Wallet,
  TrendingUp, TrendingDown, ArrowRight, BarChart2, CreditCard,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const NW_HISTORY_KEY  = 'nw_history'   // [{ date: 'YYYY-MM-DD', value: number }]
const NW_HISTORY_MAX  = 365            // keep up to 1 year of daily snapshots

function saveNWSnapshot(value) {
  if (value == null || isNaN(value)) return
  const today = new Date().toISOString().slice(0, 10)
  try {
    const raw     = localStorage.getItem(NW_HISTORY_KEY)
    const history = raw ? JSON.parse(raw) : []
    // Replace today's entry if it already exists, otherwise append
    const filtered = history.filter(e => e.date !== today)
    filtered.push({ date: today, value: Math.round(value) })
    // Keep only the most recent MAX entries
    const trimmed = filtered.slice(-NW_HISTORY_MAX)
    localStorage.setItem(NW_HISTORY_KEY, JSON.stringify(trimmed))
  } catch { /* ignore */ }
}

function loadNWHistory() {
  try { return JSON.parse(localStorage.getItem(NW_HISTORY_KEY) ?? 'null') ?? [] } catch { return [] }
}

/* ── Helpers ─────────────────────────────────────────────────────── */
function usd(n, dec = 0) {
  if (n == null || isNaN(n)) return '—'
  return Math.abs(n).toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  })
}

function loadDivTarget() {
  try {
    const p = JSON.parse(localStorage.getItem('user_profile') ?? 'null')
    return (p?.divGoal && p.divGoal > 0) ? p.divGoal : 100_000
  } catch { return 100_000 }
}

function formatGoalLabel(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  return `$${n}`
}

function signed(n) {
  if (n == null || isNaN(n)) return '—'
  const abs = usd(Math.abs(n))
  return n < 0 ? `−${abs}` : `+${abs}`
}

/**
 * Derive the current remaining mortgage balance from localStorage data.
 * Runs the amortisation schedule forward to this month.
 */
function calcMortgageBalance(config, extras) {
  if (!config?.startDate || !config?.principal || !config?.rate) return null
  const principal  = parseFloat(config.principal) || 0
  const annualRate = parseFloat(config.rate)       || 0
  const termYears  = parseInt(config.years)        || 30
  if (principal <= 0 || annualRate <= 0) return null

  const [y, m]    = config.startDate.split('-').map(Number)
  const now       = new Date()
  const elapsed   = (now.getFullYear() - y) * 12 + (now.getMonth() - (m - 1))
  if (elapsed <= 0) return principal

  const totalMonths  = termYears * 12
  const monthlyRate  = annualRate / 100 / 12
  const pow          = Math.pow(1 + monthlyRate, totalMonths)
  const payment      = monthlyRate === 0
    ? principal / totalMonths
    : principal * monthlyRate * pow / (pow - 1)

  let balance = principal
  for (let i = 0; i < Math.min(elapsed, totalMonths); i++) {
    if (balance < 0.01) break
    const interest = balance * monthlyRate
    let   prinPaid = payment - interest
    if (prinPaid > balance) prinPaid = balance
    const extra = Math.min(parseFloat(extras?.[String(i)]) || 0, Math.max(0, balance - prinPaid))
    balance = Math.max(0, balance - prinPaid - extra)
  }
  return Math.round(balance * 100) / 100
}

/** Current remaining balance of a loan, amortized from startDate to today. */
function calcLoanCurrentBalance(loan) {
  const principal = parseFloat(loan.amount) || 0
  const rate      = parseFloat(loan.rate)   || 0
  const termYears = parseFloat(loan.term)   || 0
  if (principal <= 0 || termYears <= 0) return principal   // fallback: original amount
  if (!loan.startDate) return principal

  const [startY, startM] = loan.startDate.split('-').map(Number)
  const now     = new Date()
  const elapsed = Math.max(0,
    (now.getFullYear() - startY) * 12 + (now.getMonth() - (startM - 1))
  )
  const totalMonths = Math.round(termYears * 12)
  if (elapsed >= totalMonths) return 0

  const monthlyRate = rate / 100 / 12

  if (loan.interestType === 'fixed') {
    const pow        = monthlyRate > 0 ? Math.pow(1 + monthlyRate, totalMonths) : 1
    const stdPayment = monthlyRate > 0 ? principal * monthlyRate * pow / (pow - 1) : principal / totalMonths
    const enteredPmt = parseFloat(loan.payment) || 0
    const payment    = enteredPmt > 0 ? enteredPmt : stdPayment
    let balance = principal
    for (let i = 0; i < elapsed; i++) {
      if (balance < 0.01) { balance = 0; break }
      const interest = balance * monthlyRate
      balance = Math.max(0, balance - Math.min(Math.max(0, payment - interest), balance))
    }
    return Math.round(balance * 100) / 100
  }

  if (loan.interestType === 'simple') {
    const monthlyInterest = principal * (rate / 100) / 12
    const stdPayment = principal / totalMonths + monthlyInterest
    const enteredPmt = parseFloat(loan.payment) || 0
    const payment    = enteredPmt > 0 ? enteredPmt : stdPayment
    let balance = principal
    for (let i = 0; i < elapsed; i++) {
      if (balance < 0.01) { balance = 0; break }
      const interest = principal * (rate / 100) / 12
      balance = Math.max(0, balance - Math.min(Math.max(0, payment - interest), balance))
    }
    return Math.round(balance * 100) / 100
  }

  return principal
}

/** Remaining interest from today forward (current balance → payoff). */
function calcLoanRemainingInterest(loan) {
  const currentBalance = calcLoanCurrentBalance(loan)
  const rate           = parseFloat(loan.rate)   || 0
  const termYears      = parseFloat(loan.term)   || 0
  if (currentBalance <= 0 || termYears <= 0) return 0

  const totalMonths = Math.round(termYears * 12)
  if (!loan.startDate) {
    // No start date — fall back to full-life interest
    if (loan.interestType === 'simple') return (parseFloat(loan.amount) || 0) * (rate / 100) * termYears
    if (rate === 0) return 0
    const monthlyRate = rate / 100 / 12
    const pow         = Math.pow(1 + monthlyRate, totalMonths)
    const payment     = (parseFloat(loan.amount) || 0) * monthlyRate * pow / (pow - 1)
    return (payment * totalMonths) - (parseFloat(loan.amount) || 0)
  }

  const [startY, startM] = loan.startDate.split('-').map(Number)
  const now      = new Date()
  const elapsed  = Math.max(0,
    (now.getFullYear() - startY) * 12 + (now.getMonth() - (startM - 1))
  )
  const remaining = Math.max(0, totalMonths - elapsed)
  if (remaining === 0) return 0

  if (loan.interestType === 'simple') {
    // Simple interest on original principal for remaining term
    const principal = parseFloat(loan.amount) || 0
    return principal * (rate / 100) * (remaining / 12)
  }

  if (loan.interestType === 'fixed') {
    if (rate === 0) return 0
    const monthlyRate = rate / 100 / 12
    const pow         = Math.pow(1 + monthlyRate, remaining)
    const payment     = currentBalance * monthlyRate * pow / (pow - 1)
    return Math.round((payment * remaining - currentBalance) * 100) / 100
  }

  return 0
}

/** Projected annual dividend income from owned shares. */
function calcDividendIncome(holdings, stocks) {
  const map = {}
  stocks.forEach(s => { map[s.symbol] = s })
  return Object.entries(holdings).reduce(
    (sum, [sym, shares]) => sum + ((map[sym]?.annual_dividend ?? 0) * shares), 0
  )
}

/* ── Section card ────────────────────────────────────────────────── */
function SectionCard({ to, icon: Icon, iconClass, title, primary, primaryLabel, rows = [], loading, primaryClass = 'text-emerald-400' }) {
  return (
    <Link to={to}
      className="card group flex flex-col gap-3 hover:border-accent/30 transition-colors cursor-pointer">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconClass}`}>
            <Icon size={14} />
          </div>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <ArrowRight size={14} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Primary metric */}
      {loading ? (
        <div className="h-8 w-24 rounded bg-white/5 animate-pulse" />
      ) : (
        <p className={`mono text-2xl font-bold leading-none ${primaryClass}`}>
          {primary ?? '—'}
        </p>
      )}
      {primaryLabel && <p className="text-[10px] text-muted -mt-1">{primaryLabel}</p>}

      {/* Sub-rows */}
      {rows.length > 0 && (
        <div className="border-t border-border/50 pt-2 space-y-1">
          {rows.map(([label, val, cls]) => (
            <div key={label} className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] text-muted">{label}</span>
              <span className={`mono text-xs font-medium ${cls ?? 'text-slate-300'}`}>{val ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </Link>
  )
}

/* ── Net worth mini-card ─────────────────────────────────────────── */
function NWMiniCard({ label, value, sign = '+', liability = false, loading = false }) {
  const isNeg = liability || sign === '−'
  const valCls = isNeg ? 'text-rose-400' : 'text-emerald-400'

  return (
    <div className="bg-white/[0.03] border border-border/50 rounded-xl px-3 py-2.5 flex flex-col gap-1">
      <span className="text-[10px] text-slate-300 uppercase tracking-wider font-bold leading-none">{label}</span>
      {loading ? (
        <div className="h-5 w-20 rounded bg-white/5 animate-pulse mt-0.5" />
      ) : (
        <span className={`mono text-sm font-semibold leading-none ${valCls}`}>
          {value == null ? '—' : `${sign}${usd(Math.abs(value))}`}
        </span>
      )}
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [retirement, setRetirement] = useState(null)
  const [workStock,  setWorkStock]  = useState(null)
  const [brokerage,  setBrokerage]  = useState(null)
  const [assets,     setAssets]     = useState(null)
  const [liquid,     setLiquid]     = useState(null)
  const [divData,    setDivData]    = useState(null)
  const [divHoldings,setDivHoldings]= useState(null)
  const [loading,    setLoading]    = useState(true)

  // Mortgage + loans + retirement div holdings live in localStorage (client-side only)
  const [mortgageConfig,      setMortgageConfig]      = useState(null)
  const [mortgageExtras,      setMortgageExtras]      = useState(null)
  const [mortgageProperties,  setMortgageProperties]  = useState([])  // multi-property v2
  const [loans,               setLoans]               = useState([])
  const [retirementDivMap,    setRetirementDivMap]    = useState({}) // accountId → {symbol: shares}
  const [retirementSnapshots, setRetirementSnapshots] = useState({}) // symbol → snapshot data

  useEffect(() => {
    // Read mortgage and loans from localStorage
    try {
      // New multi-property format
      const propsRaw = localStorage.getItem('mortgages_v2')
      if (propsRaw) {
        const props = JSON.parse(propsRaw)
        setMortgageProperties(props)
        // Also keep legacy single-mortgage state for PayoffVsInvest / FirePage compat
        if (props.length > 0 && props[0].form) setMortgageConfig(props[0].form)
      } else {
        // Legacy fallback
        const cfg = localStorage.getItem('mortgage_config')
        const ext = localStorage.getItem('mortgage_extras')
        if (cfg) setMortgageConfig(JSON.parse(cfg))
        if (ext) setMortgageExtras(JSON.parse(ext))
      }
    } catch { /* ignore */ }
    try {
      const l = localStorage.getItem('loans_data')
      if (l) setLoans(JSON.parse(l))
    } catch { /* ignore */ }

    // Read all retirement dividend holdings from localStorage
    // Keys are retirement_divs_{id} — scan all localStorage keys
    let divMap = {}
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('retirement_divs_')) {
          const id = key.replace('retirement_divs_', '')
          divMap[id] = JSON.parse(localStorage.getItem(key) ?? '{}')
        }
      }
      setRetirementDivMap(divMap)
    } catch { /* ignore */ }

    // Fetch all backend data in parallel
    Promise.allSettled([
      api.getRetirementAccounts(),
      api.getWorkAccounts(),
      api.getBrokerageAccounts(),
      api.getAssets(),
      api.getLiquidAccounts(),
      api.getDividends(),
      api.getDividendHoldings(),
    ]).then(([retRes, wsRes, broRes, assetRes, liquidRes, divRes, holdRes]) => {
      if (retRes.status    === 'fulfilled') setRetirement(retRes.value)
      if (wsRes.status     === 'fulfilled') setWorkStock(wsRes.value)
      if (broRes.status    === 'fulfilled') setBrokerage(broRes.value)
      if (assetRes.status  === 'fulfilled') setAssets(assetRes.value)
      if (liquidRes.status === 'fulfilled') setLiquid(liquidRes.value)
      if (divRes.status    === 'fulfilled') setDivData(divRes.value)
      if (holdRes.status   === 'fulfilled') setDivHoldings(holdRes.value)
      setLoading(false)

      // Find all retirement ticker symbols not in the dividend portfolio universe,
      // then fetch their snapshot data so the retirement div income card is accurate
      const knownSymbols = new Set(
        (divRes.status === 'fulfilled' ? divRes.value?.stocks ?? [] : []).map(s => s.symbol)
      )
      const missing = [...new Set(
        Object.values(divMap).flatMap(holdings => Object.keys(holdings))
      )].filter(sym => !knownSymbols.has(sym))

      if (missing.length > 0) {
        Promise.allSettled(missing.map(sym => api.lookupDividendTicker(sym)))
          .then(results => {
            const fetched = {}
            results.forEach((r, i) => {
              if (r.status === 'fulfilled') fetched[missing[i]] = r.value
            })
            setRetirementSnapshots(fetched)
          })
      }
    })
  }, [])

  /* ── Derived numbers ── */
  const retirementTotal = (retirement ?? []).reduce((s, a) => s + (a.value ?? 0), 0)
  const workStockTotal  = (workStock  ?? []).reduce((s, a) => s + (a.value ?? 0), 0)
  const brokerageTotal  = (brokerage  ?? []).reduce((s, a) => s + (a.value ?? 0), 0)
  const assetValue      = (assets     ?? []).reduce((s, a) => s + (a.value ?? 0), 0)
  const assetDebt       = (assets     ?? []).reduce((s, a) => s + (a.debt  ?? 0), 0)
  const assetEquity     = assetValue - assetDebt
  const liquidTotal     = (liquid     ?? []).reduce((s, a) => s + (a.value ?? 0), 0)

  // Sum mortgage balances and property values across all properties
  const { mortgageBalance, mortgagePropertyValue, hasMortgage } = useMemo(() => {
    if (mortgageProperties.length > 0) {
      let totalBalance = 0, totalValue = 0, anyMortgage = false
      for (const p of mortgageProperties) {
        const extras = (() => {
          try { return JSON.parse(localStorage.getItem(`mortgage_extras_${p.id}`) ?? 'null') ?? {} }
          catch { return {} }
        })()
        const bal = calcMortgageBalance(p.form, extras)
        if (bal !== null) { totalBalance += bal; anyMortgage = true }
        totalValue += parseFloat(p.propertyValue) || 0
      }
      return {
        mortgageBalance:       anyMortgage ? totalBalance : null,
        mortgagePropertyValue: totalValue,
        hasMortgage:           anyMortgage,
      }
    }
    // Legacy single-mortgage fallback
    const bal = calcMortgageBalance(mortgageConfig, mortgageExtras)
    return { mortgageBalance: bal, mortgagePropertyValue: 0, hasMortgage: bal !== null }
  }, [mortgageProperties, mortgageConfig, mortgageExtras])

  const projectedIncome = (divData && divHoldings)
    ? calcDividendIncome(divHoldings, divData.stocks ?? [])
    : null

  // Retirement div income: sum across all accounts' localStorage holdings.
  // Merge divData.stocks (dividend portfolio universe) with retirementSnapshots
  // (tickers added only to retirement accounts, fetched via lookup endpoint).
  const retirementDivIncome = divData
    ? (() => {
        const snapMap = {}
        for (const s of divData.stocks ?? []) snapMap[s.symbol] = s
        Object.assign(snapMap, retirementSnapshots)
        return Object.values(retirementDivMap).reduce((total, holdings) =>
          total + calcDividendIncome(holdings, Object.values(snapMap)), 0)
      })()
    : null

  // Loan totals (from localStorage) — use current balance + remaining interest
  const loanCurrentTotal   = loans.reduce((s, l) => s + calcLoanCurrentBalance(l), 0)
  const loanInterestTotal  = loans.reduce((s, l) => s + calcLoanRemainingInterest(l), 0)
  const loanPrincipalTotal = loans.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const hasLoans           = loans.length > 0

  // Net worth = all assets minus all liabilities
  // Property value is an asset; mortgage balance is a liability
  // Loan liability = current balance + remaining interest (accurate live figure)
  const netAssets      = retirementTotal + workStockTotal + brokerageTotal + assetValue + liquidTotal + mortgagePropertyValue
  const netLiabilities = assetDebt + (hasMortgage ? mortgageBalance : 0) + loanCurrentTotal + loanInterestTotal
  const netWorth       = netAssets - netLiabilities
  const nwReady        = !loading

  // Snapshot today's net worth once data is loaded, then load full history
  const [nwHistory, setNwHistory] = useState(() => loadNWHistory())
  useEffect(() => {
    if (!loading && !isNaN(netWorth)) {
      saveNWSnapshot(netWorth)
      setNwHistory(loadNWHistory())
    }
  }, [loading, netWorth])

  // Dividend goal from profile (re-read on focus in case user updated profile)
  const [divTarget, setDivTarget] = useState(() => loadDivTarget())
  useEffect(() => {
    const onFocus = () => setDivTarget(loadDivTarget())
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
  const divMilestones = [1, 2, 3, 4].map(i => Math.round((divTarget / 4) * i))

  // Dividend progress toward goal
  const divProgress = projectedIncome != null
    ? Math.min(100, (projectedIncome / divTarget) * 100)
    : null

  // Mortgage section card rows — multi-property summary
  const mortgageCardRows = useMemo(() => {
    if (!hasMortgage) return []
    if (mortgageProperties.length > 1) {
      return [
        [`${mortgageProperties.length} properties`, '', 'text-slate-400'],
        mortgagePropertyValue > 0 ? ['Total property value', usd(mortgagePropertyValue), 'text-emerald-400/80'] : null,
        ['Total remaining balance', usd(mortgageBalance), 'text-rose-400/80'],
        mortgagePropertyValue > 0 ? ['Total equity', usd(mortgagePropertyValue - mortgageBalance), mortgagePropertyValue - mortgageBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'] : null,
      ].filter(Boolean)
    }
    // Single property
    const p = mortgageProperties[0] ?? null
    const cfg = p?.form ?? mortgageConfig
    let payoffLabel = null
    if (cfg?.startDate && cfg?.years) {
      const [y, m] = cfg.startDate.split('-').map(Number)
      const payoffDate = new Date(y, (m - 1) + parseInt(cfg.years) * 12)
      payoffLabel = payoffDate.toLocaleString('default', { month: 'long', year: 'numeric' })
    }
    const pVal = parseFloat(p?.propertyValue) || 0
    return [
      pVal > 0        ? ['Property value',   usd(pVal),              'text-emerald-400/80'] : null,
      payoffLabel     ? ['Standard payoff',  payoffLabel,            'text-slate-300']      : null,
      pVal > 0        ? ['Equity',           usd(pVal - mortgageBalance), pVal - mortgageBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'] : null,
    ].filter(Boolean)
  }, [hasMortgage, mortgageProperties, mortgagePropertyValue, mortgageBalance, mortgageConfig])

  return (
    <div className="space-y-6">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-semibold">Financial Dashboard</h1>
        <p className="text-xs text-muted mt-0.5">Your complete financial picture at a glance</p>
      </div>

      {/* ── Net Worth hero card ───────────────────────────────────── */}
      <div className={`card border ${nwReady
        ? netWorth >= 0 ? 'border-green-500/25 bg-green-500/[0.04]' : 'border-red-500/25 bg-red-500/[0.04]'
        : 'border-border'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-start gap-6">

          {/* Big number */}
          <div className="shrink-0">
            <p className="text-[10px] text-slate-300 uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5">
              {nwReady && (netWorth >= 0
                ? <TrendingUp size={11} className="text-green-400" />
                : <TrendingDown size={11} className="text-red-400" />
              )}
              Net Worth
            </p>
            {loading ? (
              <div className="h-14 w-48 rounded bg-white/5 animate-pulse" />
            ) : (
              <p className={`mono text-5xl font-bold leading-none ${netWorth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {netWorth >= 0 ? '' : '−'}{usd(Math.abs(netWorth))}
              </p>
            )}
          </div>

          {/* Breakdown mini-cards */}
          <div className="flex-1 sm:border-l sm:border-border/50 sm:pl-6">
            <p className="text-[10px] text-slate-300 uppercase tracking-widest font-bold mb-3">Breakdown</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <NWMiniCard label="Retirement"      value={retirementTotal} sign="+"  loading={loading} />
              <NWMiniCard label="Work Stock"       value={workStockTotal}  sign="+"  loading={loading} />
              <NWMiniCard label="Brokerage"        value={brokerageTotal}  sign="+"  loading={loading} />
              <NWMiniCard label="Liquid Assets"    value={liquidTotal}           sign="+"  loading={loading} />
              <NWMiniCard label="Physical Assets"  value={assetValue}            sign="+"  loading={loading} />
              {mortgagePropertyValue > 0 && (
                <NWMiniCard label="Property Value" value={mortgagePropertyValue} sign="+"  loading={loading} />
              )}
              <NWMiniCard label="Asset Debt"       value={assetDebt}             sign="−"  loading={loading} liability />
              {hasMortgage && (
                <NWMiniCard label="Mortgage Bal."  value={mortgageBalance}       sign="−"  loading={loading} liability />
              )}
              {hasLoans && (
                <NWMiniCard label="Loan Balance"   value={loanCurrentTotal}  sign="−" loading={false}   liability />
              )}
              {hasLoans && loanInterestTotal > 0 && (
                <NWMiniCard label="Loan Interest"  value={loanInterestTotal} sign="−" loading={false}   liability />
              )}
            </div>
          </div>
        </div>

        {/* ── Net Worth history chart ── */}
        {nwHistory.length >= 2 && (
          <div className="border-t border-border/40 pt-4 mt-2">
            <p className="text-[10px] text-slate-300 uppercase tracking-widest font-bold mb-3">Net Worth History</p>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={nwHistory} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false}
                  tickFormatter={d => { const [,m,day] = d.split('-'); return `${m}/${day}` }}
                  interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false}
                  tickFormatter={v => v >= 1_000_000 ? `$${(v/1_000_000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`}
                  width={52} />
                <Tooltip
                  contentStyle={{ background: '#161b27', border: '1px solid #1e2535', borderRadius: 8, fontSize: 11 }}
                  formatter={v => [`$${v.toLocaleString()}`, 'Net Worth']}
                  labelFormatter={d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                />
                <Area type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={1.5} fill="url(#nwGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-muted mt-1">{nwHistory.length} daily snapshot{nwHistory.length !== 1 ? 's' : ''} · updates each time you visit</p>
          </div>
        )}
        {nwHistory.length < 2 && !loading && (
          <p className="text-[10px] text-muted border-t border-border/40 pt-3 mt-2">
            Net worth history will appear here after you visit on multiple days.
          </p>
        )}
      </div>

      {/* ── Dividend Income banner ────────────────────────────────── */}
      <Link to="/dividends"
        className="card group border border-emerald-500/20 bg-emerald-500/[0.04] hover:border-emerald-500/40 transition-colors cursor-pointer block">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">

          {/* Big number */}
          <div className="shrink-0">
            <p className="text-[10px] text-slate-300 uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5">
              <Landmark size={11} className="text-emerald-400" />
              Dividend Income
            </p>
            {loading ? (
              <div className="h-14 w-48 rounded bg-white/5 animate-pulse" />
            ) : (
              <p className="mono text-5xl font-bold leading-none text-emerald-400">
                {projectedIncome != null ? `${usd(projectedIncome)}/yr` : '—'}
              </p>
            )}
            {!loading && projectedIncome != null && (
              <p className="text-xs text-muted mt-2">{usd(projectedIncome / 12)}/mo projected · from owned shares</p>
            )}
          </div>

          {/* Progress + milestone chips */}
          <div className="flex-1 sm:border-l sm:border-border/50 sm:pl-6 space-y-3">
            <p className="text-[10px] text-slate-300 uppercase tracking-widest font-bold">Goal Progress — {formatGoalLabel(divTarget)} / yr</p>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500/70 transition-all duration-500"
                  style={{ width: `${Math.min(100, divProgress ?? 0)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted">
                <span>{(divProgress ?? 0).toFixed(1)}% complete</span>
                <span>{projectedIncome != null ? `${usd(divTarget - projectedIncome)} remaining` : '—'}</span>
              </div>
            </div>

            {/* Milestone chips */}
            <div className="grid grid-cols-4 gap-2">
              {divMilestones.map(milestone => {
                const reached = (projectedIncome ?? 0) >= milestone
                return (
                  <div key={milestone}
                    className={`rounded-xl px-3 py-2 border text-center transition-colors ${
                      reached
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-white/[0.02] border-border/40'
                    }`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${reached ? 'text-emerald-400' : 'text-muted'}`}>
                      {reached ? '✓ ' : ''}{formatGoalLabel(milestone)}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          <ArrowRight size={16} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-center" />
        </div>
      </Link>

      {/* ── Section cards grid ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Retirement */}
        <SectionCard
          to="/retirement"
          icon={PiggyBank}
          iconClass="bg-purple-500/10 text-purple-400"
          title="Retirement Accounts"
          primary={loading ? null : usd(retirementTotal)}
          primaryLabel={`${(retirement ?? []).length} account${(retirement ?? []).length !== 1 ? 's' : ''}`}
          loading={loading}
          rows={loading ? [] : [
            ['Contribution to net worth', signed(retirementTotal), 'text-green-400/80'],
            ...(retirementDivIncome != null && retirementDivIncome > 0 ? [
              ['Retirement div. income', `${usd(retirementDivIncome)}/yr`, 'text-emerald-400'],
            ] : []),
          ]}
        />

        {/* Work Stock */}
        <SectionCard
          to="/workstock"
          icon={Briefcase}
          iconClass="bg-blue-500/10 text-blue-400"
          title="Work Stock Plans"
          primary={loading ? null : usd(workStockTotal)}
          primaryLabel={`${(workStock ?? []).length} plan${(workStock ?? []).length !== 1 ? 's' : ''} tracked manually`}
          loading={loading}
          rows={[
            ['Contribution to net worth', loading ? null : signed(workStockTotal), 'text-green-400/80'],
          ]}
        />

        {/* Brokerage */}
        <SectionCard
          to="/brokerage"
          icon={BarChart2}
          iconClass="bg-indigo-500/10 text-indigo-400"
          title="Brokerage Accounts"
          primary={loading ? null : usd(brokerageTotal)}
          primaryLabel={`${(brokerage ?? []).length} account${(brokerage ?? []).length !== 1 ? 's' : ''}`}
          loading={loading}
          rows={[
            ['Contribution to net worth', loading ? null : signed(brokerageTotal), 'text-green-400/80'],
          ]}
        />

        {/* Physical Assets */}
        <SectionCard
          to="/assets"
          icon={Layers}
          iconClass="bg-orange-500/10 text-orange-400"
          title="Physical Assets"
          primary={loading ? null : usd(assetEquity)}
          primaryLabel="net equity (value − debt)"
          loading={loading}
          rows={loading ? [] : [
            ['Total value', usd(assetValue), 'text-slate-300'],
            ['Total debt',  usd(assetDebt),  'text-red-400/80'],
          ]}
        />

        {/* Liquid Assets */}
        <SectionCard
          to="/liquid"
          icon={Wallet}
          iconClass="bg-cyan-500/10 text-cyan-400"
          title="Liquid Assets"
          primary={loading ? null : usd(liquidTotal)}
          primaryLabel={`${(liquid ?? []).length} account${(liquid ?? []).length !== 1 ? 's' : ''}`}
          loading={loading}
          rows={loading ? [] : [
            ['Contribution to net worth', signed(liquidTotal), 'text-green-400/80'],
          ]}
        />

        {/* Loans */}
        <SectionCard
          to="/loans"
          icon={CreditCard}
          iconClass="bg-rose-500/10 text-rose-400"
          title="Loans"
          primary={hasLoans ? usd(loanCurrentTotal) : 'None'}
          primaryLabel={hasLoans ? `current balance · ${loans.length} loan${loans.length !== 1 ? 's' : ''}` : null}
          primaryClass={hasLoans ? 'text-rose-400' : 'text-slate-400'}
          loading={false}
          rows={hasLoans ? [
            ['Remaining interest', usd(loanInterestTotal),                        'text-rose-400/80'],
            ['Original principal', usd(loanPrincipalTotal),                       'text-slate-400'],
            ['Net worth drag',     `−${usd(loanCurrentTotal + loanInterestTotal)}`, 'text-rose-400'],
          ] : []}
        />

        {/* Mortgage */}
        <SectionCard
          to="/mortgage"
          icon={Home}
          iconClass="bg-yellow-500/10 text-yellow-400"
          title={mortgageProperties.length > 1 ? `Mortgages (${mortgageProperties.length})` : 'Mortgage'}
          primary={hasMortgage ? usd(mortgageBalance) : 'Not set up'}
          primaryLabel={hasMortgage ? 'remaining balance' : null}
          primaryClass={hasMortgage ? 'text-rose-400' : 'text-slate-400'}
          loading={false}
          rows={mortgageCardRows}
        />

      </div>

    </div>
  )
}
