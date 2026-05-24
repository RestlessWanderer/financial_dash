import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { Plus, Pencil, Trash2, Check, Wallet } from 'lucide-react'

const ACCOUNT_TYPES = ['Checking', 'Savings', 'HYSA', 'Money Market', 'CD', 'Other']

const TYPE_COLORS = {
  'Checking':     'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Savings':      'bg-green-500/10 text-green-400 border-green-500/20',
  'HYSA':         'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Money Market': 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  'CD':           'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Other':        'bg-slate-500/10 text-slate-400 border-slate-500/20',
}

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

const INPUT = 'w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors'

/* ── Inline editable account card ─────────────────────────────────── */
function AccountCard({ account, onSave, onDelete }) {
  const [editing,  setEditing]  = useState(false)
  const [name,     setName]     = useState(account.name)
  const [type,     setType]     = useState(account.account_type)
  const [value,    setValue]    = useState(String(account.value))
  const [saving,   setSaving]   = useState(false)
  const nameRef = useRef(null)

  const startEdit = () => {
    setName(account.name)
    setType(account.account_type)
    setValue(String(account.value))
    setEditing(true)
    setTimeout(() => nameRef.current?.focus(), 0)
  }

  const cancel = () => {
    setEditing(false)
    setName(account.name)
    setType(account.account_type)
    setValue(String(account.value))
  }

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onSave(account.id, { name: name.trim(), account_type: type, value: parseFloat(value) || 0 })
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
        <div className="relative">
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

  return (
    <div className="card group flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5 min-w-0">
          <p className="text-xs text-muted uppercase tracking-widest truncate">{account.name}</p>
          <span className={`self-start text-[10px] px-2 py-0.5 rounded-full border font-medium ${typeColor}`}>
            {account.account_type}
          </span>
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
      <p className="text-[10px] text-muted mt-auto pt-1">Updated {timeAgo(account.updated_at)}</p>
    </div>
  )
}

/* ── Add card ──────────────────────────────────────────────────────── */
function AddCard({ onAdd }) {
  const [open,   setOpen]   = useState(false)
  const [name,   setName]   = useState('')
  const [type,   setType]   = useState('Checking')
  const [value,  setValue]  = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(null)

  const startOpen = () => {
    setOpen(true)
    setTimeout(() => nameRef.current?.focus(), 0)
  }

  const cancel = () => { setOpen(false); setName(''); setType('Checking'); setValue('') }

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onAdd({ name: name.trim(), account_type: type, value: parseFloat(value) || 0 })
    setOpen(false); setName(''); setType('Checking'); setValue('')
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
        <div className="relative">
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

/* ── Page ──────────────────────────────────────────────────────────── */
export default function LiquidAssetsPage() {
  const [accounts, setAccounts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    api.getLiquidAccounts()
      .then(setAccounts)
      .catch(e => setError(e.message))
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

  // Totals by type
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
            <AccountCard key={a.id} account={a} onSave={handleSave} onDelete={handleDelete} />
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
