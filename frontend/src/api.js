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

  // Assets
  getAssets:    ()           => request('/assets/'),
  createAsset:  (body)       => request('/assets/', { method: 'POST', body: JSON.stringify(body) }),
  updateAsset:  (id, body)   => request(`/assets/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAsset:  (id)         => request(`/assets/${id}`, { method: 'DELETE' }),

  // Work Stock Plans — manual accounts
  getWorkAccounts:    ()           => request('/workstock/accounts'),
  createWorkAccount:  (body)       => request('/workstock/accounts', { method: 'POST', body: JSON.stringify(body) }),
  updateWorkAccount:  (id, body)   => request(`/workstock/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteWorkAccount:  (id)         => request(`/workstock/accounts/${id}`, { method: 'DELETE' }),

  // Work Stock Plans — E*TRADE integration
  etradeStatus:       ()           => request('/workstock/etrade/status'),
  etradeSaveCreds:    (body)       => request('/workstock/etrade/credentials', { method: 'POST', body: JSON.stringify(body) }),
  etradeStartAuth:    ()           => request('/workstock/etrade/start-auth', { method: 'POST' }),
  etradeCompleteAuth: (pin)        => request('/workstock/etrade/complete-auth', { method: 'POST', body: JSON.stringify({ pin }) }),
  etradeDisconnect:   ()           => request('/workstock/etrade/disconnect', { method: 'DELETE' }),
  etradePortfolio:    ()           => request('/workstock/etrade/portfolio'),

  // Liquid accounts (checking, savings, HYSA, etc.)
  getLiquidAccounts:    ()           => request('/liquid/'),
  createLiquidAccount:  (body)       => request('/liquid/', { method: 'POST', body: JSON.stringify(body) }),
  updateLiquidAccount:  (id, body)   => request(`/liquid/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteLiquidAccount:  (id)         => request(`/liquid/${id}`, { method: 'DELETE' }),

  // Retirement accounts
  getRetirementAccounts:    ()           => request('/retirement/'),
  createRetirementAccount:  (body)       => request('/retirement/', { method: 'POST', body: JSON.stringify(body) }),
  updateRetirementAccount:  (id, body)   => request(`/retirement/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRetirementAccount:  (id)         => request(`/retirement/${id}`, { method: 'DELETE' }),

  // Dividend portfolio
  getDividends:          ()               => request('/dividends/'),
  refreshDividends:      ()               => request('/dividends/refresh', { method: 'POST' }),
  getDividendHoldings:   ()               => request('/dividends/holdings'),
  updateDividendHolding: (symbol, shares) => request(`/dividends/holdings/${symbol}`, {
    method: 'PATCH',
    body: JSON.stringify({ shares_owned: shares }),
  }),
  addDividendTicker:     (symbol)         => request('/dividends/tickers', {
    method: 'POST',
    body: JSON.stringify({ symbol }),
  }),
  removeDividendTicker:  (symbol)         => request(`/dividends/tickers/${symbol}`, { method: 'DELETE' }),
}
