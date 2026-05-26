import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { Scale, TrendingUp, Home, Info, AlertCircle, Wallet, SlidersHorizontal, Trash2, AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react'

const INPUT  = 'w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors'
const SELECT = INPUT + ' cursor-pointer'

/* ── Tax constants (2024) ─────────────────────────────────────────── */
const FED_BRACKETS = {
  single: [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[609350,.35],[Infinity,.37]],
  mfj:    [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
  mfs:    [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[365600,.35],[Infinity,.37]],
  hoh:    [[16550,.10],[63100,.12],[100500,.22],[191950,.24],[243700,.32],[609350,.35],[Infinity,.37]],
}

const STD_DEDUCTION = { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900 }

const LTCG_BRACKETS = {
  single: [[47025,0],[518900,.15],[Infinity,.20]],
  mfj:    [[94050,0],[583750,.15],[Infinity,.20]],
  mfs:    [[47025,0],[291850,.15],[Infinity,.20]],
  hoh:    [[63000,0],[551350,.15],[Infinity,.20]],
}

// Top marginal state income tax rates (2024 approximate)
const STATE_TAX = {
  AL:.05,  AK:0,     AZ:.025,  AR:.044,  CA:.133,
  CO:.044, CT:.069,  DE:.066,  FL:0,     GA:.055,
  HI:.11,  ID:.058,  IL:.0495, IN:.0305, IA:.057,
  KS:.057, KY:.045,  LA:.0425, ME:.0715, MD:.0575,
  MA:.05,  MI:.0425, MN:.0985, MS:.047,  MO:.048,
  MT:.069, NE:.0664, NV:0,     NH:0,     NJ:.1075,
  NM:.059, NY:.109,  NC:.0475, ND:.029,  OH:.035,
  OK:.0475,OR:.099,  PA:.0307, RI:.0599, SC:.065,
  SD:0,    TN:0,     TX:0,     UT:.0465, VT:.0875,
  VA:.0575,WA:0,     WV:.065,  WI:.0765, WY:0,
  DC:.1075,
}

const STATE_NAMES = {
  AL:'Alabama',       AK:'Alaska',         AZ:'Arizona',       AR:'Arkansas',
  CA:'California',    CO:'Colorado',        CT:'Connecticut',   DC:'Washington D.C.',
  DE:'Delaware',      FL:'Florida',         GA:'Georgia',       HI:'Hawaii',
  ID:'Idaho',         IL:'Illinois',        IN:'Indiana',       IA:'Iowa',
  KS:'Kansas',        KY:'Kentucky',        LA:'Louisiana',     ME:'Maine',
  MD:'Maryland',      MA:'Massachusetts',   MI:'Michigan',      MN:'Minnesota',
  MS:'Mississippi',   MO:'Missouri',        MT:'Montana',       NE:'Nebraska',
  NV:'Nevada',        NH:'New Hampshire',   NJ:'New Jersey',    NM:'New Mexico',
  NY:'New York',      NC:'North Carolina',  ND:'North Dakota',  OH:'Ohio',
  OK:'Oklahoma',      OR:'Oregon',          PA:'Pennsylvania',  RI:'Rhode Island',
  SC:'South Carolina',SD:'South Dakota',    TN:'Tennessee',     TX:'Texas',
  UT:'Utah',          VT:'Vermont',         VA:'Virginia',      WA:'Washington',
  WV:'West Virginia', WI:'Wisconsin',       WY:'Wyoming',
}

/* ── Helpers ──────────────────────────────────────────────────────── */
function getMarginalRate(income, brackets) {
  for (const [upper, rate] of brackets) {
    if (income <= upper) return rate
  }
  return brackets[brackets.length - 1][1]
}

function pct(n, dec = 1) {
  if (n == null || isNaN(n)) return '—'
  return `${(n * 100).toFixed(dec)}%`
}

function usd(n) {
  if (n == null || isNaN(n) || n === 0) return '$0'
  return Math.abs(n).toLocaleString('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
  })
}

function calcMortgageBalance(config, extras) {
  if (!config?.startDate || !config?.principal || !config?.rate) return null
  const principal  = parseFloat(config.principal) || 0
  const annualRate = parseFloat(config.rate)       || 0
  const termYears  = parseInt(config.years)        || 30
  if (principal <= 0 || annualRate <= 0) return null
  const [y, m]  = config.startDate.split('-').map(Number)
  const now     = new Date()
  const elapsed = (now.getFullYear() - y) * 12 + (now.getMonth() - (m - 1))
  if (elapsed <= 0) return principal
  const totalMonths = termYears * 12
  const monthlyRate = annualRate / 100 / 12
  const pow         = Math.pow(1 + monthlyRate, totalMonths)
  const payment     = monthlyRate === 0
    ? principal / totalMonths
    : principal * monthlyRate * pow / (pow - 1)
  let balance = principal
  for (let i = 0; i < Math.min(elapsed, totalMonths); i++) {
    if (balance < 0.01) break
    const interest = balance * monthlyRate
    let prinPaid = payment - interest
    if (prinPaid > balance) prinPaid = balance
    const extra = Math.min(parseFloat(extras?.[String(i)]) || 0, Math.max(0, balance - prinPaid))
    balance = Math.max(0, balance - prinPaid - extra)
  }
  return Math.round(balance * 100) / 100
}

/** Calculate the flat monthly extra payment required to hit a target payoff year. */
function calcRequiredExtra(mortgageConfig, mortgageBalance, targetYearStr) {
  if (!mortgageConfig || !mortgageBalance || !targetYearStr) return null
  const targetY   = parseInt(targetYearStr)
  if (!targetY) return null
  const principal  = parseFloat(mortgageConfig.principal) || 0
  const annualRate = parseFloat(mortgageConfig.rate)       || 0
  const termYears  = parseInt(mortgageConfig.years)        || 30
  if (principal <= 0 || annualRate <= 0) return null
  const [startY, startM] = mortgageConfig.startDate.split('-').map(Number)
  const startMonth0 = startM - 1

  const monthlyRate   = annualRate / 100 / 12
  const totalMonths   = termYears * 12
  const stdPayment    = monthlyRate === 0
    ? principal / totalMonths
    : principal * monthlyRate * Math.pow(1 + monthlyRate, totalMonths) /
      (Math.pow(1 + monthlyRate, totalMonths) - 1)

  const targetMonths  = (targetY - startY) * 12 + (12 - startMonth0)
  if (targetMonths <= 0 || targetMonths >= totalMonths) return null

  // Payment required to pay off current balance in the remaining targetMonths
  const reqPayment = monthlyRate === 0
    ? mortgageBalance / targetMonths
    : mortgageBalance * monthlyRate * Math.pow(1 + monthlyRate, targetMonths) /
      (Math.pow(1 + monthlyRate, targetMonths) - 1)

  const extra = Math.ceil(Math.max(0, reqPayment - stdPayment))
  return { targetY, requiredExtra: extra, reqPayment: Math.round(reqPayment * 100) / 100 }
}

/**
 * Build the per-month target-year plan with carry-forward logic.
 *
 * Each month:
 *  - needed = requiredExtra + carry (pace + any prior shortfall)
 *  - if budget >= needed: pay 'needed' to mortgage, rest to invest, carry → 0
 *  - if budget < needed: pay all budget to mortgage, carry += (needed - budget)
 *  - if budget > needed: extra budget reclaimed for investing (no overpaying)
 */
function buildTargetPlan(months, monthBudgets, defaultBudget, requiredExtra) {
  let carry = 0
  return months.map(ym => {
    const budget  = parseFloat(monthBudgets[ym] || defaultBudget) || 0
    const needed  = Math.round(requiredExtra + carry)
    const deficit = carry > 0

    let mortgagePaid, invest, newCarry
    if (budget <= 0) {
      // No budget at all — full amount rolls forward
      mortgagePaid = 0
      invest       = 0
      newCarry     = needed
    } else if (budget >= needed) {
      // Can fully fund the needed amount — surplus goes to invest
      mortgagePaid = needed
      invest       = budget - needed
      newCarry     = 0
    } else {
      // Under-funded — everything goes to mortgage, shortfall carries forward
      mortgagePaid = budget
      invest       = 0
      newCarry     = needed - budget
    }

    const carryIn = carry
    carry = newCarry
    return { ym, budget, needed, mortgagePaid, invest, carryIn, carryOut: newCarry, deficit }
  })
}

/**
 * Build list of 'YYYY-MM' strings from today through endYear (inclusive, through Dec).
 * Falls back to 12 months if no endYear provided.
 */
function buildMonthList(endYear) {
  const now    = new Date()
  const startY = now.getFullYear()
  const startM = now.getMonth()  // 0-indexed
  const finalY = endYear ?? startY
  const finalM = 11               // always run through December of endYear

  const months = []
  let y = startY, m = startM
  while (y < finalY || (y === finalY && m <= finalM)) {
    months.push(`${y}-${String(m + 1).padStart(2, '0')}`)
    m++
    if (m > 11) { m = 0; y++ }
  }
  // Always return at least 12 months
  if (months.length < 12) {
    const d = new Date(startY, startM + months.length, 1)
    while (months.length < 12) {
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      d.setMonth(d.getMonth() + 1)
    }
  }
  return months
}

function formatMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long' })
}

