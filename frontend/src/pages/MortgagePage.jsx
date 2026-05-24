import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react'
import { ChevronDown, ChevronRight, Home } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

/* ── Helpers ─────────────────────────────────────────────────────── */

function usd(n, dec = 0) {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  })
}

function r2(n) { return Math.round(n * 100) / 100 }

function calcPayment(principal, monthlyRate, totalMonths) {
  if (monthlyRate === 0) return r2(principal / totalMonths)
  const x = Math.pow(1 + monthlyRate, totalMonths)
  return r2(principal * monthlyRate * x / (x - 1))
}

/**
 * Build a full amortization schedule.
 * extraPayments: { [monthIndex: string]: number }
 */
function buildSchedule(principal, annualRate, termYears, startYear, startMonth0, extraPayments = {}) {
  const monthlyRate = annualRate / 100 / 12
  const totalMonths = termYears * 12
  const payment     = calcPayment(principal, monthlyRate, totalMonths)

  let balance      = principal
  let totalInterest = 0
  const months      = []

  for (let i = 0; i < totalMonths; i++) {
    if (balance < 0.005) break

    const interest = r2(balance * monthlyRate)
    let   prinPaid = r2(payment - interest)
    if (prinPaid > balance) prinPaid = r2(balance)          // last-month adjustment

    const extra  = Math.min(parseFloat(extraPayments[i]) || 0, Math.max(0, balance - prinPaid))
    const newBal = r2(Math.max(0, balance - prinPaid - extra))

    const date = new Date(startYear, startMonth0 + i, 1)
    months.push({
      index:     i,
      year:      date.getFullYear(),
      monthNum:  date.getMonth(),
      monthName: date.toLocaleString('default', { month: 'long' }),
      payment:   r2(Math.min(payment, balance + interest)),
      interest,
      principal: prinPaid,
      extra:     r2(extra),
      balance:   newBal,
    })

    totalInterest += interest
    balance = newBal
  }

  const last = months[months.length - 1]
  return {
    months,
    payment,
    totalInterest:   r2(totalInterest),
    payoffYear:      last?.year,
    payoffMonthName: last?.monthName,
    count:           months.length,
  }
}

function groupByYear(months) {
  const map = new Map()
  for (const m of months) {
    if (!map.has(m.year)) {
      map.set(m.year, { year: m.year, months: [], interest: 0, principal: 0, extra: 0, endBalance: 0 })
    }
    const yr = map.get(m.year)
    yr.months.push(m)
    yr.interest   = r2(yr.interest  + m.interest)
    yr.principal  = r2(yr.principal + m.principal)
    yr.extra      = r2(yr.extra     + m.extra)
    yr.endBalance = m.balance
  }
  return [...map.values()]
}

