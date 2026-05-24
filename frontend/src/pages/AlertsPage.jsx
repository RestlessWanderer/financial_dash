import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import RuleBuilder from '../components/RuleBuilder'
import { Plus, Trash2, Edit2, ToggleLeft, ToggleRight, PlayCircle, X, Check, AlertCircle } from 'lucide-react'

// Preset templates for quick-start
const PRESETS = [
  {
    label: 'MMBM Signal',
    description: 'Full Market Maker Buy Model pattern',
    tree: { op: 'AND', conditions: [
      { indicator: 'mmbm_signal', operator: '>=', value: 1 },
      { indicator: 'rsi', operator: '<', value: 55 },
    ]},
  },
  {
    label: 'MMSM Signal',
    description: 'Full Market Maker Sell Model pattern',
    tree: { op: 'AND', conditions: [
      { indicator: 'mmsm_signal', operator: '>=', value: 1 },
      { indicator: 'rsi', operator: '>', value: 45 },
    ]},
  },
  {
    label: 'RSI Oversold Dip',
    description: 'RSI < 30 and price below 50-day SMA',
    tree: { op: 'AND', conditions: [
      { indicator: 'rsi', operator: '<', value: 30 },
      { indicator: 'price', operator: '<', value: 0 },  // user sets SMA value
    ]},
  },
  {
    label: 'Volume Spike Down',
    description: 'Volume 2x average on a down candle',
    tree: { op: 'AND', conditions: [
      { indicator: 'volume_ratio', operator: '>', value: 2 },
      { indicator: 'price', operator: '<', value: 0 },
    ]},
  },
  {
    label: 'MACD Bullish Cross',
    description: 'MACD crosses above signal line',
    tree: { op: 'AND', conditions: [
      { indicator: 'macd', operator: 'crosses_above', value: 0 },
      { indicator: 'rsi', operator: '<', value: 60 },
    ]},
  },
]

