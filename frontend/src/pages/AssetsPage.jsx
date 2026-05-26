import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { Plus, Pencil, Trash2, Check } from 'lucide-react'

function usd(n, dec = 0) {
  return (n ?? 0).toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  })
}

function timeAgo(iso) {
  if (!iso) return null
  const mins = Math.round((Date.now() - new Date(iso + 'Z').getTime()) / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.round(mins / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

const INPUT = 'w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors'

/* ── Asset card ──────────────────────────────────────────────────── */
function AssetCard({ asset, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [name,    setName]    = useState(asset.name)
  const [value,   setValue]   = useState(String(asset.value))
  const [debt,    setDebt]    = useState(String(asset.debt))
  const [saving,  setSaving]  = useState(false)
  const nameRef = useRef(null)

  const startEdit = () => {
    setName(asset.name)
    setValue(String(asset.value))
    setDebt(String(asset.debt))
    setEditing(true)
    setTimeout(() => nameRef.current?.focus(), 0)
  }

  const cancel = () => setEditing(false)

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onSave(asset.id, {
      name:  name.trim(),
      value: parseFloat(value) || 0,
      debt:  parseFloat(debt)  || 0,
    })
    setEditing(false)
    setSaving(false)
  }

  const kd = (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }

  if (editing) {
    return (
      <div className="card border-accent/40 bg-accent/[0.04] flex flex-col gap-3">
        <input ref={nameRef} value={name}
          onChange={e => setName(e.target.value)} onKeyDown={kd}
          placeholder="Asset name (e.g. 2022 Honda Civic)"
          className={INPUT}
        />
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Current Value</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
              <input type="number" min="0" step="100" value={value}
                onChange={e => setValue(e.target.value)} onKeyDown={kd}
                placeholder="0"
                className={INPUT + ' pl-6'}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Current Debt</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
              <input type="number" min="0" step="100" value={debt}
                onChange={e => setDebt(e.target.value)} onKeyDown={kd}
                placeholder="0"
                className={INPUT + ' pl-6'}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-40">
            <Check size={12} /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={cancel} className="text-xs text-muted hover:text-slate-200 px-2 py-1.5 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  const equity = asset.value - asset.debt
  const equityPositive = equity >= 0

  return (
    <div className="card group flex flex-col gap-3">
      {/* Name + actions */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted uppercase tracking-widest truncate">{asset.name}</p>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={startEdit} className="p-1 text-muted hover:text-slate-200 transition-colors" title="Edit">
            <Pencil size={13} />
          </button>
          <button onClick={() => onDelete(asset.id)} className="p-1 text-muted hover:text-rose-400 transition-colors" title="Delete">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Value & debt */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] text-muted uppercase tracking-wider">Value</span>
          <span className="mono text-lg font-semibold text-slate-200">{usd(asset.value)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] text-muted uppercase tracking-wider">Debt</span>
          <span className={`mono text-lg font-semibold ${asset.debt > 0 ? 'text-rose-400' : 'text-slate-200'}`}>{usd(asset.debt)}</span>
        </div>
      </div>

      {/* Divider + equity */}
      <div className="border-t border-border/60 pt-2.5 flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted">Equity</span>
        <span className={`mono text-xl font-bold ${equityPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
          {equityPositive ? '' : '−'}{usd(Math.abs(equity))}
        </span>
      </div>

      <p className="text-[10px] text-muted -mt-1">Updated {timeAgo(asset.updated_at)}</p>
    </div>
  )
}

/* ── Add card ────────────────────────────────────────────────────── */
function AddAssetCard({ onAdd }) {
  const [open,   setOpen]   = useState(false)
  const [name,   setName]   = useState('')
  const [value,  setValue]  = useState('')
  const [debt,   setDebt]   = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(null)

  const startOpen = () => { setOpen(true); setTimeout(() => nameRef.current?.focus(), 0) }

  const cancel = () => { setOpen(false); setName(''); setValue(''); setDebt('') }

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onAdd({ name: name.trim(), value: parseFloat(value) || 0, debt: parseFloat(debt) || 0 })
    cancel()
    setSaving(false)
  }

  const kd = (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }

  if (open) {
    return (
      <div className="card border-accent/40 bg-accent/[0.04] flex flex-col gap-3">
        <input ref={nameRef} value={name}
          onChange={e => setName(e.target.value)} onKeyDown={kd}
          placeholder="Asset name (e.g. 2022 Honda Civic)"
          className={INPUT}
        />
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Current Value</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
              <input type="number" min="0" step="100" value={value}
                onChange={e => setValue(e.target.value)} onKeyDown={kd}
                placeholder="0" className={INPUT + ' pl-6'}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Current Debt</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
              <input type="number" min="0" step="100" value={debt}
                onChange={e => setDebt(e.target.value)} onKeyDown={kd}
                placeholder="0" className={INPUT + ' pl-6'}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-40">
            <Check size={12} /> {saving ? 'Saving…' : 'Add Asset'}
          </button>
          <button onClick={cancel} className="text-xs text-muted hover:text-slate-200 px-2 py-1.5 transition-colors">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <button onClick={startOpen}
      className="card border-dashed border-border/60 flex flex-col items-center justify-center gap-2 min-h-[160px] hover:border-accent/50 hover:bg-accent/[0.03] transition-all group">
      <div className="w-8 h-8 rounded-full border border-dashed border-border/60 group-hover:border-accent/50 flex items-center justify-center transition-colors">
        <Plus size={16} className="text-muted group-hover:text-accent transition-colors" />
      </div>
      <span className="text-xs text-muted group-hover:text-accent transition-colors">Add Asset</span>
    </button>
  )
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function AssetsPage() {
  const [assets,  setAssets]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    api.getAssets()
      .then(setAssets)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleAdd = async (body) => {
    try {
      const created = await api.createAsset(body)
      setAssets(prev => [...prev, created])
    } catch (e) { setError(e.message) }
  }

  const handleSave = async (id, body) => {
    try {
      const updated = await api.updateAsset(id, body)
      setAssets(prev => prev.map(a => a.id === id ? updated : a))
    } catch (e) { setError(e.message) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Remove this asset?')) return
    try {
      await api.deleteAsset(id)
      setAssets(prev => prev.filter(a => a.id !== id))
    } catch (e) { setError(e.message) }
  }

  const totalValue  = assets.reduce((s, a) => s + (a.value ?? 0), 0)
  const totalDebt   = assets.reduce((s, a) => s + (a.debt  ?? 0), 0)
  const totalEquity = totalValue - totalDebt

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Physical Assets</h1>
          <p className="text-xs text-muted mt-0.5">Track owned physical assets and any debt against them</p>
        </div>

        {/* Totals summary */}
        {assets.length > 0 && (
          <div className="flex items-center gap-5 shrink-0">
            <div className="text-right">
              <p className="text-[10px] text-muted uppercase tracking-widest">Total Value</p>
              <p className="mono text-lg font-bold text-slate-200 leading-none">{usd(totalValue)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted uppercase tracking-widest">Total Debt</p>
              <p className="mono text-lg font-bold text-rose-400 leading-none">{usd(totalDebt)}</p>
            </div>
            <div className="text-right border-l border-border pl-5">
              <p className="text-[10px] text-muted uppercase tracking-widest">Net Equity</p>
              <p className={`mono text-2xl font-bold leading-none ${totalEquity >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {totalEquity >= 0 ? '' : '−'}{usd(Math.abs(totalEquity))}
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="text-rose-400 text-sm px-3 py-2 rounded-lg border border-rose-400/20 bg-rose-400/5">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-muted py-10 text-center">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map(a => (
            <AssetCard key={a.id} asset={a} onSave={handleSave} onDelete={handleDelete} />
          ))}
          <AddAssetCard onAdd={handleAdd} />
        </div>
      )}

      {!loading && assets.length === 0 && (
        <p className="text-xs text-muted text-center -mt-2">
          Click the card above to add your first asset.
        </p>
      )}
    </div>
  )
}