/**
 * Group a flat array of plan rows (each with a `ym` field) into year buckets,
 * computing year-level totals for the summary row.
 */
function groupPlanByYear(rows) {
  const map = new Map()
  for (const row of rows) {
    const year = parseInt(row.ym.split('-')[0])
    if (!map.has(year)) {
      map.set(year, { year, rows: [], budget: 0, stdMortgage: 0, stdInvest: 0, m1: 0, i1: 0, m2: 0, i2: 0, hasDeficit: false })
    }
    const g = map.get(year)
    g.rows.push(row)
    g.budget      += row.budget
    g.stdMortgage += row.stdMortgage
    g.stdInvest   += row.stdInvest
    g.m1          += row.m1 ?? 0
    g.i1          += row.i1 ?? 0
    g.m2          += row.m2 ?? 0
    g.i2          += row.i2 ?? 0
    if (row.deficit1 || row.deficit2) g.hasDeficit = true
  }
  return [...map.values()]
}

function analyze(profile, mortgageRateStr, mortgageBalance) {
  const { filingStatus = 'single', state = 'TX', grossIncome = '', expectedReturn = '7' } = profile
  const income  = parseFloat(grossIncome) || 0
  const mRate   = parseFloat(mortgageRateStr) || 0
  const mBal    = parseFloat(mortgageBalance) || 0
  const expRet  = parseFloat(expectedReturn) / 100 || 0.07
  const status  = ['single','mfj','mfs','hoh'].includes(filingStatus) ? filingStatus : 'single'

  const fedMarginal   = getMarginalRate(income, FED_BRACKETS[status])
  const stateMarginal = STATE_TAX[state] ?? 0
  const ltcgFed       = getMarginalRate(income, LTCG_BRACKETS[status])
  const ltcgState     = stateMarginal

  const annualInterest    = mBal * mRate / 100
  const estStateIncomeTax = income * stateMarginal * 0.6
  const saltDeduction     = Math.min(estStateIncomeTax + 4_000, 10_000)
  const totalItemized     = annualInterest + saltDeduction
  const stdDed            = STD_DEDUCTION[status]
  const itemizes          = totalItemized > stdDed

  const deductionBenefit      = itemizes ? fedMarginal + (stateMarginal > 0 ? stateMarginal : 0) : 0
  const effectiveMortgageRate = mRate / 100 * (1 - deductionBenefit)
  const afterTaxInvestReturn  = expRet * (1 - ltcgFed - ltcgState)
  const diff                  = afterTaxInvestReturn - effectiveMortgageRate

  let investFrac
  const totalRate = afterTaxInvestReturn + effectiveMortgageRate
  if (afterTaxInvestReturn <= 0)       investFrac = 0.0
  else if (effectiveMortgageRate <= 0) investFrac = 1.0
  else if (totalRate <= 0)             investFrac = 0.5
  else                                 investFrac = afterTaxInvestReturn / totalRate

  return {
    income, fedMarginal, stateMarginal, ltcgFed, ltcgState,
    annualInterest, saltDeduction, totalItemized, stdDed, itemizes,
    deductionBenefit, effectiveMortgageRate,
    expRet, afterTaxInvestReturn, diff, investFrac,
    mortgageRate: mRate, mortgageBalance: mBal,
  }
}

