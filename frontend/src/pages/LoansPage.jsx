import { useState, useRef } from 'react'
import { Plus, Pencil, Trash2, Check, X, TrendingDown } from 'lucide-react'

const LS_KEY = 'loans_data'

function usd(n, dec = 0) {
  if (n == null || isNaN(n)) return '—'
  return Math.abs(n).toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  })
}

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') ?? [] } catch { return [] }
}

function save(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data))
}

function nextId(loans) {
  return loans.length > 0 ? Math.max(...loans.map(l => l.id)) + 1 : 1
}

/** Standard amortizing monthly payment from principal. */
function calcStdPayment(principal, annualRate, termYears) {
  if (principal <= 0 || termYears <= 0) return 0
  if (annualRate === 0) return principal / (termYears * 12)
  const r = annualRate / 100 / 12
  const n = termYears * 12
  const pow = Math.pow(1 + r, n)
  return principal * r * pow / (pow - 1)
}

/**
 * Calculate current remaining balance by amortizing from startDate to today.
 * Uses the entered monthly payment if provided, otherwise the calculated
 * standard amortizing payment (for fixed) or principal-only portion (for simple).
 * Returns null if not enough data.
 */
function calcCurrentBalance(loan) {
  const principal = parseFloat(loan.amount) || 0
  const rate      = parseFloat(loan.rate)   || 0
  const termYears = parseFloat(loan.term)   || 0
  if (principal <= 0 || termYears <= 0 || !loan.startDate) return null

  const [startY, startM] = loan.startDate.split('-').map(Number)
  const start = new Date(startY, startM - 1, 1)
  const now   = new Date()
  // Months elapsed from loan start to start of current month
  const elapsed = Math.max(0,
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth())
  )

  const totalMonths = Math.round(termYears * 12)
  // Already paid off by term end
  if (elapsed >= totalMonths) return 0

  const monthlyRate = rate / 100 / 12

  if (loan.interestType === 'fixed') {
    const stdPayment = calcStdPayment(principal, rate, termYears)
    // Use entered payment if it's >= the interest-only floor (to avoid negative amortization display)
    const enteredPayment = parseFloat(loan.payment) || 0
    const payment = enteredPayment > 0 ? enteredPayment : stdPayment

    let balance = principal
    for (let i = 0; i < elapsed; i++) {
      if (balance < 0.01) { balance = 0; break }
      const interest = balance * monthlyRate
      const prinPaid = Math.min(Math.max(0, payment - interest), balance)
      balance = Math.max(0, balance - prinPaid)
    }
    return Math.round(balance * 100) / 100
  }

  if (loan.interestType === 'simple') {
    // Simple interest: daily interest accrues on original principal only.
    // Each payment first covers the accrued interest, remainder reduces principal.
    const monthlyInterest = principal * (rate / 100) / 12
    const stdPayment = termYears > 0
      ? principal / totalMonths + monthlyInterest   // flat approximation
      : 0
    const enteredPayment = parseFloat(loan.payment) || 0
    const payment = enteredPayment > 0 ? enteredPayment : stdPayment

    let balance = principal
    for (let i = 0; i < elapsed; i++) {
      if (balance < 0.01) { balance = 0; break }
      const interest = principal * (rate / 100) / 12  // always on original principal
      const prinPaid = Math.min(Math.max(0, payment - interest), balance)
      balance = Math.max(0, balance - prinPaid)
    }
    return Math.round(balance * 100) / 100
  }

  return null
}

/** Calculate total interest paid over the life of a loan (from origination). */
function calcTotalInterest(loan) {
  const principal = parseFloat(loan.amount)  || 0
  const rate      = parseFloat(loan.rate)    || 0
  const termYears = parseFloat(loan.term)    || 0

  if (principal <= 0 || termYears <= 0) return null

  if (loan.interestType === 'simple') {
    return principal * (rate / 100) * termYears
  }

  if (loan.interestType === 'fixed') {
    if (rate === 0) return 0
    const payment     = calcStdPayment(principal, rate, termYears)
    const totalMonths = Math.round(termYears * 12)
    return Math.round((payment * totalMonths - principal) * 100) / 100
  }

  return null
}

/** Months remaining from today until payoff. */
function calcMonthsRemaining(loan) {
  const principal = parseFloat(loan.amount) || 0
  const rate      = parseFloat(loan.rate)   || 0
  const termYears = parseFloat(loan.term)   || 0
  if (principal <= 0 || termYears <= 0 || !loan.startDate) return null

  const [startY, startM] = loan.startDate.split('-').map(Number)
  const start   = new Date(startY, startM - 1, 1)
  const now     = new Date()
  const elapsed = Math.max(0,
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth())
  )
  const total = Math.round(termYears * 12)
  return Math.max(0, total - elapsed)
}

