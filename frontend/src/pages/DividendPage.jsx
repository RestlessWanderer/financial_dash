import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { RefreshCw, Landmark, Plus, X, LoaderCircle } from 'lucide-react'

const DEFAULT_TARGET  = 100_000
const MIN_YIELD_HIGH  = 0.05    // ≥ 5%  → high-yield tier
const MIN_YIELD_MID   = 0.025   // 2.5–4.99% → mid-yield / quality tier

function loadTarget() {
  try {
    const p = JSON.parse(localStorage.getItem('user_profile') ?? 'null')
    return (p?.divGoal && p.divGoal > 0) ? p.divGoal : DEFAULT_TARGET
  } catch { return DEFAULT_TARGET }
}

function formatGoalLabel(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  return `$${n}`
}

function buildMilestones(target) {
  const step = target / 4
  return [1, 2, 3, 4].map(i => Math.round(step * i))
}

function usd(n, dec = 0) {
  return (n ?? 0).toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  })
}

function YieldPill({ value }) {
  const pct = (value * 100).toFixed(1)
  const cls = value >= 0.08
    ? 'bg-green-500/20 text-green-300 border border-green-400/30 font-bold'
    : 'bg-green-500/10 text-green-400 border border-green-500/20'
  return <span className={`text-xs px-2 py-0.5 rounded-full mono ${cls}`}>{pct}%</span>
}

