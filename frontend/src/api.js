const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  // Tickers
  getTickers:       ()         => request('/tickers/'),
  addTicker:        (body)     => request('/tickers/', { method: 'POST', body: JSON.stringify(body) }),
  removeTicker:     (symbol)   => request(`/tickers/${symbol}`, { method: 'DELETE' }),
  getIndicators:    (symbol)   => request(`/tickers/${symbol}/indicators`),
  getIndicatorMeta: ()         => request('/tickers/meta/indicators'),

  // Alert Rules
  getRules:    ()           => request('/alerts/rules'),
  createRule:  (body)       => request('/alerts/rules', { method: 'POST', body: JSON.stringify(body) }),
  updateRule:  (id, body)   => request(`/alerts/rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRule:  (id)         => request(`/alerts/rules/${id}`, { method: 'DELETE' }),

  // Events
  getEvents:   (limit = 50) => request(`/alerts/events?limit=${limit}`),
  getPending:  ()           => request('/alerts/pending'),

  // Manual trigger
  runNow:      ()           => request('/alerts/run-now', { method: 'POST' }),

  // Dividend portfolio
  getDividends:     () => request('/dividends/'),
  refreshDividends: () => request('/dividends/refresh', { method: 'POST' }),
}
