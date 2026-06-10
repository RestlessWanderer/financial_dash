/**
 * useMilestoneNotifications
 *
 * Checks financial milestones derived from localStorage data and fires
 * in-app toasts (and optionally browser notifications) when a milestone
 * is newly crossed. Uses a "seen" set persisted to localStorage so each
 * milestone only fires once.
 *
 * Checked on mount and whenever the window regains focus.
 */
import { useEffect, useCallback } from 'react'

const LS_SEEN = 'milestone_seen'   // Set of milestone IDs already notified

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_SEEN) ?? '[]')) } catch { return new Set() }
}

function markSeen(id) {
  const seen = loadSeen()
  seen.add(id)
  localStorage.setItem(LS_SEEN, JSON.stringify([...seen]))
}

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}

function calcLoanCurrentBalance(loan) {
  const principal = parseFloat(loan.amount) || 0
  const rate      = parseFloat(loan.rate)   || 0
  const termYears = parseFloat(loan.term)   || 0
  if (principal <= 0 || termYears <= 0) return principal
  if (!loan.startDate) return principal
  const [startY, startM] = loan.startDate.split('-').map(Number)
  const now     = new Date()
  const elapsed = Math.max(0,
    (now.getFullYear() - startY) * 12 + (now.getMonth() - (startM - 1))
  )
  const totalMonths = Math.round(termYears * 12)
  if (elapsed >= totalMonths) return 0
  const monthlyRate = rate / 100 / 12
  if (loan.interestType === 'fixed') {
    const pow     = monthlyRate > 0 ? Math.pow(1 + monthlyRate, totalMonths) : 1
    const stdPmt  = monthlyRate > 0 ? principal * monthlyRate * pow / (pow - 1) : principal / totalMonths
    const payment = parseFloat(loan.payment) > 0 ? parseFloat(loan.payment) : stdPmt
    let balance = principal
    for (let i = 0; i < elapsed; i++) {
      if (balance < 0.01) { balance = 0; break }
      balance = Math.max(0, balance - Math.min(Math.max(0, payment - balance * monthlyRate), balance))
    }
    return Math.round(balance * 100) / 100
  }
  if (loan.interestType === 'simple') {
    const monthlyInterest = principal * (rate / 100) / 12
    const stdPmt  = principal / totalMonths + monthlyInterest
    const payment = parseFloat(loan.payment) > 0 ? parseFloat(loan.payment) : stdPmt
    let balance = principal
    for (let i = 0; i < elapsed; i++) {
      if (balance < 0.01) { balance = 0; break }
      balance = Math.max(0, balance - Math.min(Math.max(0, payment - monthlyInterest), balance))
    }
    return Math.round(balance * 100) / 100
  }
  return principal
}

function calcRemainingInterest(loan) {
  const currentBalance = calcLoanCurrentBalance(loan)
  const rate           = parseFloat(loan.rate)   || 0
  const termYears      = parseFloat(loan.term)   || 0
  if (currentBalance <= 0 || termYears <= 0) return 0
  const totalMonths = Math.round(termYears * 12)
  if (!loan.startDate) {
    const principal = parseFloat(loan.amount) || 0
    if (loan.interestType === 'simple') return principal * (rate / 100) * termYears
    if (rate === 0) return 0
    const r = rate / 100 / 12; const pow = Math.pow(1 + r, totalMonths)
    return (principal * r * pow / (pow - 1)) * totalMonths - principal
  }
  const [startY, startM] = loan.startDate.split('-').map(Number)
  const now      = new Date()
  const elapsed  = Math.max(0, (now.getFullYear() - startY) * 12 + (now.getMonth() - (startM - 1)))
  const remaining = Math.max(0, totalMonths - elapsed)
  if (remaining === 0) return 0
  if (loan.interestType === 'simple') {
    return (parseFloat(loan.amount) || 0) * (rate / 100) * (remaining / 12)
  }
  if (loan.interestType === 'fixed') {
    if (rate === 0) return 0
    const r = rate / 100 / 12; const pow = Math.pow(1 + r, remaining)
    return Math.max(0, Math.round((currentBalance * r * pow / (pow - 1)) * remaining - currentBalance))
  }
  return 0
}

function calcMortgageBalance(config, extras) {
  if (!config?.startDate || !config?.principal || !config?.rate) return null
  const principal  = parseFloat(config.principal) || 0
  const annualRate = parseFloat(config.rate) || 0
  const years      = parseFloat(config.years) || 30
  if (principal <= 0 || annualRate <= 0) return principal
  const r = annualRate / 100 / 12
  const n = years * 12
  const pow = Math.pow(1 + r, n)
  const payment = principal * r * pow / (pow - 1)
  const [startY, startM] = config.startDate.split('-').map(Number)
  const now = new Date()
  let monthsElapsed = (now.getFullYear() - startY) * 12 + (now.getMonth() - (startM - 1))
  if (monthsElapsed < 0) monthsElapsed = 0
  const extraMonthly = parseFloat(extras?.extraMonthly || 0)
  let balance = principal
  for (let i = 0; i < monthsElapsed && balance > 0; i++) {
    balance = balance * (1 + r) - payment - extraMonthly
  }
  return Math.max(0, balance)
}

