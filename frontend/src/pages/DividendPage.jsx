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
 * Build the dividend plan from a set of portfolio tickers.
 *
 * Normal mode — equal-income allocation:
 *   Each position targets (targetIncome / n) in annual income.
 *   targetShares = ceil(incomePerPos / annualDividend)
 *   Higher-yield tickers need fewer shares, lower-yield need more.
 *
 * Max Acceleration mode — yield-weighted allocation:
 *   Income is distributed proportionally to each ticker's yield.
 *   Higher-yield tickers receive a larger income slice, so less
 *   total capital is needed to hit the goal.
 *   incomeForTicker = targetIncome * (yield / sumOfAllYields)
 *   targetShares    = ceil(incomeForTicker / annualDividend)
 */
function buildPlan(stocks, targetIncome, maxAccel = false) {
  if (stocks.length === 0) return { rows: [], totalNeeded: 0, totalIncome: 0, avgYield: 0, perStock: 0 }

  const avgYield  = stocks.reduce((s, t) => s + t.dividend_yield, 0) / stocks.length
  const sorted    = [...stocks].sort((a, b) => b.dividend_yield - a.dividend_yield)
  const yieldSum  = stocks.reduce((s, t) => s + t.dividend_yield, 0)

  const rows = sorted.map(s => {
    const price  = s.price ?? 0
    const annDiv = s.annual_dividend ?? 0

    let targetShares
    if (maxAccel) {
      // Yield-weighted: ticker gets a share of income proportional to its yield
      const incomeSlice = yieldSum > 0 ? targetIncome * (s.dividend_yield / yieldSum) : targetIncome / sorted.length
      targetShares = annDiv > 0 ? Math.ceil(incomeSlice / annDiv) : 0
    } else {
      // Equal-income: every ticker targets the same income contribution
      const incomePerPos = targetIncome / stocks.length
      targetShares = annDiv > 0 ? Math.ceil(incomePerPos / annDiv) : 0
    }

    return {
      ...s,
      targetShares,
      targetInvest: targetShares * price,
      targetIncome: targetShares * annDiv,
    }
  })

  return {
    rows,
    totalNeeded: rows.reduce((s, r) => s + r.targetInvest, 0),
    totalIncome: rows.reduce((s, r) => s + r.targetIncome, 0),
    avgYield,
    perStock: targetIncome / stocks.length,
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
  const step = target / 4
  const milestones = [0, step, step * 2, step * 3, target]
  const all = new Set(milestones)
  for (let i = 0; i < 4; i++) {
    const from  = step * i
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
    <div className="space-y-3">
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

function Stat({ label, value, valueClass = 'text-slate-200' }) {
  return (
    <div>
      <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`mono text-lg font-semibold leading-none ${valueClass}`}>{value}</p>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function DividendPage() {
  const [data,           setData]           = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [refreshing,     setRefreshing]     = useState(false)   // full rescreen
  const [refreshingPx,   setRefreshingPx]   = useState(false)   // portfolio price refresh
  const [addingSymbol,   setAddingSymbol]   = useState(null)    // screener "+" in-flight
  const [error,          setError]          = useState('')
  const [ownedInputs,    setOwnedInputs]    = useState({})
  const [savedOwned,     setSavedOwned]     = useState({})
  const [TARGET,         setTARGET]         = useState(() => loadTarget())
  const [riskFilter,     setRiskFilter]     = useState('normal')
  const [maxAccel,       setMaxAccel]       = useState(false)
  const [addSymbol,      setAddSymbol]      = useState('')
  const [addLoading,     setAddLoading]     = useState(false)
  const [addError,       setAddError]       = useState('')
  const addInputRef = useRef(null)
  const debounceRef = useRef({})

  // Re-read target from profile whenever page gains focus
  useEffect(() => {
    const onFocus = () => setTARGET(loadTarget())
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // Initial load: fetch dividends + holdings
  useEffect(() => {
    Promise.allSettled([api.getDividends(), api.getDividendHoldings()])
      .then(([divRes, holdRes]) => {
        if (divRes.status  === 'fulfilled') setData(divRes.value)
        if (holdRes.status === 'fulfilled') {
          const h = holdRes.value
          setSavedOwned(h)
          // Only pre-populate inputs for non-zero positions — preserves any
          // in-flight edits the user may have made before this resolves
          setOwnedInputs(prev => {
            const merged = { ...prev }
            Object.entries(h).forEach(([k, v]) => {
              if (v > 0 && merged[k] === undefined) merged[k] = String(v)
            })
            return merged
          })
        }
        setLoading(false)
      })
  }, [])

  // Helper: merge fresh dividend + holdings data into state WITHOUT touching
  // existing ownedInputs (preserves any in-progress edits)
  const mergeData = useCallback((divData, holdData) => {
    if (divData)  setData(divData)
    if (holdData) {
      setSavedOwned(holdData)
      setOwnedInputs(prev => {
        const merged = { ...prev }
        Object.entries(holdData).forEach(([k, v]) => {
          if (v > 0 && merged[k] === undefined) merged[k] = String(v)
        })
        return merged
      })
    }
  }, [])

  // Full rescreen (screener refresh button)
  const handleRescreen = async () => {
    setRefreshing(true); setError('')
    try {
      await api.refreshDividends()
      const [divRes, holdRes] = await Promise.allSettled([
        api.getDividends(),
        api.getDividendHoldings(),
      ])
      mergeData(
        divRes.status  === 'fulfilled' ? divRes.value  : null,
        holdRes.status === 'fulfilled' ? holdRes.value : null,
      )
    } catch (e) {
      setError(e.message || 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  // Lightweight portfolio price refresh: re-adds each user_added ticker
  // which triggers fetch_one() and updates the snapshot in the DB
  const handleRefreshPrices = useCallback(async () => {
    if (!data) return
    const portfolioSymbols = (data.stocks ?? [])
      .filter(s => s.user_added)
      .map(s => s.symbol)
    if (portfolioSymbols.length === 0) return
    setRefreshingPx(true); setError('')
    try {
      // Fire all refreshes in parallel — addDividendTicker upserts the snapshot
      await Promise.allSettled(portfolioSymbols.map(sym => api.addDividendTicker(sym)))
      // Re-fetch to get updated prices
      const [divRes, holdRes] = await Promise.allSettled([
        api.getDividends(),
        api.getDividendHoldings(),
      ])
      mergeData(
        divRes.status  === 'fulfilled' ? divRes.value  : null,
        holdRes.status === 'fulfilled' ? holdRes.value : null,
      )
    } catch (e) {
      setError(e.message || 'Price refresh failed')
    } finally {
      setRefreshingPx(false)
    }
  }, [data, mergeData])

  // "Add a ticker" in portfolio card
  const handleAddTicker = useCallback(async () => {
    const sym = addSymbol.trim().toUpperCase()
    if (!sym) return
    setAddLoading(true); setAddError('')
    try {
      await api.addDividendTicker(sym)
      const [divRes, holdRes] = await Promise.allSettled([
        api.getDividends(),
        api.getDividendHoldings(),
      ])
      mergeData(
        divRes.status  === 'fulfilled' ? divRes.value  : null,
        holdRes.status === 'fulfilled' ? holdRes.value : null,
      )
      setAddSymbol('')
      addInputRef.current?.focus()
    } catch (e) {
      setAddError(e.message || 'Could not add ticker')
    } finally {
      setAddLoading(false)
    }
  }, [addSymbol, mergeData])

  // "+" button on screener rows
  const handleScreenerAdd = useCallback(async (symbol) => {
    setAddingSymbol(symbol)
    try {
      await api.addDividendTicker(symbol)
      const [divRes, holdRes] = await Promise.allSettled([
        api.getDividends(),
        api.getDividendHoldings(),
      ])
      mergeData(
        divRes.status  === 'fulfilled' ? divRes.value  : null,
        holdRes.status === 'fulfilled' ? holdRes.value : null,
      )
    } catch (e) {
      setError(e.message || `Could not add ${symbol}`)
    } finally {
      setAddingSymbol(null)
    }
  }, [mergeData])

  const handleRemoveTicker = useCallback(async (symbol) => {
    await api.removeDividendTicker(symbol)
    setData(prev => {
      if (!prev) return prev
      const stocks = prev.stocks.filter(s => s.symbol !== symbol)
      return { ...prev, stocks, count: stocks.length }
    })
    // Do NOT clear ownedInputs / savedOwned — user may re-add later
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

  // ── Derived data ──────────────────────────────────────────────────
  const allStocks  = data?.stocks ?? []
  const portfolio  = allStocks.filter(s => s.user_added)   // Portfolio card
  const screened   = allStocks.filter(s => !s.user_added)  // Screener card

  // Risk filter helper (applies to screener only)
  function applyRisk(tier) {
    return tier.filter(s => {
      if (riskFilter === 'normal') return true
      if (s.payout_ratio == null)  return true
      if (riskFilter === 'medium') return s.payout_ratio <= 1.0
      if (riskFilter === 'low')    return s.payout_ratio <= 0.8
      return true
    })
  }

  const highYield    = screened.filter(s => s.dividend_yield >= MIN_YIELD_HIGH)
  const midYield     = screened.filter(s => s.dividend_yield >= MIN_YIELD_MID && s.dividend_yield < MIN_YIELD_HIGH)
  const highFiltered = applyRisk(highYield)
  const midFiltered  = applyRisk(midYield)

  // Portfolio plan: uses portfolio tickers only
  // Max Accel ignores risk filter and works on the full portfolio
  const planStocks = maxAccel ? portfolio : portfolio  // risk filter doesn't apply to portfolio
  const plan = buildPlan(planStocks, TARGET, maxAccel)

  const MILESTONES = buildMilestones(TARGET)
  const lastUpdated = timeAgo(data?.last_updated)

  const totalActuallyInvested = portfolio.reduce(
    (sum, s) => sum + getOwned(s.symbol) * (s.price ?? 0), 0
  )
  const totalProjectedIncome = portfolio.reduce(
    (sum, s) => sum + getOwned(s.symbol) * (s.annual_dividend ?? 0), 0
  )
  const toGo = Math.max(0, plan.totalNeeded - totalActuallyInvested)

  // Portfolio symbols set — used in screener to hide already-added tickers
  const portfolioSymbols = new Set(portfolio.map(s => s.symbol))

  return (
    <div className="space-y-6">

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

      {loading && (
        <div className="card text-center py-16 text-muted">
          <RefreshCw size={24} className="mx-auto mb-3 animate-spin opacity-50" />
          <p className="text-sm font-medium text-slate-300">Loading…</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          PORTFOLIO CARD (top)
          ══════════════════════════════════════════════════════════ */}
      {!loading && (
        <div className="card p-0 w-full">
          {/* Card header */}
          <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3 justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Portfolio Breakdown</h2>
              <p className="text-[11px] text-muted mt-0.5">
                {portfolio.length} ticker{portfolio.length !== 1 ? 's' : ''} · target{' '}
                <span className="text-emerald-400 font-medium">{formatGoalLabel(TARGET)}/yr</span>
              </p>
            </div>
            {/* Refresh Ticker Prices */}
            {portfolio.length > 0 && (
              <button
                onClick={handleRefreshPrices}
                disabled={refreshingPx}
                className="flex items-center gap-1.5 bg-accent/10 text-accent border border-accent/20 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/20 transition-colors disabled:opacity-50 shrink-0"
              >
                <RefreshCw size={12} className={refreshingPx ? 'animate-spin' : ''} />
                {refreshingPx ? 'Refreshing…' : 'Refresh Ticker Prices'}
              </button>
            )}
          </div>

          <div className="px-5 py-5 space-y-5">
            {/* Progress bar */}
            <IncomeProgressBar current={totalProjectedIncome} target={TARGET} />

            {/* Summary info card */}
            {portfolio.length > 0 && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-5 py-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-widest mb-2">{formatGoalLabel(TARGET)} / yr Portfolio</p>
                    <div className="flex flex-wrap gap-x-8 gap-y-3">
                      <Stat label="Total needed"       value={usd(plan.totalNeeded)} />
                      <Stat label="Avg yield"          value={`${(plan.avgYield * 100).toFixed(2)}%`} />
                      <Stat label="Positions"          value={portfolio.length} />
                      <Stat label="Income / position"  value={usd(plan.perStock)} />
                    </div>
                    {maxAccel && (
                      <p className="text-[11px] text-amber-400/80 mt-2">
                        ⚡ Max Acceleration — sorted by yield, concentrated into your highest-yielding positions. Minimum capital to reach goal.
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
            )}

            {/* Milestone step cards */}
            {portfolio.length > 0 && (
              <div className="grid grid-cols-4 gap-3">
                {MILESTONES.map((m) => {
                  const p     = buildPlan(planStocks, m, maxAccel)
                  const toGoM = Math.max(0, p.totalNeeded - totalActuallyInvested)
                  const done  = toGoM === 0
                  const pct   = p.totalNeeded > 0 ? Math.min(100, (totalActuallyInvested / p.totalNeeded) * 100) : 0
                  return (
                    <div key={m} className={`rounded-xl border p-4 flex flex-col gap-3 ${done ? 'border-emerald-500/40 bg-emerald-500/[0.06]' : 'border-border bg-surface/50'}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold uppercase tracking-wide ${done ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {formatGoalLabel(m)}/yr
                        </span>
                        {done && <span className="text-emerald-400 text-sm">✓</span>}
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${done ? 'bg-emerald-400' : 'bg-accent'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
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
                      <p className={`text-[10px] ${done ? 'text-emerald-400/80' : 'text-muted'}`}>
                        {done ? 'Milestone reached!' : `${pct.toFixed(0)}% complete`}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add a ticker input */}
            <div className="rounded-xl border border-dashed border-border/60 px-4 py-3 space-y-2">
              <p className="text-xs font-medium text-slate-300">Add a ticker to track</p>
              <p className="text-[10px] text-muted">
                Enter any stock or ETF symbol. Live dividend data will be fetched and the ticker will persist across portfolio refreshes.
              </p>
              <div className="flex items-center gap-2">
                <input
                  ref={addInputRef}
                  type="text"
                  value={addSymbol}
                  onChange={e => { setAddSymbol(e.target.value.toUpperCase()); setAddError('') }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddTicker()
                    if (e.key === 'Escape') { setAddSymbol(''); setAddError('') }
                  }}
                  placeholder="e.g. AAPL, JEPI, O"
                  maxLength={10}
                  className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm mono uppercase focus:outline-none focus:border-accent transition-colors placeholder:normal-case placeholder:text-muted"
                  disabled={addLoading}
                />
                <button
                  onClick={handleAddTicker}
                  disabled={addLoading || !addSymbol.trim()}
                  className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-40"
                >
                  {addLoading
                    ? <><LoaderCircle size={12} className="animate-spin" /> Fetching…</>
                    : <><Plus size={12} /> Add</>
                  }
                </button>
              </div>
              {addError && (
                <p className="text-[11px] text-rose-400 flex items-start gap-1">
                  <span className="shrink-0">⚠</span> {addError}
                </p>
              )}
            </div>

            {/* Portfolio table */}
            {portfolio.length === 0 ? (
              <div className="text-center py-10 text-muted space-y-2">
                <Landmark size={28} className="mx-auto opacity-25" />
                <p className="text-sm text-slate-400">No portfolio tickers yet</p>
                <p className="text-xs max-w-xs mx-auto">
                  Add tickers above, or click the <span className="text-accent font-medium">+</span> button on any screener row below.
                </p>
              </div>
            ) : (
              <div className="-mx-5 overflow-x-auto">
                {/* Table toolbar — Max Accel lives here, right above the rows */}
                <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-surface/20">
                  <span className="text-[11px] text-muted">
                    {maxAccel
                      ? <span className="text-amber-400">⚡ Yield-weighted allocation — higher-yield tickers get larger income targets</span>
                      : <span>Equal-income allocation — each position targets the same annual income</span>
                    }
                  </span>
                  <button
                    onClick={() => setMaxAccel(v => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border ${
                      maxAccel
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        : 'bg-transparent text-muted border-border/40 hover:border-border hover:text-slate-300'
                    }`}
                    title="Concentrates allocation into your highest-yield portfolio tickers to minimise capital needed to reach the goal."
                  >
                    ⚡ Max Accel
                  </button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11px] text-muted uppercase tracking-wide bg-surface/40">
                      <th className="px-4 py-3 text-left w-8">#</th>
                      <th className="px-4 py-3 text-left">Ticker</th>
                      <th className="px-4 py-3 text-left">Company</th>
                      <th className="px-4 py-3 text-right">Yield</th>
                      <th className="px-4 py-3 text-right">Div / Share</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3 text-right">Moat</th>
                      <th className="px-4 py-3 text-right">Beta</th>
                      <th className="px-4 py-3 text-right">Payout</th>
                      <th className="px-4 py-3 text-right">Shares Owned</th>
                      <th className="px-4 py-3 text-right text-amber-400/70">Shares Goal</th>
                      <th className="px-4 py-3 text-right text-emerald-400/50">Target / yr</th>
                      <th className="px-4 py-3 text-right text-emerald-400">Actual / yr</th>
                      <th className="px-4 py-3 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows
                      // plan.rows only contains planStocks (portfolio); show all portfolio sorted by plan income
                      .map((s, i) => {
                        const owned        = getOwned(s.symbol)
                        const actualIncome = owned * (s.annual_dividend ?? 0)
                        return (
                          <tr key={s.symbol}
                            className="border-b border-border/40 hover:bg-white/[0.025] transition-colors">
                            <td className="px-4 py-2.5 text-xs text-muted">{i + 1}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="mono font-semibold text-accent">{s.symbol}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-300 max-w-[160px]">
                              <span className="truncate block">{s.name}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right"><YieldPill value={s.dividend_yield} /></td>
                            <td className="px-4 py-2.5 text-right mono text-slate-300">${(s.annual_dividend ?? 0).toFixed(2)}</td>
                            <td className="px-4 py-2.5 text-right mono">${(s.price ?? 0).toFixed(2)}</td>
                            <td className="px-4 py-2.5 text-right"><MoatPill label={s.moat_label} score={s.moat_score} /></td>
                            <td className="px-4 py-2.5 text-right"><BetaPill value={s.beta} /></td>
                            <td className="px-4 py-2.5 text-right"><PayoutPill value={s.payout_ratio} /></td>
                            <td className="px-4 py-2.5 text-right">
                              <input
                                type="number" min="0" step="1"
                                value={ownedInputs[s.symbol] ?? ''} placeholder="0"
                                onChange={e => handleOwned(s.symbol, e.target.value)}
                                className="w-20 bg-surface border border-border rounded-md px-2 py-1 text-xs mono text-right focus:outline-none focus:border-accent transition-colors"
                              />
                            </td>
                            <td className="px-4 py-2.5 text-right mono">
                              {(() => {
                                const owned = getOwned(s.symbol)
                                const goal  = s.targetShares || 0
                                if (goal === 0) return <span className="text-muted/30">—</span>
                                const remaining = Math.max(0, goal - owned)
                                const met = owned >= goal
                                return met
                                  ? <span className="text-emerald-400 text-xs font-medium">✓ {goal.toLocaleString()}</span>
                                  : <span className="text-amber-400 text-xs font-semibold">{remaining.toLocaleString()} more</span>
                              })()}
                            </td>
                            <td className="px-4 py-2.5 text-right mono text-emerald-400/40">
                              {s.targetIncome > 0 ? usd(s.targetIncome) : <span className="text-muted/30">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right mono">
                              {actualIncome > 0
                                ? <span className="text-emerald-400 font-semibold">{usd(actualIncome)}</span>
                                : <span className="text-muted/40">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <button
                                onClick={() => handleRemoveTicker(s.symbol)}
                                title={`Remove ${s.symbol}`}
                                className="p-1 text-muted hover:text-red-400 transition-colors rounded"
                              >
                                <X size={13} />
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    }
                  </tbody>
                  {totalProjectedIncome > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-border/60 bg-white/[0.02]">
                        <td colSpan={11} className="px-4 py-3 text-xs text-slate-400 font-semibold">
                          Total
                        </td>
                        <td className="px-4 py-3 text-right mono font-bold text-emerald-400/50">
                          {usd(plan.totalIncome)}
                        </td>
                        <td className="px-4 py-3 text-right mono font-bold text-emerald-400">
                          {usd(totalProjectedIncome)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

          </div>{/* /px-5 py-5 */}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          SCREENER CARD (bottom)
          ══════════════════════════════════════════════════════════ */}
      {!loading && (
        <div className="card p-0 w-full">
          {/* Card header */}
          <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3 justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Dividend Screener</h2>
              <p className="text-[11px] text-muted mt-0.5">
                {highFiltered.length} high-yield (≥5%) · {midFiltered.length} mid-yield (2.5–4.9%)
                {riskFilter !== 'normal' ? ` · risk filter: ${riskFilter}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0 flex-wrap">
              {/* Risk filter toggle */}
              <div className="flex items-center gap-1.5">
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

              {/* Rescreen (full refresh) button */}
              <div className="flex items-center gap-2">
                {lastUpdated && <span className="text-xs text-muted">Updated {lastUpdated}</span>}
                <button
                  onClick={handleRescreen}
                  disabled={refreshing}
                  className="flex items-center gap-1.5 bg-accent/10 text-accent border border-accent/20 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                  {refreshing ? 'Screening…' : screened.length > 0 ? 'Rescreen' : 'Load Screener'}
                </button>
              </div>
            </div>
          </div>

          {/* Screener loading state */}
          {refreshing && (
            <div className="text-center py-14 text-muted">
              <RefreshCw size={22} className="mx-auto mb-3 animate-spin opacity-50" />
              <p className="text-sm font-medium text-slate-300">Screening dividend stocks & ETFs…</p>
              <p className="text-xs mt-1">~20 seconds</p>
            </div>
          )}

          {/* Empty screener state */}
          {!refreshing && screened.length === 0 && (
            <div className="text-center py-12 text-muted space-y-2 px-5">
              <Landmark size={28} className="mx-auto opacity-25" />
              <p className="text-sm text-slate-400">No screener data yet</p>
              <p className="text-xs max-w-sm mx-auto">
                Click <strong className="text-slate-300">Load Screener</strong> to discover high-quality dividend stocks and ETFs. Takes ~20 seconds.
              </p>
            </div>
          )}

          {/* Screener table */}
          {!refreshing && screened.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] text-muted uppercase tracking-wide bg-surface/40">
                    <th className="px-4 py-3 text-left w-8">#</th>
                    <th className="px-4 py-3 text-left">Ticker</th>
                    <th className="px-4 py-3 text-left">Company</th>
                    <th className="px-4 py-3 text-right">Yield</th>
                    <th className="px-4 py-3 text-right">Div / Share</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Moat</th>
                    <th className="px-4 py-3 text-right">Beta</th>
                    <th className="px-4 py-3 text-right">Payout</th>
                    <th className="px-4 py-3 text-center w-12">Add</th>
                  </tr>
                </thead>
                <tbody>
                  {/* High-yield tier (≥ 5%) */}
                  {highFiltered.length > 0 && (
                    <>
                      <tr className="bg-emerald-500/[0.04]">
                        <td colSpan={10} className="px-4 py-1.5 text-[10px] text-emerald-400/80 uppercase tracking-widest font-medium border-b border-emerald-500/20">
                          High Yield — ≥ 5% · {highFiltered.length} tickers
                          {riskFilter === 'medium' && ' · Payout ≤ 100%'}
                          {riskFilter === 'low'    && ' · Payout ≤ 80%'}
                        </td>
                      </tr>
                      {highFiltered
                        .sort((a, b) => b.dividend_yield - a.dividend_yield)
                        .map((s, i) => (
                          <ScreenerRow
                            key={s.symbol}
                            s={s}
                            i={i}
                            inPortfolio={portfolioSymbols.has(s.symbol)}
                            adding={addingSymbol === s.symbol}
                            onAdd={handleScreenerAdd}
                          />
                        ))
                      }
                    </>
                  )}

                  {/* Mid-yield tier (2.5–4.99%) */}
                  {midFiltered.length > 0 && (
                    <>
                      <tr className="bg-blue-500/[0.04]">
                        <td colSpan={10} className="px-4 py-1.5 text-[10px] text-blue-400/80 uppercase tracking-widest font-medium border-b border-blue-500/20">
                          Mid Yield — 2.5–4.9% · Quality Dividend Growers · {midFiltered.length} tickers
                          {riskFilter === 'medium' && ' · Payout ≤ 100%'}
                          {riskFilter === 'low'    && ' · Payout ≤ 80%'}
                        </td>
                      </tr>
                      {midFiltered
                        .sort((a, b) => b.dividend_yield - a.dividend_yield)
                        .map((s, i) => (
                          <ScreenerRow
                            key={s.symbol}
                            s={s}
                            i={i}
                            inPortfolio={portfolioSymbols.has(s.symbol)}
                            adding={addingSymbol === s.symbol}
                            onAdd={handleScreenerAdd}
                          />
                        ))
                      }
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer key */}
          {!refreshing && screened.length > 0 && (
            <div className="px-5 py-4 border-t border-border/30 space-y-2">
              <p className="text-xs text-muted">
                Click <span className="text-accent font-medium">+</span> to add a screener ticker to your Portfolio Breakdown above.
                Tickers already in your portfolio show a ✓ check.
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[10px] text-muted">
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
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Screener row (read-only, no ownership columns) ─────────────── */
function ScreenerRow({ s, i, inPortfolio, adding, onAdd }) {
  return (
    <tr className="border-b border-border/40 hover:bg-white/[0.025] transition-colors">
      <td className="px-4 py-2.5 text-xs text-muted">{i + 1}</td>
      <td className="px-4 py-2.5 mono font-semibold text-accent">{s.symbol}</td>
      <td className="px-4 py-2.5 text-xs text-slate-300 max-w-[160px]">
        <span className="truncate block">{s.name}</span>
      </td>
      <td className="px-4 py-2.5 text-right"><YieldPill value={s.dividend_yield} /></td>
      <td className="px-4 py-2.5 text-right mono text-slate-300">${(s.annual_dividend ?? 0).toFixed(2)}</td>
      <td className="px-4 py-2.5 text-right mono">${(s.price ?? 0).toFixed(2)}</td>
      <td className="px-4 py-2.5 text-right"><MoatPill label={s.moat_label} score={s.moat_score} /></td>
      <td className="px-4 py-2.5 text-right"><BetaPill value={s.beta} /></td>
      <td className="px-4 py-2.5 text-right"><PayoutPill value={s.payout_ratio} /></td>
      <td className="px-4 py-2.5 text-center">
        {inPortfolio ? (
          <span className="text-emerald-400 text-sm" title="Already in portfolio">✓</span>
        ) : adding ? (
          <LoaderCircle size={14} className="animate-spin text-accent mx-auto" />
        ) : (
          <button
            onClick={() => onAdd(s.symbol)}
            title={`Add ${s.symbol} to portfolio`}
            className="p-1 text-muted hover:text-accent transition-colors rounded hover:bg-accent/10"
          >
            <Plus size={15} />
          </button>
        )}
      </td>
    </tr>
  )
}