const INTEREST_TYPES = [
  { value: 'fixed',  label: 'Fixed (Amortizing)' },
  { value: 'simple', label: 'Simple Interest' },
]

const INPUT = 'w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors'

const EMPTY_FORM = { name: '', interestType: 'fixed', amount: '', term: '', rate: '', startDate: '', payment: '' }

/* ── Shared form fields grid ─────────────────────────────────────── */
function LoanFormFields({ form, set, kd, nameRef }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
      {/* Name — spans 2 cols */}
      <div className="lg:col-span-2 space-y-1">
        <label className="text-[10px] text-muted uppercase tracking-wider">Loan Name</label>
        <input ref={nameRef} value={form.name ?? ''}
          onChange={e => set('name', e.target.value)} onKeyDown={kd}
          placeholder="e.g. Car Loan"
          className={INPUT}
        />
      </div>
      {/* Interest type */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted uppercase tracking-wider">Interest Type</label>
        <select value={form.interestType ?? 'fixed'}
          onChange={e => set('interestType', e.target.value)}
          className={INPUT + ' cursor-pointer'}>
          {INTEREST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      {/* Start date */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted uppercase tracking-wider">Start Date</label>
        <input type="month" value={form.startDate ?? ''}
          onChange={e => set('startDate', e.target.value)} onKeyDown={kd}
          className={INPUT}
        />
      </div>
      {/* Original amount */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted uppercase tracking-wider">Original Amount</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
          <input type="number" min="0" step="100" value={form.amount ?? ''}
            onChange={e => set('amount', e.target.value)} onKeyDown={kd}
            placeholder="0" className={INPUT + ' pl-6'}
          />
        </div>
      </div>
      {/* Term */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted uppercase tracking-wider">Term (yrs)</label>
        <input type="number" min="0.5" step="0.5" value={form.term ?? ''}
          onChange={e => set('term', e.target.value)} onKeyDown={kd}
          placeholder="5" className={INPUT}
        />
      </div>
      {/* Rate */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted uppercase tracking-wider">Rate</label>
        <div className="relative">
          <input type="number" min="0" step="0.05" value={form.rate ?? ''}
            onChange={e => set('rate', e.target.value)} onKeyDown={kd}
            placeholder="6.5" className={INPUT + ' pr-7'}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">%</span>
        </div>
      </div>
      {/* Monthly payment (optional) */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted uppercase tracking-wider">Monthly Pmt <span className="normal-case text-muted/60">(opt.)</span></label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
          <input type="number" min="0" step="10" value={form.payment ?? ''}
            onChange={e => set('payment', e.target.value)} onKeyDown={kd}
            placeholder="auto" className={INPUT + ' pl-6'}
          />
        </div>
      </div>
    </div>
  )
}

/* ── Loan row ────────────────────────────────────────────────────── */
function LoanRow({ loan, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form,    setForm]    = useState({})
  const [saving,  setSaving]  = useState(false)
  const nameRef = useRef(null)

  const startEdit = () => {
    setForm({ ...loan })
    setEditing(true)
    setTimeout(() => nameRef.current?.focus(), 0)
  }

  const cancel = () => setEditing(false)

  const doSave = async () => {
    if (!form.name?.trim()) return
    setSaving(true)
    await onSave(loan.id, form)
    setEditing(false)
    setSaving(false)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const kd  = (e) => { if (e.key === 'Escape') cancel() }

  const totalInterest  = calcTotalInterest(loan)
  const totalCost      = totalInterest != null ? (parseFloat(loan.amount) || 0) + totalInterest : null
  const currentBalance = calcCurrentBalance(loan)
  const monthsLeft     = calcMonthsRemaining(loan)
  const hasStartDate   = !!loan.startDate

  // Payoff progress: how far through the loan are we?
  const principal      = parseFloat(loan.amount) || 0
  const progressPct    = (hasStartDate && currentBalance != null && principal > 0)
    ? Math.round(((principal - currentBalance) / principal) * 100)
    : null

  if (editing) {
    return (
      <div className="px-4 py-4 border-b border-border/60 bg-accent/[0.03]">
        <LoanFormFields form={form} set={set} kd={kd} nameRef={nameRef} />
        <div className="flex items-center gap-2 mt-3">
          <button onClick={doSave} disabled={saving || !form.name?.trim()}
            className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-40">
            <Check size={12} /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={cancel} className="p-1.5 text-muted hover:text-slate-200 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group px-4 py-3 border-b border-border/40 hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center gap-4">
        {/* Name + type */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">{loan.name}</p>
          <p className="text-[10px] text-muted mt-0.5">
            {INTEREST_TYPES.find(t => t.value === loan.interestType)?.label ?? loan.interestType}
            {loan.startDate && <span className="ml-2 opacity-60">started {loan.startDate}</span>}
          </p>
        </div>

        {/* Current balance — highlighted as the live figure */}
        <div className="text-right w-36 shrink-0">
          {hasStartDate && currentBalance != null ? (
            <>
              <p className="mono text-sm font-bold text-accent">{usd(currentBalance)}</p>
              <p className="text-[10px] text-muted">current balance</p>
            </>
          ) : (
            <>
              <p className="mono text-sm font-semibold text-slate-400">{usd(principal)}</p>
              <p className="text-[10px] text-muted">original</p>
            </>
          )}
        </div>

        {/* Monthly payment */}
        <div className="text-right w-28 shrink-0">
          {loan.payment ? (
            <>
              <p className="mono text-sm font-semibold text-slate-200">{usd(parseFloat(loan.payment), 2)}</p>
              <p className="text-[10px] text-muted">/mo</p>
            </>
          ) : loan.interestType === 'fixed' && loan.amount && loan.rate && loan.term ? (
            <>
              <p className="mono text-sm font-semibold text-slate-400">
                {usd(calcStdPayment(principal, parseFloat(loan.rate), parseFloat(loan.term)), 2)}
              </p>
              <p className="text-[10px] text-muted">/mo (calc.)</p>
            </>
          ) : (
            <p className="mono text-sm text-muted/40">—</p>
          )}
        </div>

        {/* Rate */}
        <div className="text-right w-20 shrink-0">
          <p className="mono text-sm font-semibold text-slate-200">
            {loan.rate ? `${loan.rate}%` : '—'}
          </p>
          <p className="text-[10px] text-muted">rate</p>
        </div>

        {/* Months remaining */}
        <div className="text-right w-24 shrink-0">
          {monthsLeft != null ? (
            <>
              <p className="mono text-sm font-semibold text-slate-200">{monthsLeft}</p>
              <p className="text-[10px] text-muted">mo. left</p>
            </>
          ) : loan.term ? (
            <>
              <p className="mono text-sm font-semibold text-slate-400">{loan.term} yr</p>
              <p className="text-[10px] text-muted">term</p>
            </>
          ) : (
            <p className="mono text-sm text-muted/40">—</p>
          )}
        </div>

        {/* Total interest */}
        <div className="text-right w-32 shrink-0 border-l border-border/50 pl-4">
          <p className="mono text-sm font-semibold text-rose-400">
            {totalInterest != null ? usd(totalInterest) : '—'}
          </p>
          <p className="text-[10px] text-muted">total interest</p>
        </div>

        {/* Total cost */}
        <div className="text-right w-32 shrink-0">
          <p className="mono text-sm font-semibold text-slate-200">
            {totalCost != null ? usd(totalCost) : '—'}
          </p>
          <p className="text-[10px] text-muted">total cost</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={startEdit} className="p-1.5 text-muted hover:text-slate-200 transition-colors" title="Edit">
            <Pencil size={13} />
          </button>
          <button onClick={() => onDelete(loan.id)} className="p-1.5 text-muted hover:text-rose-400 transition-colors" title="Delete">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Progress bar — only shown when we have start date + balance */}
      {progressPct != null && (
        <div className="mt-2.5 pl-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted">
              {progressPct}% paid off
              {monthsLeft === 0 && <span className="ml-1.5 text-emerald-400 font-medium">✓ Paid off</span>}
            </span>
            {monthsLeft != null && monthsLeft > 0 && (
              <span className="text-[10px] text-muted">
                Payoff ~{(() => {
                  const d = new Date()
                  d.setMonth(d.getMonth() + monthsLeft)
                  return d.toLocaleString('default', { month: 'short', year: 'numeric' })
                })()}
              </span>
            )}
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, progressPct)}%`,
                background: progressPct >= 100
                  ? '#22c55e'
                  : progressPct >= 75
                  ? '#3b82f6'
                  : progressPct >= 50
                  ? '#3b82f6'
                  : '#3b82f6',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Add row ─────────────────────────────────────────────────────── */
function AddLoanRow({ onAdd }) {
  const [open,   setOpen]   = useState(false)
  const [form,   setForm]   = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(null)

  const startOpen = () => { setOpen(true); setTimeout(() => nameRef.current?.focus(), 0) }
  const cancel = () => { setOpen(false); setForm(EMPTY_FORM) }

  const doSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await onAdd(form)
    cancel()
    setSaving(false)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const kd  = (e) => { if (e.key === 'Escape') cancel() }

  if (open) {
    return (
      <div className="px-4 py-4 bg-accent/[0.03] border-t border-border/40">
        <LoanFormFields form={form} set={set} kd={kd} nameRef={nameRef} />
        <div className="flex items-center gap-2 mt-3">
          <button onClick={doSave} disabled={saving || !form.name.trim()}
            className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-40">
            <Check size={12} /> {saving ? 'Saving…' : 'Add Loan'}
          </button>
          <button onClick={cancel} className="p-1.5 text-muted hover:text-slate-200 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <button onClick={startOpen}
      className="w-full flex items-center gap-2 px-4 py-3 text-xs text-muted hover:text-accent hover:bg-accent/[0.03] transition-colors border-t border-border/40">
      <Plus size={13} /> Add Loan
    </button>
  )
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function LoansPage() {
  const [loans, setLoans] = useState(() => load())

  const persist = (updated) => { setLoans(updated); save(updated) }

  const handleAdd = (form) => {
    const updated = [...loans, { id: nextId(loans), ...form }]
    persist(updated)
  }

  const handleSave = (id, form) => {
    const updated = loans.map(l => l.id === id ? { ...l, ...form } : l)
    persist(updated)
  }

  const handleDelete = (id) => {
    if (!confirm('Remove this loan?')) return
    persist(loans.filter(l => l.id !== id))
  }

  // Use current balance when available, else original principal
  const totalCurrentBalance = loans.reduce((s, l) => {
    const cur = calcCurrentBalance(l)
    return s + (cur != null ? cur : (parseFloat(l.amount) || 0))
  }, 0)
  const totalInterest = loans.reduce((s, l) => {
    const i = calcTotalInterest(l)
    return s + (i ?? 0)
  }, 0)
  const totalOriginal = loans.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const hasAnyStartDate = loans.some(l => !!l.startDate)

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <TrendingDown size={18} className="text-accent" />
            Loans
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Track loans · balances update automatically each month as time progresses
          </p>
        </div>

        {loans.length > 0 && (
          <div className="flex items-center gap-5 shrink-0">
            <div className="text-right">
              <p className="text-[10px] text-muted uppercase tracking-widest">
                {hasAnyStartDate ? 'Current Balance' : 'Total Principal'}
              </p>
              <p className="mono text-lg font-bold text-accent leading-none">
                {usd(totalCurrentBalance)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted uppercase tracking-widest">Total Interest</p>
              <p className="mono text-lg font-bold text-rose-400 leading-none">{usd(totalInterest)}</p>
            </div>
            <div className="text-right border-l border-border pl-5">
              <p className="text-[10px] text-muted uppercase tracking-widest">Total Cost</p>
              <p className="mono text-2xl font-bold text-slate-200 leading-none">
                {usd(totalOriginal + totalInterest)}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        {/* Column headers */}
        {loans.length > 0 && (
          <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-white/[0.02] text-[10px] text-muted uppercase tracking-wider">
            <span className="flex-1">Loan</span>
            <span className="w-36 text-right">Balance</span>
            <span className="w-28 text-right">Monthly</span>
            <span className="w-20 text-right">Rate</span>
            <span className="w-24 text-right">Remaining</span>
            <span className="w-32 text-right border-l border-border/50 pl-4">Total Interest</span>
            <span className="w-32 text-right">Total Cost</span>
            <span className="w-12" />
          </div>
        )}

        {loans.map(l => (
          <LoanRow key={l.id} loan={l} onSave={handleSave} onDelete={handleDelete} />
        ))}

        <AddLoanRow onAdd={handleAdd} />

        {loans.length === 0 && (
          <p className="text-xs text-muted text-center py-8">
            No loans yet — click Add Loan below to get started.
          </p>
        )}
      </div>

      <p className="text-[10px] text-muted leading-relaxed">
        <strong className="text-slate-400">Fixed (Amortizing)</strong> — standard installment loan where each payment covers interest + principal (auto loans, personal loans, etc.).{' '}
        <strong className="text-slate-400">Simple Interest</strong> — interest calculated only on the original principal (I = P × r × t).{' '}
        Current balance is calculated from the start date and monthly payment; enter a monthly payment to improve accuracy.
      </p>
    </div>
  )
}