function RuleModal({ tickers, indicatorMeta, onSave, onClose, editing }) {
  const [ticker, setTicker] = useState(editing?.ticker_symbol || (tickers[0]?.symbol ?? ''))
  const [name,   setName]   = useState(editing?.name || '')
  const [tree,   setTree]   = useState(editing?.rule_tree || { op: 'AND', conditions: [] })
  const [cooldown, setCooldown] = useState(editing?.cooldown_minutes || 60)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const applyPreset = (preset) => {
    setName(preset.label)
    setTree(JSON.parse(JSON.stringify(preset.tree)))
  }

  const save = async () => {
    if (!ticker || !name.trim()) { setError('Ticker and name are required'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({ ticker_symbol: ticker, name: name.trim(), rule_tree: tree, cooldown_minutes: cooldown })
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto py-10">
      <div className="bg-panel border border-border rounded-2xl w-full max-w-2xl mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">{editing ? 'Edit Alert' : 'New Alert Rule'}</h2>
          <button onClick={onClose} className="text-muted hover:text-slate-200"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Presets */}
          {!editing && (
            <div>
              <p className="text-xs text-muted mb-2 uppercase tracking-wider font-medium">Quick-start presets</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(p => (
                  <button key={p.label} onClick={() => applyPreset(p)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-border hover:border-accent/50 hover:text-accent transition-colors">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ticker & Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted mb-1 block">Ticker</label>
              <select
                value={ticker}
                onChange={e => setTicker(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                {tickers.map(t => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Alert Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. AAPL MMBM Signal"
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Rule builder */}
          <div>
            <label className="text-xs text-muted mb-2 block uppercase tracking-wider font-medium">Conditions</label>
            <RuleBuilder value={tree} onChange={setTree} indicatorMeta={indicatorMeta} />
          </div>

          {/* Cooldown */}
          <div>
            <label className="text-xs text-muted mb-1 block">Cooldown (minutes between re-fires)</label>
            <input
              type="number"
              min={5}
              value={cooldown}
              onChange={e => setCooldown(parseInt(e.target.value) || 60)}
              className="w-28 bg-surface border border-border rounded-lg px-3 py-2 text-sm mono focus:outline-none focus:border-accent"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-slate-200 transition-colors">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50">
            <Check size={14} />
            {saving ? 'Saving...' : editing ? 'Update Rule' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RuleCard({ rule, onDelete, onToggle, onEdit }) {
  const condCount = (tree) => {
    if (!tree) return 0
    let n = 0
    const walk = (node) => {
      if (node.op) node.conditions?.forEach(walk)
      else n++
    }
    walk(tree)
    return n
  }

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="mono text-sm font-semibold text-accent">{rule.ticker_symbol}</span>
            <span className="font-medium text-sm">{rule.name}</span>
          </div>
          <p className="text-xs text-muted mt-0.5">
            {condCount(rule.rule_tree)} condition{condCount(rule.rule_tree) !== 1 ? 's' : ''} ·
            cooldown {rule.cooldown_minutes}m ·
            {rule.last_fired
              ? ` last fired ${new Date(rule.last_fired).toLocaleString()}`
              : ' never fired'}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onToggle(rule)} className={`text-muted hover:text-accent transition-colors p-1`}>
            {rule.enabled ? <ToggleRight size={18} className="text-accent" /> : <ToggleLeft size={18} />}
          </button>
          <button onClick={() => onEdit(rule)} className="text-muted hover:text-slate-200 transition-colors p-1">
            <Edit2 size={14} />
          </button>
          <button onClick={() => onDelete(rule.id)} className="text-muted hover:text-red-400 transition-colors p-1">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className={`text-xs px-2 py-0.5 rounded-full font-medium self-start ${rule.enabled ? 'badge-green' : 'badge-muted'}`}>
        {rule.enabled ? 'Active' : 'Paused'}
      </div>
    </div>
  )
}

export default function AlertsPage() {
  const [rules,   setRules]   = useState([])
  const [tickers, setTickers] = useState([])
  const [meta,    setMeta]    = useState({})
  const [events,  setEvents]  = useState([])
  const [modal,   setModal]   = useState(false)
  const [editing, setEditing] = useState(null)
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    const [r, t, m, e] = await Promise.allSettled([
      api.getRules(), api.getTickers(), api.getIndicatorMeta(), api.getEvents(100),
    ])
    if (r.status === 'fulfilled') setRules(r.value)
    if (t.status === 'fulfilled') setTickers(t.value)
    if (m.status === 'fulfilled') setMeta(m.value)
    if (e.status === 'fulfilled') setEvents(e.value)
  }, [])

  useEffect(() => { load() }, [load])

  const saveRule = async (body) => {
    if (editing) {
      await api.updateRule(editing.id, body)
    } else {
      await api.createRule(body)
    }
    await load()
  }

  const deleteRule = async (id) => {
    if (!confirm('Delete this alert rule?')) return
    await api.deleteRule(id)
    await load()
  }

  const toggleRule = async (rule) => {
    await api.updateRule(rule.id, { enabled: !rule.enabled })
    await load()
  }

  const runNow = async () => {
    setRunning(true)
    await api.runNow()
    setTimeout(() => setRunning(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Stock Alerts</h1>
        <div className="flex items-center gap-2">
          <button onClick={runNow} disabled={running}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border text-muted hover:text-slate-200 hover:border-slate-500 transition-colors disabled:opacity-50">
            <PlayCircle size={14} />
            {running ? 'Running...' : 'Run Now'}
          </button>
          <button
            onClick={() => { setEditing(null); setModal(true) }}
            disabled={tickers.length === 0}
            className="flex items-center gap-1.5 bg-accent/10 text-accent border border-accent/20 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            <Plus size={14} /> New Rule
          </button>
        </div>
      </div>

      {tickers.length === 0 && (
        <div className="card badge-muted text-sm">
          Add tickers on the Stock Watchlist before creating alert rules.
        </div>
      )}

      {rules.length === 0 && tickers.length > 0 ? (
        <div className="card text-center py-16 text-muted">
          <p>No alert rules yet. Click <strong>New Rule</strong> to create one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map(r => (
            <RuleCard
              key={r.id}
              rule={r}
              onDelete={deleteRule}
              onToggle={toggleRule}
              onEdit={(rule) => { setEditing(rule); setModal(true) }}
            />
          ))}
        </div>
      )}

      {/* ── Alert History ─────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-slate-200">Alert History</h2>

        {events.length === 0 ? (
          <div className="card text-center py-12 text-muted">
            <AlertCircle size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No alerts have fired yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map(e => {
              const snap = e.indicator_snapshot || {}
              return (
                <div key={e.id} className="card flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="mono text-sm font-semibold text-accent">{e.ticker_symbol}</span>
                        <span className="font-medium">{e.rule_name}</span>
                      </div>
                      <p className="text-xs text-muted mt-0.5">
                        {new Date(e.triggered_at).toLocaleString()}
                      </p>
                    </div>
                    {snap.price && (
                      <span className="mono text-lg font-semibold">${snap.price?.toFixed(2)}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-2 border-t border-border">
                    {[
                      ['RSI',    snap.rsi?.toFixed(1)],
                      ['MACD',   snap.macd?.toFixed(3)],
                      ['Vol ×',  snap.volume_ratio && `${snap.volume_ratio}x`],
                      ['SMA 50', snap.sma_50?.toFixed(2) && `$${snap.sma_50?.toFixed(2)}`],
                      ['MMBM',   snap.mmbm_signal ? '✅' : '—'],
                      ['MMSM',   snap.mmsm_signal ? '✅' : '—'],
                    ].filter(([, v]) => v).map(([label, val]) => (
                      <div key={label} className="flex flex-col">
                        <span className="text-xs text-muted">{label}</span>
                        <span className="mono text-sm">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <RuleModal
          tickers={tickers}
          indicatorMeta={meta}
          onSave={saveRule}
          onClose={() => { setModal(false); setEditing(null) }}
          editing={editing}
        />
      )}
    </div>
  )
}
