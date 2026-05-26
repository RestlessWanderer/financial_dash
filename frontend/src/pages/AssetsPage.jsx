import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'

function usd(n, dec = 0) {
  return (n ?? 0).toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  })
}

const INPUT = 'w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors'

/* ── Asset row ───────────────────────────────────────────────────── */
function AssetRow({ asset, onSave, onDelete }) {
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

  const equity = asset.value - asset.debt

  if (editing) {
    return (
      <div className="px-4 py-3 border-b border-border/60 bg-accent/[0.03]">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <input ref={nameRef} value={name}
            onChange={e => setName(e.target.value)} onKeyDown={kd}
            placeholder="Asset name"
            className={INPUT + ' sm:flex-1'}
          />
          <div className="flex gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-36">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
              <input type="number" min="0" step="100" value={value}
                onChange={e => setValue(e.target.value)} onKeyDown={kd}
                placeholder="Value"
                className={INPUT + ' pl-6'}
              />
            </div>
            <div className="relative flex-1 sm:w-36">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
              <input type="number" min="0" step="100" value={debt}
                onChange={e => setDebt(e.target.value)} onKeyDown={kd}
                placeholder="Debt"
                className={INPUT + ' pl-6'}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={save} disabled={saving || !name.trim()}
              className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-40">
              <Check size={12} /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={cancel} className="p-1.5 text-muted hover:text-slate-200 transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex items-center gap-4 px-4 py-3 border-b border-border/40 hover:bg-white/[0.02] transition-colors">
      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{asset.name}</p>
      </div>

      {/* Value */}
      <div className="text-right w-32 shrink-0">
        <p className="mono text-sm font-semibold text-slate-200">{usd(asset.value)}</p>
      </div>

      {/* Debt */}
      <div className="text-right w-32 shrink-0">
        <p className={`mono text-sm font-semibold ${asset.debt > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
          {usd(asset.debt)}
        </p>
      </div>

      {/* Equity */}
      <div className="text-right w-36 shrink-0 border-l border-border/50 pl-4">
        <p className={`mono text-sm font-semibold ${equity >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {equity >= 0 ? '' : '−'}{usd(Math.abs(equity))}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={startEdit} className="p-1.5 text-muted hover:text-slate-200 transition-colors" title="Edit">
          <Pencil size={13} />
        </button>
        <button onClick={() => onDelete(asset.id)} className="p-1.5 text-muted hover:text-rose-400 transition-colors" title="Delete">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

/* ── Add row ─────────────────────────────────────────────────────── */
function AddAssetRow({ onAdd }) {
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
      <div className="px-4 py-3 bg-accent/[0.03] border-t border-border/40">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <input ref={nameRef} value={name}
            onChange={e => setName(e.target.value)} onKeyDown={kd}
            placeholder="Asset name (e.g. 2022 Honda Civic)"
            className={INPUT + ' sm:flex-1'}
          />
          <div className="flex gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-36">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
              <input type="number" min="0" step="100" value={value}
                onChange={e => setValue(e.target.value)} onKeyDown={kd}
                placeholder="Value" className={INPUT + ' pl-6'}
              />
            </div>
            <div className="relative flex-1 sm:w-36">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
              <input type="number" min="0" step="100" value={debt}
                onChange={e => setDebt(e.target.value)} onKeyDown={kd}
                placeholder="Debt" className={INPUT + ' pl-6'}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={save} disabled={saving || !name.trim()}
              className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-40">
              <Check size={12} /> {saving ? 'Saving…' : 'Add Asset'}
            </button>
            <button onClick={cancel} className="p-1.5 text-muted hover:text-slate-200 transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <button onClick={startOpen}
      className="w-full flex items-center gap-2 px-4 py-3 text-xs text-muted hover:text-accent hover:bg-accent/[0.03] transition-colors border-t border-border/40">
      <Plus size={13} /> Add Asset
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
        <div className="card p-0 overflow-hidden">
          {/* Table header */}
          {assets.length > 0 && (
            <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-white/[0.02] text-[10px] text-muted uppercase tracking-wider">
              <span className="flex-1">Asset</span>
              <span className="w-32 text-right">Value</span>
              <span className="w-32 text-right">Debt</span>
              <span className="w-36 text-right border-l border-border/50 pl-4">Equity</span>
              <span className="w-12" />
            </div>
          )}

          {/* Rows */}
          {assets.map(a => (
            <AssetRow key={a.id} asset={a} onSave={handleSave} onDelete={handleDelete} />
          ))}

          {/* Add row */}
          <AddAssetRow onAdd={handleAdd} />

          {assets.length === 0 && (
            <p className="text-xs text-muted text-center py-8">
              No assets yet — click Add Asset below to get started.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
