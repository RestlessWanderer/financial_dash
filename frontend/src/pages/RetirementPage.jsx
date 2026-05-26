import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import {
  Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight,
  Landmark, Loader2, AlertCircle,
} from 'lucide-react'

/* ── Helpers ──────────────────────────────────────────────────────── */
function usd(n, dec = 0) {
  if (n == null || isNaN(n)) return '—'
  return Math.abs(n).toLocaleString('en-US', {
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
  if (h < 24)   return `${h}h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d}d ago`
}

/* localStorage helpers for per-account dividend holdings */
function loadAccountDivs(accountId) {
  try {
    const raw = localStorage.getItem(`retirement_divs_${accountId}`)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveAccountDivs(accountId, holdings) {
  localStorage.setItem(`retirement_divs_${accountId}`, JSON.stringify(holdings))
}

/* ── Dividend ticker row inside an account ────────────────────────── */
function DividendRow({ symbol, data, shares, onSharesChange, onRemove }) {
  const annualDiv   = (data?.annual_dividend ?? 0) * shares
  const yieldPct    = data?.dividend_yield != null ? `${(data.dividend_yield * 100).toFixed(2)}%` : '—'

  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0 group">
      {/* Symbol + name */}
      <div className="w-20 shrink-0">
        <p className="text-xs font-semibold text-slate-200">{symbol}</p>
        <p className="text-[10px] text-muted truncate max-w-[76px]">{data?.name ?? '—'}</p>
      </div>

      {/* Annual div per share + yield */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted">
          {data?.annual_dividend != null ? `${usd(data.annual_dividend, 2)}/share` : '—'}
          <span className="ml-2 text-[10px]">{yieldPct} yield</span>
        </p>
      </div>

      {/* Shares owned */}
      <div className="w-28 shrink-0">
        <div className="relative">
          <input
            type="number"
            min="0"
            step="1"
            value={shares === 0 ? '' : shares}
            onChange={e => onSharesChange(symbol, parseFloat(e.target.value) || 0)}
            placeholder="0 shares"
            className="w-full bg-surface border border-border rounded px-2 py-1 text-xs mono focus:outline-none focus:border-accent transition-colors text-right"
          />
        </div>
      </div>

      {/* Annual income */}
      <div className="w-24 shrink-0 text-right">
        <p className={`mono text-xs font-semibold ${annualDiv > 0 ? 'text-emerald-400' : 'text-muted'}`}>
          {annualDiv > 0 ? `${usd(annualDiv)}/yr` : '—'}
        </p>
      </div>

      {/* Remove */}
      <button
        onClick={() => onRemove(symbol)}
        className="p-1 text-muted hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
        title="Remove"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

/* ── Add ticker input ─────────────────────────────────────────────── */
function AddTickerRow({ onAdd }) {
  const [sym,     setSym]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const inputRef = useRef(null)

  const handleAdd = async () => {
    const s = sym.trim().toUpperCase()
    if (!s) return
    setLoading(true)
    setError('')
    try {
      const result = await api.lookupDividendTicker(s)
      onAdd(s, result)
      setSym('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') handleAdd()
    if (e.key === 'Escape') { setSym(''); setError('') }
  }

  return (
    <div className="pt-2 space-y-1">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={sym}
          onChange={e => { setSym(e.target.value.toUpperCase()); setError('') }}
          onKeyDown={handleKey}
          placeholder="Add ticker (e.g. VTI)"
          className="flex-1 bg-surface border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={loading || !sym.trim()}
          className="flex items-center gap-1 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-40"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
          Add
        </button>
      </div>
      {error && (
        <p className="text-[10px] text-rose-400 flex items-center gap-1">
          <AlertCircle size={10} /> {error}
        </p>
      )}
    </div>
  )
}

/* ── Account banner ───────────────────────────────────────────────── */
function AccountBanner({ account, onSave, onDelete, divSnapshots, onAddTicker }) {
  const [expanded, setExpanded]   = useState(false)
  const [editing,  setEditing]    = useState(false)
  const [name,     setName]       = useState(account.name)
  const [value,    setValue]      = useState(String(account.value))
  const [saving,   setSaving]     = useState(false)
  const nameRef = useRef(null)

  // Per-account dividend holdings: symbol → shares
  const [holdings, setHoldings] = useState(() => loadAccountDivs(account.id))

  // Symbols that have been added (in order)
  const symbols = Object.keys(holdings)

  const startEdit = (e) => {
    e.stopPropagation()
    setName(account.name)
    setValue(String(account.value))
    setEditing(true)
    setTimeout(() => nameRef.current?.focus(), 0)
  }

  const cancel = (e) => {
    e?.stopPropagation()
    setEditing(false)
    setName(account.name)
    setValue(String(account.value))
  }

  const save = async (e) => {
    e?.stopPropagation()
    const trimName = name.trim()
    if (!trimName) return
    setSaving(true)
    await onSave(account.id, { name: trimName, value: parseFloat(value) || 0 })
    setEditing(false)
    setSaving(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') save(e)
    if (e.key === 'Escape') cancel(e)
  }

  /* Dividend helpers */
  const updateShares = useCallback((sym, shares) => {
    setHoldings(prev => {
      const next = { ...prev, [sym]: shares }
      saveAccountDivs(account.id, next)
      return next
    })
  }, [account.id])

  const removeTicker = useCallback((sym) => {
    setHoldings(prev => {
      const next = { ...prev }
      delete next[sym]
      saveAccountDivs(account.id, next)
      return next
    })
  }, [account.id])

  const handleAddTicker = useCallback((sym, data) => {
    setHoldings(prev => {
      if (sym in prev) return prev
      const next = { ...prev, [sym]: 0 }
      saveAccountDivs(account.id, next)
      return next
    })
    onAddTicker?.(sym, data)
  }, [account.id, onAddTicker])

  // Compute annual div income for this account
  const annualIncome = symbols.reduce((sum, sym) => {
    const data   = divSnapshots[sym]
    const shares = holdings[sym] ?? 0
    return sum + (data?.annual_dividend ?? 0) * shares
  }, 0)

  /* ── Edit mode ── */
  if (editing) {
    return (
      <div className="card border-accent/40 bg-accent/[0.04] flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <input
            ref={nameRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Account name"
            className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors"
          />
          <div className="relative w-40 shrink-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
            <input
              type="number" min="0" step="1000"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKey}
              placeholder="0"
              className="w-full bg-surface border border-border rounded-md pl-6 pr-3 py-1.5 text-sm mono focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-40 shrink-0"
          >
            <Check size={12} /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={cancel} className="text-xs text-muted hover:text-slate-200 px-2 py-1.5 transition-colors shrink-0">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  /* ── Display mode ── */
  return (
    <div className="card flex flex-col gap-0 overflow-hidden p-0">

      {/* Banner header row */}
      <div
        className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors group"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Chevron */}
        <div className="text-muted shrink-0">
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">{account.name}</p>
          <p className="text-[10px] text-muted">Updated {timeAgo(account.updated_at)}</p>
        </div>

        {/* Annual dividend income */}
        {annualIncome > 0 && (
          <div className="text-right shrink-0 mr-4">
            <p className="text-[10px] text-muted uppercase tracking-widest">Div. Income</p>
            <p className="mono text-sm font-semibold text-emerald-400">{usd(annualIncome)}/yr</p>
          </div>
        )}

        {/* Balance */}
        <div className="text-right shrink-0 w-36">
          <p className="text-[10px] text-muted uppercase tracking-widest">Balance</p>
          <p className="mono text-xl font-bold text-slate-200">{usd(account.value)}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={startEdit} className="p-1.5 text-muted hover:text-slate-200 transition-colors" title="Edit">
            <Pencil size={13} />
          </button>
          <button onClick={() => onDelete(account.id)} className="p-1.5 text-muted hover:text-rose-400 transition-colors" title="Delete">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded dividend section */}
      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 bg-white/[0.01]">
          <div className="flex items-center gap-2 mb-3">
            <Landmark size={12} className="text-muted" />
            <p className="text-[10px] text-muted uppercase tracking-widest">Dividend Holdings in this Account</p>
          </div>

          {/* Column headers */}
          {symbols.length > 0 && (
            <div className="flex items-center gap-3 pb-1 border-b border-border/30 mb-1">
              <div className="w-20 shrink-0">
                <p className="text-[10px] text-muted uppercase tracking-widest">Ticker</p>
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-muted uppercase tracking-widest">Div / Share · Yield</p>
              </div>
              <div className="w-28 shrink-0 text-right">
                <p className="text-[10px] text-muted uppercase tracking-widest">Shares</p>
              </div>
              <div className="w-24 shrink-0 text-right">
                <p className="text-[10px] text-muted uppercase tracking-widest">Annual Income</p>
              </div>
              <div className="w-6 shrink-0" />
            </div>
          )}

          {/* Ticker rows */}
          {symbols.map(sym => (
            <DividendRow
              key={sym}
              symbol={sym}
              data={divSnapshots[sym]}
              shares={holdings[sym] ?? 0}
              onSharesChange={updateShares}
              onRemove={removeTicker}
            />
          ))}

          {/* Account total */}
          {symbols.length > 0 && (
            <div className="flex items-center justify-end gap-4 pt-2 mt-1 border-t border-border/30">
              <p className="text-[10px] text-muted uppercase tracking-widest">Account Total</p>
              <p className={`mono text-sm font-bold ${annualIncome > 0 ? 'text-emerald-400' : 'text-muted'}`}>
                {annualIncome > 0 ? `${usd(annualIncome)}/yr` : '—'}
              </p>
            </div>
          )}

          {/* Add ticker */}
          <AddTickerRow onAdd={handleAddTicker} />
        </div>
      )}
    </div>
  )
}

/* ── Add account banner ───────────────────────────────────────────── */
function AddAccountBanner({ onAdd }) {
  const [open,   setOpen]   = useState(false)
  const [name,   setName]   = useState('')
  const [value,  setValue]  = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(null)

  const startOpen = () => {
    setOpen(true)
    setTimeout(() => nameRef.current?.focus(), 0)
  }

  const cancel = () => { setOpen(false); setName(''); setValue('') }

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onAdd({ name: name.trim(), value: parseFloat(value) || 0 })
    setOpen(false); setName(''); setValue('')
    setSaving(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') cancel()
  }

  if (open) {
    return (
      <div className="card border-accent/40 bg-accent/[0.04] flex items-center gap-3">
        <input
          ref={nameRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Account name (e.g. Roth IRA)"
          className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors"
        />
        <div className="relative w-40 shrink-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
          <input
            type="number" min="0" step="1000"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKey}
            placeholder="0"
            className="w-full bg-surface border border-border rounded-md pl-6 pr-3 py-1.5 text-sm mono focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-40 shrink-0"
        >
          <Check size={12} /> {saving ? 'Saving…' : 'Add Account'}
        </button>
        <button onClick={cancel} className="text-xs text-muted hover:text-slate-200 px-2 py-1.5 transition-colors shrink-0">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={startOpen}
      className="w-full card border-dashed border-border/60 flex items-center justify-center gap-2 py-3 hover:border-accent/50 hover:bg-accent/[0.03] transition-all group"
    >
      <div className="w-6 h-6 rounded-full border border-dashed border-border/60 group-hover:border-accent/50 flex items-center justify-center transition-colors">
        <Plus size={13} className="text-muted group-hover:text-accent transition-colors" />
      </div>
      <span className="text-xs text-muted group-hover:text-accent transition-colors">Add Account</span>
    </button>
  )
}

/* ── Page ──────────────────────────────────────────────────────────── */
export default function RetirementPage() {
  const [accounts,     setAccounts]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [divSnapshots, setDivSnapshots] = useState({}) // symbol → snapshot data

  useEffect(() => {
    Promise.allSettled([
      api.getRetirementAccounts(),
      api.getDividends(),
    ]).then(([accRes, divRes]) => {
      if (accRes.status === 'fulfilled') setAccounts(accRes.value)
      else setError(accRes.reason?.message ?? 'Failed to load accounts')

      // Build a symbol → snapshot map for quick lookup in AccountBanner
      if (divRes.status === 'fulfilled') {
        const map = {}
        for (const s of divRes.value?.stocks ?? []) map[s.symbol] = s
        setDivSnapshots(map)
      }

      setLoading(false)
    })
  }, [])


  const handleAdd = async (body) => {
    try {
      const created = await api.createRetirementAccount(body)
      setAccounts(prev => [...prev, created])
    } catch (e) { setError(e.message) }
  }

  const handleSave = async (id, body) => {
    try {
      const updated = await api.updateRetirementAccount(id, body)
      setAccounts(prev => prev.map(a => a.id === id ? updated : a))
    } catch (e) { setError(e.message) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Remove this account?')) return
    try {
      await api.deleteRetirementAccount(id)
      setAccounts(prev => prev.filter(a => a.id !== id))
      localStorage.removeItem(`retirement_divs_${id}`)
    } catch (e) { setError(e.message) }
  }

  /* ── Derived totals ── */
  const total = accounts.reduce((s, a) => s + (a.value ?? 0), 0)

  // Sum annual div income across all accounts using their localStorage holdings
  const totalDivIncome = accounts.reduce((sum, a) => {
    const holdings = loadAccountDivs(a.id)
    return sum + Object.entries(holdings).reduce((s, [sym, shares]) => {
      return s + (divSnapshots[sym]?.annual_dividend ?? 0) * shares
    }, 0)
  }, 0)

  const handleAddTicker = useCallback((sym, data) => {
    // Update snapshot cache immediately so the row shows data right away
    setDivSnapshots(prev => ({ ...prev, [sym]: data }))
  }, [])

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Retirement Accounts</h1>
          <p className="text-xs text-muted mt-0.5">
            Track your 401(k), IRA, Roth, and other retirement balances — with per-account dividend portfolios
          </p>
        </div>

        {/* Summary tiles */}
        {accounts.length > 0 && (
          <div className="flex items-stretch gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[10px] text-muted uppercase tracking-widest">Total Balance</p>
              <p className="mono text-2xl font-bold text-slate-200 leading-none">{usd(total)}</p>
            </div>
            {totalDivIncome > 0 && (
              <>
                <div className="w-px bg-border/50" />
                <div className="text-right">
                  <p className="text-[10px] text-muted uppercase tracking-widest">Retirement Div. Income</p>
                  <p className="mono text-2xl font-bold text-emerald-400 leading-none">{usd(totalDivIncome)}/yr</p>
                  <p className="text-[10px] text-muted mt-0.5">{usd(totalDivIncome / 12)}/mo</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="text-rose-400 text-sm px-3 py-2 rounded-lg border border-rose-400/20 bg-rose-400/5">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted py-10 text-center">Loading…</div>
      ) : (
        <div className="space-y-3">
          {accounts.map(a => (
            <AccountBanner
              key={a.id}
              account={a}
              onSave={handleSave}
              onDelete={handleDelete}
              divSnapshots={divSnapshots}
              onAddTicker={handleAddTicker}
            />
          ))}
          <AddAccountBanner onAdd={handleAdd} />
        </div>
      )}

      {!loading && accounts.length === 0 && (
        <p className="text-xs text-muted text-center -mt-2">
          Click the button above to add your first account.
        </p>
      )}
    </div>
  )
}
