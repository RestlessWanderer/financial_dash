import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import {
  CheckCircle2, Circle, ChevronRight, Flame, PartyPopper,
  AlertTriangle, Lightbulb, ArrowRight,
} from 'lucide-react'

/* ── Constants ────────────────────────────────────────────────────── */
// Age at which US retirement accounts (401k/IRA) become penalty-free
const RETIREMENT_ACCOUNT_AGE = 59.5
const DEFAULT_WITHDRAW_RATE  = 4   // %
const LS_FIRE_OVERRIDES      = 'fire_overrides'  // { stepId: true } manual complete flags

/* ── Helpers ─────────────────────────────────────────────────────── */
function usd(n, dec = 0) {
  if (n == null || isNaN(n)) return '—'
  return Math.abs(n).toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  })
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
    const r   = rate / 100 / 12
    const n   = termYears * 12
    const pow = Math.pow(1 + r, n)
    return (principal * r * pow / (pow - 1)) * n - principal
  }
  return 0
}

function calcMortgageBalance(config, extras) {
  if (!config?.startDate || !config?.principal || !config?.rate) return null
  const principal = parseFloat(config.principal) || 0
  const annualRate = parseFloat(config.rate) || 0
  const years = parseFloat(config.years) || 30
  if (principal <= 0 || annualRate <= 0) return principal
  const r = annualRate / 100 / 12
  const n = years * 12
  const pow = Math.pow(1 + r, n)
  const payment = principal * r * pow / (pow - 1)
  const [startY, startM] = config.startDate.split('-').map(Number)
  const now = new Date()
  let monthsElapsed = (now.getFullYear() - startY) * 12 + (now.getMonth() - (startM - 1))
  if (monthsElapsed < 0) monthsElapsed = 0
  // Apply extra payments
  const extraMonthly = parseFloat(extras?.extraMonthly || 0)
  let balance = principal
  for (let i = 0; i < monthsElapsed && balance > 0; i++) {
    balance = balance * (1 + r) - payment - extraMonthly
  }
  return Math.max(0, balance)
}

