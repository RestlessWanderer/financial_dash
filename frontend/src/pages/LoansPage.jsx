import { useState, useEffect, useRef } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'

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

/** Calculate total interest paid over the life of a loan. */
function calcTotalInterest(loan) {
  const principal = parseFloat(loan.amount)  || 0
  const rate      = parseFloat(loan.rate)    || 0
  const termYears = parseFloat(loan.term)    || 0

  if (principal <= 0 || termYears <= 0) return null

  if (loan.interestType === 'simple') {
    // Simple interest: I = P × r × t
    return principal * (rate / 100) * termYears
  }

  if (loan.interestType === 'fixed') {
    // Amortizing fixed-rate loan
    if (rate === 0) return 0
    const monthlyRate  = rate / 100 / 12
    const totalMonths  = termYears * 12
    const pow          = Math.pow(1 + monthlyRate, totalMonths)
    const payment      = principal * monthlyRate * pow / (pow - 1)
    const totalPaid    = payment * totalMonths
    return totalPaid - principal
  }

  return null
}

const INTEREST_TYPES = [
  { value: 'fixed',  label: 'Fixed (Amortizing)' },
  { value: 'simple', label: 'Simple Interest' },
]

const INPUT = 'w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors'

const EMPTY_FORM = { name: '', interestType: 'fixed', amount: '', term: '', rate: '' }

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

  const save = async () => {
    if (!form.name?.trim()) return
    setSaving(true)
    await onSave(loan.id, form)
    setEditing(false)
    setSaving(false)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const kd  = (e) => { if (e.key === 'Escape') cancel() }

  const totalInterest = calcTotalInterest(loan)
  const totalCost     = totalInterest != null ? (parseFloat(loan.amount) || 0) + totalInterest : null

  if (editing) {
    return (
      <div className="px-4 py-3 border-b border-border/60 bg-accent/[0.03]">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          <div className="lg:col-span-2 space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Loan Name</label>
            <input ref={nameRef} value={form.name ?? ''}
              onChange={e => set('name', e.target.value)} onKeyDown={kd}
              placeholder="e.g. Car Loan"
              className={INPUT}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Interest Type</label>
            <select value={form.interestType ?? 'fixed'}
              onChange={e => set('interestType', e.target.value)}
              className={INPUT + ' cursor-pointer'}>
              {INTEREST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Loan Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
              <input type="number" min="0" step="100" value={form.amount ?? ''}
                onChange={e => set('amount', e.target.value)} onKeyDown={kd}
                placeholder="0" className={INPUT + ' pl-6'}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Term (years)</label>
            <input type="number" min="0.5" step="0.5" value={form.term ?? ''}
              onChange={e => set('term', e.target.value)} onKeyDown={kd}
              placeholder="e.g. 5" className={INPUT}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Interest Rate</label>
            <div className="relative">
              <input type="number" min="0" step="0.05" value={form.rate ?? ''}
                onChange={e => set('rate', e.target.value)} onKeyDown={kd}
                placeholder="e.g. 6.5" className={INPUT + ' pr-7'}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">%</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button onClick={save} disabled={saving || !form.name?.trim()}
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
    <div className="group flex items-center gap-4 px-4 py-3 border-b border-border/40 hover:bg-white/[0.02] transition-colors">
      {/* Name + type */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{loan.name}</p>
        <p className="text-[10px] text-muted mt-0.5">{INTEREST_TYPES.find(t => t.value === loan.interestType)?.label ?? loan.interestType}</p>
      </div>

      {/* Loan amount */}
      <div className="text-right w-32 shrink-0">
        <p className="mono text-sm font-semibold text-slate-200">{usd(parseFloat(loan.amount))}</p>
      </div>

      {/* Term */}
      <div className="text-right w-24 shrink-0">
        <p className="mono text-sm font-semibold text-slate-200">
          {loan.term ? `${loan.term} yr` : '—'}
        </p>
      </div>

      {/* Rate */}
      <div className="text-right w-24 shrink-0">
        <p className="mono text-sm font-semibold text-slate-200">
          {loan.rate ? `${loan.rate}%` : '—'}
        </p>
      </div>

      {/* Total interest */}
      <div className="text-right w-36 shrink-0 border-l border-border/50 pl-4">
        <p className="mono text-sm font-semibold text-rose-400">
          {totalInterest != null ? usd(totalInterest) : '—'}
        </p>
      </div>

      {/* Total cost */}
      <div className="text-right w-36 shrink-0">
        <p className="mono text-sm font-semibold text-slate-200">
          {totalCost != null ? usd(totalCost) : '—'}
        </p>
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

  const save = async () => {
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
      <div className="px-4 py-3 bg-accent/[0.03] border-t border-border/40">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          <div className="lg:col-span-2 space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Loan Name</label>
            <input ref={nameRef} value={form.name}
              onChange={e => set('name', e.target.value)} onKeyDown={kd}
              placeholder="e.g. Car Loan"
              className={INPUT}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Interest Type</label>
            <select value={form.interestType}
              onChange={e => set('interestType', e.target.value)}
              className={INPUT + ' cursor-pointer'}>
              {INTEREST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Loan Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
              <input type="number" min="0" step="100" value={form.amount}
                onChange={e => set('amount', e.target.value)} onKeyDown={kd}
                placeholder="0" className={INPUT + ' pl-6'}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Term (years)</label>
            <input type="number" min="0.5" step="0.5" value={form.term}
              onChange={e => set('term', e.target.value)} onKeyDown={kd}
              placeholder="e.g. 5" className={INPUT}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Interest Rate</label>
            <div className="relative">
              <input type="number" min="0" step="0.05" value={form.rate}
                onChange={e => set('rate', e.target.value)} onKeyDown={kd}
                placeholder="e.g. 6.5" className={INPUT + ' pr-7'}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">%</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button onClick={save} disabled={saving || !form.name.trim()}
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

  const totalPrincipal = loans.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const totalInterest  = loans.reduce((s, l) => {
    const i = calcTotalInterest(l)
    return s + (i ?? 0)
  }, 0)
  const totalCost = totalPrincipal + totalInterest

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Loans</h1>
          <p className="text-xs text-muted mt-0.5">Track loans and see total interest cost over the life of each</p>
        </div>

        {loans.length > 0 && (
          <div className="flex items-center gap-5 shrink-0">
            <div className="text-right">
              <p className="text-[10px] text-muted uppercase tracking-widest">Total Principal</p>
              <p className="mono text-lg font-bold text-slate-200 leading-none">{usd(totalPrincipal)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted uppercase tracking-widest">Total Interest</p>
              <p className="mono text-lg font-bold text-rose-400 leading-none">{usd(totalInterest)}</p>
            </div>
            <div className="text-right border-l border-border pl-5">
              <p className="text-[10px] text-muted uppercase tracking-widest">Total Cost</p>
              <p className="mono text-2xl font-bold text-slate-200 leading-none">{usd(totalCost)}</p>
            </div>
          </div>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        {/* Column headers */}
        {loans.length > 0 && (
          <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-white/[0.02] text-[10px] text-muted uppercase tracking-wider">
            <span className="flex-1">Loan</span>
            <span className="w-32 text-right">Principal</span>
            <span className="w-24 text-right">Term</span>
            <span className="w-24 text-right">Rate</span>
            <span className="w-36 text-right border-l border-border/50 pl-4">Total Interest</span>
            <span className="w-36 text-right">Total Cost</span>
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

      <p className="text-[10px] text-muted">
        <strong className="text-slate-400">Fixed (Amortizing)</strong> — standard installment loan where each payment covers interest + principal (auto loans, personal loans, etc.).{' '}
        <strong className="text-slate-400">Simple Interest</strong> — interest calculated only on the original principal (I = P × r × t).
      </p>
    </div>
  )
}