export function useMilestoneNotifications(addToast) {
  const check = useCallback(() => {
    const seen           = loadSeen()
    const loans              = load('loans_data', [])
    const mortgageProperties = load('mortgages_v2', null)
    const mortgageConfig     = load('mortgage_config', null)  // legacy fallback
    const mortgageExtras     = load('mortgage_extras', null)  // legacy fallback
    const profile        = load('user_profile', {})
    const budgetDefaults = load('budget_defaults', {})
    const customLabels   = load('budget_custom_labels', [])
    const neFlags        = new Set(load('budget_ne_flags', []))
    const nwHistory      = load('nw_history', [])

    const milestones = []

    // ── Loans cleared ──────────────────────────────────────────────
    const totalLoanBalance = loans.reduce((s, l) => s + calcLoanCurrentBalance(l), 0)
    if (loans.length === 0 || totalLoanBalance === 0) {
      milestones.push({
        id: 'loans_cleared',
        emoji: '🎉',
        title: 'Debt Free!',
        body: 'All loans paid off — you\'re free of non-mortgage debt!',
      })
    } else {
      // Individual loan milestone: remaining interest < 10% of original principal
      loans.forEach(loan => {
        const principal   = parseFloat(loan.amount) || 0
        const remInterest = calcRemainingInterest(loan)
        if (principal > 0 && remInterest < principal * 0.1) {
          milestones.push({
            id: `loan_almost_clear_${loan.id}`,
            emoji: '💪',
            title: `${loan.name} almost paid off`,
            body: `Less than 10% interest remaining on ${loan.name}. You're in the home stretch!`,
          })
        }
      })
    }

    // ── Mortgage milestones ────────────────────────────────────────
    // Check each property individually so milestones fire per-property
    const mortgageList = mortgageProperties && mortgageProperties.length > 0
      ? mortgageProperties.map(p => ({
          cfg:     p.form,
          extras:  (() => { try { return JSON.parse(localStorage.getItem(`mortgage_extras_${p.id}`) ?? 'null') ?? {} } catch { return {} } })(),
          label:   mortgageProperties.length > 1 ? p.address : null,
          idSuffix: mortgageProperties.length > 1 ? `_${p.id}` : '',
        }))
      : mortgageConfig
      ? [{ cfg: mortgageConfig, extras: mortgageExtras ?? {}, label: null, idSuffix: '' }]
      : []

    for (const { cfg, extras, label, idSuffix } of mortgageList) {
      const balance   = calcMortgageBalance(cfg, extras)
      const principal = parseFloat(cfg?.principal) || 0
      if (balance != null && principal > 0) {
        const pctPaid    = ((principal - balance) / principal) * 100
        const addrSuffix = label ? ` (${label})` : ''
        ;[25, 50, 75, 100].forEach(pct => {
          if (pctPaid >= pct) {
            milestones.push({
              id:    `mortgage_${pct}pct${idSuffix}`,
              emoji: pct === 100 ? '🏠' : '📈',
              title: pct === 100 ? `Mortgage Paid Off!${addrSuffix}` : `Mortgage ${pct}% paid${addrSuffix}`,
              body:  pct === 100
                ? `You own your home outright${label ? ' at ' + label : ''}. A major FIRE milestone!`
                : `You've paid off ${pct}% of your mortgage${addrSuffix}. ${100 - pct}% to go!`,
            })
          }
        })
      }
    }

    // ── Net worth milestones ───────────────────────────────────────
    if (nwHistory.length > 0) {
      const latestNW = nwHistory[nwHistory.length - 1]?.value ?? 0
      ;[10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000].forEach(threshold => {
        if (latestNW >= threshold) {
          milestones.push({
            id: `nw_${threshold}`,
            emoji: threshold >= 1_000_000 ? '🦁' : '💰',
            title: `Net Worth $${threshold >= 1000 ? (threshold / 1000) + 'K' : threshold}!`,
            body: `Your net worth has crossed $${threshold >= 1_000_000 ? (threshold / 1_000_000) + 'M' : threshold >= 1000 ? (threshold / 1000) + 'K' : threshold}. Keep going!`,
          })
        }
      })
    }

    // ── NE spending eliminated ─────────────────────────────────────
    const neFlagged = customLabels.filter((_, i) => neFlags.has(`custom_${i}`))
    const neTotal   = neFlagged.reduce((s, _, i) => {
      const k = `custom_${customLabels.indexOf(neFlagged[i])}`
      return s + (parseFloat(budgetDefaults[k]) || 0)
    }, 0)
    if (neFlagged.length > 0 && neTotal === 0) {
      milestones.push({
        id: 'ne_eliminated',
        emoji: '✂️',
        title: 'Non-essential spending cut!',
        body: 'All flagged non-essential categories are at $0. Your monthly surplus has improved.',
      })
    }

    // ── FIRE profile set ───────────────────────────────────────────
    if (profile.age && profile.retireAge && profile.divGoal) {
      milestones.push({
        id: 'profile_complete',
        emoji: '🔥',
        title: 'FIRE Journey unlocked!',
        body: `Profile complete — targeting retirement at age ${profile.retireAge} with $${(profile.divGoal / 1000).toFixed(0)}K/yr dividend goal.`,
      })
    }

    // ── Fire new milestones ────────────────────────────────────────
    milestones.forEach(m => {
      if (seen.has(m.id)) return
      markSeen(m.id)
      addToast({ id: Date.now() + Math.random(), isMilestone: true, ...m })

      // Browser notification
      if (Notification.permission === 'granted') {
        new Notification(`${m.emoji} ${m.title}`, { body: m.body, icon: '/favicon.ico' })
      }
    })
  }, [addToast])

  useEffect(() => {
    check()
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [check])
}
