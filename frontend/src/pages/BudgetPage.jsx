import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'

/* ── Constants ────────────────────────────────────────────────────── */
const LS_BUDGET   = 'budget_data'
const LS_DEFAULTS = 'budget_defaults'
const LS_CUSTOM   = 'budget_custom_labels'
const LS_NE       = 'budget_ne_flags'       // array of keys marked non-essential
const LS_MORTGAGE = 'mortgage_config'

const DEFAULT_CUSTOM_LABELS = ['Car Payment', 'Insurance', 'Subscriptions', 'Dining', 'Misc']
const PAY_KEYS     = ['pay1', 'pay2']
const PAY_LABELS   = ['Pay 1', 'Pay 2']
const FIXED_KEYS   = ['housing', 'utilities', 'groceries']
const FIXED_LABELS = ['Housing', 'Utilities', 'Groceries']

const INPUT_BASE = 'w-full bg-surface border border-border rounded px-2 py-1.5 text-xs mono focus:outline-none focus:border-accent transition-colors text-right'

/* ── Helpers ──────────────────────────────────────────────────────── */
function usd(n) {
  if (n == null || isNaN(n) || n === '') return '—'
  return Math.abs(n).toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  })
}

function buildMonthList(endYear) {
  const now    = new Date()
  const startY = now.getFullYear()
  const startM = now.getMonth()
  const finalY = endYear ?? startY
  const months = []
  let y = startY, m = startM
  while (y < finalY || (y === finalY && m <= 11)) {
    months.push(`${y}-${String(m + 1).padStart(2, '0')}`)
    m++; if (m > 11) { m = 0; y++ }
  }
  if (months.length < 12) {
    const d = new Date(startY, startM + months.length, 1)
    while (months.length < 12) {
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      d.setMonth(d.getMonth() + 1)
    }
  }
  return months
}

function formatMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long' })
}

function load(key, fallback = {}) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}

function effective(rowData, defaults, key) {
  const v = rowData?.[key]
  if (v !== undefined && v !== '') return parseFloat(v) || 0
  const d = defaults?.[key]
  if (d !== undefined && d !== '') return parseFloat(d) || 0
  return 0
}

function calcRemaining(rowData, defaults, customLabels) {
  const pay1      = effective(rowData, defaults, 'pay1')
  const pay2      = effective(rowData, defaults, 'pay2')
  const housing   = effective(rowData, defaults, 'housing')
  const utilities = effective(rowData, defaults, 'utilities')
  const groceries = effective(rowData, defaults, 'groceries')
  const customSum = customLabels.reduce((s, _, i) => s + effective(rowData, defaults, `custom_${i}`), 0)
  return (pay1 + pay2) - housing - utilities - groceries - customSum
}

/* ── NE badge ─────────────────────────────────────────────────────── */
function NEBadge({ active, onToggle }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle() }}
      title={active ? 'Non-Essential — click to unmark' : 'Mark as Non-Essential'}
      className={`text-[9px] font-black px-1.5 py-0.5 rounded border transition-colors leading-none ${
        active
          ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
          : 'bg-white/[0.04] border-border/50 text-muted/50 hover:border-amber-500/30 hover:text-amber-400/70'
      }`}
    >
      NE
    </button>
  )
}

/* ── Default row ──────────────────────────────────────────────────── */
function DefaultsRow({ defaults, customLabels, onChange }) {
  const allKeys = [...PAY_KEYS, ...FIXED_KEYS, ...customLabels.map((_, i) => `custom_${i}`)]

  const cell = (key) => (
    <td key={key} className="px-2 py-2 border-b border-border/60">
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted/60 pointer-events-none">$</span>
        <input
          type="number" min="0" step="50"
          value={defaults[key] ?? ''}
          placeholder="default"
          onChange={e => onChange(key, e.target.value)}
          className={INPUT_BASE + ' pl-5 bg-accent/[0.03] border-accent/20 placeholder:text-muted/40 placeholder:text-[10px]'}
        />
      </div>
    </td>
  )

  return (
    <tr className="bg-accent/[0.03] border-b border-border/60">
      <td className="pl-4 pr-2 py-2 border-b border-border/60">
        <span className="text-[10px] text-accent/70 uppercase tracking-widest font-medium whitespace-nowrap">
          Default
        </span>
      </td>
      {allKeys.map(key => cell(key))}
      <td className="px-2 py-2 border-b border-border/60 text-right">
        <span className="text-[10px] text-muted/40 italic">per month</span>
      </td>
    </tr>
  )
}

