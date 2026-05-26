import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { RefreshCw, Landmark, Plus, X, LoaderCircle } from 'lucide-react'

const TARGET          = 100_000
const MIN_YIELD       = 0.05
const MILESTONES      = [25_000, 50_000, 75_000, 100_000]
const MILESTONE_LABELS = ['$25K', '$50K', '$75K', '$100K']

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

function timeAgo(iso) {
  if (!iso) return null
  const mins = Math.round((Date.now() - new Date(iso + 'Z').getTime()) / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.round(mins / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

function buildPlan(stocks, targetIncome) {
  const n = stocks.length
  if (n === 0) return { rows: [], totalNeeded: 0, totalIncome: 0, avgYield: 0, perStock: 0 }
  const avgYield = stocks.reduce((s, t) => s + t.dividend_yield, 0) / n
  const perStock = (targetIncome / avgYield) / n
  const rows = stocks.map(s => {
    const price    = s.price ?? 0
    const annDiv   = s.annual_dividend ?? 0
    const targetShares = price > 0 ? Math.ceil(perStock / price) : 0
    return {
      ...s,
      targetShares,
      targetInvest: targetShares * price,
      targetIncome: targetShares * annDiv,
    }
  }).sort((a, b) => b.targetIncome - a.targetIncome)
  return {
    rows,
    totalNeeded: rows.reduce((s, r) => s + r.targetInvest, 0),
    totalIncome: rows.reduce((s, r) => s + r.targetIncome, 0),
    avgYield,
    perStock,
  }
}

const BAR_GRADIENT = 'linear-gradient(to right, #ef4444 0%, #f97316 25%, #eab308 50%, #22c55e 100%)'

function progressColor(pct) {
  if (pct < 25) return '#ef4444'
  if (pct < 50) return '#f97316'
  if (pct < 75) return '#eab308'
  return '#22c55e'
}

const TICKS = [0, 10_000, 20_000, 25_000, 30_000, 40_000, 50_000, 60_000, 70_000, 75_000, 80_000, 90_000, 100_000]
const TICK_LABELS = { 0: '$0', 25_000: '$25K', 50_000: '$50K', 75_000: '$75K', 100_000: '$100K' }

function IncomeProgressBar({ current, target }) {
  const pct   = Math.min(100, Math.max(0, (current / target) * 100))
  const color = progressColor(pct)
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
        {TICKS.map(t => {
          const x = (t / target) * 100
          const label = TICK_LABELS[t]
          const isMilestone = label !== undefined
          const isFirst = t === 0
          const isLast  = t === target
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
          ? <span className="text-green-400 font-semibold">🎉 $100K/yr goal reached!</span>
          : <><span className="text-slate-300 font-medium">{usd(TARGET - current)}</span>{' '}remaining · {pct.toFixed(1)}% complete</>
        }
      </p>
    </div>
  )
}

/* ── Add Ticker Card ─────────────────────────────────────────────── */
function AddTickerCard({ onAdd }) {
  const [symbol,  setSymbol]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const inputRef = useRef(null)

  const submit = async () => {
    const sym = symbol.trim().toUpperCase()
    if (!sym) return
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
    if (e.key === 'Escape') { setSymbol(''); setError('') }
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
          onChange={e => { setSymbol(e.target.value.toUpperCase()); setError('') }}
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
      {error && (
        <p className="text-[11px] text-red-400 flex items-start gap-1">
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
  const debounceRef = useRef({})

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
    try   { setData(await api.refreshDividends()) }
    catch (e) { setError(e.message || 'Refresh failed') }
    finally   { setRefreshing(false) }
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
  const allStocks  = data?.stocks ?? []
  const userAdded  = allStocks.filter(s => s.user_added)
  const screened   = allStocks.filter(s => !s.user_added)
  const qualified  = screened.filter(s => s.dividend_yield >= MIN_YIELD)

  const plan = buildPlan(qualified, TARGET)
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Dividend Income Planner</h1>
          <p className="text-xs text-muted mt-0.5">
            Your path to{' '}
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
        <div className="text-red-400 text-sm px-3 py-2 rounded-lg border border-red-400/20 bg-red-400/5">{error}</div>
      )}

      {/* ── Add Ticker card (always visible) ─────────────────────── */}
      {!loading && !refreshing && (
        <AddTickerCard onAdd={handleAddTicker} />
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

      {/* ── Empty state ──────────────────────────────────────────── */}
      {!loading && !refreshing && qualified.length === 0 && userAdded.length === 0 && (
        <div className="card text-center py-16 text-muted space-y-2">
          <Landmark size={32} className="mx-auto opacity-30" />
          <p className="font-medium text-slate-300">No data yet</p>
          <p className="text-xs max-w-sm mx-auto">
            Click <strong className="text-slate-200">Load Data</strong> to screen
            dividend-paying stocks and ETFs, or add your own tickers above.
          </p>
        </div>
      )}

      {/* ── Main planner ─────────────────────────────────────────── */}
      {hasContent && (
        <>
          {/* 1. Progress bar */}
          <IncomeProgressBar current={totalProjectedIncome} target={TARGET} />

          {/* 2. Info cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card border-green-500/20 bg-green-500/[0.04] space-y-3">
              <p className="text-[10px] text-muted uppercase tracking-widest">$100K / yr Portfolio</p>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <Stat label="Total needed" value={usd(plan.totalNeeded)} />
                <Stat label="Avg yield"    value={`${(plan.avgYield * 100).toFixed(2)}%`} />
                <Stat label="Positions"    value={qualified.length} />
                <Stat label="Per stock"    value={usd(plan.perStock)} />
              </div>
              <div className="border-t border-border/40 pt-2.5 flex gap-6">
                <Stat label="Invested so far" value={usd(totalActuallyInvested)} valueClass="text-green-400" />
                <Stat label="To go" value={toGo === 0 ? '✓ done!' : usd(toGo)}
                  valueClass={toGo === 0 ? 'text-green-400' : 'text-yellow-400'} />
              </div>
            </div>
            <div className="card border-green-500/20 bg-green-500/[0.04] flex flex-col justify-center gap-1">
              <p className="text-[10px] text-muted uppercase tracking-widest">Current Projected Income</p>
              <p className="text-5xl font-bold mono text-green-400 leading-none">{usd(totalProjectedIncome)}</p>
              <p className="text-sm text-muted">per year</p>
              {totalProjectedIncome > 0 && (
                <p className="text-xs text-muted mt-1">
                  ≈ <strong className="text-slate-300">{usd(totalProjectedIncome / 12)}</strong> / mo &nbsp;·&nbsp;{' '}
                  <strong className="text-slate-300">{((totalProjectedIncome / TARGET) * 100).toFixed(1)}%</strong> of goal
                </p>
              )}
            </div>
          </div>

          {/* 3. Milestone strip */}
          <div className="grid grid-cols-4 gap-2">
            {MILESTONES.map((m, i) => {
              const p     = buildPlan(qualified, m)
              const toGoM = Math.max(0, p.totalNeeded - totalActuallyInvested)
              const done  = toGoM === 0
              return (
                <div key={m} className={`card p-3 border ${done ? 'border-green-500/50 bg-green-500/[0.07]' : 'border-border'}`}>
                  <p className={`text-xs font-semibold mb-1 ${done ? 'text-green-400' : 'text-muted'}`}>
                    {MILESTONE_LABELS[i]}/yr {done && <span className="ml-1">✓</span>}
                  </p>
                  <p className="mono text-sm font-bold text-slate-200">{usd(p.totalNeeded)}</p>
                  <p className="text-[10px] text-muted mb-2">total needed</p>
                  <div className="border-t border-border/50 pt-2 space-y-1">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[10px] text-muted">invested</span>
                      <span className="mono text-[11px] text-green-400 font-medium">{usd(totalActuallyInvested)}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[10px] text-muted">to go</span>
                      <span className={`mono text-[11px] font-medium ${done ? 'text-green-400' : 'text-yellow-400'}`}>
                        {done ? '✓ done' : usd(toGoM)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 4. Table */}
          <div className="card p-0 overflow-x-auto">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium">
                Portfolio breakdown —{' '}
                <span className="text-green-400">$100,000 / yr</span>
              </span>
              <span className="text-xs text-muted">
                {qualified.length} screened · {userAdded.length} custom · update <em>Shares Owned</em> as you buy
              </span>
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
                  <th className="px-3 py-3 text-right">Invest</th>
                  <th className="px-3 py-3 text-right">Shares Goal</th>
                  <th className="px-3 py-3 text-right">Shares Owned</th>
                  <th className="px-3 py-3 text-right text-green-400/70">Target Income / yr</th>
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody>

                {/* ── User-added tickers ──────────────────────── */}
                {userAdded.length > 0 && (
                  <>
                    <tr className="bg-accent/[0.03]">
                      <td colSpan={11} className="px-3 py-1.5 text-[10px] text-accent/70 uppercase tracking-widest font-medium border-b border-accent/10">
                        Custom Tickers
                      </td>
                    </tr>
                    {userAdded
                      .sort((a, b) => b.dividend_yield - a.dividend_yield)
                      .map((s, i) => {
                        const owned = getOwned(s.symbol)
                        const projIncome = owned * s.annual_dividend
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
                            <td className="px-3 py-2.5 text-xs text-slate-300 max-w-[150px]">
                              <span className="truncate block">{s.name}</span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <YieldPill value={s.dividend_yield} />
                            </td>
                            <td className="px-3 py-2.5 text-right mono text-slate-300">${(s.annual_dividend ?? 0).toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-right mono">${(s.price ?? 0).toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-right mono text-muted">—</td>
                            <td className="px-3 py-2.5 text-right mono text-muted">—</td>
                            <td className="px-3 py-2.5 text-right">
                              <input
                                type="number" min="0" step="1"
                                value={ownedInputs[s.symbol] ?? ''}
                                placeholder="0"
                                onChange={e => handleOwned(s.symbol, e.target.value)}
                                className="w-20 bg-surface border border-border rounded-md px-2 py-1 text-xs mono text-right focus:outline-none focus:border-accent transition-colors"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right mono text-green-400/60">
                              {owned > 0 ? usd(projIncome) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-center">
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
                      })}
                  </>
                )}

                {/* ── Screened plan rows ──────────────────────── */}
                {qualified.length > 0 && (
                  <>
                    {userAdded.length > 0 && (
                      <tr className="bg-white/[0.01]">
                        <td colSpan={11} className="px-3 py-1.5 text-[10px] text-muted uppercase tracking-widest font-medium border-b border-border/30">
                          Screened Portfolio — Top {qualified.length} by Yield ≥ 5%
                        </td>
                      </tr>
                    )}
                    {plan.rows.map((s, i) => {
                      const owned         = getOwned(s.symbol)
                      const sharesGoal    = Math.max(0, s.targetShares - owned)
                      const goalMet       = owned >= s.targetShares
                      const remainInvest  = sharesGoal * (s.price ?? 0)
                      return (
                        <tr key={s.symbol}
                          className="border-b border-border/40 hover:bg-white/[0.025] transition-colors">
                          <td className="px-3 py-2.5 text-xs text-muted">{i + 1}</td>
                          <td className="px-3 py-2.5 mono font-semibold text-accent">{s.symbol}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-300 max-w-[150px]">
                            <span className="truncate block">{s.name}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <YieldPill value={s.dividend_yield} />
                          </td>
                          <td className="px-3 py-2.5 text-right mono text-slate-300">${(s.annual_dividend ?? 0).toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right mono">${(s.price ?? 0).toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right mono">
                            {goalMet
                              ? <span className="text-emerald-400 text-xs font-medium">✓ done</span>
                              : usd(remainInvest)
                            }
                          </td>
                          <td className="px-3 py-2.5 text-right mono">
                            {goalMet
                              ? <span className="text-emerald-400 text-xs font-medium">✓ {s.targetShares.toLocaleString()}</span>
                              : <span>{sharesGoal.toLocaleString()}</span>
                            }
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <input
                              type="number" min="0" step="1"
                              value={ownedInputs[s.symbol] ?? ''}
                              placeholder="0"
                              onChange={e => handleOwned(s.symbol, e.target.value)}
                              className="w-20 bg-surface border border-border rounded-md px-2 py-1 text-xs mono text-right focus:outline-none focus:border-accent transition-colors"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right mono text-green-400/60">
                            {usd(s.targetIncome)}
                          </td>
                          <td className="px-3 py-2.5" />
                        </tr>
                      )
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted">
            {qualified.length} screened stocks/ETFs with yield ≥ 5% · {userAdded.length} custom tickers.
            Equal-weight allocation across screened portfolio. Custom tickers are always tracked regardless of yield.
            Projected income updates live as you enter shares. Data via Yahoo Finance · not financial advice.
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
