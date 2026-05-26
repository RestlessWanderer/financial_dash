import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import {
  Plus, Pencil, Trash2, Check, X, RefreshCw,
  ExternalLink, Unplug, AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react'

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
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

const PLAN_TYPES = ['ESPP', 'RSU', 'Other']

const PLAN_COLORS = {
  ESPP:  'text-blue-400 bg-blue-400/10 border-blue-400/20',
  RSU:   'text-purple-400 bg-purple-400/10 border-purple-400/20',
  Other: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
}

/* ── Manual account card ─────────────────────────────────────────── */
function WorkAccountCard({ account, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form,    setForm]    = useState({})
  const [saving,  setSaving]  = useState(false)
  const nameRef = useRef(null)

  const startEdit = () => {
    setForm({
      name:      account.name,
      plan_type: account.plan_type,
      ticker:    account.ticker ?? '',
      value:     String(account.value),
      notes:     account.notes ?? '',
    })
    setEditing(true)
    setTimeout(() => nameRef.current?.focus(), 0)
  }

  const cancel = () => setEditing(false)

  const save = async () => {
    if (!form.name?.trim()) return
    setSaving(true)
    await onSave(account.id, {
      name:      form.name.trim(),
      plan_type: form.plan_type,
      ticker:    form.ticker?.trim().toUpperCase() || null,
      value:     parseFloat(form.value) || 0,
      notes:     form.notes?.trim() || null,
    })
    setEditing(false)
    setSaving(false)
  }

  const kd = (e) => { if (e.key === 'Escape') cancel() }

  if (editing) {
    return (
      <div className="card border-accent/40 bg-accent/[0.04] flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <input ref={nameRef} value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            onKeyDown={kd} placeholder="Plan / account name"
            className="col-span-2 w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors"
          />
          <select value={form.plan_type}
            onChange={e => setForm(f => ({ ...f, plan_type: e.target.value }))}
            className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
          >
            {PLAN_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <input value={form.ticker}
            onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))}
            onKeyDown={kd} placeholder="Ticker (optional)"
            className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm mono uppercase focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
          <input type="number" min="0" step="100" value={form.value}
            onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
            onKeyDown={kd} placeholder="0"
            className="w-full bg-surface border border-border rounded-md pl-6 pr-3 py-1.5 text-sm mono focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <input value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          onKeyDown={kd} placeholder="Notes (optional)"
          className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-muted focus:outline-none focus:border-accent transition-colors"
        />
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving || !form.name?.trim()}
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

  return (
    <div className="card group flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wider shrink-0 ${PLAN_COLORS[account.plan_type] ?? PLAN_COLORS.Other}`}>
            {account.plan_type}
          </span>
          {account.ticker && (
            <span className="mono text-xs font-semibold text-accent">{account.ticker}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={startEdit} className="p-1 text-muted hover:text-slate-200 transition-colors"><Pencil size={13} /></button>
          <button onClick={() => onDelete(account.id)} className="p-1 text-muted hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
        </div>
      </div>
      <p className="text-xs text-muted truncate">{account.name}</p>
      <p className="mono text-3xl font-bold text-slate-200 leading-none">{usd(account.value)}</p>
      {account.notes && <p className="text-[10px] text-muted italic">{account.notes}</p>}
      <p className="text-[10px] text-muted mt-auto pt-1">Updated {timeAgo(account.updated_at)}</p>
    </div>
  )
}

/* ── Add card ────────────────────────────────────────────────────── */
function AddWorkCard({ onAdd }) {
  const [open,   setOpen]   = useState(false)
  const [form,   setForm]   = useState({ name: '', plan_type: 'ESPP', ticker: '', value: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(null)

  const startOpen = () => {
    setOpen(true)
    setTimeout(() => nameRef.current?.focus(), 0)
  }

  const cancel = () => { setOpen(false); setForm({ name: '', plan_type: 'ESPP', ticker: '', value: '', notes: '' }) }

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await onAdd({
      name:      form.name.trim(),
      plan_type: form.plan_type,
      ticker:    form.ticker.trim().toUpperCase() || null,
      value:     parseFloat(form.value) || 0,
      notes:     form.notes.trim() || null,
    })
    cancel()
    setSaving(false)
  }

  const kd = (e) => { if (e.key === 'Escape') cancel() }

  if (open) {
    return (
      <div className="card border-accent/40 bg-accent/[0.04] flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <input ref={nameRef} value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            onKeyDown={kd} placeholder="Plan / account name"
            className="col-span-2 w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors"
          />
          <select value={form.plan_type}
            onChange={e => setForm(f => ({ ...f, plan_type: e.target.value }))}
            className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
          >
            {PLAN_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <input value={form.ticker}
            onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))}
            onKeyDown={kd} placeholder="Ticker (optional)"
            className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm mono uppercase focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
          <input type="number" min="0" step="100" value={form.value}
            onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
            onKeyDown={kd} placeholder="0"
            className="w-full bg-surface border border-border rounded-md pl-6 pr-3 py-1.5 text-sm mono focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <input value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          onKeyDown={kd} placeholder="Notes (optional)"
          className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-muted focus:outline-none focus:border-accent transition-colors"
        />
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving || !form.name.trim()}
            className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-40">
            <Check size={12} /> {saving ? 'Saving…' : 'Add Account'}
          </button>
          <button onClick={cancel} className="text-xs text-muted hover:text-slate-200 px-2 py-1.5 transition-colors">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <button onClick={startOpen}
      className="card border-dashed border-border/60 flex flex-col items-center justify-center gap-2 min-h-[120px] hover:border-accent/50 hover:bg-accent/[0.03] transition-all group">
      <div className="w-8 h-8 rounded-full border border-dashed border-border/60 group-hover:border-accent/50 flex items-center justify-center transition-colors">
        <Plus size={16} className="text-muted group-hover:text-accent transition-colors" />
      </div>
      <span className="text-xs text-muted group-hover:text-accent transition-colors">Add Account</span>
    </button>
  )
}

/* ── E*TRADE panel ───────────────────────────────────────────────── */
function ETradePanel() {
  const [status,       setStatus]       = useState(null)   // { has_consumer, has_access }
  const [credsForm,    setCredsForm]    = useState({ consumer_key: '', consumer_secret: '' })
  const [showCredsForm, setShowCredsForm] = useState(false)
  const [authUrl,      setAuthUrl]      = useState('')
  const [pin,          setPin]          = useState('')
  const [portfolio,    setPortfolio]    = useState(null)
  const [expandedAcct, setExpandedAcct] = useState(new Set())
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  const loadStatus = async () => {
    try {
      const s = await api.etradeStatus()
      setStatus(s)
    } catch { /* backend may not be up yet */ }
  }

  useEffect(() => { loadStatus() }, [])

  const saveCreds = async () => {
    if (!credsForm.consumer_key || !credsForm.consumer_secret) return
    setLoading(true); setError('')
    try {
      await api.etradeSaveCreds(credsForm)
      await loadStatus()
      setShowCredsForm(false)
      setCredsForm({ consumer_key: '', consumer_secret: '' })
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const startAuth = async () => {
    setLoading(true); setError(''); setAuthUrl(''); setPin('')
    try {
      const { auth_url } = await api.etradeStartAuth()
      setAuthUrl(auth_url)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const completeAuth = async () => {
    if (!pin.trim()) return
    setLoading(true); setError('')
    try {
      await api.etradeCompleteAuth(pin.trim())
      await loadStatus()
      setAuthUrl(''); setPin('')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const fetchPortfolio = async () => {
    setLoading(true); setError('')
    try {
      const data = await api.etradePortfolio()
      setPortfolio(data)
      setExpandedAcct(new Set(data.accounts.map(a => a.accountIdKey)))
    } catch (e) {
      if (e.status === 401) {
        // Token expired — backend already cleared it; refresh status so UI
        // switches back to the "Connect Account" flow automatically.
        setPortfolio(null)
        await loadStatus()
      }
      setError(e.message)
    }
    finally { setLoading(false) }
  }

  const disconnect = async () => {
    if (!confirm('Disconnect E*TRADE? Your consumer key/secret will be kept.')) return
    await api.etradeDisconnect()
    setPortfolio(null)
    await loadStatus()
  }

  const toggleAcct = (key) => setExpandedAcct(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  if (!status) return null

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <span className="text-sm font-black text-blue-400">E*</span>
          </div>
          <div>
            <p className="text-sm font-semibold">E*TRADE Account</p>
            <p className="text-xs text-muted">
              {status.has_access
                ? `Connected${status.sandbox ? ' · Sandbox' : ''} — live portfolio positions · session expires at midnight ET`
                : 'Not connected'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status.has_access && (
            <>
              <button onClick={fetchPortfolio} disabled={loading}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted hover:text-slate-200 hover:border-slate-500 transition-colors disabled:opacity-50">
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Loading…' : 'Refresh'}
              </button>
              <button onClick={disconnect}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted hover:text-red-400 hover:border-red-400/30 transition-colors">
                <Unplug size={12} /> Disconnect
              </button>
            </>
          )}
          {!status.has_access && status.has_consumer && (
            <button onClick={startAuth} disabled={loading}
              className="flex items-center gap-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50">
              Connect Account
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-rose-400 text-xs px-3 py-2 rounded-lg border border-rose-400/20 bg-rose-400/5 flex items-start gap-2">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <div>
            <span>{error}</span>
            {error.toLowerCase().includes('expired') && (
              <p className="mt-1 text-muted">
                E*TRADE OAuth tokens expire daily at midnight ET. Click{' '}
                <strong className="text-slate-300">Connect Account</strong> to re-authorize.
              </p>
            )}
          </div>
        </div>
      )}

      {/* API limitation notice */}
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-yellow-400/5 border border-yellow-400/15 text-xs text-yellow-400/80">
        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
        <span>
          The E*TRADE retail API returns <strong className="text-yellow-400">portfolio positions</strong> (vested shares you hold).
          Unvested RSU grants and active ESPP purchase windows are in E*TRADE's corporate Equity Edge system
          and are not accessible through individual accounts.
        </span>
      </div>

      {/* Step 1: Consumer credentials */}
      {!status.has_consumer && !showCredsForm && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            To connect, you need a <strong className="text-slate-300">Consumer Key</strong> and{' '}
            <strong className="text-slate-300">Consumer Secret</strong> from the E*TRADE developer portal.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="https://developer.etrade.com/home" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted hover:text-slate-200 transition-colors">
              <ExternalLink size={12} /> E*TRADE Developer Portal
            </a>
            <button onClick={() => setShowCredsForm(true)}
              className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/25 transition-colors">
              <Plus size={12} /> Enter Credentials
            </button>
          </div>
        </div>
      )}

      {(showCredsForm || (status.has_consumer && !status.has_access && !authUrl)) && !status.has_access && (
        <div className="space-y-3">
          {showCredsForm && (
            <>
              <p className="text-xs text-muted font-medium">Paste your E*TRADE API credentials:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted uppercase tracking-wider">Consumer Key</label>
                  <input type="password" value={credsForm.consumer_key}
                    onChange={e => setCredsForm(f => ({ ...f, consumer_key: e.target.value }))}
                    placeholder="Paste your consumer key"
                    className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-xs mono focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted uppercase tracking-wider">Consumer Secret</label>
                  <input type="password" value={credsForm.consumer_secret}
                    onChange={e => setCredsForm(f => ({ ...f, consumer_secret: e.target.value }))}
                    placeholder="Paste your consumer secret"
                    className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-xs mono focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveCreds} disabled={loading || !credsForm.consumer_key || !credsForm.consumer_secret}
                  className="flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/25 disabled:opacity-40">
                  <Check size={12} /> Save Credentials
                </button>
                <button onClick={() => setShowCredsForm(false)} className="text-xs text-muted hover:text-slate-200 px-2 py-1.5">Cancel</button>
              </div>
            </>
          )}
          {status.has_consumer && !showCredsForm && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-green-400">✓ Credentials saved</span>
              <button onClick={() => setShowCredsForm(true)} className="text-xs text-muted hover:text-slate-200 underline underline-offset-2">Update</button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: OAuth PIN flow */}
      {status.has_consumer && !status.has_access && (
        <div className="space-y-3">
          {!authUrl ? (
            <div className="text-xs text-muted space-y-1">
              <p>Click <strong className="text-slate-300">Connect Account</strong> above to start the authorization flow.</p>
              <p>You'll be given a link to log in to E*TRADE and receive a PIN to paste back here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-medium text-slate-200">Step 1 — Authorize in your browser:</p>
              <a href={authUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors w-fit">
                <ExternalLink size={12} /> Open E*TRADE Authorization Page
              </a>
              <p className="text-xs text-muted">
                Log in, approve access, then copy the <strong className="text-slate-300">PIN / verification code</strong> shown on screen.
              </p>
              <p className="text-xs font-medium text-slate-200">Step 2 — Paste your PIN:</p>
              <div className="flex items-center gap-2">
                <input
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && completeAuth()}
                  placeholder="Enter PIN from E*TRADE"
                  className="w-48 bg-surface border border-border rounded-md px-3 py-1.5 text-sm mono focus:outline-none focus:border-accent transition-colors"
                />
                <button onClick={completeAuth} disabled={loading || !pin.trim()}
                  className="flex items-center gap-1.5 bg-green-500/10 text-green-400 border border-green-500/20 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-500/20 disabled:opacity-40">
                  <Check size={12} /> {loading ? 'Verifying…' : 'Verify PIN'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Portfolio data */}
      {status.has_access && !portfolio && !loading && (
        <button onClick={fetchPortfolio}
          className="text-xs text-accent hover:underline underline-offset-2">
          Load portfolio positions →
        </button>
      )}

      {portfolio && (
        <div className="space-y-3">
          {portfolio.accounts.map(acct => (
            <div key={acct.accountIdKey} className="border border-border/60 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleAcct(acct.accountIdKey)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedAcct.has(acct.accountIdKey)
                    ? <ChevronDown size={13} className="text-muted" />
                    : <ChevronRight size={13} className="text-muted" />
                  }
                  <span className="text-sm font-medium">{acct.accountDesc || acct.accountIdKey}</span>
                  {acct.accountId && (
                    <span className="text-xs text-muted mono">
                      ···{acct.accountId.slice(-4)}
                    </span>
                  )}
                  {acct.accountMode && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] border border-border/50 text-muted uppercase tracking-wide">
                      {acct.accountMode}
                    </span>
                  )}
                </div>
                <span className="mono text-sm font-semibold text-emerald-400">{usd(acct.totalValue)}</span>
              </button>

              {expandedAcct.has(acct.accountIdKey) && (
                <div className="border-t border-border/40">
                  {acct.positions.length === 0 ? (
                    <p className="text-xs text-muted px-4 py-3">No positions found.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/30 text-[10px] text-muted uppercase tracking-wide bg-white/[0.02]">
                          <th className="px-4 py-2 text-left">Symbol</th>
                          <th className="px-4 py-2 text-left">Description</th>
                          <th className="px-4 py-2 text-right">Qty</th>
                          <th className="px-4 py-2 text-right">Price</th>
                          <th className="px-4 py-2 text-right">Market Value</th>
                          <th className="px-4 py-2 text-right">Gain / Loss</th>
                        </tr>
                      </thead>
                      <tbody>
                        {acct.positions.map((p, i) => (
                          <tr key={i} className="border-b border-border/20 hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-2 mono font-semibold text-accent">{p.symbol}</td>
                            <td className="px-4 py-2 text-slate-400 max-w-[160px] truncate">{p.description}</td>
                            <td className="px-4 py-2 text-right mono">{p.quantity}</td>
                            <td className="px-4 py-2 text-right mono">${(p.currentPrice ?? 0).toFixed(2)}</td>
                            <td className="px-4 py-2 text-right mono font-medium">{usd(p.marketValue)}</td>
                            <td className={`px-4 py-2 text-right mono ${(p.gainLoss ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {(p.gainLoss ?? 0) >= 0 ? '+' : ''}{usd(p.gainLoss)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function WorkStockPage() {
  const [accounts, setAccounts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    api.getWorkAccounts()
      .then(setAccounts)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleAdd = async (body) => {
    try {
      const created = await api.createWorkAccount(body)
      setAccounts(prev => [...prev, created])
    } catch (e) { setError(e.message) }
  }

  const handleSave = async (id, body) => {
    try {
      const updated = await api.updateWorkAccount(id, body)
      setAccounts(prev => prev.map(a => a.id === id ? updated : a))
    } catch (e) { setError(e.message) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Remove this account?')) return
    try {
      await api.deleteWorkAccount(id)
      setAccounts(prev => prev.filter(a => a.id !== id))
    } catch (e) { setError(e.message) }
  }

  const total = accounts.reduce((s, a) => s + (a.value ?? 0), 0)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Work Stock Plans</h1>
          <p className="text-xs text-muted mt-0.5">Track ESPP, RSU, and other equity compensation</p>
        </div>
        {accounts.length > 0 && (
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted uppercase tracking-widest">Manual Total</p>
            <p className="mono text-2xl font-bold text-slate-200 leading-none">{usd(total)}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="text-red-400 text-sm px-3 py-2 rounded-lg border border-red-400/20 bg-red-400/5">{error}</div>
      )}

      {/* E*TRADE integration */}
      <div>
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Brokerage Integration</h2>
        <ETradePanel />
      </div>

      {/* Manual accounts */}
      <div>
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Manual Accounts</h2>
        {loading ? (
          <p className="text-sm text-muted py-6 text-center">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map(a => (
              <WorkAccountCard key={a.id} account={a} onSave={handleSave} onDelete={handleDelete} />
            ))}
            <AddWorkCard onAdd={handleAdd} />
          </div>
        )}
        {!loading && accounts.length === 0 && (
          <p className="text-xs text-muted text-center mt-2">
            Click the card above to manually track an ESPP, RSU, or other equity plan.
          </p>
        )}
      </div>

    </div>
  )
}
