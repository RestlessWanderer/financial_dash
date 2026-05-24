import { useState, useEffect } from 'react'
import { api } from '../api'
import { RefreshCw, Landmark, TrendingUp, Info } from 'lucide-react'

function YieldCell({ value }) {
  if (!value) return <span className="text-muted">—</span>
  const pct = (value * 100).toFixed(2)
  const cls = value >= 0.08 ? 'text-green-400 font-bold'
            : value >= 0.05 ? 'text-green-400'
            : value >= 0.03 ? 'text-yellow-400'
            : 'text-muted'
  return <span className={`mono ${cls}`}>{pct}%</span>
}

function PayoutCell({ value }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>
  const pct = Math.round(value * 100)
  const cls = value < 0.60 ? 'text-green-400'
            : value < 0.90 ? 'text-yellow-400'
            : 'text-red-400'
  return <span className={`mono ${cls}`}>{pct}%</span>
}

function timeAgo(isoString) {
  if (!isoString) return null
  const ms = Date.now() - new Date(isoString + 'Z').getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`
}

export default function DividendPage() {
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    api.getDividends()
      .then(d  => { setData(d);  setLoading(false) })
      .catch(() => { setData({ stocks: [], last_updated: null }); setLoading(false) })
  }, [])

  const refresh = async () => {
    setRefreshing(true)
    setError('')
    try {
      const d = await api.refreshDividends()
      setData(d)
    } catch (e) {
      setError(e.message || 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  const stocks      = data?.stocks ?? []
  const lastUpdated = timeAgo(data?.last_updated)

  return (
    <div className="space-y-4">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Dividend Portfolio</h1>
          <p className="text-xs text-muted mt-0.5">
            Top 25 stocks ranked by dividend yield — most income per dollar invested
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {lastUpdated && (
            <span className="text-xs text-muted">Updated {lastUpdated}</span>
          )}
          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 bg-accent/10 text-accent border border-accent/20 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Fetching (~20s)…' : stocks.length ? 'Refresh' : 'Load Data'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-sm px-3 py-2 rounded-lg border border-red-400/20 bg-red-400/5">
          {error}
        </div>
      )}

      {/* Loading spinner */}
      {loading && (
        <div className="card text-center py-16 text-muted">
          <RefreshCw size={24} className="mx-auto mb-3 animate-spin opacity-40" />
          <p>Loading…</p>
        </div>
      )}

      {/* Empty / first-run state */}
      {!loading && stocks.length === 0 && !refreshing && (
        <div className="card text-center py-16 text-muted space-y-2">
          <Landmark size={32} className="mx-auto opacity-30" />
          <p className="font-medium text-slate-300">No data yet</p>
          <p className="text-xs max-w-sm mx-auto">
            Click <strong className="text-slate-200">Load Data</strong> to screen
            ~110 dividend-paying stocks and surface the top 25 by yield.
            Takes about 20 seconds.
          </p>
        </div>
      )}

      {/* Refreshing overlay message */}
      {refreshing && (
        <div className="card text-center py-10 text-muted">
          <RefreshCw size={24} className="mx-auto mb-3 animate-spin opacity-60" />
          <p className="text-sm font-medium text-slate-300">Screening ~110 stocks…</p>
          <p className="text-xs mt-1">Fetching live yield data in parallel. Hang tight.</p>
        </div>
      )}

      {/* Results table */}
      {!loading && !refreshing && stocks.length > 0 && (
        <>
          {/* Explainer */}
          <div className="card flex items-start gap-2.5 py-3 text-xs text-muted">
            <Info size={13} className="text-accent shrink-0 mt-0.5" />
            <span>
              <strong className="text-slate-300">Yield</strong> = annual dividend ÷ share price.
              Ranked highest-first because for the same dollar invested, a higher yield
              means more dividend income — e.g. $100 in a 10 % stock earns $10/yr vs $5/yr
              from a 5 % stock.&nbsp;
              <strong className="text-yellow-400">Payout &gt; 90 %</strong> may signal
              the dividend is at risk of being cut.
            </span>
          </div>

          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] text-muted uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-8">#</th>
                  <th className="px-4 py-3 text-left">Ticker</th>
                  <th className="px-4 py-3 text-left">Company</th>
                  <th className="px-4 py-3 text-left">Sector</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Ann. Div</th>
                  <th className="px-4 py-3 text-right">
                    <span className="text-accent">Yield ↓</span>
                  </th>
                  <th className="px-4 py-3 text-right">Payout</th>
                  <th className="px-4 py-3 text-right">Ex-Div</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((s, i) => (
                  <tr
                    key={s.symbol}
                    className="border-b border-border/40 hover:bg-white/[0.025] transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-muted">{i + 1}</td>

                    <td className="px-4 py-3">
                      <span className="mono font-semibold text-accent text-sm">
                        {s.symbol}
                      </span>
                    </td>

                    <td className="px-4 py-3 max-w-[180px]">
                      <span className="text-xs text-slate-300 truncate block">{s.name}</span>
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-xs text-muted">{s.sector}</span>
                    </td>

                    <td className="px-4 py-3 text-right mono text-sm">
                      ${s.price.toFixed(2)}
                    </td>

                    <td className="px-4 py-3 text-right mono text-sm">
                      ${s.annual_dividend.toFixed(2)}
                    </td>

                    <td className="px-4 py-3 text-right text-sm">
                      <YieldCell value={s.dividend_yield} />
                    </td>

                    <td className="px-4 py-3 text-right text-sm">
                      <PayoutCell value={s.payout_ratio} />
                    </td>

                    <td className="px-4 py-3 text-right mono text-xs text-muted">
                      {s.ex_dividend_date ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted text-right">
            Screened {' '}
            <strong className="text-slate-400">~110</strong>
            {' '}known dividend payers · data via Yahoo Finance
          </p>
        </>
      )}
    </div>
  )
}
