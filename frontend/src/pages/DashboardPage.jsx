import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import {
  PiggyBank, Briefcase, Layers, Home, Landmark, Wallet,
  TrendingUp, TrendingDown, ArrowRight, BarChart2,
} from 'lucide-react'

/* ── Helpers ─────────────────────────────────────────────────────── */
function usd(n, dec = 0) {
  if (n == null || isNaN(n)) return '—'
  return Math.abs(n).toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  })
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

/** Projected annual dividend income from owned shares. */
function calcDividendIncome(holdings, stocks) {
  const map = {}
  stocks.forEach(s => { map[s.symbol] = s })
  return Object.entries(holdings).reduce(
    (sum, [sym, shares]) => sum + ((map[sym]?.annual_dividend ?? 0) * shares), 0
  )
}

/* ── Section card ────────────────────────────────────────────────── */
function SectionCard({ to, icon: Icon, iconClass, title, primary, primaryLabel, rows = [], loading }) {
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
        <p className="mono text-2xl font-bold text-slate-200 leading-none">
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

/* ── Net worth breakdown row ─────────────────────────────────────── */
function NWRow({ label, value, sign = '+', muted = false, total = false }) {
  const cls = total
    ? (value >= 0 ? 'text-green-400' : 'text-red-400')
    : sign === '−'
    ? 'text-red-400/80'
    : 'text-slate-300'

  return (
    <div className={`flex items-baseline justify-between gap-4 ${total ? 'border-t border-border pt-3 mt-1' : ''}`}>
      <span className={`text-xs ${total ? 'font-semibold text-slate-200' : muted ? 'text-muted' : 'text-slate-400'}`}>
        {label}
      </span>
      <span className={`mono text-sm font-semibold ${cls}`}>
        {value == null ? '—' : `${total ? (value >= 0 ? '' : '−') : sign}${usd(Math.abs(value))}`}
      </span>
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

  // Mortgage + retirement div holdings live in localStorage (client-side only)
  const [mortgageConfig,   setMortgageConfig]   = useState(null)
  const [mortgageExtras,   setMortgageExtras]   = useState(null)
  const [retirementDivMap, setRetirementDivMap] = useState({}) // accountId → {symbol: shares}

  useEffect(() => {
    // Read mortgage from localStorage
    try {
      const cfg = localStorage.getItem('mortgage_config')
      const ext = localStorage.getItem('mortgage_extras')
      if (cfg) setMortgageConfig(JSON.parse(cfg))
      if (ext) setMortgageExtras(JSON.parse(ext))
    } catch { /* ignore */ }

    // Read all retirement dividend holdings from localStorage
    // Keys are retirement_divs_{id} — scan all localStorage keys
    try {
      const divMap = {}
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

  const mortgageBalance = calcMortgageBalance(mortgageConfig, mortgageExtras)
  const hasMortgage     = mortgageBalance !== null

  const projectedIncome = (divData && divHoldings)
    ? calcDividendIncome(divHoldings, divData.stocks ?? [])
    : null

  // Retirement div income: sum across all accounts' localStorage holdings
  const retirementDivIncome = divData
    ? Object.values(retirementDivMap).reduce((total, holdings) =>
        total + calcDividendIncome(holdings, divData.stocks ?? []), 0)
    : null

  // Net worth = all assets minus all liabilities
  const netAssets      = retirementTotal + workStockTotal + brokerageTotal + assetValue + liquidTotal
  const netLiabilities = assetDebt + (hasMortgage ? mortgageBalance : 0)
  const netWorth       = netAssets - netLiabilities
  const nwReady        = !loading

  // Dividend progress toward $100K goal
  const divProgress = projectedIncome != null
    ? Math.min(100, (projectedIncome / 100_000) * 100)
    : null

  // Mortgage payoff label
  let mortgageLabel = null
  if (mortgageConfig?.startDate && mortgageConfig?.years) {
    const [y, m] = mortgageConfig.startDate.split('-').map(Number)
    const payoffDate = new Date(y, (m - 1) + parseInt(mortgageConfig.years) * 12)
    mortgageLabel = payoffDate.toLocaleString('default', { month: 'long', year: 'numeric' })
  }

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
            <p className="text-[10px] text-muted uppercase tracking-widest mb-2 flex items-center gap-1.5">
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

          {/* Breakdown */}
          <div className="flex-1 sm:border-l sm:border-border/50 sm:pl-6 space-y-1.5">
            <p className="text-[10px] text-muted uppercase tracking-widest mb-2">Breakdown</p>

            <NWRow label="Retirement Accounts" value={loading ? null : retirementTotal} sign="+" />
            <NWRow label="Work Stock Plans"    value={loading ? null : workStockTotal}  sign="+" />
            <NWRow label="Brokerage Accounts"  value={loading ? null : brokerageTotal}  sign="+" />
            <NWRow label="Liquid Assets"       value={loading ? null : liquidTotal}     sign="+" />
            <NWRow label="Physical Asset Values" value={loading ? null : assetValue}   sign="+" />
            <NWRow label="Physical Asset Debts"  value={loading ? null : assetDebt}    sign="−" />
            {hasMortgage && (
              <NWRow label="Mortgage Balance"  value={loading ? null : mortgageBalance} sign="−" />
            )}
            <NWRow label="Net Worth"           value={loading ? null : netWorth}        total />
          </div>
        </div>
      </div>

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

        {/* Mortgage */}
        <SectionCard
          to="/mortgage"
          icon={Home}
          iconClass="bg-yellow-500/10 text-yellow-400"
          title="Mortgage"
          primary={hasMortgage ? usd(mortgageBalance) : 'Not set up'}
          primaryLabel={hasMortgage ? 'remaining balance' : null}
          loading={false}
          rows={hasMortgage ? [
            ['Original loan',    usd(parseFloat(mortgageConfig?.principal)), 'text-slate-300'],
            ['Standard payoff',  mortgageLabel,                              'text-slate-300'],
            ['Liability impact', `−${usd(mortgageBalance)}`,                'text-red-400/80'],
          ] : []}
        />

        {/* Dividends */}
        <SectionCard
          to="/dividends"
          icon={Landmark}
          iconClass="bg-green-500/10 text-green-400"
          title="Dividend Income"
          primary={projectedIncome != null ? `${usd(projectedIncome)}/yr` : '—'}
          primaryLabel="projected annual income from owned shares"
          loading={loading}
          rows={divProgress != null ? [
            ['Goal ($100K/yr)', `${divProgress.toFixed(1)}% complete`, divProgress >= 100 ? 'text-green-400' : 'text-yellow-400'],
            ['Monthly',         projectedIncome != null ? `${usd(projectedIncome / 12)}/mo` : '—', 'text-slate-300'],
          ] : []}
        />

      </div>
    </div>
  )
}
