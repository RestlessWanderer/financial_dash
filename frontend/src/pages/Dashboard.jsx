import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { Plus, RefreshCw, Trash2, TrendingUp, TrendingDown, Minus, BarChart2 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

function Stat({ label, value }) {
  if (value === null || value === undefined) return null
  return (
    <div className="flex flex-col items-start min-w-0">
      <span className="text-[10px] text-muted uppercase tracking-wide leading-none mb-0.5">{label}</span>
      <span className="mono text-xs font-medium text-slate-200 truncate">{value}</span>
    </div>
  )
}

function PatternPill({ label, active }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${
      active ? 'bg-green-500/15 text-green-400 border border-green-500/20'
              : 'bg-white/5 text-muted border border-white/5'
    }`}>
      {label}
    </span>
  )
}

function TickerRow({ ticker, onRemove, onRefresh }) {
  const [chart, setChart] = useState([])
  const [loading, setLoading] = useState(false)
  const ind = ticker.indicators || {}
  const price = ind.price
  const change = price && ind.open ? ((price - ind.open) / ind.open * 100) : null

  useEffect(() => {
    api.getIndicators(ticker.symbol).then(data => {
      if (data?.history) setChart(data.history)
    }).catch(() => {})
  }, [ticker.symbol])

  const refresh = async () => {
    setLoading(true)
    await onRefresh(ticker.symbol)
    setLoading(false)
  }

  const changeColor = change === null ? 'text-muted' : change >= 0 ? 'text-green-400' : 'text-red-400'
  const ChangeIcon  = change === null ? Minus : change >= 0 ? TrendingUp : TrendingDown
  const lineColor   = change === null || change >= 0 ? '#22c55e' : '#ef4444'

  return (
    <div className="card flex items-center gap-4 py-3 px-4">

      {/* Symbol + age */}
      <div className="w-16 shrink-0">
        <div className="mono font-semibold text-sm">{ticker.symbol}</div>
        <div className="text-[10px] text-muted mt-0.5">
          {ticker.cache_age_minutes !== null ? `${ticker.cache_age_minutes}m ago` : '—'}
        </div>
      </div>

      {/* Price + change */}
      <div className="w-24 shrink-0">
        <div className="mono text-base font-semibold">
          {price ? `$${price.toFixed(2)}` : '—'}
        </div>
        <div className={`flex items-center gap-0.5 text-[11px] ${changeColor}`}>
          <ChangeIcon size={10} />
          {change !== null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—'}
        </div>
      </div>

      {/* Sparkline */}
      <div className="shrink-0" style={{ width: 160, height: 44 }}>
        {chart.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <Line type="monotone" dataKey="close" stroke={lineColor}
                    dot={false} strokeWidth={1.5} isAnimationActive={false} />
              <XAxis dataKey="date" hide />
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip
                contentStyle={{ background: '#161b27', border: '1px solid #1e2535', borderRadius: 6, fontSize: 11 }}
                labelStyle={{ color: '#64748b' }}
                formatter={(v) => [`$${v.toFixed(2)}`, 'Close']}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-muted">no data</div>
        )}
      </div>

      {/* Indicators */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <Stat label="RSI"    value={ind.rsi        != null ? ind.rsi.toFixed(1)        : null} />
        <Stat label="MACD"   value={ind.macd       != null ? ind.macd.toFixed(3)       : null} />
        <Stat label="Vol×"   value={ind.volume_ratio != null ? `${ind.volume_ratio}x`  : null} />
        <Stat label="SMA 50" value={ind.sma_50     != null ? `$${ind.sma_50.toFixed(0)}` : null} />
        <Stat label="SMA200" value={ind.sma_200    != null ? `$${ind.sma_200.toFixed(0)}` : null} />
        <Stat label="BB↑"    value={ind.bb_upper   != null ? `$${ind.bb_upper.toFixed(0)}` : null} />
        <Stat label="BB↓"    value={ind.bb_lower   != null ? `$${ind.bb_lower.toFixed(0)}` : null} />
      </div>

      {/* Pattern pills */}
      <div className="flex items-center gap-1 shrink-0">
        <PatternPill label="MMBM sweep"  active={ind.mmbm_sweep}  />
        <PatternPill label="MMBM sig"    active={ind.mmbm_signal} />
        <PatternPill label="MMSM sweep"  active={ind.mmsm_sweep}  />
        <PatternPill label="MMSM sig"    active={ind.mmsm_signal} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={refresh} disabled={loading}
          className="p-1.5 rounded-lg text-muted hover:text-slate-200 hover:bg-white/5 transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <button onClick={() => onRemove(ticker.symbol)}
          className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/5 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>

    </div>
  )
}

export default function Dashboard() {
  const [tickers, setTickers] = useState([])
  const [symbol, setSymbol]   = useState('')
  const [error, setError]     = useState('')
  const [adding, setAdding]   = useState(false)

  const load = useCallback(async () => {
    const data = await api.getTickers()
    setTickers(data)
  }, [])

  useEffect(() => { load() }, [load])

  const addTicker = async () => {
    if (!symbol.trim()) return
    setAdding(true)
    setError('')
    try {
      await api.addTicker({ symbol: symbol.trim().toUpperCase() })
      setSymbol('')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  const removeTicker  = async (sym) => { await api.removeTicker(sym);  await load() }
  const refreshTicker = async (sym) => { await api.getIndicators(sym); await load() }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Watchlist</h1>
        <div className="flex items-center gap-2">
          <input
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && addTicker()}
            placeholder="AAPL"
            className="bg-panel border border-border rounded-lg px-3 py-1.5 text-sm mono w-28 focus:outline-none focus:border-accent"
          />
          <button
            onClick={addTicker}
            disabled={adding}
            className="flex items-center gap-1.5 bg-accent/10 text-accent border border-accent/20 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            <Plus size={14} />
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>

      {error && (
        <div className="badge-red px-3 py-2 rounded-lg text-sm">{error}</div>
      )}

      {tickers.length === 0 ? (
        <div className="card text-center py-16 text-muted">
          <BarChart2 size={32} className="mx-auto mb-3 opacity-30" />
          <p>No tickers yet. Add one above to get started.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tickers.map(t => (
            <TickerRow
              key={t.symbol}
              ticker={t}
              onRemove={removeTicker}
              onRefresh={refreshTicker}
            />
          ))}
        </div>
      )}
    </div>
  )
}