/* ── Chart tooltip ───────────────────────────────────────────────── */
function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div className="card text-xs py-2 px-3 space-y-1 border-border/80 shadow-lg">
      <p className="text-muted font-medium">{payload[0]?.payload?.label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="font-medium mono">{usd(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Input style shared class ────────────────────────────────────── */
const INPUT = 'w-full bg-surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors'

/* ── Page ────────────────────────────────────────────────────────── */
export default function MortgagePage() {
  const [form, setForm] = useState({ startDate: '', years: '30', rate: '', principal: '' })
  const [calculated,  setCalculated]  = useState(false)
  const [extras,      setExtras]      = useState({})        // { [monthIdx]: number }
  const [extraInputs, setExtraInputs] = useState({})        // { [monthIdx]: string }
  const [expanded,    setExpanded]    = useState(new Set())
  const debounceRef = useRef({})

  /* Restore from localStorage */
  useEffect(() => {
    try {
      const cfg = localStorage.getItem('mortgage_config')
      if (cfg) { setForm(JSON.parse(cfg)); setCalculated(true) }
      const ext = localStorage.getItem('mortgage_extras')
      if (ext) {
        const p = JSON.parse(ext)
        setExtras(p)
        setExtraInputs(
          Object.fromEntries(
            Object.entries(p).filter(([, v]) => v > 0).map(([k, v]) => [k, String(v)])
          )
        )
      }
    } catch { /* ignore */ }
  }, [])

  /* Parse form → mortgage params */
  const mortgage = useMemo(() => {
    if (!calculated || !form.startDate || !form.rate || !form.principal) return null
    const [y, m] = form.startDate.split('-').map(Number)
    const principal = parseFloat(String(form.principal).replace(/,/g, '')) || 0
    const rate      = parseFloat(form.rate) || 0
    const years     = parseInt(form.years)  || 30
    if (principal <= 0 || rate <= 0) return null
    return { principal, rate, years, startYear: y, startMonth0: m - 1 }
  }, [calculated, form])

  const stdSched = useMemo(() =>
    mortgage
      ? buildSchedule(mortgage.principal, mortgage.rate, mortgage.years,
                      mortgage.startYear, mortgage.startMonth0, {})
      : null,
    [mortgage]
  )

  const modSched = useMemo(() =>
    mortgage
      ? buildSchedule(mortgage.principal, mortgage.rate, mortgage.years,
                      mortgage.startYear, mortgage.startMonth0, extras)
      : null,
    [mortgage, extras]
  )

  /* Chart: one point per year (year-end balance) */
  const chartData = useMemo(() => {
    if (!stdSched || !mortgage) return []
    return Array.from({ length: mortgage.years }, (_, i) => {
      const idx  = Math.min(i * 12 + 11, stdSched.months.length - 1)
      const stdM = stdSched.months[idx]
      const modM = modSched?.months[idx] ?? null
      return {
        label:      stdM?.year?.toString() ?? String(mortgage.startYear + i),
        stdBalance: stdM?.balance  ?? 0,
        modBalance: modM?.balance  ?? 0,
      }
    })
  }, [mortgage, stdSched, modSched])

  const yearGroups = useMemo(() => groupByYear(modSched?.months ?? []), [modSched])

  const hasExtras     = Object.keys(extras).length > 0
  const monthsSaved   = stdSched && modSched ? stdSched.count - modSched.count : 0
  const interestSaved = stdSched && modSched ? r2(stdSched.totalInterest - modSched.totalInterest) : 0

  /* Handlers */
  const handleCalc = () => {
    if (!form.startDate || !form.rate || !form.principal) return
    setCalculated(true)
    localStorage.setItem('mortgage_config', JSON.stringify(form))
  }

  const handleClear = () => {
    // Cancel any in-flight debounce timers
    Object.values(debounceRef.current).forEach(clearTimeout)
    debounceRef.current = {}
    setForm({ startDate: '', years: '30', rate: '', principal: '' })
    setCalculated(false)
    setExtras({})
    setExtraInputs({})
    setExpanded(new Set())
    localStorage.removeItem('mortgage_config')
    localStorage.removeItem('mortgage_extras')
  }

  const handleExtra = useCallback((idx, raw) => {
    const key = String(idx)
    setExtraInputs(prev => ({ ...prev, [key]: raw }))
    clearTimeout(debounceRef.current[key])
    debounceRef.current[key] = setTimeout(() => {
      const n = parseFloat(raw) || 0
      setExtras(prev => {
        const next = { ...prev }
        if (n > 0) next[key] = n
        else delete next[key]
        localStorage.setItem('mortgage_extras', JSON.stringify(next))
        return next
      })
    }, 400)
  }, [])

  const toggleYear = useCallback((year) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(year) ? next.delete(year) : next.add(year)
      return next
    })
  }, [])

  const fmtYAxis = v => v >= 1_000_000
    ? `$${(v / 1_000_000).toFixed(1)}M`
    : v >= 1000
    ? `$${(v / 1000).toFixed(0)}K`
    : `$${v}`

  const xInterval = mortgage
    ? Math.max(1, Math.floor(mortgage.years / 7) - 1)
    : 'preserveStartEnd'

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Home size={20} className="text-accent" />
        <div>
          <h1 className="text-xl font-semibold">Mortgage Payoff Calculator</h1>
          <p className="text-xs text-muted mt-0.5">
            See how extra payments cut years off your loan and save thousands in interest
          </p>
        </div>
      </div>

      {/* ── Mortgage inputs ────────────────────────────────────── */}
      <div className="card space-y-4">
        <p className="text-sm font-medium text-slate-200">Mortgage Details</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">

          <div className="space-y-1.5">
            <label className="text-xs text-muted">Original Start Date</label>
            <input
              type="month"
              value={form.startDate}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
              className={INPUT}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted">Loan Term</label>
            <select
              value={form.years}
              onChange={e => setForm(f => ({ ...f, years: e.target.value }))}
              className={INPUT}
            >
              {[10, 15, 20, 25, 30].map(y => (
                <option key={y} value={y}>{y} years</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted">Interest Rate</label>
            <div className="relative">
              <input
                type="number" step="0.125" min="0" max="20"
                placeholder="6.75"
                value={form.rate}
                onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
                className={INPUT + ' pr-7'}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">%</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted">Principal Balance</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
              <input
                type="number" step="1000" min="0"
                placeholder="350000"
                value={form.principal}
                onChange={e => setForm(f => ({ ...f, principal: e.target.value }))}
                className={INPUT + ' pl-6'}
              />
            </div>
          </div>

        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCalc}
            disabled={!form.startDate || !form.rate || !form.principal}
            className="bg-accent/15 text-accent border border-accent/30 px-5 py-2 rounded-lg text-sm font-semibold hover:bg-accent/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Calculate Amortization
          </button>
          <button
            onClick={handleClear}
            className="text-muted border border-border px-4 py-2 rounded-lg text-sm font-medium hover:border-red-500/40 hover:text-red-400 transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* ── Results ────────────────────────────────────────────── */}
      {stdSched && modSched && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">

            <div className="card space-y-1">
              <p className="text-[10px] text-muted uppercase tracking-widest">Monthly Payment</p>
              <p className="mono text-3xl font-bold text-slate-200 leading-none">{usd(stdSched.payment, 2)}</p>
              <p className="text-xs text-muted">{mortgage.years}-year fixed</p>
            </div>

            <div className="card space-y-1">
              <p className="text-[10px] text-muted uppercase tracking-widest">Standard Payoff</p>
              <p className="mono text-xl font-bold text-slate-200 leading-none">
                {stdSched.payoffMonthName} {stdSched.payoffYear}
              </p>
              <p className="text-xs text-muted mt-0.5">
                {usd(stdSched.totalInterest)} total interest
              </p>
            </div>

            <div className={`card space-y-1 transition-colors ${
              hasExtras ? 'border-green-500/30 bg-green-500/[0.05]' : 'border-border opacity-60'
            }`}>
              <p className="text-[10px] text-muted uppercase tracking-widest">With Extra Payments</p>
              {hasExtras ? (
                <>
                  <p className="mono text-xl font-bold text-green-400 leading-none">
                    {modSched.payoffMonthName} {modSched.payoffYear}
                  </p>
                  <p className="text-xs text-green-400/80 mt-0.5">
                    {monthsSaved > 0 ? `${monthsSaved} months early` : 'same payoff'}{' '}
                    ·{' '}
                    {interestSaved > 0 ? `${usd(interestSaved)} saved` : 'no savings yet'}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted mt-2 italic">
                  Enter extra payments in the schedule below
                </p>
              )}
            </div>

          </div>

          {/* Chart */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium">Loan Balance Over Time</p>
              <div className="flex items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-5 border-t-2 border-dashed border-slate-500" />
                  Standard
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-5 border-t-2 border-green-500" />
                  With extra payments
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="stdGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#64748b" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#64748b" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="modGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  interval={xInterval}
                />
                <YAxis
                  tickFormatter={fmtYAxis}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  width={56}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="stdBalance"
                  name="Standard"
                  stroke="#64748b"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  fill="url(#stdGrad)"
                  dot={false}
                  activeDot={{ r: 3 }}
                />
                <Area
                  type="monotone"
                  dataKey="modBalance"
                  name="With Extra Payments"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fill="url(#modGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#22c55e' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Amortization schedule */}
          <div className="card p-0 overflow-x-auto">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium">Amortization Schedule</span>
              <span className="text-xs text-muted">
                Click a year to expand · enter extra payments to recalculate instantly
              </span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] text-muted uppercase tracking-wide bg-white/[0.02]">
                  <th className="w-8 px-3 py-3" />
                  <th className="px-3 py-3 text-left">Year</th>
                  <th className="px-3 py-3 text-right">Interest Paid</th>
                  <th className="px-3 py-3 text-right">Principal Paid</th>
                  <th className="px-3 py-3 text-right text-green-400/70">Extra Paid</th>
                  <th className="px-3 py-3 text-right">End Balance</th>
                </tr>
              </thead>
              <tbody>
                {yearGroups.map(yr => (
                  <Fragment key={yr.year}>

                    {/* ── Year row ── */}
                    <tr
                      onClick={() => toggleYear(yr.year)}
                      className="border-b border-border/60 hover:bg-white/[0.03] cursor-pointer transition-colors select-none"
                    >
                      <td className="px-3 py-3 text-muted">
                        {expanded.has(yr.year)
                          ? <ChevronDown size={13} />
                          : <ChevronRight size={13} />
                        }
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-200">{yr.year}</td>
                      <td className="px-3 py-3 text-right mono text-red-400/80">{usd(yr.interest)}</td>
                      <td className="px-3 py-3 text-right mono">{usd(yr.principal)}</td>
                      <td className="px-3 py-3 text-right mono">
                        {yr.extra > 0
                          ? <span className="text-green-400">{usd(yr.extra)}</span>
                          : <span className="text-muted">—</span>
                        }
                      </td>
                      <td className="px-3 py-3 text-right mono font-medium">{usd(yr.endBalance)}</td>
                    </tr>

                    {/* ── Month rows ── */}
                    {expanded.has(yr.year) && (
                      <tr className="border-b border-border/20">
                        <td colSpan={6} className="p-0">
                          <table className="w-full text-xs bg-white/[0.015]">
                            <thead>
                              <tr className="text-[10px] text-muted uppercase tracking-wide border-b border-border/30">
                                <th className="w-8" />
                                <th className="px-3 py-2 text-left pl-10">Month</th>
                                <th className="px-3 py-2 text-right">Payment</th>
                                <th className="px-3 py-2 text-right">Interest</th>
                                <th className="px-3 py-2 text-right">Principal</th>
                                <th className="px-3 py-2 text-right text-green-400/70">Extra Payment</th>
                                <th className="px-3 py-2 text-right">Balance</th>
                              </tr>
                            </thead>
                            <tbody>
                              {yr.months.map(m => (
                                <tr key={m.index}
                                    className="border-b border-border/20 hover:bg-white/[0.02] transition-colors">
                                  <td className="w-8" />
                                  <td className="px-3 py-2 pl-10 text-slate-300">{m.monthName}</td>
                                  <td className="px-3 py-2 text-right mono text-slate-400">{usd(m.payment, 2)}</td>
                                  <td className="px-3 py-2 text-right mono text-red-400/70">{usd(m.interest, 2)}</td>
                                  <td className="px-3 py-2 text-right mono">{usd(m.principal, 2)}</td>
                                  <td className="px-3 py-2 text-right">
                                    <input
                                      type="number"
                                      min="0"
                                      step="100"
                                      placeholder="0"
                                      value={extraInputs[String(m.index)] ?? (m.extra > 0 ? String(m.extra) : '')}
                                      onChange={e => handleExtra(m.index, e.target.value)}
                                      className="w-28 bg-surface border border-border rounded-md px-2 py-1 mono text-right text-green-300 focus:outline-none focus:border-green-500/60 transition-colors"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right mono">{usd(m.balance, 2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}

                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted">
            Based on a standard fixed-rate amortization. Extra payments are applied directly to principal.
            Chart shows year-end balances. Totals are estimates — verify with your lender.
          </p>
        </>
      )}
    </div>
  )
}
