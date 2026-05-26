import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2, DollarSign } from 'lucide-react'

/* ── Constants ────────────────────────────────────────────────────── */
const LS_BUDGET   = 'budget_data'         // { months: { 'YYYY-MM': { paycheck, housing, utilities, groceries, custom } } }
const LS_CUSTOM   = 'budget_custom_labels' // string[]  — user-defined expense label names
const LS_MORTGAGE = 'mortgage_config'

const DEFAULT_CUSTOM_LABELS = ['Car Payment', 'Insurance', 'Subscriptions', 'Dining', 'Misc']

const INPUT = 'w-full bg-surface border border-border rounded px-2 py-1.5 text-xs mono focus:outline-none focus:border-accent transition-colors text-right'

/* ── Helpers ──────────────────────────────────────────────────────── */
function usd(n) {
  if (n == null || isNaN(n)) return '—'
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
    m++
    if (m > 11) { m = 0; y++ }
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

function loadBudgetData() {
  try { return JSON.parse(localStorage.getItem(LS_BUDGET) ?? '{}') } catch { return {} }
}
function saveBudgetData(data) {
  localStorage.setItem(LS_BUDGET, JSON.stringify(data))
}
function loadCustomLabels() {
  try {
    const raw = localStorage.getItem(LS_CUSTOM)
    return raw ? JSON.parse(raw) : DEFAULT_CUSTOM_LABELS
  } catch { return DEFAULT_CUSTOM_LABELS }
}
function saveCustomLabels(labels) {
  localStorage.setItem(LS_CUSTOM, JSON.stringify(labels))
}

/** Compute remaining = paycheck − all expenses */
function calcRemaining(row, customLabels) {
  const paycheck  = parseFloat(row?.paycheck)  || 0
  const housing   = parseFloat(row?.housing)   || 0
  const utilities = parseFloat(row?.utilities) || 0
  const groceries = parseFloat(row?.groceries) || 0
  const customSum = customLabels.reduce((s, _, i) => s + (parseFloat(row?.[`custom_${i}`]) || 0), 0)
  return paycheck - housing - utilities - groceries - customSum
}

/* ── Month row (inside expanded year) ────────────────────────────── */
function MonthRow({ ym, rowData = {}, customLabels, onChange }) {
  const remaining = calcRemaining(rowData, customLabels)
  const remCls    = remaining >= 0 ? 'text-emerald-400' : 'text-rose-400'

  const field = (key) => (
    <td className="px-2 py-1.5">
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted pointer-events-none">$</span>
        <input
          type="number" min="0" step="50"
          value={rowData[key] ?? ''}
          placeholder="0"
          onChange={e => onChange(ym, key, e.target.value)}
          className={INPUT + ' pl-5'}
        />
      </div>
    </td>
  )

  return (
    <tr className="border-b border-border/20 hover:bg-white/[0.015] transition-colors">
      {/* Month name */}
      <td className="pl-10 pr-3 py-1.5 text-xs text-muted w-36">{formatMonth(ym)}</td>

      {/* Paycheck */}
      {field('paycheck')}

      {/* Fixed expenses */}
      {field('housing')}
      {field('utilities')}
      {field('groceries')}

      {/* Custom expense fields */}
      {customLabels.map((_, i) => (
        <Fragment key={i}>{field(`custom_${i}`)}</Fragment>
      ))}

      {/* Remaining */}
      <td className="px-2 py-1.5 text-right">
        <span className={`mono text-xs font-semibold ${remCls}`}>
          {usd(remaining)}
        </span>
      </td>
    </tr>
  )
}

/* ── Page ─────────────────────────────────────────────────────────── */
export default function BudgetPage() {
  const [budgetData,    setBudgetData]    = useState(loadBudgetData)
  const [customLabels,  setCustomLabels]  = useState(loadCustomLabels)
  const [editingLabel,  setEditingLabel]  = useState(null) // index being renamed
  const [labelDraft,    setLabelDraft]    = useState('')
  const [mortgageConfig, setMortgageConfig] = useState(null)
  const [expanded,      setExpanded]      = useState(new Set())

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

  /* Field change handler */
  const handleChange = useCallback((ym, key, val) => {
    setBudgetData(prev => {
      const next = {
        ...prev,
        [ym]: { ...(prev[ym] ?? {}), [key]: val },
      }
      saveBudgetData(next)
      return next
    })
  }, [])

  /* Custom label rename */
  const startRename = (i) => { setEditingLabel(i); setLabelDraft(customLabels[i]) }
  const commitRename = (i) => {
    const trimmed = labelDraft.trim()
    if (!trimmed) return
    setCustomLabels(prev => {
      const next = [...prev]
      next[i] = trimmed
      saveCustomLabels(next)
      return next
    })
    setEditingLabel(null)
  }
  const addCustomField = () => {
    if (customLabels.length >= 10) return
    setCustomLabels(prev => {
      const next = [...prev, `Expense ${prev.length + 1}`]
      saveCustomLabels(next)
      return next
    })
  }
  const removeCustomField = (i) => {
    setCustomLabels(prev => {
      const next = prev.filter((_, idx) => idx !== i)
      saveCustomLabels(next)
      return next
    })
    // Remove that key from all months
    setBudgetData(prev => {
      const next = {}
      for (const [ym, row] of Object.entries(prev)) {
        const newRow = { ...row }
        delete newRow[`custom_${i}`]
        // Re-index custom fields above the removed one
        for (let j = i + 1; j < customLabels.length; j++) {
          if (`custom_${j}` in newRow) {
            newRow[`custom_${j - 1}`] = newRow[`custom_${j}`]
            delete newRow[`custom_${j}`]
          }
        }
        next[ym] = newRow
      }
      saveBudgetData(next)
      return next
    })
  }

  /* Year-level summary stats */
  const yearStats = useMemo(() => {
    const stats = {}
    for (const { year, months } of yearGroups) {
      let paycheck = 0, expenses = 0, remaining = 0
      for (const ym of months) {
        const row = budgetData[ym] ?? {}
        const rem = calcRemaining(row, customLabels)
        paycheck  += parseFloat(row.paycheck) || 0
        expenses  += (parseFloat(row.paycheck) || 0) - Math.max(0, rem) // only positive expenses
        remaining += rem
      }
      stats[year] = { paycheck, remaining }
    }
    return stats
  }, [yearGroups, budgetData, customLabels])

  /* Column count for colSpan */
  const totalCols = 1 + 1 + 3 + customLabels.length + 1  // month + paycheck + 3 fixed + custom + remaining

  const FIXED_LABELS = ['Housing', 'Utilities', 'Groceries']

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Monthly Budget</h1>
          <p className="text-xs text-muted mt-0.5">
            Track income and expenses by month. The <span className="text-emerald-400 font-medium">Remaining</span> amount
            feeds into the Payoff vs. Invest planner as your default monthly budget.
          </p>
        </div>
      </div>

      {/* ── Column label editor ── */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-300">Expense Categories</p>
          {customLabels.length < 10 && (
            <button
              onClick={addCustomField}
              className="flex items-center gap-1 text-[11px] text-accent hover:text-accent/80 transition-colors"
            >
              <Plus size={11} /> Add category
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Fixed labels */}
          {FIXED_LABELS.map(label => (
            <span key={label} className="px-2.5 py-1 rounded-full bg-white/[0.05] border border-border/60 text-xs text-muted select-none">
              {label}
            </span>
          ))}
          {/* Custom labels — editable */}
          {customLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-1 group">
              {editingLabel === i ? (
                <input
                  autoFocus
                  value={labelDraft}
                  onChange={e => setLabelDraft(e.target.value)}
                  onBlur={() => commitRename(i)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(i); if (e.key === 'Escape') setEditingLabel(null) }}
                  className="px-2 py-0.5 rounded-full bg-accent/10 border border-accent/40 text-xs text-accent focus:outline-none w-28"
                />
              ) : (
                <button
                  onClick={() => startRename(i)}
                  className="px-2.5 py-1 rounded-full bg-accent/[0.07] border border-accent/25 text-xs text-accent hover:bg-accent/15 transition-colors"
                  title="Click to rename"
                >
                  {label}
                </button>
              )}
              <button
                onClick={() => removeCustomField(i)}
                className="p-0.5 text-muted hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Remove category"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted">Click a custom category name to rename it. Fixed categories (Housing, Utilities, Groceries) cannot be removed.</p>
      </div>

      {/* ── Year-grouped table ── */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-[11px] text-muted uppercase tracking-wide bg-white/[0.02]">
              <th className="px-3 py-3 text-left w-36">Month</th>
              <th className="px-2 py-3 text-right min-w-[100px]">
                <span className="text-slate-300">Paycheck</span>
              </th>
              {FIXED_LABELS.map(l => (
                <th key={l} className="px-2 py-3 text-right min-w-[90px] text-muted">{l}</th>
              ))}
              {customLabels.map((l, i) => (
                <th key={i} className="px-2 py-3 text-right min-w-[90px] text-muted">{l}</th>
              ))}
              <th className="px-2 py-3 text-right min-w-[90px]">
                <span className="text-emerald-400/80">Remaining</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {yearGroups.map(({ year, months }) => {
              const stats = yearStats[year] ?? {}
              const isExpanded = expanded.has(year)
              const remCls = (stats.remaining ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'

              return (
                <Fragment key={year}>
                  {/* Year summary row */}
                  <tr
                    onClick={() => toggleYear(year)}
                    className="border-b border-border/60 cursor-pointer select-none hover:bg-white/[0.03] transition-colors bg-white/[0.01]"
                  >
                    <td className="px-3 py-3 font-semibold text-slate-200 flex items-center gap-2">
                      {isExpanded ? <ChevronDown size={13} className="text-muted" /> : <ChevronRight size={13} className="text-muted" />}
                      {year}
                    </td>
                    <td className="px-2 py-3 text-right mono text-slate-300">
                      {stats.paycheck > 0 ? usd(stats.paycheck) : <span className="text-muted/40">—</span>}
                    </td>
                    {/* Expense columns — blank in year row */}
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
        All budget data is stored locally in your browser. Changes save automatically.
        The <span className="text-emerald-400">Remaining</span> amount for each month is used as the default budget in the Payoff vs. Invest planner.
      </p>
    </div>
  )
}