/* ── Month row ────────────────────────────────────────────────────── */
function MonthRow({ ym, rowData = {}, defaults, customLabels, onChange }) {
  const remaining = calcRemaining(rowData, defaults, customLabels)
  const remCls    = remaining >= 0 ? 'text-emerald-400' : 'text-rose-400'

  const cell = (key) => {
    const hasOverride = rowData[key] !== undefined && rowData[key] !== ''
    const defVal      = defaults[key]
    const placeholder = defVal !== undefined && defVal !== '' ? String(defVal) : '0'

    return (
      <td key={key} className="px-2 py-1.5">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted pointer-events-none">$</span>
          <input
            type="number" min="0" step="50"
            value={rowData[key] ?? ''}
            placeholder={placeholder}
            onChange={e => onChange(ym, key, e.target.value)}
            className={INPUT_BASE + ' pl-5 ' + (hasOverride ? 'border-accent/30' : 'placeholder:text-muted/50')}
            title={!hasOverride && defVal ? `Using default: ${usd(parseFloat(defVal))}` : undefined}
          />
        </div>
      </td>
    )
  }

  return (
    <tr className="border-b border-border/20 hover:bg-white/[0.015] transition-colors">
      <td className="pl-10 pr-3 py-1.5 text-xs text-muted w-36 whitespace-nowrap">{formatMonth(ym)}</td>
      {PAY_KEYS.map(k => cell(k))}
      {FIXED_KEYS.map(k => cell(k))}
      {customLabels.map((_, i) => cell(`custom_${i}`))}
      <td className="px-2 py-1.5 text-right">
        <span className={`mono text-xs font-semibold ${remCls}`}>{usd(remaining)}</span>
      </td>
    </tr>
  )
}

