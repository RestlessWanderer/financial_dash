import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react'
import { ChevronDown, ChevronRight, Home, Plus, X, ChevronLeft, Building2 } from 'lucide-react'
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

function buildSchedule(principal, annualRate, termYears, startYear, startMonth0, extraPayments = {}) {
  const monthlyRate = annualRate / 100 / 12
  const totalMonths = termYears * 12
  const payment     = calcPayment(principal, monthlyRate, totalMonths)

  let balance       = principal
  let totalInterest = 0
  const months      = []

  for (let i = 0; i < totalMonths; i++) {
    if (balance < 0.005) break
    const interest = r2(balance * monthlyRate)
    let   prinPaid = r2(payment - interest)
    if (prinPaid > balance) prinPaid = r2(balance)
    const extra  = Math.min(parseFloat(extraPayments[i]) || 0, Math.max(0, balance - prinPaid))
    const newBal = r2(Math.max(0, balance - prinPaid - extra))
    const date   = new Date(startYear, startMonth0 + i, 1)
    months.push({
      index: i, year: date.getFullYear(), monthNum: date.getMonth(),
      monthName: date.toLocaleString('default', { month: 'long' }),
      payment: r2(Math.min(payment, balance + interest)),
      interest, principal: prinPaid, extra: r2(extra), balance: newBal,
    })
    totalInterest += interest
    balance = newBal
  }

  const last = months[months.length - 1]
  return {
    months, payment,
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

/** Compute current remaining balance from a mortgage config + extras object */
export function calcMortgageBalance(cfg, extras) {
  if (!cfg?.startDate || !cfg?.principal || !cfg?.rate) return null
  const [y, m]      = cfg.startDate.split('-').map(Number)
  const principal   = parseFloat(String(cfg.principal).replace(/,/g, '')) || 0
  const rate        = parseFloat(cfg.rate) || 0
  const years       = parseInt(cfg.years)  || 30
  if (principal <= 0 || rate <= 0) return null
  const sched = buildSchedule(principal, rate, years, y, m - 1, extras ?? {})
  // Find the month corresponding to today
  const now   = new Date()
  const month = sched.months.find(mo => mo.year === now.getFullYear() && mo.monthNum === now.getMonth())
  return month ? month.balance : (sched.months[sched.months.length - 1]?.balance ?? 0)
}

/* ── Persistence helpers ─────────────────────────────────────────── */

const LS_KEY = 'mortgages_v2'

function loadMortgages() {
  try {
    // Check for new format first
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)

    // Migrate from legacy single-mortgage format
    const legacyCfg = localStorage.getItem('mortgage_config')
    if (legacyCfg) {
      const cfg = JSON.parse(legacyCfg)
      const migrated = [{
        id:            1,
        address:       'Primary Residence',
        propertyValue: '',
        form:          cfg,
        calculated:    true,
      }]
      localStorage.setItem(LS_KEY, JSON.stringify(migrated))
      // Don't remove legacy key so other pages still work until they're updated
      return migrated
    }
    return []
  } catch { return [] }
}

function saveMortgages(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list))
  // Keep legacy mortgage_config in sync with first property so Dashboard/Fire still work
  if (list.length > 0 && list[0].form && list[0].calculated) {
    localStorage.setItem('mortgage_config', JSON.stringify(list[0].form))
  } else if (list.length === 0) {
    localStorage.removeItem('mortgage_config')
  }
}

function nextId(list) {
  return list.length === 0 ? 1 : Math.max(...list.map(p => p.id)) + 1
}

const EMPTY_FORM = { startDate: '', years: '30', rate: '', principal: '', targetYear: '', targetYear2: '' }

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

const INPUT = 'w-full bg-surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors'

