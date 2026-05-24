import { useState, useEffect } from 'react'
import { api } from '../api'
import { RefreshCw, Landmark, TrendingUp } from 'lucide-react'

const MILESTONES   = [25_000, 50_000, 75_000, 100_000]
const MILESTONE_LABELS = ['$25K', '$50K', '$75K', '$100K']

// Only show stocks at or above 5 % yield (green and green-bold tiers)
const MIN_YIELD = 0.05

function usd(n, decimals = 0) {
  return n.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function YieldPill({ value }) {
  const pct = (value * 100).toFixed(1)
  const cls = value >= 0.08
    ? 'bg-green-500/20 text-green-300 border border-green-400/30 font-bold'
    : 'bg-green-500/10 text-green-400 border border-green-500/20'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full mono ${cls}`}>{pct}%</span>
  )
}

function timeAgo(iso) {
  if (!iso) return null
  const mins = Math.round((Date.now() - new Date(iso + 'Z').getTime()) / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.round(mins / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

// Build the allocation plan for one milestone target
function buildPlan(stocks, targetIncome) {
  const n = stocks.length
  if (n === 0) return { rows: [], totalInvested: 0, totalIncome: 0 }

  const avgYield   = stocks.reduce((s, t) => s + t.dividend_yield, 0) / n
  const totalIdeal = targetIncome / avgYield      // ideal $ needed (fractional)
  const perStock   = totalIdeal / n               // equal-weight target per stock

  const rows = stocks.map(s => {
    // Round up to the next whole share so we always hit or exceed the target
    const shares   = Math.ceil(perStock / s.price)
    const invested = shares * s.price
    const income   = shares * s.annual_dividend
    return { ...s, shares, invested, income }
  }).sort((a, b) => b.income - a.income)

  const totalInvested = rows.reduce((s, r) => s + r.invested, 0)
  const totalIncome   = rows.reduce((s, r) => s + r.income,   0)
  return { rows, totalInvested, totalIncome, avgYield, perStock }
}

export default function DividendPage() {
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error,      setError]      = useState('')
  const [step,       setStep]       = useState(0)   // 0-3 → MILESTONES index

  useEffect(() => {
    api.getDividends()
      .then(d  => { setData(d);  setLoading(false) })
      .catch(() => { setData({ stocks: [], last_updated: null }); setLoading(false) })
  }, [])

  const refresh = async () => {
    setRefreshing(true); setError('')
    try   { setData(await api.refreshDividends()) }
    catch (e) { setError(e.message || 'Refresh failed') }
    finally   { setRefreshing(false) }
  }

  const qualified   = (data?.stocks ?? []).filter(s => s.dividend_yield >= MIN_YIELD)
  const plan        = buildPlan(qualified, MILESTONES[step])
  const prevPlan    = step > 0 ? buildPlan(qualified, MILESTONES[step - 1]) : null
  const stepUpCost  = prevPlan ? plan.totalInvested - prevPlan.totalInvested : null
  const lastUpdated = timeAgo(data?.last_updated)

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Dividend Income Planner</h1>
          <p className="text-xs text-muted mt-0.5">
            Step-by-step path to{' '}
            <strong className="text-green-400">$100,000 / year</strong>{' '}
            in passive dividend income
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {lastUpdated && <span className="text-xs text-muted">Updated {lastUpdated}</span>}
          <button
            onClick={refresh} disabled={refreshing}
            className="flex items-center gap-1.5 bg-accent/10 text-accent border border-accent/20 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Fetching…' : qualified.length ? 'Refresh' : 'Load Data'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-sm px-3 py-2 rounded-lg border border-red-400/20 bg-red-400/5">
          {error}
        </div>
      )}

      {/* ── Loading / refreshing states ─────────────────────────── */}
      {(loading || refreshing) && (
        <div className="card text-center py-16 text-muted">
          <RefreshCw size={24} className="mx-auto mb-3 animate-spin opacity-50" />
          <p className="text-sm font-medium text-slate-300">
            {refreshing ? 'Screening ~110 dividend stocks…' : 'Loading…'}
          </p>
          {refreshing && (
            <p className="text-xs mt-1">Fetching live yield data in parallel. ~20 seconds.</p>
          )}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────── */}
      {!loading && !refreshing && qualified.length === 0 && (
        <div className="card text-center py-16 text-muted space-y-2">
          <Landmark size={32} className="mx-auto opacity-30" />
          <p className="font-medium text-slate-300">No data yet</p>
          <p className="text-xs max-w-sm mx-auto">
            Click <strong className="text-slate-200">Load Data</strong> to screen
            dividend-paying stocks and ETFs and build your income plan.
          </p>
        </div>
      )}

      {/* ── Main planner ────────────────────────────────────────── */}
      {!loading && !refreshing && qualified.length > 0 && (
        <>

          {/* Milestone step selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted">Income goal:</span>
            {MILESTONES.map((m, i) => (
              <button
                key={m}
                onClick={() => setStep(i)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                  step === i
                    ? 'bg-green-500/20 text-green-300 border-green-400/40 shadow shadow-green-500/10'
                    : 'text-muted border-border hover:border-green-500/30 hover:text-green-400'
                }`}
              >
                {MILESTONE_LABELS[i]}
                <span className="text-[10px] font-normal opacity-70"> /yr</span>
              </button>
            ))}
          </div>

          {/* Hero summary card */}
          <div className="card border-green-500/25 bg-green-500/5 flex flex-wrap gap-x-8 gap-y-4 items-center">

            {/* Primary number */}
            <div>
              <p className="text-[10px] text-muted uppercase tracking-widest mb-1">
                Total portfolio value needed
              </p>
              <p className="text-4xl font-bold mono text-green-400 leading-none">
                {usd(plan.totalInvested)}
              </p>
              <p className="text-xs text-muted mt-1.5">
                generates{' '}
                <strong className="text-green-400">~{usd(plan.totalIncome)} / year</strong>
                {' '}in dividends
              </p>
            </div>

            <div className="h-12 w-px bg-border/60 hidden sm:block" />

            {/* Stats row */}
            <div className="flex flex-wrap gap-6">
              <Stat label="Avg yield"    value={`${(plan.avgYield * 100).toFixed(2)}%`} />
              <Stat label="# of stocks"  value={qualified.length} />
              <Stat label="Per stock"    value={usd(plan.perStock)} />
              {stepUpCost !== null && (
                <Stat
                  label={`Step up from ${MILESTONE_LABELS[step - 1]}`}
                  value={`+${usd(stepUpCost)}`}
                  valueClass="text-yellow-400"
                />
              )}
            </div>
          </div>

          {/* 4-step progress strip */}
          <div className="grid grid-cols-4 gap-2">
            {MILESTONES.map((m, i) => {
              const p = buildPlan(qualified, m)
              const active = i === step
              return (
                <button
                  key={m}
                  onClick={() => setStep(i)}
                  className={`card text-left p-3 transition-all border ${
                    active
                      ? 'border-green-500/40 bg-green-500/8'
                      : 'border-border hover:border-green-500/20 opacity-60 hover:opacity-90'
                  }`}
                >
                  <p className={`text-xs font-semibold mb-1 ${active ? 'text-green-400' : 'text-muted'}`}>
                    {MILESTONE_LABELS[i]}/yr
                  </p>
                  <p className="mono text-sm font-bold text-slate-200">{usd(p.totalInvested)}</p>
                  <p className="text-[10px] text-muted mt-0.5">total invested</p>
                </button>
              )
            })}
          </div>

          {/* Allocation table */}
          <div className="card p-0 overflow-x-auto">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium">
                Portfolio breakdown —{' '}
                <span className="text-green-400">{usd(MILESTONES[step])}/yr</span>
              </span>
              <span className="text-xs text-muted">
                {qualified.length} stocks · equal weight · shares rounded up
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] text-muted uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-8">#</th>
                  <th className="px-4 py-3 text-left">Ticker</th>
                  <th className="px-4 py-3 text-left">Company</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Sector</th>
                  <th className="px-4 py-3 text-right">Yield</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Invest</th>
                  <th className="px-4 py-3 text-right">Shares</th>
                  <th className="px-4 py-3 text-right text-green-400">Income / yr</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((s, i) => (
                  <tr key={s.symbol}
                      className="border-b border-border/40 hover:bg-white/[0.025] transition-colors">
                    <td className="px-4 py-2.5 text-xs text-muted">{i + 1}</td>
                    <td className="px-4 py-2.5 mono font-semibold text-accent">{s.symbol}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-300 max-w-[160px]">
                      <span className="truncate block">{s.name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted hidden lg:table-cell">{s.sector}</td>
                    <td className="px-4 py-2.5 text-right"><YieldPill value={s.dividend_yield} /></td>
                    <td className="px-4 py-2.5 text-right mono">${s.price.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right mono">{usd(s.invested)}</td>
                    <td className="px-4 py-2.5 text-right mono">{s.shares.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right mono text-green-400 font-medium">
                      {usd(s.income)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-white/[0.03] font-semibold text-sm">
                  <td colSpan={6} className="px-4 py-3 text-muted text-xs uppercase tracking-wide">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right mono">{usd(plan.totalInvested)}</td>
                  <td className="px-4 py-3 text-right text-muted">—</td>
                  <td className="px-4 py-3 text-right mono text-green-400">
                    {usd(plan.totalIncome)}/yr
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-muted">
            {qualified.length} stocks/ETFs with yield ≥ 5 % shown (screened {data?.count ?? '…'} total with dividend data).
            Equal-weight allocation — each position gets the same dollar amount.
            Shares rounded up so the income target is always met or exceeded.
            Annual income = shares × trailing 12-month dividend. Data via Yahoo Finance · not financial advice.
          </p>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, valueClass = 'text-slate-200' }) {
  return (
    <div>
      <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`mono text-lg font-semibold leading-none ${valueClass}`}>{value}</p>
    </div>
  )
}