/* ── Page ─────────────────────────────────────────────────────────── */
export default function BudgetPage() {
  const [budgetData,     setBudgetData]     = useState(() => load(LS_BUDGET, {}))
  const [defaults,       setDefaults]       = useState(() => load(LS_DEFAULTS, {}))
  const [customLabels,   setCustomLabels]   = useState(() => load(LS_CUSTOM, DEFAULT_CUSTOM_LABELS))
  const [neFlags,        setNeFlags]        = useState(() => new Set(load(LS_NE, [])))
  const [editingLabel,   setEditingLabel]   = useState(null)
  const [labelDraft,     setLabelDraft]     = useState('')
  const [mortgageConfig, setMortgageConfig] = useState(null)
  const [expanded,       setExpanded]       = useState(new Set())

  useEffect(() => {
    try {
      const cfg = localStorage.getItem(LS_MORTGAGE)
      if (cfg) setMortgageConfig(JSON.parse(cfg))
    } catch { /* ignore */ }
  }, [])

  const MONTHS = useMemo(() => {
    if (!mortgageConfig?.startDate || !mortgageConfig?.years) return buildMonthList(null)
    const [startY] = mortgageConfig.startDate.split('-').map(Number)
    const stdEnd   = startY + parseInt(mortgageConfig.years || 30)
    const t1 = parseInt(mortgageConfig.targetYear  || 0)
    const t2 = parseInt(mortgageConfig.targetYear2 || 0)
    const candidates = [t1, t2].filter(Boolean)
    const endYear = candidates.length > 0 ? Math.max(...candidates) : stdEnd
    return buildMonthList(endYear)
  }, [mortgageConfig])

  const yearGroups = useMemo(() => {
    const map = new Map()
    for (const ym of MONTHS) {
      const year = parseInt(ym.split('-')[0])
      if (!map.has(year)) map.set(year, [])
      map.get(year).push(ym)
    }
    return [...map.entries()].map(([year, months]) => ({ year, months }))
  }, [MONTHS])

  const toggleYear = useCallback((year) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(year) ? next.delete(year) : next.add(year)
      return next
    })
  }, [])

  /* NE flag toggle */
  const toggleNE = useCallback((key) => {
    setNeFlags(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      localStorage.setItem(LS_NE, JSON.stringify([...next]))
      return next
    })
  }, [])

  const handleDefaultChange = useCallback((key, val) => {
    setDefaults(prev => {
      const next = { ...prev, [key]: val }
      localStorage.setItem(LS_DEFAULTS, JSON.stringify(next))
      return next
    })
  }, [])

  const handleChange = useCallback((ym, key, val) => {
    setBudgetData(prev => {
      const next = { ...prev, [ym]: { ...(prev[ym] ?? {}), [key]: val } }
      localStorage.setItem(LS_BUDGET, JSON.stringify(next))
      return next
    })
  }, [])

  const startRename  = (i) => { setEditingLabel(i); setLabelDraft(customLabels[i]) }
  const commitRename = (i) => {
    const trimmed = labelDraft.trim()
    if (!trimmed) { setEditingLabel(null); return }
    setCustomLabels(prev => {
      const next = [...prev]; next[i] = trimmed
      localStorage.setItem(LS_CUSTOM, JSON.stringify(next))
      return next
    })
    setEditingLabel(null)
  }

  const addCustomField = () => {
    if (customLabels.length >= 10) return
    setCustomLabels(prev => {
      const next = [...prev, `Expense ${prev.length + 1}`]
      localStorage.setItem(LS_CUSTOM, JSON.stringify(next))
      return next
    })
  }

  const removeCustomField = (i) => {
    const key = `custom_${i}`
    // Remove NE flag for this key
    setNeFlags(prev => {
      const next = new Set(prev); next.delete(key)
      localStorage.setItem(LS_NE, JSON.stringify([...next]))
      return next
    })
    setCustomLabels(prev => {
      const next = prev.filter((_, idx) => idx !== i)
      localStorage.setItem(LS_CUSTOM, JSON.stringify(next))
      return next
    })
    setDefaults(prev => {
      const next = { ...prev }
      delete next[`custom_${i}`]
      for (let j = i + 1; j < customLabels.length; j++) {
        if (`custom_${j}` in next) { next[`custom_${j - 1}`] = next[`custom_${j}`]; delete next[`custom_${j}`] }
      }
      localStorage.setItem(LS_DEFAULTS, JSON.stringify(next))
      return next
    })
    setBudgetData(prev => {
      const next = {}
      for (const [ym, row] of Object.entries(prev)) {
        const newRow = { ...row }
        delete newRow[`custom_${i}`]
        for (let j = i + 1; j < customLabels.length; j++) {
          if (`custom_${j}` in newRow) { newRow[`custom_${j - 1}`] = newRow[`custom_${j}`]; delete newRow[`custom_${j}`] }
        }
        next[ym] = newRow
      }
      localStorage.setItem(LS_BUDGET, JSON.stringify(next))
      return next
    })
  }

  const yearStats = useMemo(() => {
    const stats = {}
    for (const { year, months } of yearGroups) {
      let paycheck = 0, remaining = 0
      for (const ym of months) {
        const row = budgetData[ym] ?? {}
        paycheck  += effective(row, defaults, 'pay1') + effective(row, defaults, 'pay2')
        remaining += calcRemaining(row, defaults, customLabels)
      }
      stats[year] = { paycheck, remaining }
    }
    return stats
  }, [yearGroups, budgetData, defaults, customLabels])

  /* NE summary — total non-essential spend per month (using defaults, custom only) */
  const neTotal = useMemo(() => {
    const keys = customLabels.map((_, i) => `custom_${i}`).filter(k => neFlags.has(k))
    return keys.reduce((s, k) => s + (parseFloat(defaults[k]) || 0), 0)
  }, [neFlags, defaults, customLabels])

  /* NE savings projection — how much faster bridge capital is funded if NE is cut */
  const neSavingsProjection = useMemo(() => {
    if (neTotal <= 0) return null
    try {
      const profile     = JSON.parse(localStorage.getItem('user_profile') ?? 'null') ?? {}
      const age         = parseInt(profile.age)      || null
      const retireAge   = parseInt(profile.retireAge) || null
      if (!age || !retireAge || retireAge <= age) return null

      const bridgeYears = Math.max(0, 59.5 - retireAge)
      if (bridgeYears <= 0) return null

      // Current monthly surplus
      const pay1 = parseFloat(defaults.pay1) || 0
      const pay2 = parseFloat(defaults.pay2) || 0
      const totalIncome = pay1 + pay2
      const fixedExp    = ['housing', 'utilities', 'groceries'].reduce((s, k) => s + (parseFloat(defaults[k]) || 0), 0)
      const customExp   = customLabels.reduce((s, _, i) => s + (parseFloat(defaults[`custom_${i}`]) || 0), 0)
      const currentSurplus = totalIncome - fixedExp - customExp
      const improvedSurplus = currentSurplus + neTotal

      // Bridge capital (PV annuity at 5%)
      const annualEssential = (fixedExp + (customExp - neTotal)) * 12
      if (annualEssential <= 0 || improvedSurplus <= 0) return null
      const r = 0.05
      const bridgeCapital = annualEssential * (1 - Math.pow(1 + r, -bridgeYears)) / r

      const monthsCurrent  = currentSurplus  > 0 ? Math.ceil(bridgeCapital / currentSurplus)  : null
      const monthsImproved = improvedSurplus > 0 ? Math.ceil(bridgeCapital / improvedSurplus) : null
      const monthsSaved    = (monthsCurrent && monthsImproved) ? monthsCurrent - monthsImproved : null

      return { neTotal, bridgeCapital, monthsCurrent, monthsImproved, monthsSaved, annualNE: neTotal * 12 }
    } catch { return null }
  }, [neTotal, defaults, customLabels])

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-semibold">Monthly Budget</h1>
        <p className="text-xs text-muted mt-0.5">
          Track income and expenses by month. The <span className="text-emerald-400 font-medium">Remaining</span> amount
          feeds into the Payoff vs. Invest planner as your default monthly budget.
        </p>
      </div>

      {/* ── Category chip editor ── */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-xs font-medium text-slate-300">Expense Categories</p>
            {neTotal > 0 && (
              <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                {usd(neTotal)}/mo non-essential
              </span>
            )}
          </div>
          {customLabels.length < 10 && (
            <button onClick={addCustomField} className="flex items-center gap-1 text-[11px] text-accent hover:text-accent/80 transition-colors">
              <Plus size={11} /> Add category
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Fixed categories — no NE flag (always essential) */}
          {FIXED_KEYS.map((key, i) => (
            <div key={key} className="flex items-center gap-1">
              <span className="px-2.5 py-1 rounded-full bg-white/[0.05] border border-border/60 text-xs text-muted select-none">
                {FIXED_LABELS[i]}
              </span>
            </div>
          ))}
          {/* Custom categories */}
          {customLabels.map((label, i) => {
            const key = `custom_${i}`
            return (
              <div key={i} className="flex items-center gap-1 group">
                {editingLabel === i ? (
                  <input
                    autoFocus value={labelDraft}
                    onChange={e => setLabelDraft(e.target.value)}
                    onBlur={() => commitRename(i)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(i); if (e.key === 'Escape') setEditingLabel(null) }}
                    className="px-2 py-0.5 rounded-full bg-accent/10 border border-accent/40 text-xs text-accent focus:outline-none w-28"
                  />
                ) : (
                  <button onClick={() => startRename(i)}
                    className="px-2.5 py-1 rounded-full bg-accent/[0.07] border border-accent/25 text-xs text-accent hover:bg-accent/15 transition-colors"
                    title="Click to rename">
                    {label}
                  </button>
                )}
                <NEBadge active={neFlags.has(key)} onToggle={() => toggleNE(key)} />
                <button onClick={() => removeCustomField(i)}
                  className="p-0.5 text-muted hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove category">
                  <Trash2 size={11} />
                </button>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-muted">
          Click a custom category name to rename it. Click <span className="text-amber-400 font-semibold">NE</span> to flag a custom category as <span className="text-amber-400">Non-Essential</span> — spending that could be reduced or eliminated. Fixed categories (Housing, Utilities, Groceries) are always considered essential.
        </p>
      </div>

      {/* ── NE savings projection ── */}
      {neSavingsProjection && (
        <div className="card border border-amber-500/20 bg-amber-500/[0.04] space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-lg">✂️</span>
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-200">What if you cut non-essential spending?</p>
              <p className="text-[10px] text-muted mt-0.5">
                You have <strong className="text-amber-400">{usd(neSavingsProjection.neTotal)}/mo</strong> ({usd(neSavingsProjection.annualNE)}/yr) flagged as non-essential.
                Here's how cutting it affects your FIRE bridge capital timeline:
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-border/50">
              <p className="text-[10px] text-muted uppercase tracking-widest mb-0.5">Bridge Capital</p>
              <p className="mono text-sm font-bold text-slate-200">{usd(neSavingsProjection.bridgeCapital)}</p>
            </div>
            <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-border/50">
              <p className="text-[10px] text-muted uppercase tracking-widest mb-0.5">Time Without Cuts</p>
              <p className="mono text-sm font-bold text-rose-400">
                {neSavingsProjection.monthsCurrent != null ? `${(neSavingsProjection.monthsCurrent / 12).toFixed(1)} yrs` : '—'}
              </p>
            </div>
            <div className="bg-emerald-500/[0.06] rounded-lg px-3 py-2 border border-emerald-500/20">
              <p className="text-[10px] text-muted uppercase tracking-widest mb-0.5">Time With Cuts</p>
              <p className="mono text-sm font-bold text-emerald-400">
                {neSavingsProjection.monthsImproved != null ? `${(neSavingsProjection.monthsImproved / 12).toFixed(1)} yrs` : '—'}
              </p>
            </div>
          </div>
          {neSavingsProjection.monthsSaved != null && neSavingsProjection.monthsSaved > 0 && (
            <p className="text-xs text-amber-400 font-medium">
              💡 Cutting NE spending saves <strong>{Math.round(neSavingsProjection.monthsSaved / 12 * 10) / 10} years</strong> ({neSavingsProjection.monthsSaved} months) on your path to FIRE.
            </p>
          )}
        </div>
      )}

      {/* ── Year-grouped table ── */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] text-muted uppercase tracking-wide bg-white/[0.02] border-b border-border">
              <th className="px-3 py-3 text-left w-36">Month</th>
              <th className="px-2 py-3 text-right min-w-[100px] text-slate-300">Pay 1</th>
              <th className="px-2 py-3 text-right min-w-[100px] text-slate-300">Pay 2</th>
              {FIXED_KEYS.map((key, i) => (
                <th key={key} className="px-2 py-3 text-right min-w-[90px]">
                  {FIXED_LABELS[i]}
                </th>
              ))}
              {customLabels.map((l, i) => (
                <th key={i} className="px-2 py-3 text-right min-w-[90px]">
                  <span className="flex items-center justify-end gap-1">
                    {l}
                    {neFlags.has(`custom_${i}`) && <span className="text-[8px] font-black text-amber-400 leading-none">NE</span>}
                  </span>
                </th>
              ))}
              <th className="px-2 py-3 text-right min-w-[90px] text-emerald-400/80">Remaining</th>
            </tr>

            <DefaultsRow
              defaults={defaults}
              customLabels={customLabels}
              onChange={handleDefaultChange}
            />
          </thead>
          <tbody>
            {yearGroups.map(({ year, months }) => {
              const stats      = yearStats[year] ?? {}
              const isExpanded = expanded.has(year)
              const remCls     = (stats.remaining ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'

              return (
                <Fragment key={year}>
                  <tr
                    onClick={() => toggleYear(year)}
                    className="border-b border-border/60 cursor-pointer select-none hover:bg-white/[0.03] transition-colors bg-white/[0.01]"
                  >
                    <td className="px-3 py-3 font-semibold text-slate-200">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown size={13} className="text-muted" /> : <ChevronRight size={13} className="text-muted" />}
                        {year}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right mono text-slate-300">
                      {stats.paycheck > 0 ? usd(stats.paycheck) : <span className="text-muted/40">—</span>}
                    </td>
                    {Array.from({ length: 1 + FIXED_KEYS.length + customLabels.length }).map((_, i) => (
                      <td key={i} className="px-2 py-3 text-right text-muted/30">—</td>
                    ))}
                    <td className="px-2 py-3 text-right">
                      <span className={`mono font-semibold ${remCls}`}>
                        {stats.paycheck > 0 ? usd(stats.remaining) : <span className="text-muted/40">—</span>}
                      </span>
                    </td>
                  </tr>

                  {isExpanded && months.map(ym => (
                    <MonthRow
                      key={ym}
                      ym={ym}
                      rowData={budgetData[ym]}
                      defaults={defaults}
                      customLabels={customLabels}
                      onChange={handleChange}
                    />
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-muted">
        The <strong className="text-slate-400">Default</strong> row sets a value for every month. Override any individual month by typing directly in that cell — overrides are highlighted with a blue border.
        The <span className="text-emerald-400">Remaining</span> amount per month feeds into the Payoff vs. Invest planner.
      </p>
    </div>
  )
}
