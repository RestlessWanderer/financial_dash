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

function calcTotalInterest(loan) {
  const principal = parseFloat(loan.amount) || 0
  const rate      = parseFloat(loan.rate)   || 0
  const termYears = parseFloat(loan.term)   || 0
  if (principal <= 0 || termYears <= 0) return 0
  if (loan.interestType === 'simple') return principal * (rate / 100) * termYears
  if (loan.interestType === 'fixed') {
    if (rate === 0) return 0
    const r = rate / 100 / 12
    const n = termYears * 12
    const pow = Math.pow(1 + r, n)
    return (principal * r * pow / (pow - 1)) * n - principal
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
    const loans          = load('loans_data', [])
    const mortgageConfig = load('mortgage_config', null)
    const mortgageExtras = load('mortgage_extras', null)
    const profile        = load('user_profile', {})
    const budgetDefaults = load('budget_defaults', {})
    const customLabels   = load('budget_custom_labels', [])
    const neFlags        = new Set(load('budget_ne_flags', []))
    const nwHistory      = load('nw_history', [])

    const milestones = []

    // ── Loans cleared ──────────────────────────────────────────────
    if (loans.length === 0) {
      milestones.push({
        id: 'loans_cleared',
        emoji: '🎉',
        title: 'Debt Free!',
        body: 'All loans have been removed — you\'re free of non-mortgage debt!',
      })
    } else {
      // Individual loan milestone: total cost drops below principal (interest mostly paid)
      loans.forEach(loan => {
        const principal = parseFloat(loan.amount) || 0
        const interest  = calcTotalInterest(loan)
        if (principal > 0 && interest < principal * 0.1) {
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
    if (mortgageConfig) {
      const balance   = calcMortgageBalance(mortgageConfig, mortgageExtras)
      const principal = parseFloat(mortgageConfig.principal) || 0
      if (balance != null && principal > 0) {
        const pctPaid = ((principal - balance) / principal) * 100
        ;[25, 50, 75, 100].forEach(pct => {
          if (pctPaid >= pct) {
            milestones.push({
              id: `mortgage_${pct}pct`,
              emoji: pct === 100 ? '🏠' : '📈',
              title: pct === 100 ? 'Mortgage Paid Off!' : `Mortgage ${pct}% paid`,
              body: pct === 100
                ? 'You own your home outright. A major FIRE milestone!'
                : `You've paid off ${pct}% of your mortgage. ${100 - pct}% to go!`,
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