/* ── Stat tile ────────────────────────────────────────────────────── */
function Tile({ label, value, sub, color = 'default' }) {
  const cls = {
    default: 'bg-white/[0.03] border-border/50 text-slate-200',
    green:   'bg-green-500/[0.06] border-green-500/20 text-green-400',
    yellow:  'bg-yellow-500/[0.06] border-yellow-500/20 text-yellow-400',
    blue:    'bg-blue-500/[0.06] border-blue-500/20 text-blue-400',
    accent:  'bg-accent/[0.06] border-accent/20 text-accent',
  }[color]

  return (
    <div className={`rounded-xl p-3 border ${cls}`}>
      <p className="text-[10px] text-muted uppercase tracking-widest mb-1">{label}</p>
      <p className="mono text-lg font-bold leading-none">{value}</p>
      {sub && <p className="text-[10px] text-muted mt-1 leading-relaxed">{sub}</p>}
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function PayoffVsInvestPage() {
  const [profile, setProfile] = useState({
    filingStatus: 'single',
    state:        'TX',
    grossIncome:  '',
    expectedReturn: '7',
  })
  const [monthBudgets,   setMonthBudgets]   = useState({})
  const [customSplit,    setCustomSplit]     = useState(null)
  const [mortgageConfig, setMortgageConfig] = useState(null)
  const [mortgageExtras, setMortgageExtras] = useState(null)
  const [expanded,       setExpanded]       = useState(new Set())
  const [budgetData,     setBudgetData]     = useState({})  // from Budget page
  const [budgetDefaults, setBudgetDefaults] = useState({})  // from Budget page defaults row
  const [budgetLabels,   setBudgetLabels]   = useState([])  // custom label names

  // Load from localStorage
  useEffect(() => {
    try {
      const p   = localStorage.getItem('payoff_vs_invest_profile')
      const mb  = localStorage.getItem('payoff_vs_invest_month_budgets')
      const cs  = localStorage.getItem('payoff_vs_invest_split')
      const cfg = localStorage.getItem('mortgage_config')
      const ext = localStorage.getItem('mortgage_extras')
      const bd  = localStorage.getItem('budget_data')
      const bdf = localStorage.getItem('budget_defaults')
      const bl  = localStorage.getItem('budget_custom_labels')
      if (p)   setProfile(JSON.parse(p))
      if (mb)  setMonthBudgets(JSON.parse(mb))
      if (cs)  setCustomSplit(parseFloat(cs))
      if (cfg) setMortgageConfig(JSON.parse(cfg))
      if (ext) setMortgageExtras(JSON.parse(ext))
      if (bd)  setBudgetData(JSON.parse(bd))
      if (bdf) setBudgetDefaults(JSON.parse(bdf))
      if (bl)  setBudgetLabels(JSON.parse(bl))
    } catch { /* ignore */ }
  }, [])

  const updateProfile = (key, val) => {
    setProfile(prev => {
      const next = { ...prev, [key]: val }
      localStorage.setItem('payoff_vs_invest_profile', JSON.stringify(next))
      return next
    })
  }

  const updateMonthBudget = (ym, val) => {
    setMonthBudgets(prev => {
      const next = { ...prev }
      if (!val) delete next[ym]
      else next[ym] = val
      localStorage.setItem('payoff_vs_invest_month_budgets', JSON.stringify(next))
      return next
    })
  }

  const updateCustomSplit = (val) => {
    setCustomSplit(val)
    if (val === null) localStorage.removeItem('payoff_vs_invest_split')
    else localStorage.setItem('payoff_vs_invest_split', String(val))
  }

  const clearAll = () => {
    const defaults = { filingStatus: 'single', state: 'TX', grossIncome: '', expectedReturn: '7' }
    setProfile(defaults)
    setMonthBudgets({})
    setCustomSplit(null)
    localStorage.removeItem('payoff_vs_invest_profile')
    localStorage.removeItem('payoff_vs_invest_month_budgets')
    localStorage.removeItem('payoff_vs_invest_split')
  }

  /** Resolve effective value for a budget field — month override > default > 0 */
  const budgetEffective = useCallback((row, key) => {
    const v = row?.[key]
    if (v !== undefined && v !== '') return parseFloat(v) || 0
    const d = budgetDefaults?.[key]
    if (d !== undefined && d !== '') return parseFloat(d) || 0
    return 0
  }, [budgetDefaults])

  /** Compute the remaining budget for a month from the Budget page data */
  const getMonthBudget = useCallback((ym) => {
    // Per-month override in this page takes priority
    if (monthBudgets[ym] !== undefined && monthBudgets[ym] !== '') {
      return parseFloat(monthBudgets[ym]) || 0
    }
    // Fall back to Budget page remaining (using effective values with defaults)
    const row       = budgetData[ym] ?? {}
    const paycheck  = budgetEffective(row, 'pay1') + budgetEffective(row, 'pay2')
    const housing   = budgetEffective(row, 'housing')
    const utilities = budgetEffective(row, 'utilities')
    const groceries = budgetEffective(row, 'groceries')
    const customSum = budgetLabels.reduce((s, _, i) =>
      s + budgetEffective(row, `custom_${i}`), 0)
    const remaining = paycheck - housing - utilities - groceries - customSum
    return paycheck > 0 ? Math.max(0, remaining) : 0
  }, [monthBudgets, budgetData, budgetDefaults, budgetLabels, budgetEffective])

  const toggleYear = useCallback((year) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(year) ? next.delete(year) : next.add(year)
      return next
    })
  }, [])

  /* ── Derived ── */
  const mortgageRate    = mortgageConfig?.rate ?? ''
  const mortgageBalance = calcMortgageBalance(mortgageConfig, mortgageExtras)
  const hasMortgage     = mortgageBalance !== null && mortgageRate !== ''

  const canAnalyze = !!(profile.grossIncome && parseFloat(profile.grossIncome) > 0)
  const a = canAnalyze ? analyze(profile, mortgageRate, mortgageBalance ?? 0) : null

  const investFrac   = customSplit !== null ? customSplit : (a?.investFrac ?? 0.5)
  const mortgageFrac = 1 - investFrac

  /* Target year plans */
  const target1 = useMemo(
    () => calcRequiredExtra(mortgageConfig, mortgageBalance, mortgageConfig?.targetYear),
    [mortgageConfig, mortgageBalance]
  )
  const target2 = useMemo(
    () => calcRequiredExtra(mortgageConfig, mortgageBalance, mortgageConfig?.targetYear2),
    [mortgageConfig, mortgageBalance]
  )
  const hasTargets = !!(target1 || target2)

  /*
   * Dynamic month list: spans from today through December of the furthest
   * relevant year — the later of target1, target2, and standard payoff.
   * Falls back to 12 months when there's no mortgage.
   */
  const MONTHS = useMemo(() => {
    if (!mortgageConfig?.startDate || !mortgageConfig?.years) return buildMonthList(null)
    const [startY] = mortgageConfig.startDate.split('-').map(Number)
    const stdEnd   = startY + parseInt(mortgageConfig.years || 30)
    // Prefer the target years when set; only fall back to standard payoff if neither target is configured
    const targetCandidates = [target1?.targetY, target2?.targetY].filter(Boolean)
    const endYear = targetCandidates.length > 0
      ? Math.max(...targetCandidates)
      : stdEnd
    return buildMonthList(endYear)
  }, [mortgageConfig, target1, target2])

  /*
   * Unified per-month rows: one entry per MONTHS item, carrying all columns so
   * grouping by year is straightforward.
   */
  const allRows = useMemo(() => {
    // Build target plans if we have targets
    let tp1 = null, tp2 = null
    if (target1) {
      let carry = 0
      tp1 = {}
      for (const ym of MONTHS) {
        const budget = getMonthBudget(ym)
        const needed = Math.round(target1.requiredExtra + carry)
        let mortgagePaid, invest, newCarry
        if (budget <= 0)           { mortgagePaid = 0;      invest = 0;               newCarry = needed }
        else if (budget >= needed) { mortgagePaid = needed; invest = budget - needed;  newCarry = 0 }
        else                       { mortgagePaid = budget; invest = 0;               newCarry = needed - budget }
        tp1[ym] = { mortgagePaid, invest, carryIn: carry, carryOut: newCarry }
        carry = newCarry
      }
    }
    if (target2) {
      let carry = 0
      tp2 = {}
      for (const ym of MONTHS) {
        const budget = getMonthBudget(ym)
        const needed = Math.round(target2.requiredExtra + carry)
        let mortgagePaid, invest, newCarry
        if (budget <= 0)           { mortgagePaid = 0;      invest = 0;               newCarry = needed }
        else if (budget >= needed) { mortgagePaid = needed; invest = budget - needed;  newCarry = 0 }
        else                       { mortgagePaid = budget; invest = 0;               newCarry = needed - budget }
        tp2[ym] = { mortgagePaid, invest, carryIn: carry, carryOut: newCarry }
        carry = newCarry
      }
    }

    return MONTHS.map(ym => {
      const budget      = getMonthBudget(ym)
      const stdMortgage = Math.round(budget * mortgageFrac)
      const stdInvest   = budget - stdMortgage
      const r1 = tp1?.[ym] ?? null
      const r2 = tp2?.[ym] ?? null
      return {
        ym,
        budget,
        hasOverride: ym in monthBudgets && monthBudgets[ym] !== '',
        stdMortgage,
        stdInvest,
        m1: r1?.mortgagePaid ?? null,
        i1: r1?.invest       ?? null,
        carry1In:  r1?.carryIn  ?? 0,
        carry1Out: r1?.carryOut ?? 0,
        deficit1:  r1 ? r1.carryIn > 0 : false,
        m2: r2?.mortgagePaid ?? null,
        i2: r2?.invest       ?? null,
        carry2In:  r2?.carryIn  ?? 0,
        carry2Out: r2?.carryOut ?? 0,
        deficit2:  r2 ? r2.carryIn > 0 : false,
      }
    })
  }, [MONTHS, getMonthBudget, mortgageFrac, target1, target2])

  /* Year-grouped view */
  const yearGroups = useMemo(() => groupPlanByYear(allRows), [allRows])

  /* Grand totals across all months */
  const grandTotals = useMemo(() => allRows.reduce((acc, r) => ({
    budget:      acc.budget      + r.budget,
    stdMortgage: acc.stdMortgage + r.stdMortgage,
    stdInvest:   acc.stdInvest   + r.stdInvest,
    m1: acc.m1 + (r.m1 ?? 0),
    i1: acc.i1 + (r.i1 ?? 0),
    m2: acc.m2 + (r.m2 ?? 0),
    i2: acc.i2 + (r.i2 ?? 0),
  }), { budget: 0, stdMortgage: 0, stdInvest: 0, m1: 0, i1: 0, m2: 0, i2: 0 }), [allRows])

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Scale size={18} className="text-accent" />
            Payoff vs. Invest
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Compare your effective after-tax mortgage cost against expected investment returns
            to find the optimal split for extra monthly cash.
          </p>
        </div>
        <button
          onClick={clearAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted border border-border/60 hover:text-red-400 hover:border-red-400/40 hover:bg-red-400/5 transition-colors shrink-0"
        >
          <Trash2 size={13} />
          Clear All
        </button>
      </div>

      {/* Top two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Profile & Inputs ──────────────────────────────────── */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Info size={14} className="text-accent" />
            Tax Profile
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-muted uppercase tracking-wider">Filing Status</label>
              <select value={profile.filingStatus}
                onChange={e => updateProfile('filingStatus', e.target.value)}
                className={SELECT}>
                <option value="single">Single</option>
                <option value="mfj">Married — Joint</option>
                <option value="mfs">Married — Separate</option>
                <option value="hoh">Head of Household</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted uppercase tracking-wider">State</label>
              <select value={profile.state}
                onChange={e => updateProfile('state', e.target.value)}
                className={SELECT}>
                {Object.entries(STATE_NAMES)
                  .sort(([, a], [, b]) => a.localeCompare(b))
                  .map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Gross Annual Income</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
              <input type="number" min="0" step="1000"
                value={profile.grossIncome}
                onChange={e => updateProfile('grossIncome', e.target.value)}
                placeholder="85000"
                className={INPUT + ' pl-6'}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-muted uppercase tracking-wider">Expected Annual Market Return</label>
            <div className="relative">
              <input type="number" min="0" max="30" step="0.5"
                value={profile.expectedReturn}
                onChange={e => updateProfile('expectedReturn', e.target.value)}
                placeholder="7"
                className={INPUT + ' pr-7'}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">%</span>
            </div>
            <p className="text-[10px] text-muted">S&amp;P 500 historical: ~10% nominal, ~7% inflation-adjusted</p>
          </div>

          {/* Mortgage auto-loaded */}
          <div className="pt-1 border-t border-border/50 space-y-2">
            <p className="text-[10px] text-muted uppercase tracking-wider flex items-center gap-1.5">
              <Home size={10} />
              Mortgage (auto-loaded from Mortgage page)
            </p>
            {hasMortgage ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/[0.03] border border-border/40 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-muted">Interest Rate</p>
                    <p className="mono text-sm font-semibold text-slate-200">{mortgageRate}%</p>
                  </div>
                  <div className="bg-white/[0.03] border border-border/40 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-muted">Current Balance</p>
                    <p className="mono text-sm font-semibold text-slate-200">{usd(mortgageBalance)}</p>
                  </div>
                </div>
                {/* Target year summary */}
                {(target1 || target2) && (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { t: target1, label: 'Target #1', cls: 'border-accent/30 bg-accent/[0.04]', valCls: 'text-accent' },
                      { t: target2, label: 'Target #2', cls: 'border-amber-500/30 bg-amber-500/[0.04]', valCls: 'text-amber-400' },
                    ].map(({ t, label, cls, valCls }) => t && (
                      <div key={label} className={`border rounded-lg px-3 py-2 ${cls}`}>
                        <p className="text-[10px] text-muted">{label}: {t.targetY}</p>
                        <p className={`mono text-sm font-semibold ${valCls}`}>+{usd(t.requiredExtra)}/mo</p>
                        <p className="text-[10px] text-muted">extra needed</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted">
                No mortgage configured.{' '}
                <a href="/mortgage" className="text-accent underline hover:text-accent/80 transition-colors">
                  Set up your mortgage →
                </a>
              </p>
            )}
          </div>
        </div>

        {/* ── Rate Analysis ──────────────────────────────────────── */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <TrendingUp size={14} className="text-green-400" />
            Rate Analysis
          </h2>

          {!canAnalyze ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Scale size={24} className="text-muted/50" />
              <p className="text-sm text-muted">
                Enter your gross annual income to see your effective rates and recommendation.
              </p>
            </div>
          ) : (
            <>
              {/* Tax rates */}
              <div className="space-y-2">
                <p className="text-[10px] text-muted uppercase tracking-wider">Your Tax Rates</p>
                <div className="grid grid-cols-3 gap-2">
                  <Tile label="Federal Marginal" value={pct(a.fedMarginal)} />
                  <Tile label="State Marginal"   value={pct(a.stateMarginal)} sub={STATE_NAMES[profile.state]} />
                  <Tile label="LT Cap Gains"      value={pct(a.ltcgFed)} sub="federal" />
                </div>
              </div>

              {/* Mortgage cost */}
              <div className="space-y-2">
                <p className="text-[10px] text-muted uppercase tracking-wider">Mortgage Cost</p>
                {!hasMortgage ? (
                  <p className="text-xs text-muted italic">No mortgage data — add it on the Mortgage page.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Tile label="Nominal Rate"   value={pct(a.mortgageRate / 100)} />
                      <Tile label="Effective Rate" value={pct(a.effectiveMortgageRate)}
                        sub={a.itemizes ? 'after-tax (you itemize)' : 'no benefit (standard deduct.)'}
                        color={a.effectiveMortgageRate < a.afterTaxInvestReturn ? 'default' : 'yellow'}
                      />
                    </div>
                    {!a.itemizes && (
                      <div className="flex items-start gap-1.5 text-[10px] text-yellow-400/80">
                        <AlertCircle size={11} className="mt-0.5 shrink-0" />
                        <span>
                          Estimated itemized deductions ({usd(a.totalItemized)}) are below the
                          standard deduction ({usd(a.stdDed)}), so mortgage interest gives no federal tax benefit.
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Investment return */}
              <div className="space-y-2">
                <p className="text-[10px] text-muted uppercase tracking-wider">Investment Return</p>
                <div className="grid grid-cols-2 gap-2">
                  <Tile label="Gross Expected"  value={pct(a.expRet)} />
                  <Tile label="After-Tax Return" value={pct(a.afterTaxInvestReturn)}
                    sub="after fed + state cap gains"
                    color={a.afterTaxInvestReturn > a.effectiveMortgageRate ? 'green' : 'default'}
                  />
                </div>
              </div>

              {/* Verdict */}
              {hasMortgage && (
                <div className={`rounded-xl p-4 border ${
                  a.diff > 0.001
                    ? 'bg-green-500/[0.07] border-green-500/30'
                    : a.diff < -0.001
                    ? 'bg-yellow-500/[0.07] border-yellow-500/30'
                    : 'bg-blue-500/[0.07] border-blue-500/30'
                }`}>
                  <p className={`text-xs font-semibold mb-2 ${
                    a.diff > 0.001 ? 'text-green-400' : a.diff < -0.001 ? 'text-yellow-400' : 'text-blue-400'
                  }`}>
                    {a.diff > 0.001
                      ? '📈 Investing has the higher after-tax return'
                      : a.diff < -0.001
                      ? '🏠 Mortgage payoff has the higher effective return'
                      : '⚖️ Rates are essentially equal — split evenly'}
                  </p>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-center">
                      <p className="mono text-2xl font-bold text-yellow-400 leading-none">
                        {Math.round((1 - a.investFrac) * 100)}%
                      </p>
                      <p className="text-[10px] text-muted mt-1">Extra Mortgage</p>
                    </div>
                    <div className="text-muted text-sm font-light">/</div>
                    <div className="flex-1 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 text-center">
                      <p className="mono text-2xl font-bold text-green-400 leading-none">
                        {Math.round(a.investFrac * 100)}%
                      </p>
                      <p className="text-[10px] text-muted mt-1">Brokerage</p>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted leading-relaxed">
                    Calculated as{' '}
                    <span className="text-slate-300 font-mono">
                      {pct(a.afterTaxInvestReturn, 2)} ÷ ({pct(a.afterTaxInvestReturn, 2)} + {pct(a.effectiveMortgageRate, 2)})
                    </span>
                    {' '}— each dollar is split proportionally to the relative after-tax value of each option.
                    {a.diff > 0.001
                      ? ` Investing leads by ${pct(a.diff, 2)}.`
                      : a.diff < -0.001
                      ? ` Mortgage payoff leads by ${pct(-a.diff, 2)}.`
                      : ''}
                  </p>
                </div>
              )}

              <p className="text-[10px] text-muted leading-relaxed">
                ℹ️ Mortgage payoff is a <em>guaranteed</em> return. Investing has a higher
                <em> expected</em> return but comes with market volatility and no guarantees.
                Use the slider in the Monthly Planner to adjust if your risk tolerance differs.
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Planner ──────────────────────────────────────────────────── */}
      {canAnalyze && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Wallet size={14} className="text-blue-400" />
                Allocation Planner
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {hasMortgage
                  ? `Spanning today through ${MONTHS[MONTHS.length - 1].split('-')[0]} — the full mortgage horizon. Click any year to expand its months.`
                  : 'Set a default monthly budget and adjust the split slider.'}
                {hasTargets && ' Target columns show the minimum to stay on pace; surplus reclaimed for investing.'}
              </p>
            </div>

            {/* Budget sourced from Budget page */}
            <div className="shrink-0">
              <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Monthly Budget</p>
              <p className="text-xs text-muted">
                Auto-loaded from the{' '}
                <a href="/budget" className="text-accent underline hover:text-accent/80 transition-colors">Budget page</a>
                {' '}· override per-month in the table below
              </p>
            </div>
          </div>

          {/* Split slider */}
          <div className="bg-white/[0.02] border border-border/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-slate-300 flex items-center gap-1.5 font-medium">
                <SlidersHorizontal size={13} className="text-accent" />
                Allocation Split
                {hasTargets && <span className="text-muted font-normal text-[10px]">(baseline; target cols cap mortgage)</span>}
              </p>
              {customSplit !== null && (
                <button
                  onClick={() => updateCustomSplit(null)}
                  className="text-[10px] text-accent hover:text-accent/80 underline transition-colors"
                >
                  Reset to calculated ({(a.investFrac * 100).toFixed(1)}% invest / {((1 - a.investFrac) * 100).toFixed(1)}% mortgage)
                </button>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[10px] text-yellow-400 font-semibold w-16 text-right shrink-0">
                {Math.round(mortgageFrac * 100)}% mortgage
              </span>
              <input type="range" min="0" max="100" step="5"
                value={Math.round(investFrac * 100)}
                onChange={e => updateCustomSplit(parseFloat(e.target.value) / 100)}
                className="flex-1 accent-accent"
              />
              <span className="text-[10px] text-green-400 font-semibold w-16 shrink-0">
                {Math.round(investFrac * 100)}% invest
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden flex">
              <div className="bg-yellow-500/60 transition-all duration-150" style={{ width: `${mortgageFrac * 100}%` }} />
              <div className="bg-green-500/60 flex-1 transition-all duration-150" />
            </div>
            <div className="flex justify-between text-[10px] text-muted">
              <span>100% Extra Mortgage</span><span>50 / 50</span><span>100% Invest</span>
            </div>
          </div>

          {/* Year-grouped table */}
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] text-muted uppercase tracking-wide bg-white/[0.02]">
                  <th className="w-8 px-3 py-3" />
                  <th className="px-3 py-3 text-left">Year</th>
                  <th className="px-3 py-3 text-right">Budget</th>
                  <th className="px-3 py-3 text-right">
                    <span className="text-yellow-400/80">Mortgage</span>
                    <span className="text-muted/60 normal-case ml-1">({Math.round(mortgageFrac * 100)}%)</span>
                  </th>
                  <th className="px-3 py-3 text-right">
                    <span className="text-green-400/80">Invest</span>
                    <span className="text-muted/60 normal-case ml-1">({Math.round(investFrac * 100)}%)</span>
                  </th>
                  {target1 && (
                    <>
                      <th className="px-3 py-3 text-right border-l border-border/40">
                        <span className="text-accent/80">Mtg #1</span>
                        <span className="text-muted/60 normal-case ml-1">(→{target1.targetY})</span>
                      </th>
                      <th className="px-3 py-3 text-right">
                        <span className="text-accent/60">Inv #1</span>
                      </th>
                    </>
                  )}
                  {target2 && (
                    <>
                      <th className="px-3 py-3 text-right border-l border-border/40">
                        <span className="text-amber-400/80">Mtg #2</span>
                        <span className="text-muted/60 normal-case ml-1">(→{target2.targetY})</span>
                      </th>
                      <th className="px-3 py-3 text-right">
                        <span className="text-amber-400/60">Inv #2</span>
                      </th>
                    </>
                  )}
                  <th className="px-3 py-3 text-right border-l border-border/40 normal-case font-normal">Override</th>
                </tr>
              </thead>
              <tbody>
                {yearGroups.map(yg => (
                  <Fragment key={yg.year}>

                    {/* ── Year summary row ── */}
                    <tr
                      onClick={() => toggleYear(yg.year)}
                      className={`border-b border-border/60 cursor-pointer select-none transition-colors ${
                        yg.hasDeficit
                          ? 'bg-red-500/[0.04] hover:bg-red-500/[0.07]'
                          : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <td className="px-3 py-3 text-muted">
                        {expanded.has(yg.year) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-200 flex items-center gap-1.5">
                        {yg.hasDeficit && <AlertTriangle size={10} className="text-red-400 shrink-0" />}
                        {yg.year}
                      </td>
                      <td className="px-3 py-3 text-right mono text-slate-400">{yg.budget > 0 ? usd(yg.budget) : <span className="text-muted/40">—</span>}</td>
                      <td className="px-3 py-3 text-right mono text-yellow-400">{yg.budget > 0 ? usd(yg.stdMortgage) : <span className="text-muted/40">—</span>}</td>
                      <td className="px-3 py-3 text-right mono text-green-400">{yg.budget > 0 ? usd(yg.stdInvest) : <span className="text-muted/40">—</span>}</td>
                      {target1 && (
                        <>
                          <td className="px-3 py-3 text-right mono text-accent border-l border-border/40">{yg.budget > 0 ? usd(yg.m1) : <span className="text-muted/40">—</span>}</td>
                          <td className="px-3 py-3 text-right mono text-accent/70">{yg.budget > 0 ? usd(yg.i1) : <span className="text-muted/40">—</span>}</td>
                        </>
                      )}
                      {target2 && (
                        <>
                          <td className="px-3 py-3 text-right mono text-amber-400 border-l border-border/40">{yg.budget > 0 ? usd(yg.m2) : <span className="text-muted/40">—</span>}</td>
                          <td className="px-3 py-3 text-right mono text-amber-400/70">{yg.budget > 0 ? usd(yg.i2) : <span className="text-muted/40">—</span>}</td>
                        </>
                      )}
                      <td className="px-3 py-3 border-l border-border/40" />
                    </tr>

                    {/* ── Month detail rows ── */}
                    {expanded.has(yg.year) && (
                      <tr className="border-b border-border/20">
                        <td colSpan={5 + (target1 ? 2 : 0) + (target2 ? 2 : 0) + 1} className="p-0">
                          <table className="w-full text-xs bg-white/[0.015]">
                            <tbody>
                              {yg.rows.map(r => {
                                const rowDeficit = r.deficit1 || r.deficit2
                                return (
                                  <tr key={r.ym} className={`border-b border-border/20 transition-colors ${
                                    rowDeficit ? 'bg-red-500/[0.04]' : 'hover:bg-white/[0.02]'
                                  }`}>
                                    <td className="w-8" />
                                    {/* Month name */}
                                    <td className="px-3 py-2 pl-10 text-slate-300 whitespace-nowrap">
                                      <div className="flex items-center gap-1.5">
                                        {rowDeficit && <AlertTriangle size={9} className="text-red-400 shrink-0" />}
                                        {formatMonth(r.ym)}
                                      </div>
                                    </td>
                                    {/* Budget */}
                                    <td className="px-3 py-2 text-right">
                                      <span className={`mono ${r.hasOverride ? 'text-accent' : 'text-slate-400'}`}>
                                        {r.budget > 0 ? usd(r.budget) : <span className="text-muted/40">—</span>}
                                      </span>
                                      {r.hasOverride && <span className="ml-1 text-[9px] text-accent uppercase">custom</span>}
                                    </td>
                                    {/* Standard split */}
                                    <td className="px-3 py-2 text-right mono text-yellow-400/80">
                                      {r.budget > 0 ? usd(r.stdMortgage) : <span className="text-muted/40">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right mono text-green-400/80">
                                      {r.budget > 0 ? usd(r.stdInvest) : <span className="text-muted/40">—</span>}
                                    </td>
                                    {/* Target #1 */}
                                    {target1 && (
                                      <>
                                        <td className="px-3 py-2 text-right border-l border-border/40">
                                          <div className="flex flex-col items-end gap-0.5">
                                            <span className={`mono ${r.carry1Out > 0 ? 'text-red-400' : 'text-accent/80'}`}>
                                              {r.budget > 0 ? usd(r.m1 ?? 0) : <span className="text-muted/40">—</span>}
                                            </span>
                                            {r.carry1In > 0 && <span className="text-[9px] text-red-400/70">+{usd(r.carry1In)} carried in</span>}
                                            {r.carry1Out > 0 && <span className="text-[9px] text-red-400/70">{usd(r.carry1Out)} short</span>}
                                          </div>
                                        </td>
                                        <td className="px-3 py-2 text-right mono text-accent/60">
                                          {r.budget > 0 ? usd(r.i1 ?? 0) : <span className="text-muted/40">—</span>}
                                        </td>
                                      </>
                                    )}
                                    {/* Target #2 */}
                                    {target2 && (
                                      <>
                                        <td className="px-3 py-2 text-right border-l border-border/40">
                                          <div className="flex flex-col items-end gap-0.5">
                                            <span className={`mono ${r.carry2Out > 0 ? 'text-red-400' : 'text-amber-400/80'}`}>
                                              {r.budget > 0 ? usd(r.m2 ?? 0) : <span className="text-muted/40">—</span>}
                                            </span>
                                            {r.carry2In > 0 && <span className="text-[9px] text-red-400/70">+{usd(r.carry2In)} carried in</span>}
                                            {r.carry2Out > 0 && <span className="text-[9px] text-red-400/70">{usd(r.carry2Out)} short</span>}
                                          </div>
                                        </td>
                                        <td className="px-3 py-2 text-right mono text-amber-400/60">
                                          {r.budget > 0 ? usd(r.i2 ?? 0) : <span className="text-muted/40">—</span>}
                                        </td>
                                      </>
                                    )}
                                    {/* Override input */}
                                    <td className="px-3 py-2 text-right border-l border-border/40">
                                      <div className="relative inline-flex">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted pointer-events-none">$</span>
                                        <input
                                          type="number" min="0" step="50"
                                          value={monthBudgets[r.ym] ?? ''}
                                          onChange={e => updateMonthBudget(r.ym, e.target.value)}
                                          placeholder="—"
                                          className="w-24 bg-surface border border-border/60 rounded px-2 py-1 text-xs mono focus:outline-none focus:border-accent transition-colors pl-5 text-right"
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}

                  </Fragment>
                ))}
              </tbody>

              {/* Grand totals footer */}
              {grandTotals.budget > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border/60 bg-white/[0.02]">
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 text-slate-400 font-semibold text-xs whitespace-nowrap">Total</td>
                    <td className="px-3 py-3 text-right mono font-bold text-slate-300">{usd(grandTotals.budget)}</td>
                    <td className="px-3 py-3 text-right mono font-bold text-yellow-400">{usd(grandTotals.stdMortgage)}</td>
                    <td className="px-3 py-3 text-right mono font-bold text-green-400">{usd(grandTotals.stdInvest)}</td>
                    {target1 && (
                      <>
                        <td className="px-3 py-3 text-right mono font-bold text-accent border-l border-border/40">{usd(grandTotals.m1)}</td>
                        <td className="px-3 py-3 text-right mono font-bold text-accent/70">{usd(grandTotals.i1)}</td>
                      </>
                    )}
                    {target2 && (
                      <>
                        <td className="px-3 py-3 text-right mono font-bold text-amber-400 border-l border-border/40">{usd(grandTotals.m2)}</td>
                        <td className="px-3 py-3 text-right mono font-bold text-amber-400/70">{usd(grandTotals.i2)}</td>
                      </>
                    )}
                    <td className="border-l border-border/40" />
                  </tr>
                  {/* Invest delta vs standard split */}
                  {hasTargets && (
                    <tr>
                      <td className="px-3 pb-2" />
                      <td className="px-3 pb-2 text-[10px] text-muted" colSpan={3}>invest delta vs. standard split →</td>
                      <td />
                      {target1 && (
                        <>
                          <td className="px-3 pb-2 text-right border-l border-border/40" />
                          <td className="px-3 pb-2 text-right">
                            {(() => {
                              const d = grandTotals.i1 - grandTotals.stdInvest
                              return <span className={`mono text-xs font-semibold ${d >= 0 ? 'text-green-400' : 'text-red-400'}`}>{d >= 0 ? '+' : '−'}{usd(Math.abs(d))}</span>
                            })()}
                          </td>
                        </>
                      )}
                      {target2 && (
                        <>
                          <td className="px-3 pb-2 text-right border-l border-border/40" />
                          <td className="px-3 pb-2 text-right">
                            {(() => {
                              const d = grandTotals.i2 - grandTotals.stdInvest
                              return <span className={`mono text-xs font-semibold ${d >= 0 ? 'text-green-400' : 'text-red-400'}`}>{d >= 0 ? '+' : '−'}{usd(Math.abs(d))}</span>
                            })()}
                          </td>
                        </>
                      )}
                      <td className="border-l border-border/40" />
                    </tr>
                  )}
                </tfoot>
              )}
            </table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-[10px] text-muted">
            <span>Click a year row to expand · months with a <span className="text-accent">blue "custom"</span> label use a per-month budget override.</span>
            {hasTargets && (
              <span className="flex items-center gap-1">
                <AlertTriangle size={9} className="text-red-400" />
                Red = under-funded month; shortfall carries forward to the next month's required amount.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[10px] text-muted border-t border-border/30 pt-4 leading-relaxed">
        Uses approximate 2024 federal and state marginal tax rates. Effective mortgage rate assumes itemized deductions
        exceed the standard deduction; actual deductibility depends on your full tax situation. Capital gains
        rates assume long-term (held &gt;1 year). Investment returns are not guaranteed — past market performance
        does not predict future results. Consult a tax professional and financial advisor for personalized advice.
      </p>
    </div>
  )
}