/* ── Step card ────────────────────────────────────────────────────── */
function StepCard({ step, index, complete, manualOverride, onToggleOverride }) {
  const isDone = complete || manualOverride

  return (
    <div className={`card flex flex-col gap-3 border transition-colors ${
      isDone
        ? 'border-emerald-500/40 bg-emerald-500/[0.05]'
        : step.blocked
        ? 'border-border/40 opacity-60'
        : 'border-border'
    }`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`shrink-0 mt-0.5 ${isDone ? 'text-emerald-400' : 'text-muted'}`}>
          {isDone
            ? <CheckCircle2 size={20} />
            : <Circle size={20} />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted uppercase tracking-widest">Step {index + 1}</span>
            {isDone && (
              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded-full font-medium">
                Complete
              </span>
            )}
            {step.blocked && !isDone && (
              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                Waiting on earlier steps
              </span>
            )}
          </div>
          <h3 className={`text-sm font-semibold mt-0.5 ${isDone ? 'text-emerald-400' : 'text-slate-200'}`}>
            {step.title}
          </h3>
          <p className="text-xs text-muted mt-0.5">{step.description}</p>
        </div>
        {/* Manual override toggle */}
        <button
          onClick={() => onToggleOverride(step.id)}
          title={manualOverride ? 'Unmark as complete' : complete ? 'Auto-detected as complete' : 'Mark as complete'}
          className={`shrink-0 text-[10px] px-2 py-1 rounded border transition-colors ${
            manualOverride
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
              : complete
              ? 'border-emerald-500/20 text-emerald-400/40 cursor-default'
              : 'border-border/50 text-muted hover:border-accent/40 hover:text-accent'
          }`}
          disabled={complete && !manualOverride}
        >
          {complete && !manualOverride ? 'Auto ✓' : manualOverride ? 'Unmark' : 'Mark done'}
        </button>
      </div>

      {/* Body content */}
      {!isDone && step.body && (
        <div className="border-t border-border/40 pt-3 space-y-2">
          {step.body}
        </div>
      )}

      {/* Done celebration */}
      {isDone && step.doneMessage && (
        <div className="border-t border-emerald-500/20 pt-3 flex items-center gap-2">
          <PartyPopper size={14} className="text-emerald-400 shrink-0" />
          <p className="text-xs text-emerald-400">{step.doneMessage}</p>
        </div>
      )}

      {/* Nav link */}
      {step.linkTo && !isDone && (
        <Link
          to={step.linkTo}
          className="self-start flex items-center gap-1 text-[11px] text-accent hover:text-accent/80 transition-colors"
        >
          Go to {step.linkLabel} <ArrowRight size={11} />
        </Link>
      )}
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────────── */
export default function FirePage() {
  const [liquid,    setLiquid]    = useState(null)
  const [divData,   setDivData]   = useState(null)
  const [divHoldings, setDivHoldings] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [overrides, setOverrides] = useState(() => load(LS_FIRE_OVERRIDES, {}))

  // Read all localStorage data
  const profile        = load('user_profile', {})
  const loans          = load('loans_data', [])
  const mortgageConfig = load('mortgage_config', null)
  const mortgageExtras = load('mortgage_extras', null)
  const budgetDefaults = load('budget_defaults', {})
  const customLabels   = load('budget_custom_labels', [])
  const neFlags        = new Set(load('budget_ne_flags', []))

  useEffect(() => {
    Promise.allSettled([api.getLiquidAccounts(), api.getDividends(), api.getDividendHoldings()])
      .then(([liqRes, divRes, holdRes]) => {
        if (liqRes.status  === 'fulfilled') setLiquid(liqRes.value)
        if (divRes.status  === 'fulfilled') setDivData(divRes.value)
        if (holdRes.status === 'fulfilled') setDivHoldings(holdRes.value)
        setLoading(false)
      })
  }, [])

  const toggleOverride = (id) => {
    setOverrides(prev => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem(LS_FIRE_OVERRIDES, JSON.stringify(next))
      return next
    })
  }

  /* ── Derived values ─────────────────────────────────────────────── */

  // Profile
  const age            = parseInt(profile.age)          || null
  const retireAge      = parseInt(profile.retireAge)    || null
  const withdrawRate   = parseFloat(profile.withdrawRate) || DEFAULT_WITHDRAW_RATE
  const yearsToRetire  = (age && retireAge) ? Math.max(0, retireAge - age) : null

  // Gap between desired retirement age and penalty-free withdrawal age
  const bridgeYears = (retireAge != null)
    ? Math.max(0, RETIREMENT_ACCOUNT_AGE - retireAge)
    : null

  // Monthly essential expenses (budget defaults minus NE items)
  const monthlyExpenses = useMemo(() => {
    const fixedKeys   = ['housing', 'utilities', 'groceries']
    const customKeys  = customLabels.map((_, i) => `custom_${i}`)
    const allExpKeys  = [...fixedKeys, ...customKeys]
    return allExpKeys
      .filter(k => !neFlags.has(k))
      .reduce((s, k) => s + (parseFloat(budgetDefaults[k]) || 0), 0)
  }, [budgetDefaults, customLabels, neFlags])

  const annualExpenses = monthlyExpenses * 12

  // NE items
  const neItems = useMemo(() => {
    const fixedKeys   = ['housing', 'utilities', 'groceries']
    const fixedLabels = ['Housing', 'Utilities', 'Groceries']
    const items = []
    // Fixed keys (included for completeness even though UI doesn't show NE badge for them)
    fixedKeys.forEach((k, i) => {
      if (neFlags.has(k)) items.push({ label: fixedLabels[i], monthly: parseFloat(budgetDefaults[k]) || 0 })
    })
    // Custom keys
    customLabels.forEach((label, i) => {
      const k = `custom_${i}`
      if (neFlags.has(k)) items.push({ label, monthly: parseFloat(budgetDefaults[k]) || 0 })
    })
    return items
  }, [neFlags, budgetDefaults, customLabels])
  const neTotalMonthly = neItems.reduce((s, i) => s + i.monthly, 0)

  // Loans
  const totalLoanInterest = loans.reduce((s, l) => s + (calcTotalInterest(l) || 0), 0)
  const totalLoanPrincipal = loans.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const loansCleared = loans.length === 0 || totalLoanPrincipal === 0

  // Mortgage
  const mortgageBalance = calcMortgageBalance(mortgageConfig, mortgageExtras)
  const mortgageCleared = mortgageBalance != null ? mortgageBalance <= 0 : mortgageConfig == null

  // Bridge capital required
  // = annual essential expenses × bridge years / withdrawal rate
  // (how much lump-sum invested at SWR covers annual expenses for bridgeYears)
  const bridgeCapital = useMemo(() => {
    if (!bridgeYears || !annualExpenses || bridgeYears <= 0) return null
    // Present value of annuity: PV = PMT × (1 - (1+r)^-n) / r
    // Using SWR as the implied return rate for simplicity → bridgeCapital = annualExpenses / (SWR/100)
    // But more accurately for a fixed bridge period, use annuity PV at assumed ~5% real return
    const assumedReturn = 0.05
    if (assumedReturn === 0) return annualExpenses * bridgeYears
    const pv = annualExpenses * (1 - Math.pow(1 + assumedReturn, -bridgeYears)) / assumedReturn
    return Math.round(pv)
  }, [bridgeYears, annualExpenses])

  // Projected dividend income
  const projectedDivIncome = useMemo(() => {
    if (!divData?.stocks || !divHoldings) return 0
    return divData.stocks.reduce(
      (s, stock) => s + (divHoldings[stock.symbol] || 0) * (stock.annual_dividend || 0), 0
    )
  }, [divData, divHoldings])

  // Bridge funded by dividends
  const divCoversExpenses = projectedDivIncome >= annualExpenses
  const divCoveragePct    = annualExpenses > 0
    ? Math.min(100, (projectedDivIncome / annualExpenses) * 100)
    : 0

  // Monthly budget surplus
  const pay1 = parseFloat(budgetDefaults.pay1) || 0
  const pay2 = parseFloat(budgetDefaults.pay2) || 0
  const totalIncome = pay1 + pay2
  const allExpenses = Object.keys(budgetDefaults)
    .filter(k => k !== 'pay1' && k !== 'pay2')
    .reduce((s, k) => s + (parseFloat(budgetDefaults[k]) || 0), 0)
  const monthlySurplus = totalIncome - allExpenses

  // Bridge funded by savings
  const monthsToFundBridge = (bridgeCapital && monthlySurplus > 0)
    ? Math.ceil(bridgeCapital / monthlySurplus)
    : null
  const yearsToFundBridge = monthsToFundBridge ? (monthsToFundBridge / 12).toFixed(1) : null

  // Liquid savings
  const liquidTotal = (liquid ?? []).reduce((s, a) => s + (a.balance ?? 0), 0)
  const liquidTowardBridge = bridgeCapital ? Math.min(100, (liquidTotal / bridgeCapital) * 100) : 0

  // Retirement draw gap
  const hasBridgeGap = bridgeYears != null && bridgeYears > 0

  /* ── Step definitions ───────────────────────────────────────────── */
  const steps = useMemo(() => [

    /* ── Step 1: Remove non-essential spending ── */
    {
      id: 'ne',
      title: 'Eliminate Non-Essential Spending',
      description: 'Free up monthly cash flow by cutting spending that isn\'t essential to your wellbeing. Every dollar saved accelerates every step below.',
      complete: neItems.length > 0 && neTotalMonthly === 0,
      blocked: false,
      doneMessage: 'No non-essential items flagged — your spending is lean!',
      linkTo: '/budget',
      linkLabel: 'Budget',
      body: neItems.length === 0 ? (
        <div className="flex items-start gap-2 text-xs text-muted">
          <Lightbulb size={13} className="shrink-0 text-amber-400 mt-0.5" />
          <p>Go to Budget and click <strong className="text-slate-300">NE</strong> next to any custom expense category to flag non-essential spending. It will appear here with its monthly cost.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-muted uppercase tracking-widest">Flagged non-essential items</p>
          <div className="space-y-1.5">
            {neItems.map(item => (
              <div key={item.label} className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{item.label}</span>
                <span className="mono text-amber-400 font-medium">{usd(item.monthly)}/mo</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs border-t border-border/40 pt-2">
            <span className="font-medium text-slate-200">Total non-essential</span>
            <span className="mono text-amber-400 font-semibold">{usd(neTotalMonthly)}/mo · {usd(neTotalMonthly * 12)}/yr</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted pt-1">
            <Lightbulb size={13} className="shrink-0 text-amber-400 mt-0.5" />
            <p>Cutting these items adds <strong className="text-slate-300">{usd(neTotalMonthly)}/mo</strong> to your bridge capital savings rate.</p>
          </div>
        </div>
      ),
    },

    /* ── Step 2: Pay off loans ── */
    {
      id: 'loans',
      title: 'Pay Off All Loans',
      description: 'Eliminate all non-mortgage debt. This removes interest drag and maximises the monthly surplus available for bridge capital.',
      complete: loansCleared,
      blocked: false,
      doneMessage: 'No loans — you\'re debt-free (excluding mortgage)!',
      linkTo: '/loans',
      linkLabel: 'Loans',
      body: (
        <div className="space-y-2">
          {loans.length === 0 ? (
            <p className="text-xs text-muted">No loans entered yet. Add them in the Loans page to track progress here.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                {loans.map(loan => (
                  <div key={loan.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">{loan.name}</span>
                    <div className="text-right">
                      <span className="mono text-slate-200">{usd(parseFloat(loan.amount))}</span>
                      <span className="text-muted ml-2">+{usd(calcTotalInterest(loan))} interest</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs border-t border-border/40 pt-2">
                <span className="font-medium text-slate-200">Total cost to clear</span>
                <span className="mono text-rose-400 font-semibold">{usd(totalLoanPrincipal + totalLoanInterest)}</span>
              </div>
            </>
          )}
        </div>
      ),
    },

    /* ── Step 3: Pay off mortgage ── */
    {
      id: 'mortgage',
      title: 'Pay Off Your Mortgage',
      description: 'A paid-off home means your essential monthly expenses drop significantly, reducing the bridge capital you need.',
      complete: mortgageCleared,
      blocked: false,
      doneMessage: 'Mortgage fully paid off — you own your home outright!',
      linkTo: '/mortgage',
      linkLabel: 'Mortgage',
      body: mortgageConfig == null ? (
        <p className="text-xs text-muted">No mortgage configured. Set it up in the Mortgage page if applicable.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Remaining balance</span>
            <span className="mono text-rose-400 font-semibold">{usd(mortgageBalance)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-rose-400/60 transition-all duration-700"
              style={{ width: `${Math.min(100, (mortgageBalance / (parseFloat(mortgageConfig?.principal) || 1)) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted">
            Paying off the mortgage could reduce essential monthly expenses by{' '}
            <strong className="text-slate-300">~{usd(parseFloat(mortgageConfig?.payment || 0))}/mo</strong>,
            lowering your required bridge capital.
          </p>
        </div>
      ),
    },

    /* ── Step 4: Fund bridge capital ── */
    {
      id: 'bridge',
      title: 'Fund Bridge Capital',
      description: hasBridgeGap
        ? `Your desired retirement age (${retireAge}) is ${bridgeYears} year${bridgeYears === 1 ? '' : 's'} before penalty-free retirement account access (age ${RETIREMENT_ACCOUNT_AGE}). You need a bridge to cover expenses until then.`
        : retireAge == null
        ? 'Set your age and desired retirement age in the profile to calculate your bridge capital requirement.'
        : `Your retirement age (${retireAge}) is at or after penalty-free access to retirement accounts — no bridge gap needed!`,
      complete: !hasBridgeGap && retireAge != null,
      blocked: !loansCleared || !mortgageCleared,
      doneMessage: `Retiring at ${retireAge} means you can draw from retirement accounts right away — no bridge needed!`,
      linkTo: '/liquid',
      linkLabel: 'Liquid Assets',
      body: (() => {
        if (retireAge == null) return (
          <div className="flex items-start gap-2 text-xs text-muted">
            <AlertTriangle size={13} className="shrink-0 text-amber-400 mt-0.5" />
            <p>Set your <strong className="text-slate-300">Current Age</strong> and <strong className="text-slate-300">Desired Retirement Age</strong> in the Profile panel to unlock this calculation.</p>
          </div>
        )
        if (!hasBridgeGap) return null
        return (
          <div className="space-y-4">
            {/* Bridge summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/[0.03] rounded-lg px-3 py-2.5 border border-border/50">
                <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Bridge Period</p>
                <p className="mono text-lg font-bold text-slate-200 leading-none">{bridgeYears} yrs</p>
                <p className="text-[10px] text-muted mt-0.5">Age {retireAge} → {RETIREMENT_ACCOUNT_AGE}</p>
              </div>
              <div className="bg-white/[0.03] rounded-lg px-3 py-2.5 border border-border/50">
                <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Annual Expenses</p>
                <p className="mono text-lg font-bold text-slate-200 leading-none">{usd(annualExpenses)}</p>
                <p className="text-[10px] text-muted mt-0.5">{usd(monthlyExpenses)}/mo (essential only)</p>
              </div>
              <div className="bg-white/[0.03] rounded-lg px-3 py-2.5 border border-border/50">
                <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Withdrawal Rate</p>
                <p className="mono text-lg font-bold text-slate-200 leading-none">{withdrawRate}%</p>
                <p className="text-[10px] text-muted mt-0.5">Set in Profile</p>
              </div>
              <div className="bg-accent/[0.06] rounded-lg px-3 py-2.5 border border-accent/20">
                <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Bridge Capital Needed</p>
                <p className="mono text-lg font-bold text-accent leading-none">{bridgeCapital != null ? usd(bridgeCapital) : '—'}</p>
                <p className="text-[10px] text-muted mt-0.5">PV at 5% real return</p>
              </div>
            </div>

            {/* Progress: liquid savings */}
            {bridgeCapital != null && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Liquid savings toward bridge</span>
                  <span className="mono text-slate-200">{usd(liquidTotal)} / {usd(bridgeCapital)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent/70 transition-all duration-700"
                    style={{ width: `${liquidTowardBridge}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted">{liquidTowardBridge.toFixed(1)}% funded from liquid accounts</p>
              </div>
            )}

            {/* Path A: Dividend income */}
            <div className="space-y-2 border border-emerald-500/20 rounded-lg p-3 bg-emerald-500/[0.03]">
              <p className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
                <Flame size={12} /> Path A — Passive: Cover expenses with dividend income
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Current dividend income</span>
                  <span className="mono text-emerald-400">{usd(projectedDivIncome)}/yr</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Essential expenses</span>
                  <span className="mono text-slate-200">{usd(annualExpenses)}/yr</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-400/70 transition-all duration-700"
                    style={{ width: `${divCoveragePct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted">{divCoveragePct.toFixed(1)}% of essential expenses covered by dividends</p>
                {divCoversExpenses ? (
                  <p className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 size={12} /> Dividend income fully covers bridge period expenses!
                  </p>
                ) : (
                  <p className="text-[10px] text-muted">
                    Need <strong className="text-slate-300">{usd(annualExpenses - projectedDivIncome)}/yr</strong> more in dividends to fully cover the bridge.
                  </p>
                )}
              </div>
            </div>

            {/* Path B: Active savings */}
            <div className="space-y-2 border border-accent/20 rounded-lg p-3 bg-accent/[0.03]">
              <p className="text-xs font-medium text-accent flex items-center gap-1.5">
                <Flame size={12} /> Path B — Active: Save monthly surplus into bridge account
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Monthly surplus (budget)</span>
                  <span className={`mono font-medium ${monthlySurplus >= 0 ? 'text-slate-200' : 'text-rose-400'}`}>
                    {monthlySurplus >= 0 ? '+' : '−'}{usd(Math.abs(monthlySurplus))}/mo
                  </span>
                </div>
                {bridgeCapital != null && monthlySurplus > 0 && (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Time to fund bridge</span>
                      <span className="mono text-accent font-medium">{yearsToFundBridge} yrs ({monthsToFundBridge} mo)</span>
                    </div>
                    {yearsToRetire != null && (
                      <p className={`text-[10px] ${parseFloat(yearsToFundBridge) <= yearsToRetire ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {parseFloat(yearsToFundBridge) <= yearsToRetire
                          ? `✓ On track — bridge funded ${(yearsToRetire - parseFloat(yearsToFundBridge)).toFixed(1)} yrs before retirement`
                          : `⚠ Bridge would take ${(parseFloat(yearsToFundBridge) - yearsToRetire).toFixed(1)} yrs longer than time to retirement`
                        }
                      </p>
                    )}
                  </>
                )}
                {monthlySurplus <= 0 && (
                  <p className="text-[10px] text-amber-400">
                    ⚠ No monthly surplus available — completing steps 1–3 will free up cash flow.
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })(),
    },

  ], [
    neItems, neTotalMonthly, loans, loansCleared, mortgageConfig,
    mortgageBalance, mortgageCleared, hasBridgeGap, retireAge, bridgeYears,
    annualExpenses, monthlyExpenses, bridgeCapital, projectedDivIncome,
    divCoversExpenses, divCoveragePct, monthlySurplus, monthsToFundBridge,
    yearsToFundBridge, yearsToRetire, liquidTotal, liquidTowardBridge, withdrawRate,
  ])

  const completedCount = steps.filter(s => s.complete || overrides[s.id]).length
  const allDone = completedCount === steps.length

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-amber-400" />
            <h1 className="text-xl font-semibold">FIRE Journey</h1>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Your step-by-step path to Financial Independence, Early Retirement
          </p>
        </div>
        {(age || retireAge) && (
          <div className="shrink-0 text-right">
            {age && retireAge && (
              <p className="text-xs text-muted">
                Age <strong className="text-slate-200">{age}</strong> → Retire at <strong className="text-slate-200">{retireAge}</strong>
                {yearsToRetire != null && <span className="text-accent ml-1">({yearsToRetire} yrs away)</span>}
              </p>
            )}
            {bridgeYears != null && bridgeYears > 0 && (
              <p className="text-[10px] text-muted mt-0.5">
                {bridgeYears}-yr bridge needed before penalty-free retirement access
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Profile incomplete warning ── */}
      {(!age || !retireAge) && (
        <div className="card border border-amber-500/25 bg-amber-500/[0.04] flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-200">Complete your profile to unlock full FIRE calculations</p>
            <p className="text-xs text-muted mt-0.5">
              Set your <strong className="text-slate-300">Current Age</strong>, <strong className="text-slate-300">Desired Retirement Age</strong>, and optionally a <strong className="text-slate-300">Withdrawal Rate</strong> in the Profile section at the bottom of the sidebar.
            </p>
          </div>
        </div>
      )}

      {/* ── Progress summary ── */}
      {!allDone && (
        <div className="card bg-white/[0.02] border border-border/50">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-slate-300">Overall Progress</p>
            <span className="text-xs text-muted">{completedCount} of {steps.length} steps complete</span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-accent/70 transition-all duration-700"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            {steps.map((s, i) => {
              const done = s.complete || overrides[s.id]
              return (
                <div key={s.id} className="flex flex-col items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${done ? 'bg-emerald-400' : 'bg-border'}`} />
                  <span className="text-[9px] text-muted">Step {i + 1}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── All done celebration ── */}
      {allDone && (
        <div className="card border border-emerald-500/40 bg-emerald-500/[0.06] text-center py-8 space-y-2">
          <PartyPopper size={32} className="mx-auto text-emerald-400" />
          <p className="text-xl font-bold text-emerald-400">You've achieved FIRE! 🎉</p>
          <p className="text-sm text-muted">Every step on your journey is complete. Financial independence is yours.</p>
        </div>
      )}

      {/* ── Step cards ── */}
      <div className="grid grid-cols-1 gap-4">
        {steps.map((step, i) => (
          <StepCard
            key={step.id}
            step={step}
            index={i}
            complete={step.complete}
            manualOverride={!!overrides[step.id]}
            onToggleOverride={toggleOverride}
          />
        ))}
      </div>

      {/* ── Footer note ── */}
      <p className="text-[10px] text-muted">
        Bridge capital uses a present value annuity calculation at a 5% assumed real return over the bridge period.
        Withdrawal rate ({withdrawRate}%) is used to validate the bridge size against your expense level.
        All figures are estimates — consult a financial advisor for personalised advice.
      </p>

    </div>
  )
}
