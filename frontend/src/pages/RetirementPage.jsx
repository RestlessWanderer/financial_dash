import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'

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

/* ── Inline editable account card ─────────────────────────────────── */
function AccountCard({ account, onSave, onDelete }) {
  const [editing, setEditing]   = useState(false)
  const [name,    setName]      = useState(account.name)
  const [value,   setValue]     = useState(String(account.value))
  const [saving,  setSaving]    = useState(false)
  const nameRef = useRef(null)

  const startEdit = () => {
    setName(account.name)
    setValue(String(account.value))
    setEditing(true)
    setTimeout(() => nameRef.current?.focus(), 0)
  }

  const cancel = () => {
    setEditing(false)
    setName(account.name)
    setValue(String(account.value))
  }

  const save = async () => {
    const trimName = name.trim()
    if (!trimName) return
    setSaving(true)
    await onSave(account.id, { name: trimName, value: parseFloat(value) || 0 })
    setEditing(false)
    setSaving(false)
  }

  const handleKeyDown = (e) => {
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
          onKeyDown={handleKeyDown}
          placeholder="Account name"
          className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors"
        />
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
          <input
            type="number"
            min="0"
            step="1000"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="0"
            className="w-full bg-surface border border-border rounded-md pl-6 pr-3 py-1.5 text-sm mono focus:outline-none focus:border-accent transition-colors"
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
          <button
            onClick={cancel}
            className="text-xs text-muted hover:text-slate-200 px-2 py-1.5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card group flex flex-col gap-2">
      {/* Name row + action buttons */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted uppercase tracking-widest truncate">{account.name}</p>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={startEdit}
            className="p-1 text-muted hover:text-slate-200 transition-colors"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(account.id)}
            className="p-1 text-muted hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Value */}
      <p className="mono text-3xl font-bold text-slate-200 leading-none">
        {usd(account.value)}
      </p>

      {/* Last updated */}
      <p className="text-[10px] text-muted mt-auto pt-1">
        Updated {timeAgo(account.updated_at)}
      </p>
    </div>
  )
}

/* ── Add card ──────────────────────────────────────────────────────── */
function AddCard({ onAdd }) {
  const [open,   setOpen]   = useState(false)
  const [name,   setName]   = useState('')
  const [value,  setValue]  = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(null)

  const startOpen = () => {
    setOpen(true)
    setTimeout(() => nameRef.current?.focus(), 0)
  }

  const cancel = () => {
    setOpen(false)
    setName('')
    setValue('')
  }

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onAdd({ name: name.trim(), value: parseFloat(value) || 0 })
    setOpen(false)
    setName('')
    setValue('')
    setSaving(false)
  }

  const handleKeyDown = (e) => {
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
          onKeyDown={handleKeyDown}
          placeholder="Account name (e.g. Roth IRA)"
          className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors"
        />
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
          <input
            type="number"
            min="0"
            step="1000"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="0"
            className="w-full bg-surface border border-border rounded-md pl-6 pr-3 py-1.5 text-sm mono focus:outline-none focus:border-accent transition-colors"
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
          <button
            onClick={cancel}
            className="text-xs text-muted hover:text-slate-200 px-2 py-1.5 transition-colors"
          >
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
export default function RetirementPage() {
  const [accounts, setAccounts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    api.getRetirementAccounts()
      .then(setAccounts)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleAdd = async (body) => {
    try {
      const created = await api.createRetirementAccount(body)
      setAccounts(prev => [...prev, created])
    } catch (e) {
      setError(e.message)
    }
  }

  const handleSave = async (id, body) => {
    try {
      const updated = await api.updateRetirementAccount(id, body)
      setAccounts(prev => prev.map(a => a.id === id ? updated : a))
    } catch (e) {
      setError(e.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Remove this account?')) return
    try {
      await api.deleteRetirementAccount(id)
      setAccounts(prev => prev.filter(a => a.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  const total = accounts.reduce((s, a) => s + (a.value ?? 0), 0)

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Retirement Accounts</h1>
          <p className="text-xs text-muted mt-0.5">
            Manually track your 401(k), IRA, Roth, and other retirement balances
          </p>
        </div>
        {accounts.length > 0 && (
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted uppercase tracking-widest">Total Balance</p>
            <p className="mono text-2xl font-bold text-slate-200 leading-none">{usd(total)}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="text-red-400 text-sm px-3 py-2 rounded-lg border border-red-400/20 bg-red-400/5">
          {error}
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
