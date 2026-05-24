import { useState, useEffect } from 'react'
import { api } from '../api'
import { MessageSquare, AlertCircle } from 'lucide-react'

export default function HistoryPage() {
  const [events, setEvents] = useState([])

  useEffect(() => {
    api.getEvents(100).then(setEvents).catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Alert History</h1>

      {events.length === 0 ? (
        <div className="card text-center py-16 text-muted">
          <AlertCircle size={32} className="mx-auto mb-3 opacity-30" />
          <p>No alerts have fired yet.</p>
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

                {/* Indicator snapshot */}
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-2 border-t border-border">
                  {[
                    ['RSI',      snap.rsi?.toFixed(1)],
                    ['MACD',     snap.macd?.toFixed(3)],
                    ['Vol ×',    snap.volume_ratio && `${snap.volume_ratio}x`],
                    ['SMA 50',   snap.sma_50?.toFixed(2) && `$${snap.sma_50?.toFixed(2)}`],
                    ['MMBM',     snap.mmbm_signal ? '✅' : '—'],
                    ['MMSM',     snap.mmsm_signal ? '✅' : '—'],
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
  )
}
