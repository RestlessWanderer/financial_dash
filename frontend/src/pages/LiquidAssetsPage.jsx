import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { Plus, Pencil, Trash2, Check, Wallet, TrendingDown, TrendingUp, AlertTriangle, ShoppingCart } from 'lucide-react'

const ACCOUNT_TYPES = ['Checking', 'Savings', 'HYSA', 'Money Market', 'CD', 'Other']

const TYPE_COLORS = {
  'Checking':     'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Savings':      'bg-green-500/10 text-green-400 border-green-500/20',
  'HYSA':         'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Money Market': 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  'CD':           'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Other':        'bg-slate-500/10 text-slate-400 border-slate-500/20',
}

const INVESTMENT_RATE = 0.07

function usd(n) {
  return (n ?? 0).toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  })
}

function timeAgo(iso) {
  if (!iso) return null
  const mins = Math.round((Date.now() - new Date(iso + 'Z').getTime()) / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.round(mins / 60)
  if (h < 24)   return `${h}h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d}d ago`
}

/** Format a unit count — abbreviate large numbers cleanly */
function fmtUnits(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (n >= 10)        return n.toFixed(1)
  return n.toFixed(2)
}

function fmtDelta(n) {
  if (n == null || isNaN(n)) return null
  const abs = Math.abs(n)
  const str = fmtUnits(abs)
  return { label: n >= 0 ? `+${str}` : `−${str}`, positive: n >= 0 }
}

/** Per-account inflation math */
function calcInflationStats(value, apy, inflationRate) {
  const annualInterest  = value * (apy ?? 0) / 100
  const inflationDrag   = value * (inflationRate ?? 0) / 100
  const realReturn      = annualInterest - inflationDrag
  const investReturn    = value * INVESTMENT_RATE
  const opportunityCost = investReturn - annualInterest
  return { annualInterest, inflationDrag, realReturn, investReturn, opportunityCost }
}

const INPUT = 'w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors'

/* ── Inflation drag panel shown on each card ──────────────────────── */
function InflationPanel({ account, inflationRate }) {
  if (inflationRate == null) return null
  const { annualInterest, inflationDrag, realReturn, investReturn, opportunityCost } =
    calcInflationStats(account.value, account.apy, inflationRate)

  const isBeatingInflation = realReturn >= 0

  return (
    <div className="mt-1 pt-2 border-t border-border/60 space-y-1.5">
      <p className="text-[10px] text-muted uppercase tracking-widest font-medium mb-1">Inflation Analysis</p>

      <div className="flex justify-between text-[11px]">
        <span className="text-muted">Annual interest earned</span>
        <span className="mono text-green-400">+{usd(annualInterest)}</span>
      </div>

      <div className="flex justify-between text-[11px]">
        <span className="text-muted">Inflation drag ({inflationRate.toFixed(1)}%)</span>
        <span className="mono text-red-400">−{usd(inflationDrag)}</span>
      </div>

      <div className="flex justify-between text-[11px] font-medium border-t border-border/40 pt-1.5">
        <span className={isBeatingInflation ? 'text-green-400' : 'text-red-400'}>
          Real return
        </span>
        <span className={`mono ${isBeatingInflation ? 'text-green-400' : 'text-red-400'}`}>
          {realReturn >= 0 ? '+' : '−'}{usd(Math.abs(realReturn))}
        </span>
      </div>

      <div className="flex justify-between text-[11px] mt-0.5">
        <span className="text-muted">If invested @ 7%</span>
        <span className="mono text-slate-300">+{usd(investReturn)}</span>
      </div>

      <div className="flex justify-between text-[11px]">
        <span className="text-muted">Opportunity cost / yr</span>
        <span className="mono text-red-400">−{usd(opportunityCost)}</span>
      </div>
    </div>
  )
}

/* ── Inline editable account card ─────────────────────────────────── */
function AccountCard({ account, onSave, onDelete, inflationRate }) {
  const [editing,  setEditing]  = useState(false)
  const [name,     setName]     = useState(account.name)
  const [type,     setType]     = useState(account.account_type)
  const [value,    setValue]    = useState(String(account.value))
  const [apy,      setApy]      = useState(account.apy != null ? String(account.apy) : '')
  const [saving,   setSaving]   = useState(false)
  const nameRef = useRef(null)

  const startEdit = () => {
    setName(account.name)
    setType(account.account_type)
    setValue(String(account.value))
    setApy(account.apy != null ? String(account.apy) : '')
    setEditing(true)
    setTimeout(() => nameRef.current?.focus(), 0)
  }

  const cancel = () => {
    setEditing(false)
    setName(account.name)
    setType(account.account_type)
    setValue(String(account.value))
    setApy(account.apy != null ? String(account.apy) : '')
  }

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    const apyVal = apy.trim() !== '' ? parseFloat(apy) : null
    await onSave(account.id, {
      name: name.trim(),
      account_type: type,
      value: parseFloat(value) || 0,
      apy: apyVal,
    })
    setEditing(false)
    setSaving(false)
  }

  const kd = (e) => {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') cancel()
  }

  if (editing) {
    return (
      <div className="card border-accent/40 bg-accent/[0.04] flex flex-col gap-3">
        <input
          ref={nameRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={kd}
          placeholder="Account name"
          className={INPUT}
        />
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className={INPUT}
        >
          {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
            <input
              type="number" min="0" step="100"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={kd}
              placeholder="0"
              className={INPUT + ' pl-6 mono'}
            />
          </div>
          <div className="relative w-28">
            <input
              type="number" min="0" max="100" step="0.01"
              value={apy}
              onChange={e => setApy(e.target.value)}
              onKeyDown={kd}
              placeholder="0.00"
              className={INPUT + ' pr-7 mono'}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">%</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-40"
          >
            <Check size={12} /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={cancel} className="text-xs text-muted hover:text-slate-200 px-2 py-1.5 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  const typeColor = TYPE_COLORS[account.account_type] ?? TYPE_COLORS['Other']
  const hasApy    = account.apy != null && account.apy > 0

  return (
    <div className="card group flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5 min-w-0">
          <p className="text-xs text-muted uppercase tracking-widest truncate">{account.name}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${typeColor}`}>
              {account.account_type}
            </span>
            {hasApy && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium bg-green-500/10 text-green-400 border-green-500/20">
                {account.apy.toFixed(2)}% APY
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={startEdit} className="p-1 text-muted hover:text-slate-200 transition-colors" title="Edit">
            <Pencil size={13} />
          </button>
          <button onClick={() => onDelete(account.id)} className="p-1 text-muted hover:text-red-400 transition-colors" title="Delete">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <p className="mono text-3xl font-bold text-slate-200 leading-none">{usd(account.value)}</p>
      {hasApy && (
        <p className="text-[10px] text-green-400/70">
          ≈ {usd(account.value * (account.apy / 100))} / yr interest
        </p>
      )}
      <p className="text-[10px] text-muted mt-auto pt-1">Updated {timeAgo(account.updated_at)}</p>

      <InflationPanel account={account} inflationRate={inflationRate} />
    </div>
  )
}

/* ── Add card ──────────────────────────────────────────────────────── */
function AddCard({ onAdd }) {
  const [open,   setOpen]   = useState(false)
  const [name,   setName]   = useState('')
  const [type,   setType]   = useState('Checking')
  const [value,  setValue]  = useState('')
  const [apy,    setApy]    = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(null)

  const startOpen = () => {
    setOpen(true)
    setTimeout(() => nameRef.current?.focus(), 0)
  }

  const cancel = () => { setOpen(false); setName(''); setType('Checking'); setValue(''); setApy('') }

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    const apyVal = apy.trim() !== '' ? parseFloat(apy) : null
    await onAdd({ name: name.trim(), account_type: type, value: parseFloat(value) || 0, apy: apyVal })
    setOpen(false); setName(''); setType('Checking'); setValue(''); setApy('')
    setSaving(false)
  }

  const kd = (e) => {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') cancel()
  }

  if (open) {
    return (
      <div className="card border-accent/40 bg-accent/[0.04] flex flex-col gap-3">
        <input
          ref={nameRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={kd}
          placeholder="Account name (e.g. Chase Checking)"
          className={INPUT}
        />
        <select value={type} onChange={e => setType(e.target.value)} className={INPUT}>
          {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
            <input
              type="number" min="0" step="100"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={kd}
              placeholder="0"
              className={INPUT + ' pl-6 mono'}
            />
          </div>
          <div className="relative w-28">
            <input
              type="number" min="0" max="100" step="0.01"
              value={apy}
              onChange={e => setApy(e.target.value)}
              onKeyDown={kd}
              placeholder="0.00"
              className={INPUT + ' pr-7 mono'}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">%</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-40"
          >
            <Check size={12} /> {saving ? 'Saving…' : 'Add Account'}
          </button>
          <button onClick={cancel} className="text-xs text-muted hover:text-slate-200 px-2 py-1.5 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={startOpen}
      className="card border-dashed border-border/60 flex flex-col items-center justify-center gap-2 min-h-[120px] hover:border-accent/50 hover:bg-accent/[0.03] transition-all group"
    >
      <div className="w-8 h-8 rounded-full border border-dashed border-border/60 group-hover:border-accent/50 flex items-center justify-center transition-colors">
        <Plus size={16} className="text-muted group-hover:text-accent transition-colors" />
      </div>
      <span className="text-xs text-muted group-hover:text-accent transition-colors">Add Account</span>
    </button>
  )
}

/**
 * Cumulative stats over `years` — all balances grow by APY, all prices grow by inflation.
 * Returns the *cumulative* totals (not annualised), so they represent the full period impact.
 */
function calcCumulativeStats(accounts, inflationRate, years) {
  return accounts.reduce((acc, a) => {
    const apyRate   = (a.apy ?? 0) / 100
    const inflRate  = inflationRate / 100
    const principal = a.value ?? 0

    // Balance after `years` compounding at APY
    const balanceEnd = principal * Math.pow(1 + apyRate, years)
    // What principal would be worth in today's dollars (purchasing power) if kept in account
    const realValue  = balanceEnd / Math.pow(1 + inflRate, years)
    // Cumulative interest earned
    const cumInterest  = balanceEnd - principal
    // Cumulative inflation drag = what inflation eroded in nominal terms
    const nominalAfterInflation = principal * Math.pow(1 + inflRate, years)
    const cumInflationDrag      = nominalAfterInflation - principal
    // Net real gain/loss vs staying flat
    const cumRealReturn = realValue - principal
    // If invested at 7%
    const investEnd    = principal * Math.pow(1 + INVESTMENT_RATE, years)
    const cumInvest    = investEnd - principal
    const cumOpCost    = investEnd - balanceEnd

    acc.totalValue        += principal
    acc.cumInterest       += cumInterest
    acc.cumInflationDrag  += cumInflationDrag
    acc.cumRealReturn     += cumRealReturn
    acc.cumInvest         += cumInvest
    acc.cumOpCost         += cumOpCost
    return acc
  }, { totalValue: 0, cumInterest: 0, cumInflationDrag: 0, cumRealReturn: 0, cumInvest: 0, cumOpCost: 0 })
}

/* ── Aggregate inflation banner ────────────────────────────────────── */
function InflationBanner({ accounts, inflation }) {
  const [horizon, setHorizon] = useState('1yr')
  if (!inflation || inflation.rate == null || accounts.length === 0) return null

  const inflationRate = inflation.rate

  // Annual (1yr) totals — kept for the 1yr view
  const annualTotals = accounts.reduce((acc, a) => {
    const { annualInterest, inflationDrag, realReturn, investReturn, opportunityCost } =
      calcInflationStats(a.value, a.apy, inflationRate)
    acc.totalValue      += a.value
    acc.totalInterest   += annualInterest
    acc.totalDrag       += inflationDrag
    acc.totalRealReturn += realReturn
    acc.totalInvest     += investReturn
    acc.totalOpCost     += opportunityCost
    return acc
  }, { totalValue: 0, totalInterest: 0, totalDrag: 0, totalRealReturn: 0, totalInvest: 0, totalOpCost: 0 })

  const stats5  = calcCumulativeStats(accounts, inflationRate, 5)
  const stats10 = calcCumulativeStats(accounts, inflationRate, 10)

  const horizonOptions = [
    { key: '1yr',  label: '1 Year' },
    { key: '5yr',  label: '5 Years' },
    { key: '10yr', label: '10 Years' },
  ]

  // Pick active dataset
  const active = horizon === '1yr'
    ? {
        interest:    annualTotals.totalInterest,
        drag:        annualTotals.totalDrag,
        realReturn:  annualTotals.totalRealReturn,
        invest:      annualTotals.totalInvest,
        opCost:      annualTotals.totalOpCost,
        totalValue:  annualTotals.totalValue,
      }
    : horizon === '5yr'
    ? {
        interest:    stats5.cumInterest,
        drag:        stats5.cumInflationDrag,
        realReturn:  stats5.cumRealReturn,
        invest:      stats5.cumInvest,
        opCost:      stats5.cumOpCost,
        totalValue:  stats5.totalValue,
      }
    : {
        interest:    stats10.cumInterest,
        drag:        stats10.cumInflationDrag,
        realReturn:  stats10.cumRealReturn,
        invest:      stats10.cumInvest,
        opCost:      stats10.cumOpCost,
        totalValue:  stats10.totalValue,
      }

  const isPositiveReal = active.realReturn >= 0
  const periodLabel    = horizon === '1yr' ? 'per year' : `cumulative over ${horizon}`

  return (
    <div className="rounded-xl border border-border bg-panel p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {isPositiveReal
            ? <TrendingUp size={16} className="text-green-400 shrink-0" />
            : <TrendingDown size={16} className="text-red-400 shrink-0" />
          }
          <span className="text-sm font-semibold text-slate-200">Inflation Impact Summary</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20 font-medium">
            CPI-U {inflationRate.toFixed(1)}% — {inflation.period}
          </span>
          {inflation.stale && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-red-500/10 text-red-400 border-red-500/20 font-medium flex items-center gap-1">
              <AlertTriangle size={9} /> stale
            </span>
          )}
        </div>

        {/* Horizon toggle */}
        <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 border border-border shrink-0">
          {horizonOptions.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setHorizon(key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                horizon === key
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'text-muted hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-muted">
        {horizon === '1yr' ? 'Annual impact on current balances' : `Cumulative impact over ${horizon} at today's rates`}
        {' · '}vs {(INVESTMENT_RATE * 100).toFixed(0)}% avg market return
      </p>

      {/* Metric tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-surface rounded-lg px-3 py-2">
          <p className="text-[10px] text-muted mb-1">
            {horizon === '1yr' ? 'Annual Interest' : `Interest (${horizon})`}
          </p>
          <p className="mono text-sm font-bold text-green-400">+{usd(active.interest)}</p>
          <p className="text-[10px] text-muted">{periodLabel}</p>
        </div>
        <div className="bg-surface rounded-lg px-3 py-2">
          <p className="text-[10px] text-muted mb-1">
            {horizon === '1yr' ? 'Inflation Drag' : `Inflation Drag (${horizon})`}
          </p>
          <p className="mono text-sm font-bold text-red-400">−{usd(active.drag)}</p>
          <p className="text-[10px] text-muted">
            {horizon === '1yr'
              ? `${inflationRate.toFixed(1)}% on ${usd(active.totalValue)}`
              : `${inflationRate.toFixed(1)}% compounded`}
          </p>
        </div>
        <div className="bg-surface rounded-lg px-3 py-2">
          <p className="text-[10px] text-muted mb-1">
            {horizon === '1yr' ? 'Net Real Return' : `Real Return (${horizon})`}
          </p>
          <p className={`mono text-sm font-bold ${isPositiveReal ? 'text-green-400' : 'text-red-400'}`}>
            {active.realReturn >= 0 ? '+' : '−'}{usd(Math.abs(active.realReturn))}
          </p>
          <p className="text-[10px] text-muted">
            {horizon === '1yr' ? 'interest − inflation' : 'real purchasing power gain/loss'}
          </p>
        </div>
        <div className="bg-surface rounded-lg px-3 py-2">
          <p className="text-[10px] text-muted mb-1">
            {horizon === '1yr' ? 'If Invested @ 7%' : `Invested Gain (${horizon})`}
          </p>
          <p className="mono text-sm font-bold text-slate-200">+{usd(active.invest)}</p>
          <p className="text-[10px] text-muted">avg market return</p>
        </div>
        <div className="bg-surface rounded-lg px-3 py-2">
          <p className="text-[10px] text-muted mb-1">
            {horizon === '1yr' ? 'Opportunity Cost' : `Opportunity Cost (${horizon})`}
          </p>
          <p className="mono text-sm font-bold text-red-400">−{usd(active.opCost)}</p>
          <p className="text-[10px] text-muted">vs investing</p>
        </div>
      </div>
    </div>
  )
}

/** Units of a staple purchasable after `years`, given balance compounds at APY and prices compound at inflation */
function calcPPUnits(principal, apyRate, inflationRate, investRate, years, price) {
  const balance_liquid   = principal * Math.pow(1 + apyRate,   years)
  const balance_invested = principal * Math.pow(1 + investRate, years)
  const futurePrice      = price     * Math.pow(1 + inflationRate, years)
  return {
    liquidUnits:   balance_liquid   / futurePrice,
    investedUnits: balance_invested / futurePrice,
  }
}

/* ── Purchasing power banner ───────────────────────────────────────── */
function PurchasingPowerBanner({ accounts, inflation, staples }) {
  const [horizon, setHorizon] = useState('1yr')

  if (
    !staples || staples.items.length === 0 ||
    !inflation || inflation.rate == null ||
    accounts.length === 0
  ) return null

  const inflationRate = inflation.rate / 100
  const totalValue    = accounts.reduce((s, a) => s + (a.value ?? 0), 0)
  if (totalValue <= 0) return null

  // Weighted average APY across all accounts
  const weightedAPY    = accounts.reduce((s, a) => s + (a.value ?? 0) * (a.apy ?? 0), 0) / totalValue
  const weightedAPYRate = weightedAPY / 100

  const years = horizon === '1yr' ? 1 : horizon === '5yr' ? 5 : 10

  const horizonOptions = [
    { key: '1yr',  label: '1 Year' },
    { key: '5yr',  label: '5 Years' },
    { key: '10yr', label: '10 Years' },
  ]

  return (
    <div className="rounded-xl border border-border bg-panel p-4 space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <ShoppingCart size={16} className="text-accent shrink-0" />
          <div>
            <span className="text-sm font-semibold text-slate-200">Purchasing Power</span>
            <p className="text-[10px] text-muted mt-0.5">
              How much of each staple your {usd(totalValue)} can buy — today vs. after {horizon}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {/* Horizon toggle */}
          <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 border border-border">
            {horizonOptions.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setHorizon(key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  horizon === key
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'text-muted hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-3 text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-slate-500"></span>Today
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400"></span>
              Liquid ({weightedAPY.toFixed(1)}% APY)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400"></span>
              Invested (7%)
            </span>
          </div>
        </div>
      </div>

      {/* Item grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {staples.items.map(item => {
          const todayUnits = totalValue / item.price
          const { liquidUnits, investedUnits } = calcPPUnits(
            totalValue, weightedAPYRate, inflationRate, INVESTMENT_RATE, years, item.price
          )
          const liquidDelta   = fmtDelta(liquidUnits   - todayUnits)
          const investedDelta = fmtDelta(investedUnits - todayUnits)

          return (
            <div key={item.series_id} className="bg-surface rounded-lg px-3 py-2.5 space-y-2">
              {/* Item name + price */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-base leading-none">{item.emoji}</span>
                  <span className="text-xs font-medium text-slate-200 truncate">{item.name}</span>
                </div>
                <span className="text-[10px] text-muted mono shrink-0">${item.price.toFixed(2)}/{item.unit}</span>
              </div>

              {/* Today */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted">Today</span>
                <span className="mono font-medium text-slate-300">{fmtUnits(todayUnits)} {item.unit}s</span>
              </div>

              {/* Liquid after horizon */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted">{horizon} liquid</span>
                <div className="flex items-center gap-1.5">
                  <span className="mono text-blue-300">{fmtUnits(liquidUnits)}</span>
                  {liquidDelta && (
                    <span className={`text-[10px] font-medium ${liquidDelta.positive ? 'text-green-400' : 'text-red-400'}`}>
                      {liquidDelta.label}
                    </span>
                  )}
                </div>
              </div>

              {/* Invested after horizon */}
              <div className="flex items-center justify-between text-[11px] border-t border-border/40 pt-1.5">
                <span className="text-muted">{horizon} invested</span>
                <div className="flex items-center gap-1.5">
                  <span className="mono text-green-300">{fmtUnits(investedUnits)}</span>
                  {investedDelta && (
                    <span className={`text-[10px] font-medium ${investedDelta.positive ? 'text-green-400' : 'text-red-400'}`}>
                      {investedDelta.label}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer note */}
      <p className="text-[10px] text-muted/70">
        Prices as of {staples.items[0]?.period ?? '—'} · BLS Average Retail Prices (APU series) ·
        Future prices projected at CPI-U {inflation.rate.toFixed(1)}%/yr compounded
        {staples.stale && ' · ⚠ stale data'}
      </p>
    </div>
  )
}

/* ── Page ──────────────────────────────────────────────────────────── */
export default function LiquidAssetsPage() {
  const [accounts,  setAccounts]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [inflation, setInflation] = useState(null)
  const [staples,   setStaples]   = useState(null)

  useEffect(() => {
    Promise.all([
      api.getLiquidAccounts(),
      api.getInflationRate().catch(() => null),
      api.getStaplePrices().catch(() => null),
    ]).then(([accts, infl, stpls]) => {
      setAccounts(accts)
      setInflation(infl)
      setStaples(stpls)
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleAdd = async (body) => {
    try {
      const created = await api.createLiquidAccount(body)
      setAccounts(prev => [...prev, created])
    } catch (e) { setError(e.message) }
  }

  const handleSave = async (id, body) => {
    try {
      const updated = await api.updateLiquidAccount(id, body)
      setAccounts(prev => prev.map(a => a.id === id ? updated : a))
    } catch (e) { setError(e.message) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Remove this account?')) return
    try {
      await api.deleteLiquidAccount(id)
      setAccounts(prev => prev.filter(a => a.id !== id))
    } catch (e) { setError(e.message) }
  }

  const total = accounts.reduce((s, a) => s + (a.value ?? 0), 0)

  const byType = ACCOUNT_TYPES
    .map(t => ({ type: t, total: accounts.filter(a => a.account_type === t).reduce((s, a) => s + a.value, 0) }))
    .filter(x => x.total > 0)

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Wallet size={20} className="text-accent" />
          <div>
            <h1 className="text-xl font-semibold">Liquid Assets</h1>
            <p className="text-xs text-muted mt-0.5">
              Track your checking, savings, HYSA, and other cash accounts
            </p>
          </div>
        </div>
        {accounts.length > 0 && (
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted uppercase tracking-widest">Total Liquid</p>
            <p className="mono text-2xl font-bold text-slate-200 leading-none">{usd(total)}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="text-red-400 text-sm px-3 py-2 rounded-lg border border-red-400/20 bg-red-400/5">{error}</div>
      )}

      {/* Banners */}
      {!loading && (
        <>
          <InflationBanner accounts={accounts} inflation={inflation} />
          <PurchasingPowerBanner accounts={accounts} inflation={inflation} staples={staples} />
        </>
      )}

      {/* By-type summary strip */}
      {byType.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {byType.map(({ type, total: t }) => {
            const color = TYPE_COLORS[type] ?? TYPE_COLORS['Other']
            return (
              <div key={type} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${color}`}>
                <span>{type}</span>
                <span className="mono">{usd(t)}</span>
              </div>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted py-10 text-center">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(a => (
            <AccountCard
              key={a.id}
              account={a}
              onSave={handleSave}
              onDelete={handleDelete}
              inflationRate={inflation?.rate ?? null}
            />
          ))}
          <AddCard onAdd={handleAdd} />
        </div>
      )}

      {!loading && accounts.length === 0 && (
        <p className="text-xs text-muted text-center -mt-2">
          Click the card above to add your first account.
        </p>
      )}
    </div>
  )
}
