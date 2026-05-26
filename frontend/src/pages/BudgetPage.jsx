import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'

/* ── Constants ────────────────────────────────────────────────────── */
const LS_BUDGET   = 'budget_data'
const LS_DEFAULTS = 'budget_defaults'      // { paycheck, housing, utilities, groceries, custom_0, … }
const LS_CUSTOM   = 'budget_custom_labels'
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

/**
 * Resolve the effective value for a field in a month row.
 * Returns the month-specific override if set, otherwise the column default.
 */
function effective(rowData, defaults, key) {
  const v = rowData?.[key]
  if (v !== undefined && v !== '') return parseFloat(v) || 0
  const d = defaults?.[key]
  if (d !== undefined && d !== '') return parseFloat(d) || 0
  return 0
}

/** Remaining = (pay1 + pay2) − all expenses, using effective values */
function calcRemaining(rowData, defaults, customLabels) {
  const pay1      = effective(rowData, defaults, 'pay1')
  const pay2      = effective(rowData, defaults, 'pay2')
  const housing   = effective(rowData, defaults, 'housing')
  const utilities = effective(rowData, defaults, 'utilities')
  const groceries = effective(rowData, defaults, 'groceries')
  const customSum = customLabels.reduce((s, _, i) => s + effective(rowData, defaults, `custom_${i}`), 0)
  return (pay1 + pay2) - housing - utilities - groceries - customSum
}

/* ── Default row (sticky below headers) ──────────────────────────── */
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
      {/* Remaining — not editable for the default row */}
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

  /* Month list mirrors Payoff vs Invest timeline */
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

  /* Year groups */
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

  /* Default value change */
  const handleDefaultChange = useCallback((key, val) => {
    setDefaults(prev => {
      const next = { ...prev, [key]: val }
      localStorage.setItem(LS_DEFAULTS, JSON.stringify(next))
      return next
    })
  }, [])

  /* Month field change */
  const handleChange = useCallback((ym, key, val) => {
    setBudgetData(prev => {
      const next = { ...prev, [ym]: { ...(prev[ym] ?? {}), [key]: val } }
      localStorage.setItem(LS_BUDGET, JSON.stringify(next))
      return next
    })
  }, [])

  /* Custom label rename */
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
    setCustomLabels(prev => {
      const next = prev.filter((_, idx) => idx !== i)
      localStorage.setItem(LS_CUSTOM, JSON.stringify(next))
      return next
    })
    // Remove default for that key and re-index above it
    setDefaults(prev => {
      const next = { ...prev }
      delete next[`custom_${i}`]
      for (let j = i + 1; j < customLabels.length; j++) {
        if (`custom_${j}` in next) { next[`custom_${j - 1}`] = next[`custom_${j}`]; delete next[`custom_${j}`] }
      }
      localStorage.setItem(LS_DEFAULTS, JSON.stringify(next))
      return next
    })
    // Remove from all months and re-index
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

  /* Year-level summary using effective values */
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
          <p className="text-xs font-medium text-slate-300">Expense Categories</p>
          {customLabels.length < 10 && (
            <button onClick={addCustomField} className="flex items-center gap-1 text-[11px] text-accent hover:text-accent/80 transition-colors">
              <Plus size={11} /> Add category
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {FIXED_LABELS.map(label => (
            <span key={label} className="px-2.5 py-1 rounded-full bg-white/[0.05] border border-border/60 text-xs text-muted select-none">
              {label}
            </span>
          ))}
          {customLabels.map((label, i) => (
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
              <button onClick={() => removeCustomField(i)}
                className="p-0.5 text-muted hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Remove category">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted">
          Click a custom category name to rename it. Fixed categories cannot be removed.
        </p>
      </div>

      {/* ── Year-grouped table ── */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            {/* Column headers */}
            <tr className="text-[11px] text-muted uppercase tracking-wide bg-white/[0.02] border-b border-border">
              <th className="px-3 py-3 text-left w-36">Month</th>
              <th className="px-2 py-3 text-right min-w-[100px] text-slate-300">Pay 1</th>
              <th className="px-2 py-3 text-right min-w-[100px] text-slate-300">Pay 2</th>
              {FIXED_LABELS.map(l => (
                <th key={l} className="px-2 py-3 text-right min-w-[90px]">{l}</th>
              ))}
              {customLabels.map((l, i) => (
                <th key={i} className="px-2 py-3 text-right min-w-[90px]">{l}</th>
              ))}
              <th className="px-2 py-3 text-right min-w-[90px] text-emerald-400/80">Remaining</th>
            </tr>

            {/* Default values row */}
            <DefaultsRow
              defaults={defaults}
              customLabels={customLabels}
              onChange={handleDefaultChange}
            />
          </thead>
          <tbody>
            {yearGroups.map(({ year, months }) => {
              const stats     = yearStats[year] ?? {}
              const isExpanded = expanded.has(year)
              const remCls    = (stats.remaining ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'

              return (
                <Fragment key={year}>
                  {/* Year summary row */}
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
                    {Array.from({ length: 3 + customLabels.length }).map((_, i) => (
                      <td key={i} className="px-2 py-3 text-right text-muted/30">—</td>
                    ))}
                    <td className="px-2 py-3 text-right">
                      <span className={`mono font-semibold ${remCls}`}>
                        {stats.paycheck > 0 ? usd(stats.remaining) : <span className="text-muted/40">—</span>}
                      </span>
                    </td>
                  </tr>

                  {/* Month detail rows */}
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