/* ── Property detail view (the original mortgage page, scoped to one property) ── */
function PropertyDetail({ property, onUpdate, onBack }) {
  const { id, form: initialForm, calculated: initialCalc } = property

  const [form,        setFormState]  = useState(initialForm ?? EMPTY_FORM)
  const [calculated,  setCalculated] = useState(initialCalc ?? false)
  const [extras,      setExtras]     = useState({})
  const [extraInputs, setExtraInputs] = useState({})
  const [expanded,    setExpanded]   = useState(new Set())
  const debounceRef = useRef({})

  // Load extras for this property
  useEffect(() => {
    try {
      const ext = localStorage.getItem(`mortgage_extras_${id}`)
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
  }, [id])

  const saveExtras = useCallback((next) => {
    localStorage.setItem(`mortgage_extras_${id}`, JSON.stringify(next))
    // Keep legacy key in sync for property id=1
    if (id === 1) localStorage.setItem('mortgage_extras', JSON.stringify(next))
  }, [id])

  const persistForm = useCallback((nextForm, nextCalc) => {
    onUpdate({ form: nextForm, calculated: nextCalc ?? calculated })
  }, [onUpdate, calculated])

  const setFormField = useCallback((key, value) => {
    setFormState(prev => {
      const next = { ...prev, [key]: value }
      persistForm(next)
      return next
    })
  }, [persistForm])

  const handleCalc = () => {
    if (!form.startDate || !form.rate || !form.principal) return
    setCalculated(true)
    onUpdate({ form, calculated: true })
  }

  const handleClear = () => {
    Object.values(debounceRef.current).forEach(clearTimeout)
    debounceRef.current = {}
    setFormState(EMPTY_FORM)
    setCalculated(false)
    setExtras({})
    setExtraInputs({})
    setExpanded(new Set())
    localStorage.removeItem(`mortgage_extras_${id}`)
    if (id === 1) localStorage.removeItem('mortgage_extras')
    onUpdate({ form: EMPTY_FORM, calculated: false })
  }

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
    mortgage ? buildSchedule(mortgage.principal, mortgage.rate, mortgage.years, mortgage.startYear, mortgage.startMonth0, {}) : null,
    [mortgage]
  )
  const modSched = useMemo(() =>
    mortgage ? buildSchedule(mortgage.principal, mortgage.rate, mortgage.years, mortgage.startYear, mortgage.startMonth0, extras) : null,
    [mortgage, extras]
  )

  const calcTargetPayoff = useCallback((targetYearStr) => {
    if (!mortgage || !stdSched || !targetYearStr) return null
    const targetY = parseInt(targetYearStr)
    if (!targetY) return null
    const targetMonths  = (targetY - mortgage.startYear) * 12 + (12 - mortgage.startMonth0)
    if (targetMonths <= 0) return { status: 'past' }
    const naturalMonths = mortgage.years * 12
    if (targetMonths >= naturalMonths) return { status: 'unnecessary', targetY }
    const monthlyRate  = mortgage.rate / 100 / 12

    // Use remaining months from today
    const now       = new Date()
    const elapsed   = (now.getFullYear() - mortgage.startYear) * 12 + (now.getMonth() - mortgage.startMonth0)
    const totalToTarget   = targetMonths
    const remainingMonths = totalToTarget - elapsed
    if (remainingMonths <= 0) return { status: 'past' }

    // Current balance
    const curBal = calcMortgageBalance(form, extras) ?? mortgage.principal
    const reqPayment = monthlyRate === 0
      ? curBal / remainingMonths
      : curBal * monthlyRate * Math.pow(1 + monthlyRate, remainingMonths) /
        (Math.pow(1 + monthlyRate, remainingMonths) - 1)
    const extraNeeded = Math.ceil(Math.max(0, reqPayment - stdSched.payment))

    const flatExtras = {}
    for (let i = 0; i < naturalMonths; i++) flatExtras[String(i)] = extraNeeded
    const targetSched   = buildSchedule(mortgage.principal, mortgage.rate, mortgage.years, mortgage.startYear, mortgage.startMonth0, flatExtras)
    const interestSaved = r2(stdSched.totalInterest - targetSched.totalInterest)

    return { status: 'needed', targetY, targetMonths, reqPayment: r2(reqPayment), extraNeeded, interestSaved }
  }, [mortgage, stdSched, form, extras])

  const targetPayoffCalc  = useMemo(() => calcTargetPayoff(form.targetYear),  [calcTargetPayoff, form.targetYear])
  const targetPayoffCalc2 = useMemo(() => calcTargetPayoff(form.targetYear2), [calcTargetPayoff, form.targetYear2])

  const chartData = useMemo(() => {
    if (!stdSched || !mortgage) return []
    return Array.from({ length: mortgage.years }, (_, i) => {
      const idx  = Math.min(i * 12 + 11, stdSched.months.length - 1)
      const stdM = stdSched.months[idx]
      const modM = modSched?.months[idx] ?? null
      return {
        label:      stdM?.year?.toString() ?? String(mortgage.startYear + i),
        stdBalance: stdM?.balance ?? 0,
        modBalance: modM?.balance ?? 0,
      }
    })
  }, [mortgage, stdSched, modSched])

  const yearGroups    = useMemo(() => groupByYear(modSched?.months ?? []), [modSched])
  const hasExtras     = Object.keys(extras).length > 0
  const monthsSaved   = stdSched && modSched ? stdSched.count - modSched.count : 0
  const interestSaved = stdSched && modSched ? r2(stdSched.totalInterest - modSched.totalInterest) : 0

  const makeApplyExtra = useCallback((calc) => () => {
    if (!calc || calc.status !== 'needed' || !stdSched) return
    const { extraNeeded } = calc
    const newExtras = {}
    const newInputs = {}
    stdSched.months.forEach((_, i) => {
      newExtras[String(i)] = extraNeeded
      newInputs[String(i)] = String(extraNeeded)
    })
    setExtras(newExtras)
    setExtraInputs(newInputs)
    saveExtras(newExtras)
  }, [stdSched, saveExtras])

  const applyTargetExtra  = useMemo(() => makeApplyExtra(targetPayoffCalc),  [makeApplyExtra, targetPayoffCalc])
  const applyTargetExtra2 = useMemo(() => makeApplyExtra(targetPayoffCalc2), [makeApplyExtra, targetPayoffCalc2])

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
        saveExtras(next)
        return next
      })
    }, 400)
  }, [saveExtras])

  const toggleYear = useCallback((year) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(year) ? next.delete(year) : next.add(year)
      return next
    })
  }, [])

  const fmtYAxis = v => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`
  const xInterval = mortgage ? Math.max(1, Math.floor(mortgage.years / 7) - 1) : 'preserveStartEnd'

  return (
    <div className="space-y-5">

      {/* ── Back + property header ──────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-muted hover:text-slate-200 transition-colors text-sm"
        >
          <ChevronLeft size={16} /> All Properties
        </button>
        <span className="text-border/60">·</span>
        <div className="flex items-center gap-2">
          <Home size={16} className="text-accent" />
          <span className="font-semibold text-slate-200">{property.address}</span>
        </div>
      </div>

      {/* ── Mortgage inputs ────────────────────────────────────── */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-200">Mortgage Details</p>
          {mortgage && (
            <div className="text-right">
              <p className="text-[10px] text-muted uppercase tracking-wider">Current Balance</p>
              <p className="mono font-bold text-rose-400 text-lg leading-none">
                {usd(calcMortgageBalance(form, extras))}
              </p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">

          <div className="space-y-1.5">
            <label className="text-xs text-muted">Original Start Date</label>
            <input type="month" value={form.startDate}
              onChange={e => setFormField('startDate', e.target.value)} className={INPUT} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted">Loan Term</label>
            <select value={form.years} onChange={e => setFormField('years', e.target.value)} className={INPUT}>
              {[10, 15, 20, 25, 30].map(y => <option key={y} value={y}>{y} years</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted">Interest Rate</label>
            <div className="relative">
              <input type="number" step="0.125" min="0" max="20" placeholder="6.75"
                value={form.rate} onChange={e => setFormField('rate', e.target.value)}
                className={INPUT + ' pr-7'} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">%</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted">Principal Balance</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
              <input type="number" step="1000" min="0" placeholder="350000"
                value={form.principal} onChange={e => setFormField('principal', e.target.value)}
                className={INPUT + ' pl-6'} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted">Target Payoff Year #1</label>
            <input type="number" min="2024" max="2100" step="1"
              placeholder={mortgage ? String(mortgage.startYear + mortgage.years) : 'e.g. 2035'}
              value={form.targetYear} onChange={e => setFormField('targetYear', e.target.value)}
              className={INPUT} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted">Target Payoff Year #2</label>
            <input type="number" min="2024" max="2100" step="1"
              placeholder={mortgage ? String(mortgage.startYear + mortgage.years) : 'e.g. 2040'}
              value={form.targetYear2} onChange={e => setFormField('targetYear2', e.target.value)}
              className={INPUT} />
          </div>

        </div>

        {/* Target payoff banners */}
        {[
          { calc: targetPayoffCalc,  apply: applyTargetExtra,  label: '#1', cls: 'bg-accent/[0.07] border-accent/20',         btnCls: 'bg-accent/15 text-accent border-accent/30 hover:bg-accent/25',               valCls: 'text-accent'   },
          { calc: targetPayoffCalc2, apply: applyTargetExtra2, label: '#2', cls: 'bg-amber-500/[0.07] border-amber-500/20',    btnCls: 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25',  valCls: 'text-amber-400' },
        ].map(({ calc, apply, label, cls, btnCls, valCls }) => {
          if (!calc) return null
          const { status, targetY, extraNeeded, reqPayment } = calc
          if (status === 'past') return (
            <p key={label} className="text-xs text-red-400/80 flex items-center gap-1.5">⚠ Target year {label} is before or already past.</p>
          )
          if (status === 'unnecessary') return (
            <p key={label} className="text-xs text-green-400/80 flex items-center gap-1.5">✓ Target {label}: loan already pays off before {targetY}.</p>
          )
          return (
            <div key={label} className={`flex items-center gap-4 px-4 py-3 rounded-lg border ${cls}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200">
                  Target {label}: pay off by <span className={valCls}>{targetY}</span>
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Requires <span className="text-slate-200 font-semibold mono">{usd(reqPayment, 2)}/mo</span>
                  {' '}— that's an extra{' '}
                  <span className="text-green-400 font-semibold mono">{usd(extraNeeded, 0)}/mo</span>
                  {' '}on top of your standard payment.
                </p>
                {calc.interestSaved > 0 && (
                  <p className="text-xs mt-1">
                    <span className="text-emerald-400 font-semibold mono">{usd(calc.interestSaved)}</span>
                    <span className="text-muted"> in interest saved vs. standard payoff</span>
                  </p>
                )}
              </div>
              <button onClick={apply}
                className={`shrink-0 border px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${btnCls}`}>
                Apply to schedule
              </button>
            </div>
          )
        })}

        <div className="flex items-center gap-3">
          <button onClick={handleCalc}
            disabled={!form.startDate || !form.rate || !form.principal}
            className="bg-accent/15 text-accent border border-accent/30 px-5 py-2 rounded-lg text-sm font-semibold hover:bg-accent/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Calculate Amortization
          </button>
          <button onClick={handleClear}
            className="text-muted border border-border px-4 py-2 rounded-lg text-sm font-medium hover:border-red-500/40 hover:text-red-400 transition-colors">
            Clear All
          </button>
        </div>
      </div>

      {/* ── Results ────────────────────────────────────────────── */}
      {stdSched && modSched && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="card space-y-1">
              <p className="text-[10px] text-muted uppercase tracking-widest">Monthly Payment</p>
              <p className="mono text-3xl font-bold text-slate-200 leading-none">{usd(stdSched.payment, 2)}</p>
              <p className="text-xs text-muted">{mortgage.years}-year fixed</p>
            </div>
            <div className="card space-y-1">
              <p className="text-[10px] text-muted uppercase tracking-widest">Standard Payoff</p>
              <p className="mono text-xl font-bold text-slate-200 leading-none">{stdSched.payoffMonthName} {stdSched.payoffYear}</p>
              <p className="text-xs text-muted mt-0.5">{usd(stdSched.totalInterest)} total interest</p>
            </div>
            <div className={`card space-y-1 transition-colors ${hasExtras ? 'border-green-500/30 bg-green-500/[0.05]' : 'border-border opacity-60'}`}>
              <p className="text-[10px] text-muted uppercase tracking-widest">With Extra Payments</p>
              {hasExtras ? (
                <>
                  <p className="mono text-xl font-bold text-green-400 leading-none">{modSched.payoffMonthName} {modSched.payoffYear}</p>
                  <p className="text-xs text-green-400/80 mt-0.5">
                    {monthsSaved > 0 ? `${monthsSaved} months early` : 'same payoff'} · {interestSaved > 0 ? `${usd(interestSaved)} saved` : 'no savings yet'}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted mt-2 italic">Enter extra payments in the schedule below</p>
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium">Loan Balance Over Time</p>
              <div className="flex items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-5 border-t-2 border-dashed border-slate-500" /> Standard
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-5 border-t-2 border-green-500" /> With extra payments
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id={`stdGrad_${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#64748b" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#64748b" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id={`modGrad_${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} interval={xInterval} />
                <YAxis tickFormatter={fmtYAxis} tick={{ fill: '#64748b', fontSize: 11 }} width={56} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="stdBalance" name="Standard"
                  stroke="#64748b" strokeWidth={1.5} strokeDasharray="5 3"
                  fill={`url(#stdGrad_${id})`} dot={false} activeDot={{ r: 3 }} />
                <Area type="monotone" dataKey="modBalance" name="With Extra Payments"
                  stroke="#22c55e" strokeWidth={2}
                  fill={`url(#modGrad_${id})`} dot={false} activeDot={{ r: 4, fill: '#22c55e' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Amortization schedule */}
          <div className="card p-0 overflow-x-auto">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium">Amortization Schedule</span>
              <span className="text-xs text-muted">Click a year to expand · enter extra payments to recalculate instantly</span>
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
                    <tr onClick={() => toggleYear(yr.year)}
                      className="border-b border-border/60 hover:bg-white/[0.03] cursor-pointer transition-colors select-none">
                      <td className="px-3 py-3 text-muted">
                        {expanded.has(yr.year) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-200">{yr.year}</td>
                      <td className="px-3 py-3 text-right mono text-red-400/80">{usd(yr.interest)}</td>
                      <td className="px-3 py-3 text-right mono">{usd(yr.principal)}</td>
                      <td className="px-3 py-3 text-right mono">
                        {yr.extra > 0 ? <span className="text-green-400">{usd(yr.extra)}</span> : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right mono font-medium">{usd(yr.endBalance)}</td>
                    </tr>
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
                                <tr key={m.index} className="border-b border-border/20 hover:bg-white/[0.02] transition-colors">
                                  <td className="w-8" />
                                  <td className="px-3 py-2 pl-10 text-slate-300">{m.monthName}</td>
                                  <td className="px-3 py-2 text-right mono text-slate-400">{usd(m.payment, 2)}</td>
                                  <td className="px-3 py-2 text-right mono text-red-400/70">{usd(m.interest, 2)}</td>
                                  <td className="px-3 py-2 text-right mono">{usd(m.principal, 2)}</td>
                                  <td className="px-3 py-2 text-right">
                                    <input type="number" min="0" step="100" placeholder="0"
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
            Based on a standard fixed-rate amortization. Extra payments applied directly to principal.
            Chart shows year-end balances. Totals are estimates — verify with your lender.
          </p>
        </>
      )}
    </div>
  )
}

/* ── Property list row ───────────────────────────────────────────── */
function PropertyRow({ property, onSelect, onRemove, onUpdateValue }) {
  const [editingValue, setEditingValue] = useState(false)
  const [valueInput,   setValueInput]   = useState(property.propertyValue ? String(property.propertyValue) : '')
  const inputRef = useRef(null)

  const extras = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(`mortgage_extras_${property.id}`) ?? 'null') ?? {} }
    catch { return {} }
  }, [property.id])

  const balance = calcMortgageBalance(property.form, extras)
  const propVal = parseFloat(property.propertyValue) || 0
  const equity  = propVal > 0 && balance != null ? propVal - balance : null

  useEffect(() => {
    if (editingValue) inputRef.current?.focus()
  }, [editingValue])

  const saveValue = () => {
    const n = parseFloat(valueInput) || 0
    onUpdateValue(n > 0 ? n : '')
    setEditingValue(false)
  }

  return (
    <div className="card flex items-center gap-4 hover:border-accent/30 transition-colors group">
      {/* Icon */}
      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
        <Building2 size={18} className="text-accent" />
      </div>

      {/* Address + status */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(property)}>
        <p className="font-semibold text-slate-200 truncate">{property.address}</p>
        <p className="text-xs text-muted mt-0.5">
          {balance != null
            ? <><span className="text-rose-400 font-medium mono">{usd(balance)}</span> remaining</>
            : <span className="italic">No mortgage details yet — click to set up</span>
          }
        </p>
      </div>

      {/* Property value */}
      <div className="shrink-0 text-right min-w-[140px]">
        <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Property Value</p>
        {editingValue ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted">$</span>
            <input
              ref={inputRef}
              type="number" step="1000" min="0"
              value={valueInput}
              onChange={e => setValueInput(e.target.value)}
              onBlur={saveValue}
              onKeyDown={e => { if (e.key === 'Enter') saveValue(); if (e.key === 'Escape') setEditingValue(false) }}
              className="w-28 bg-surface border border-accent/40 rounded px-2 py-1 text-xs mono text-right focus:outline-none"
            />
          </div>
        ) : (
          <button onClick={() => setEditingValue(true)}
            className="text-sm font-semibold mono text-slate-200 hover:text-accent transition-colors">
            {propVal > 0 ? usd(propVal) : <span className="text-muted italic text-xs">Set value</span>}
          </button>
        )}
        {equity != null && (
          <p className={`text-xs mono font-medium mt-0.5 ${equity >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {equity >= 0 ? '+' : ''}{usd(equity)} equity
          </p>
        )}
      </div>

      {/* Open chevron */}
      <button onClick={() => onSelect(property)}
        className="p-2 text-muted hover:text-accent transition-colors rounded-lg hover:bg-accent/10">
        <ChevronRight size={16} />
      </button>

      {/* Remove */}
      <button onClick={() => onRemove(property.id)}
        className="p-2 text-muted hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10 opacity-0 group-hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  )
}

/* ── Add property form ───────────────────────────────────────────── */
function AddPropertyCard({ onAdd }) {
  const [address, setAddress] = useState('')
  const inputRef = useRef(null)

  const submit = () => {
    const trimmed = address.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setAddress('')
  }

  return (
    <div className="card border-dashed border-border/60">
      <p className="text-xs font-medium text-slate-300 mb-2">Add a property</p>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={address}
          onChange={e => setAddress(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="e.g. 123 Main St, Springfield, IL"
          className="flex-1 bg-surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors placeholder:text-muted"
        />
        <button
          onClick={submit}
          disabled={!address.trim()}
          className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/25 transition-colors disabled:opacity-40"
        >
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function MortgagePage() {
  const [properties,    setProperties]    = useState(() => loadMortgages())
  const [selectedId,    setSelectedId]    = useState(null)

  // Persist whenever list changes
  useEffect(() => {
    saveMortgages(properties)
  }, [properties])

  const handleAdd = (address) => {
    const newProp = {
      id:            nextId(properties),
      address,
      propertyValue: '',
      form:          { ...EMPTY_FORM },
      calculated:    false,
    }
    setProperties(prev => [...prev, newProp])
    setSelectedId(newProp.id)
  }

  const handleRemove = (id) => {
    localStorage.removeItem(`mortgage_extras_${id}`)
    setProperties(prev => prev.filter(p => p.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const handleUpdateProperty = (id, updates) => {
    setProperties(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
  }

  const selectedProperty = properties.find(p => p.id === selectedId) ?? null

  // Totals for header summary
  const totals = useMemo(() => {
    let totalValue = 0, totalBalance = 0
    for (const p of properties) {
      const pv = parseFloat(p.propertyValue) || 0
      totalValue += pv
      const extras = (() => {
        try { return JSON.parse(localStorage.getItem(`mortgage_extras_${p.id}`) ?? 'null') ?? {} }
        catch { return {} }
      })()
      const bal = calcMortgageBalance(p.form, extras) ?? 0
      totalBalance += bal
    }
    return { totalValue, totalBalance, totalEquity: totalValue - totalBalance }
  }, [properties])

  // ── Detail view ───────────────────────────────────────────────── //
  if (selectedProperty) {
    return (
      <PropertyDetail
        property={selectedProperty}
        onBack={() => setSelectedId(null)}
        onUpdate={(updates) => handleUpdateProperty(selectedProperty.id, updates)}
      />
    )
  }

  // ── List view ─────────────────────────────────────────────────── //
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Home size={20} className="text-accent" />
          <div>
            <h1 className="text-xl font-semibold">Mortgage Payoff Calculator</h1>
            <p className="text-xs text-muted mt-0.5">
              Track payoff schedules and property equity across all your properties
            </p>
          </div>
        </div>

        {/* Portfolio summary */}
        {properties.length > 0 && (
          <div className="flex items-center gap-6 shrink-0">
            {totals.totalValue > 0 && (
              <div className="text-right">
                <p className="text-[10px] text-muted uppercase tracking-wider">Total Value</p>
                <p className="mono font-bold text-slate-200">{usd(totals.totalValue)}</p>
              </div>
            )}
            {totals.totalBalance > 0 && (
              <div className="text-right">
                <p className="text-[10px] text-muted uppercase tracking-wider">Total Owed</p>
                <p className="mono font-bold text-rose-400">{usd(totals.totalBalance)}</p>
              </div>
            )}
            {totals.totalValue > 0 && (
              <div className="text-right">
                <p className="text-[10px] text-muted uppercase tracking-wider">Total Equity</p>
                <p className={`mono font-bold ${totals.totalEquity >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {usd(totals.totalEquity)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Property list */}
      {properties.length === 0 ? (
        <div className="card text-center py-12 text-muted space-y-2">
          <Home size={32} className="mx-auto opacity-30" />
          <p className="font-medium text-slate-300">No properties yet</p>
          <p className="text-xs">Add a property address below to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map(p => (
            <PropertyRow
              key={p.id}
              property={p}
              onSelect={(prop) => setSelectedId(prop.id)}
              onRemove={handleRemove}
              onUpdateValue={(val) => handleUpdateProperty(p.id, { propertyValue: val })}
            />
          ))}
        </div>
      )}

      <AddPropertyCard onAdd={handleAdd} />

      {properties.length > 0 && (
        <p className="text-xs text-muted">
          Click a property to open its amortization calculator and extra payment schedule.
          Property value and equity update in real time as you enter values.
          All data is saved in your browser — nothing is sent to any server.
        </p>
      )}
    </div>
  )
}