/** Moat: Wide (green) / Narrow (yellow) / Weak (red) / null = — */
function MoatPill({ label, score }) {
  if (!label) return <span className="text-muted/40 text-xs">—</span>
  const cls = label === 'Wide'
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : label === 'Narrow'
    ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
    : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${cls}`}
      title={score != null ? `Moat score: ${score}/100` : undefined}
    >
      {label}
    </span>
  )
}

/** Beta: <0.5 green (low vol), 0.5–1.0 yellow, >1.0 red (high vol), null = — */
function BetaPill({ value }) {
  if (value == null) return <span className="text-muted/40 text-xs">—</span>
  const cls = value < 0.5
    ? 'text-emerald-400'
    : value < 1.0
    ? 'text-yellow-400'
    : 'text-rose-400'
  return <span className={`mono text-xs font-semibold ${cls}`}>{value.toFixed(2)}</span>
}

/**
 * Payout ratio: <0.8 green (sustainable), 0.8–1.0 yellow (stretched),
 * >1.0 red (paying out more than earned — dividend cut risk).
 * ETFs/REITs/BDCs often legitimately exceed 1.0 due to pass-through rules,
 * so we show the value but don't alarm-red them without context.
 */
function PayoutPill({ value }) {
  if (value == null) return <span className="text-muted/40 text-xs">—</span>
  const pct = (value * 100).toFixed(0)
  const cls = value <= 0.8
    ? 'text-emerald-400'
    : value <= 1.0
    ? 'text-yellow-400'
    : 'text-rose-400'
  return (
    <span className={`mono text-xs font-semibold ${cls}`} title={value > 1 ? 'Paying out more than earnings — common for REITs/BDCs, watch for stocks' : undefined}>
      {pct}%
    </span>
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

/**
 * Build the dividend plan.
 *
 * Normal mode — income-equal allocation:
 *   Each position targets (targetIncome / n) in annual income.
 *   shares = ceil(incomePerPos / annualDividend)
 *   This fixes the old equal-capital bug: high-yield tickers need fewer
 *   shares, low-yield tickers need more — each contributes equally to income.
 *
 * Max Acceleration mode — yield-concentrated, minimum capital:
 *   Tickers sorted highest-yield first. Income target divided equally
 *   across only the top yielders. Remaining tickers show 0 target shares
 *   but still appear in the table so you can track positions you own.
 *   Result: minimum total capital to hit the goal.
 */
function buildPlan(stocks, targetIncome, maxAccel = false) {
  if (stocks.length === 0) return { rows: [], totalNeeded: 0, totalIncome: 0, avgYield: 0, perStock: 0 }

  const avgYield = stocks.reduce((s, t) => s + t.dividend_yield, 0) / stocks.length

  // In max-accel mode concentrate into highest-yield positions only
  // Use tickers until their combined yield capacity can cover the goal,
  // capped at top 15 to keep the plan actionable.
  let activeStocks, inactiveStocks
  if (maxAccel) {
    const byYield = [...stocks].sort((a, b) => b.dividend_yield - a.dividend_yield)
    // Take the top 15 highest-yield tickers as the active set
    const cap = Math.min(15, byYield.length)
    activeStocks   = byYield.slice(0, cap)
    inactiveStocks = byYield.slice(cap)
  } else {
    activeStocks   = stocks
    inactiveStocks = []
  }

  const n = activeStocks.length
  const incomePerPos = targetIncome / n

  const activeRows = activeStocks.map(s => {
    const price  = s.price ?? 0
    const annDiv = s.annual_dividend ?? 0
    const targetShares = annDiv > 0 ? Math.ceil(incomePerPos / annDiv) : 0
    return {
      ...s,
      targetShares,
      targetInvest: targetShares * price,
      targetIncome: targetShares * annDiv,
    }
  })

  // Inactive tickers still appear in the table with 0 plan targets
  const inactiveRows = inactiveStocks.map(s => ({
    ...s,
    targetShares: 0,
    targetInvest: 0,
    targetIncome: 0,
  }))

  const rows = [...activeRows, ...inactiveRows]
    .sort((a, b) => b.targetIncome - a.targetIncome)

  return {
    rows,
    totalNeeded: activeRows.reduce((s, r) => s + r.targetInvest, 0),
    totalIncome: activeRows.reduce((s, r) => s + r.targetIncome, 0),
    avgYield,
    perStock: incomePerPos,
  }
}

const BAR_GRADIENT = 'linear-gradient(to right, #ef4444 0%, #f97316 25%, #eab308 50%, #22c55e 100%)'

function progressColor(pct) {
  if (pct < 25) return '#ef4444'
  if (pct < 50) return '#f97316'
  if (pct < 75) return '#eab308'
  return '#22c55e'
}

function buildTicks(target) {
  // 4 milestone ticks + start/end, plus minor ticks between milestones
  const step = target / 4
  const milestones = [0, step, step * 2, step * 3, target]
  // add 3 minor ticks between each pair of milestones
  const all = new Set(milestones)
  for (let i = 0; i < 4; i++) {
    const from = step * i
    const minor = step / 4
    for (let j = 1; j < 4; j++) all.add(Math.round(from + minor * j))
  }
  return [...all].sort((a, b) => a - b)
}

function IncomeProgressBar({ current, target }) {
  const pct   = Math.min(100, Math.max(0, (current / target) * 100))
  const color = progressColor(pct)
  const step  = target / 4
  const milestoneSet = new Set([0, step, step * 2, step * 3, target].map(Math.round))
  const ticks = buildTicks(target)
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted uppercase tracking-widest font-medium">Income Goal Progress</span>
        <span className="mono text-sm font-bold" style={{ color }}>{usd(current)} / yr</span>
      </div>
      <div className="relative h-5 rounded-full overflow-hidden bg-surface border border-border/50">
        <div className="absolute inset-0 opacity-[0.12] rounded-full" style={{ background: BAR_GRADIENT }} />
        {pct > 0 && (
          <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
               style={{ width: `${pct}%`, background: BAR_GRADIENT }} />
        )}
        {pct > 0 && (
          <div className="absolute inset-y-0 left-0 rounded-full pointer-events-none"
               style={{ width: `${pct}%`, background: 'linear-gradient(to bottom, rgba(255,255,255,0.15) 0%, transparent 60%)' }} />
        )}
      </div>
      <div className="relative" style={{ height: '24px' }}>
        {ticks.map(t => {
          const x           = (t / target) * 100
          const isMilestone = milestoneSet.has(t)
          const isFirst     = t === 0
          const isLast      = t === target
          const label       = isMilestone ? formatGoalLabel(t) : undefined
          return (
            <div key={t} className="absolute top-0 flex flex-col items-center"
              style={{
                left:      isLast  ? undefined : isFirst ? 0      : `${x}%`,
                right:     isLast  ? 0         : undefined,
                transform: (!isFirst && !isLast) ? 'translateX(-50%)' : undefined,
              }}>
              <div className={`w-px ${isMilestone ? 'h-2 bg-border' : 'h-1.5 bg-border/40'}`} />
              {label && <span className={`text-[9px] mt-0.5 whitespace-nowrap ${isMilestone ? 'text-muted' : 'text-border'}`}>{label}</span>}
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-muted -mt-1">
        {pct >= 100
          ? <span className="text-emerald-400 font-semibold">🎉 {formatGoalLabel(target)}/yr goal reached!</span>
          : <><span className="text-slate-300 font-medium">{usd(target - current)}</span>{' '}remaining · {pct.toFixed(1)}% complete</>
        }
      </p>
    </div>
  )
}

/* ── Add Ticker Card ─────────────────────────────────────────────── */
function AddTickerCard({ onAdd, screenedSymbols = [] }) {
  const [symbol,  setSymbol]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [warn,    setWarn]    = useState('')
  const inputRef = useRef(null)

  const submit = async () => {
    const sym = symbol.trim().toUpperCase()
    if (!sym) return
    // Check if already in the screened portfolio
    if (screenedSymbols.includes(sym)) {
      setWarn(sym)
      return
    }
    setWarn('')
    setLoading(true)
    setError('')
    try {
      const result = await onAdd(sym)
      if (result) {
        setSymbol('')
        inputRef.current?.focus()
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const kd = (e) => {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') { setSymbol(''); setError(''); setWarn('') }
  }

  return (
    <div className="card border-dashed border-border/60 space-y-2">
      <p className="text-xs font-medium text-slate-300">Add a ticker to track</p>
      <p className="text-[10px] text-muted">
        Enter any stock or ETF symbol. Live dividend data will be fetched from Yahoo Finance
        and the ticker will persist across portfolio refreshes.
      </p>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={symbol}
          onChange={e => { setSymbol(e.target.value.toUpperCase()); setError(''); setWarn('') }}
          onKeyDown={kd}
          placeholder="e.g. AAPL, JEPI, O"
          maxLength={10}
          className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm mono uppercase focus:outline-none focus:border-accent transition-colors placeholder:normal-case placeholder:text-muted"
          disabled={loading}
        />
        <button
          onClick={submit}
          disabled={loading || !symbol.trim()}
          className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-40"
        >
          {loading
            ? <><LoaderCircle size={12} className="animate-spin" /> Fetching…</>
            : <><Plus size={12} /> Add</>
          }
        </button>
      </div>
      {warn && (
        <p className="text-[11px] text-amber-400 flex items-start gap-1.5">
          <span className="shrink-0">ℹ</span>
          <span>
            <strong>{warn}</strong> is already in the screened portfolio below — scroll down to the Portfolio Breakdown table and update the <em>Shares Owned</em> column to track your position.
          </span>
        </p>
      )}
      {error && (
        <p className="text-[11px] text-rose-400 flex items-start gap-1">
          <span className="shrink-0">⚠</span> {error}
        </p>
      )}
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function DividendPage() {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [error,       setError]       = useState('')
  const [ownedInputs, setOwnedInputs] = useState({})
  const [savedOwned,  setSavedOwned]  = useState({})
  const [TARGET,      setTARGET]      = useState(() => loadTarget())
  const [riskFilter,  setRiskFilter]  = useState('normal')
  const [maxAccel,    setMaxAccel]    = useState(false)
  const debounceRef = useRef({})

  // Re-read target from profile whenever page gains focus (user may have updated profile)
  useEffect(() => {
    const onFocus = () => setTARGET(loadTarget())
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    Promise.allSettled([api.getDividends(), api.getDividendHoldings()])
      .then(([divRes, holdRes]) => {
        if (divRes.status  === 'fulfilled') setData(divRes.value)
        if (holdRes.status === 'fulfilled') {
          const h = holdRes.value
          setSavedOwned(h)
          setOwnedInputs(
            Object.fromEntries(
              Object.entries(h)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => [k, String(v)])
            )
          )
        }
        setLoading(false)
      })
  }, [])

  const refresh = async () => {
    setRefreshing(true); setError('')
    try {
      await api.refreshDividends()
      // Re-fetch both data and holdings after refresh so user-added tickers
      // and their shares owned are always preserved in the UI.
      const [divRes, holdRes] = await Promise.allSettled([
        api.getDividends(),
        api.getDividendHoldings(),
      ])
      if (divRes.status  === 'fulfilled') setData(divRes.value)
      if (holdRes.status === 'fulfilled') {
        const h = holdRes.value
        setSavedOwned(h)
        setOwnedInputs(
          Object.fromEntries(
            Object.entries(h)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => [k, String(v)])
          )
        )
      }
    } catch (e) {
      setError(e.message || 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  const handleAddTicker = useCallback(async (symbol) => {
    const result = await api.addDividendTicker(symbol)
    // Re-fetch from server to guarantee consistent state (avoids render crash
    // from manually patching state with a partially-shaped object)
    const [freshData, freshHoldings] = await Promise.allSettled([
      api.getDividends(),
      api.getDividendHoldings(),
    ])
    if (freshData.status     === 'fulfilled') setData(freshData.value)
    if (freshHoldings.status === 'fulfilled') setSavedOwned(freshHoldings.value)
    return result
  }, [setSavedOwned])

  const handleRemoveTicker = useCallback(async (symbol) => {
    await api.removeDividendTicker(symbol)
    setData(prev => {
      if (!prev) return prev
      const stocks = prev.stocks.filter(s => s.symbol !== symbol)
      return { ...prev, stocks, count: stocks.length }
    })
    // Also clear shares owned for the removed ticker
    setOwnedInputs(prev => { const next = { ...prev }; delete next[symbol]; return next })
    setSavedOwned(prev  => { const next = { ...prev }; delete next[symbol]; return next })
  }, [])

  const handleOwned = useCallback((symbol, raw) => {
    setOwnedInputs(prev => ({ ...prev, [symbol]: raw }))
    clearTimeout(debounceRef.current[symbol])
    debounceRef.current[symbol] = setTimeout(() => {
      const n = parseFloat(raw) || 0
      setSavedOwned(prev => ({ ...prev, [symbol]: n }))
      api.updateDividendHolding(symbol, n).catch(console.error)
    }, 600)
  }, [])

  const getOwned = useCallback((symbol) => {
    const v = ownedInputs[symbol]
    if (v !== undefined) return parseFloat(v) || 0
    return savedOwned[symbol] || 0
  }, [ownedInputs, savedOwned])

  // Separate user-added from screened stocks
  const allStocks = data?.stocks ?? []
  const userAdded = allStocks.filter(s => s.user_added)
  const screened  = allStocks.filter(s => !s.user_added)

  // Split screened into two yield tiers
  const highYield = screened.filter(s => s.dividend_yield >= MIN_YIELD_HIGH)
  const midYield  = screened.filter(s => s.dividend_yield >= MIN_YIELD_MID && s.dividend_yield < MIN_YIELD_HIGH)

  // Helper: apply risk filter to a tier
  // Tickers with null payout_ratio always pass through regardless of setting
  function applyRisk(tier) {
    return tier.filter(s => {
      if (riskFilter === 'normal') return true
      if (s.payout_ratio == null)  return true
      if (riskFilter === 'medium') return s.payout_ratio <= 1.0
      if (riskFilter === 'low')    return s.payout_ratio <= 0.8
      return true
    })
  }

  const highFiltered = applyRisk(highYield)
  const midFiltered  = applyRisk(midYield)
  // Combined for plan math + milestone cards
  const riskFiltered = [...highFiltered, ...midFiltered]
  // Keep qualified alias for any remaining references
  const qualified = riskFiltered

  const MILESTONES = buildMilestones(TARGET)
  // Max accel ignores risk filter and uses the full screened universe
  const planStocks = maxAccel ? [...highYield, ...midYield] : riskFiltered
  const plan = buildPlan(planStocks, TARGET, maxAccel)
  const lastUpdated = timeAgo(data?.last_updated)

  const totalActuallyInvested = allStocks.reduce(
    (sum, s) => sum + getOwned(s.symbol) * (s.price ?? 0), 0
  )
  const totalProjectedIncome = allStocks.reduce(
    (sum, s) => sum + getOwned(s.symbol) * (s.annual_dividend ?? 0), 0
  )
  const toGo = Math.max(0, plan.totalNeeded - totalActuallyInvested)

  const hasContent = !loading && !refreshing && (qualified.length > 0 || userAdded.length > 0)

  return (
    <div className="space-y-5">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-semibold">Dividend Income Planner</h1>
        <p className="text-xs text-muted mt-0.5">
          Your path to{' '}
          <strong className="text-emerald-400">{formatGoalLabel(TARGET)} / year</strong>{' '}
          in passive dividend income
        </p>
      </div>

      {error && (
        <div className="text-red-400 text-sm px-3 py-2 rounded-lg border border-red-400/20 bg-red-400/5">{error}</div>
      )}

      {/* ── Loading / refreshing ─────────────────────────────────── */}
      {(loading || refreshing) && (
        <div className="card text-center py-16 text-muted">
          <RefreshCw size={24} className="mx-auto mb-3 animate-spin opacity-50" />
          <p className="text-sm font-medium text-slate-300">
            {refreshing ? 'Screening dividend stocks & ETFs…' : 'Loading…'}
          </p>
          {refreshing && <p className="text-xs mt-1">~20 seconds</p>}
        </div>
      )}

      {/* ── Empty state (no data yet) ────────────────────────────── */}
      {!loading && !refreshing && !hasContent && (
        <>
          <div className="card text-center py-12 text-muted space-y-3">
            <Landmark size={32} className="mx-auto opacity-30" />
            <p className="font-medium text-slate-300">No data yet</p>
            <p className="text-xs max-w-sm mx-auto">
              Screen dividend-paying stocks and ETFs to build your portfolio plan.
            </p>
            <button
              onClick={refresh} disabled={refreshing}
              className="inline-flex items-center gap-1.5 bg-accent/10 text-accent border border-accent/20 px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors disabled:opacity-50 mx-auto"
            >
              <RefreshCw size={13} />
              Load Data
            </button>
          </div>
          <AddTickerCard onAdd={handleAddTicker} screenedSymbols={screened.map(s => s.symbol)} />
        </>
      )}

      {/* ── Main planner ─────────────────────────────────────────── */}
      {hasContent && (
        <>
          {/* 1. Progress bar */}
          <IncomeProgressBar current={totalProjectedIncome} target={TARGET} />

          {/* 2. $100K portfolio info card */}
          <div className="card border-emerald-500/20 bg-emerald-500/[0.04] space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] text-muted uppercase tracking-widest mb-2">{formatGoalLabel(TARGET)} / yr Portfolio</p>
                <div className="flex flex-wrap gap-x-8 gap-y-3">
                  <Stat label="Total needed" value={usd(plan.totalNeeded)} />
                  <Stat label="Avg yield"    value={`${(plan.avgYield * 100).toFixed(2)}%`} />
                  {maxAccel
                    ? <Stat label="Active positions" value={`Top 15 by yield`} valueClass="text-amber-400" />
                    : <>
                        <Stat label="High yield ≥5%"    value={highFiltered.length} />
                        <Stat label="Mid yield 2.5–5%"  value={midFiltered.length} />
                      </>
                  }
                  <Stat label="Income / position" value={usd(plan.perStock)} />
                </div>
                {maxAccel && (
                  <p className="text-[11px] text-amber-400/80 mt-1">
                    ⚡ Max Acceleration — concentrated into top 15 highest-yield positions, risk filters bypassed. Minimum capital to reach goal.
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Current Projected Income</p>
                <p className="text-4xl font-bold mono text-emerald-400 leading-none">{usd(totalProjectedIncome)}</p>
                <p className="text-xs text-muted mt-1">per year</p>
                {totalProjectedIncome > 0 && (
                  <p className="text-xs text-muted mt-1">
                    ≈ <strong className="text-slate-300">{usd(totalProjectedIncome / 12)}</strong> / mo &nbsp;·&nbsp;{' '}
                    <strong className="text-slate-300">{((totalProjectedIncome / TARGET) * 100).toFixed(1)}%</strong> of goal
                  </p>
                )}
              </div>
            </div>
            <div className="border-t border-border/40 pt-2.5 flex gap-8">
              <Stat label="Invested so far" value={usd(totalActuallyInvested)} valueClass="text-emerald-400" />
              <Stat label="Still needed"    value={toGo === 0 ? '✓ done!' : usd(toGo)}
                valueClass={toGo === 0 ? 'text-emerald-400' : 'text-amber-400'} />
            </div>
          </div>

          {/* 3. Milestone step cards */}
          <div className="grid grid-cols-4 gap-3">
            {MILESTONES.map((m) => {
              const p     = buildPlan(planStocks, m, maxAccel)
              const toGoM = Math.max(0, p.totalNeeded - totalActuallyInvested)
              const done  = toGoM === 0
              const pct   = Math.min(100, (totalActuallyInvested / p.totalNeeded) * 100)
              return (
                <div key={m} className={`card p-4 border flex flex-col gap-3 ${done ? 'border-emerald-500/40 bg-emerald-500/[0.06]' : 'border-border'}`}>
                  {/* Step label */}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold uppercase tracking-wide ${done ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {formatGoalLabel(m)}/yr
                    </span>
                    {done && <span className="text-emerald-400 text-sm">✓</span>}
                  </div>
                  {/* Mini progress bar */}
                  <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${done ? 'bg-emerald-400' : 'bg-accent'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {/* Stats */}
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] text-muted">Total needed</span>
                      <span className="mono text-xs font-semibold text-slate-200">{usd(p.totalNeeded)}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] text-muted">Invested</span>
                      <span className="mono text-xs font-medium text-emerald-400">{usd(totalActuallyInvested)}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] text-muted">To go</span>
                      <span className={`mono text-xs font-medium ${done ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {done ? '✓ done' : usd(toGoM)}
                      </span>
                    </div>
                  </div>
                  {/* Pct complete */}
                  <p className={`text-[10px] ${done ? 'text-emerald-400/80' : 'text-muted'}`}>
                    {done ? 'Milestone reached!' : `${pct.toFixed(0)}% complete`}
                  </p>
                </div>
              )
            })}
          </div>

          {/* 4. Add a ticker */}
          <AddTickerCard onAdd={handleAddTicker} screenedSymbols={screened.map(s => s.symbol)} />

          {/* 5. Table */}
          <div className="card p-0 overflow-x-auto">
            <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-3 justify-between">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium">
                  Portfolio breakdown —{' '}
                  <span className="text-emerald-400">{formatGoalLabel(TARGET)} / yr</span>
                </span>
                <span className="text-xs text-muted">
                  {highFiltered.length} high · {midFiltered.length} mid{riskFilter !== 'normal' ? ` (risk filtered)` : ''} · {userAdded.length} custom
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {/* Risk filter toggle — disabled in max accel mode */}
                <div className={`flex items-center gap-1.5 transition-opacity ${maxAccel ? 'opacity-30 pointer-events-none' : ''}`}>
                  <span className="text-[10px] text-muted uppercase tracking-wider">Risk:</span>
                  {['normal', 'medium', 'low'].map(level => (
                    <button
                      key={level}
                      onClick={() => setRiskFilter(level)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border ${
                        riskFilter === level
                          ? level === 'low'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : level === 'medium'
                            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
                            : 'bg-white/10 text-slate-200 border-white/20'
                          : 'bg-transparent text-muted border-border/40 hover:border-border hover:text-slate-300'
                      }`}
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Max Acceleration toggle */}
                <button
                  onClick={() => setMaxAccel(v => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border ${
                    maxAccel
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                      : 'bg-transparent text-muted border-border/40 hover:border-border hover:text-slate-300'
                  }`}
                  title="Concentrates allocation into the top 15 highest-yield tickers to minimise capital needed to reach the goal. Ignores risk filter."
                >
                  {maxAccel ? '⚡' : '⚡'} Max Accel
                </button>
                {/* Refresh button */}
                <div className="flex items-center gap-2">
                  {lastUpdated && <span className="text-xs text-muted">Updated {lastUpdated}</span>}
                  <button
                    onClick={refresh} disabled={refreshing}
                    className="flex items-center gap-1.5 bg-accent/10 text-accent border border-accent/20 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                    {refreshing ? 'Fetching…' : qualified.length ? 'Refresh' : 'Load Data'}
                  </button>
                </div>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] text-muted uppercase tracking-wide">
                  <th className="px-3 py-3 text-left w-8">#</th>
                  <th className="px-3 py-3 text-left">Ticker</th>
                  <th className="px-3 py-3 text-left">Company</th>
                  <th className="px-3 py-3 text-right">Yield</th>
                  <th className="px-3 py-3 text-right">Div / Share</th>
                  <th className="px-3 py-3 text-right">Price</th>
                  <th className="px-3 py-3 text-right">Moat</th>
                  <th className="px-3 py-3 text-right">Beta</th>
                  <th className="px-3 py-3 text-right">Payout</th>
                  <th className="px-3 py-3 text-right">Invest</th>
                  <th className="px-3 py-3 text-right">Shares Goal</th>
                  <th className="px-3 py-3 text-right">Shares Owned</th>
                  <th className="px-3 py-3 text-right text-emerald-400/40">Target / yr</th>
                  <th className="px-3 py-3 text-right text-emerald-400">Actual / yr</th>
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody>

                {/* ── User-added tickers ──────────────────────── */}
                {userAdded.length > 0 && (
                  <>
                    <tr className="bg-accent/[0.03]">
                      <td colSpan={15} className="px-3 py-1.5 text-[10px] text-accent/70 uppercase tracking-widest font-medium border-b border-accent/10">
                        Custom Tickers
                      </td>
                    </tr>
                    {userAdded
                      .sort((a, b) => b.dividend_yield - a.dividend_yield)
                      .map((s, i) => {
                        const owned        = getOwned(s.symbol)
                        const actualIncome = owned * (s.annual_dividend ?? 0)
                        return (
                          <tr key={s.symbol}
                            className="border-b border-border/40 hover:bg-white/[0.025] transition-colors bg-accent/[0.02]">
                            <td className="px-3 py-2.5 text-xs text-muted">{i + 1}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="mono font-semibold text-accent">{s.symbol}</span>
                                <span className="text-[9px] bg-accent/15 text-accent border border-accent/25 rounded px-1 py-0.5 uppercase tracking-wide leading-none">custom</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-slate-300 max-w-[150px]"><span className="truncate block">{s.name}</span></td>
                            <td className="px-3 py-2.5 text-right"><YieldPill value={s.dividend_yield} /></td>
                            <td className="px-3 py-2.5 text-right mono text-slate-300">${(s.annual_dividend ?? 0).toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-right mono">${(s.price ?? 0).toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-right"><MoatPill label={s.moat_label} score={s.moat_score} /></td>
                            <td className="px-3 py-2.5 text-right"><BetaPill value={s.beta} /></td>
                            <td className="px-3 py-2.5 text-right"><PayoutPill value={s.payout_ratio} /></td>
                            <td className="px-3 py-2.5 text-right mono text-muted">—</td>
                            <td className="px-3 py-2.5 text-right mono text-muted">—</td>
                            <td className="px-3 py-2.5 text-right">
                              <input type="number" min="0" step="1"
                                value={ownedInputs[s.symbol] ?? ''} placeholder="0"
                                onChange={e => handleOwned(s.symbol, e.target.value)}
                                className="w-20 bg-surface border border-border rounded-md px-2 py-1 text-xs mono text-right focus:outline-none focus:border-accent transition-colors"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right mono text-muted/40">—</td>
                            <td className="px-3 py-2.5 text-right mono">
                              {actualIncome > 0
                                ? <span className="text-emerald-400 font-semibold">{usd(actualIncome)}</span>
                                : <span className="text-muted/40">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button onClick={() => handleRemoveTicker(s.symbol)} title={`Remove ${s.symbol}`}
                                className="p-1 text-muted hover:text-red-400 transition-colors rounded">
                                <X size={13} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                  </>
                )}

                {/* ── High-yield tier (≥ 5%) ──────────────────── */}
                {highFiltered.length > 0 && (() => {
                  const highRows = plan.rows.filter(r => r.dividend_yield >= MIN_YIELD_HIGH)
                  return (
                    <>
                      <tr className="bg-emerald-500/[0.04]">
                        <td colSpan={15} className="px-3 py-1.5 text-[10px] text-emerald-400/80 uppercase tracking-widest font-medium border-b border-emerald-500/20">
                          High Yield — ≥ 5% · {highFiltered.length} tickers
                          {riskFilter === 'medium' && ' · Payout ≤ 100%'}
                          {riskFilter === 'low'    && ' · Payout ≤ 80%'}
                        </td>
                      </tr>
                      {highRows.map((s, i) => <PlanRow key={s.symbol} s={s} i={i} getOwned={getOwned} ownedInputs={ownedInputs} handleOwned={handleOwned} />)}
                    </>
                  )
                })()}

                {/* ── Mid-yield tier (2.5–4.99%) ──────────────── */}
                {midFiltered.length > 0 && (() => {
                  const midRows = plan.rows.filter(r => r.dividend_yield < MIN_YIELD_HIGH)
                  return (
                    <>
                      <tr className="bg-blue-500/[0.04]">
                        <td colSpan={15} className="px-3 py-1.5 text-[10px] text-blue-400/80 uppercase tracking-widest font-medium border-b border-blue-500/20">
                          Mid Yield — 2.5–4.9% · Quality Dividend Growers · {midFiltered.length} tickers
                          {riskFilter === 'medium' && ' · Payout ≤ 100%'}
                          {riskFilter === 'low'    && ' · Payout ≤ 80%'}
                        </td>
                      </tr>
                      {midRows.map((s, i) => <PlanRow key={s.symbol} s={s} i={i} getOwned={getOwned} ownedInputs={ownedInputs} handleOwned={handleOwned} />)}
                    </>
                  )
                })()}

              </tbody>

              {/* ── Totals footer ───────────────────────────────── */}
              {totalProjectedIncome > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border/60 bg-white/[0.02]">
                    <td colSpan={12} className="px-3 py-3 text-xs text-slate-400 font-semibold">
                      Total
                    </td>
                    <td className="px-3 py-3 text-right mono font-bold text-emerald-400/50">
                      {usd(plan.totalIncome)}
                    </td>
                    <td className="px-3 py-3 text-right mono font-bold text-emerald-400">
                      {usd(totalProjectedIncome)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <p className="text-xs text-muted">
            {maxAccel
              ? <>⚡ <strong className="text-amber-400">Max Acceleration</strong> — top 15 highest-yield positions, all risk filters bypassed. </>
              : <>{highFiltered.length} high-yield (≥5%) · {midFiltered.length} mid-yield (2.5–4.9%){riskFilter !== 'normal' ? ` · risk filter: ${riskFilter}` : ''} · </>
            }
            {userAdded.length} custom tickers.
            Equal-income allocation per position. Custom tickers always tracked regardless of yield.
            Projected income updates live as you enter shares. Moat score computed from ROE, margins, ROA, and D/E. Data via Yahoo Finance · not financial advice.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[10px] text-muted border-t border-border/30 pt-3">
            <span className="font-medium text-slate-400 uppercase tracking-wider">Key:</span>
            <span><span className="font-semibold text-emerald-400">Moat Wide</span> — strong competitive advantage (score ≥ 65)</span>
            <span><span className="font-semibold text-yellow-400">Moat Narrow</span> — some advantage (35–64)</span>
            <span><span className="font-semibold text-rose-400">Moat Weak</span> — limited defensibility (&lt; 35)</span>
            <span className="border-l border-border/40 pl-6"><span className="font-semibold text-emerald-400">Beta &lt; 0.5</span> — low vol</span>
            <span><span className="font-semibold text-yellow-400">Beta 0.5–1.0</span> — moderate</span>
            <span><span className="font-semibold text-rose-400">Beta &gt; 1.0</span> — high vol</span>
            <span className="border-l border-border/40 pl-6"><span className="font-semibold text-emerald-400">Payout ≤ 80%</span> — sustainable</span>
            <span><span className="font-semibold text-yellow-400">Payout 80–100%</span> — stretched</span>
            <span><span className="font-semibold text-rose-400">Payout &gt; 100%</span> — exceeds earnings · normal for REITs/BDCs</span>
          </div>
        </>
      )}
    </div>
  )
}

function PlanRow({ s, i, getOwned, ownedInputs, handleOwned }) {
  const owned        = getOwned(s.symbol)
  const sharesGoal   = Math.max(0, s.targetShares - owned)
  const goalMet      = owned >= s.targetShares
  const remainInvest = sharesGoal * (s.price ?? 0)
  const actualIncome = owned * (s.annual_dividend ?? 0)
  return (
    <tr className="border-b border-border/40 hover:bg-white/[0.025] transition-colors">
      <td className="px-3 py-2.5 text-xs text-muted">{i + 1}</td>
      <td className="px-3 py-2.5 mono font-semibold text-accent">{s.symbol}</td>
      <td className="px-3 py-2.5 text-xs text-slate-300 max-w-[150px]"><span className="truncate block">{s.name}</span></td>
      <td className="px-3 py-2.5 text-right"><YieldPill value={s.dividend_yield} /></td>
      <td className="px-3 py-2.5 text-right mono text-slate-300">${(s.annual_dividend ?? 0).toFixed(2)}</td>
      <td className="px-3 py-2.5 text-right mono">${(s.price ?? 0).toFixed(2)}</td>
      <td className="px-3 py-2.5 text-right"><MoatPill label={s.moat_label} score={s.moat_score} /></td>
      <td className="px-3 py-2.5 text-right"><BetaPill value={s.beta} /></td>
      <td className="px-3 py-2.5 text-right"><PayoutPill value={s.payout_ratio} /></td>
      <td className="px-3 py-2.5 text-right mono">
        {goalMet
          ? <span className="text-emerald-400 text-xs font-medium">✓ done</span>
          : usd(remainInvest)}
      </td>
      <td className="px-3 py-2.5 text-right mono">
        {goalMet
          ? <span className="text-emerald-400 text-xs font-medium">✓ {s.targetShares.toLocaleString()}</span>
          : <span>{sharesGoal.toLocaleString()}</span>}
      </td>
      <td className="px-3 py-2.5 text-right">
        <input type="number" min="0" step="1"
          value={ownedInputs[s.symbol] ?? ''} placeholder="0"
          onChange={e => handleOwned(s.symbol, e.target.value)}
          className="w-20 bg-surface border border-border rounded-md px-2 py-1 text-xs mono text-right focus:outline-none focus:border-accent transition-colors"
        />
      </td>
      <td className="px-3 py-2.5 text-right mono text-emerald-400/40">{usd(s.targetIncome)}</td>
      <td className="px-3 py-2.5 text-right mono">
        {actualIncome > 0
          ? <span className="text-emerald-400 font-semibold">{usd(actualIncome)}</span>
          : <span className="text-muted/40">—</span>}
      </td>
      <td className="px-3 py-2.5" />
    </tr>
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
