import { useState, useEffect, useMemo } from 'react'
import { api } from '../api'
import { ShieldAlert, ShieldCheck, Shield } from 'lucide-react'

// ── localStorage keys ────────────────────────────────────────────
const LS_DEFAULTS = 'budget_defaults'
const LS_CUSTOM   = 'budget_custom_labels'
const LS_NE       = 'budget_ne_flags'
const LS_CONFIG   = 'emergency_fund_config'  // { stMonths, ltMonths, accountTags: { [id]: 'short'|'long'|'both'|'none' } }

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}

function saveConfig(cfg) {
  localStorage.setItem(LS_CONFIG, JSON.stringify(cfg))
}

function usd(n) {
  return (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ── SVG Arc Gauge ────────────────────────────────────────────────
// Renders a half-circle gauge with colour zones and a needle.
// pct: 0–100+ (capped visually at 110 so "overfunded" shows clearly)
function ArcGauge({ pct, label, sublabel }) {
  const R   = 80
  const cx  = 100
  const cy  = 95
  const clampedPct = Math.min(110, Math.max(0, pct))

  // Arc from 180° (left) to 0° (right) — a half circle
  // angle: 180° at 0%, 0° at 100%
  const degToRad = (d) => (d * Math.PI) / 180
  const pctToAngle = (p) => 180 - (p / 100) * 180  // 180→0 degrees as pct goes 0→100

  function arcPath(startPct, endPct, r, inset = 0) {
    const ri = r - inset
    const a1 = degToRad(pctToAngle(startPct))
    const a2 = degToRad(pctToAngle(endPct))
    const x1 = cx + ri * Math.cos(a1)
    const y1 = cy - ri * Math.sin(a1)
    const x2 = cx + ri * Math.cos(a2)
    const y2 = cy - ri * Math.sin(a2)
    const large = endPct - startPct > 50 ? 1 : 0
    return `M ${x1} ${y1} A ${ri} ${ri} 0 ${large} 0 ${x2} ${y2}`
  }

  // Colour zones: 0–25 red, 25–50 orange, 50–75 yellow, 75–100 green
  const zones = [
    { from: 0,  to: 25,  color: '#ef4444' },
    { from: 25, to: 50,  color: '#f97316' },
    { from: 50, to: 75,  color: '#eab308' },
    { from: 75, to: 100, color: '#22c55e' },
  ]

  // Needle
  const needleAngle = degToRad(pctToAngle(clampedPct))
  const needleLen = R - 8
  const nx = cx + needleLen * Math.cos(needleAngle)
  const ny = cy - needleLen * Math.sin(needleAngle)

  // Status label
  const status = pct >= 100 ? { text: 'Secure', color: '#22c55e', Icon: ShieldCheck }
    : pct >= 75             ? { text: 'Almost There', color: '#86efac', Icon: Shield }
    : pct >= 50             ? { text: 'Caution', color: '#eab308', Icon: Shield }
    : pct >= 25             ? { text: 'Warning', color: '#f97316', Icon: ShieldAlert }
    :                         { text: 'Danger', color: '#ef4444', Icon: ShieldAlert }

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="200" height="115" viewBox="0 0 200 115">
        {/* Background track */}
        <path d={arcPath(0, 100, R, 0)} stroke="#ffffff0f" strokeWidth="18" fill="none" strokeLinecap="round" />
        {/* Zone arcs */}
        {zones.map(z => (
          <path key={z.from} d={arcPath(z.from, z.to, R, 0)}
            stroke={z.color} strokeWidth="18" fill="none" strokeOpacity="0.25" />
        ))}
        {/* Filled progress arc */}
        {clampedPct > 0 && (
          <path d={arcPath(0, clampedPct, R, 0)}
            stroke={status.color} strokeWidth="18" fill="none" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${status.color}55)` }} />
        )}
        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny}
          stroke={status.color} strokeWidth="2.5" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${status.color}88)` }} />
        <circle cx={cx} cy={cy} r="5" fill={status.color} />
        {/* Centre label */}
        <text x={cx} y={cy - 14} textAnchor="middle" fontSize="15" fontWeight="700"
          fill={status.color} fontFamily="monospace">
          {pct.toFixed(0)}%
        </text>
      </svg>
      <div className="flex items-center gap-1.5 -mt-2">
        <status.Icon size={13} style={{ color: status.color }} />
        <span className="text-xs font-semibold" style={{ color: status.color }}>{status.text}</span>
      </div>
      <p className="text-sm font-semibold text-slate-200 mt-0.5">{label}</p>
      {sublabel && <p className="text-[11px] text-muted">{sublabel}</p>}
    </div>
  )
}

// ── Month slider ──────────────────────────────────────────────────
function MonthSlider({ value, min, max, onChange, label }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-muted w-28 shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-accent h-1.5"
      />
      <span className="mono text-xs font-semibold text-slate-200 w-16 text-right">
        {value} mo{value !== 1 ? 's' : ''}
      </span>
    </div>
  )
}

// ── Account tag badge ─────────────────────────────────────────────
const TAG_OPTS = [
  { value: 'none',  label: 'None',       cls: 'bg-transparent text-muted border-border/40' },
  { value: 'short', label: 'Short-term', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  { value: 'long',  label: 'Long-term',  cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  { value: 'both',  label: 'Both',       cls: 'bg-accent/20 text-accent border-accent/40' },
]

function TagCycle({ value, onChange }) {
  const current = TAG_OPTS.find(t => t.value === value) ?? TAG_OPTS[0]
  const next    = TAG_OPTS[(TAG_OPTS.indexOf(current) + 1) % TAG_OPTS.length]
  return (
    <button
      onClick={() => onChange(next.value)}
      className={`text-[10px] px-2 py-0.5 rounded border font-semibold transition-colors ${current.cls}`}
      title="Click to cycle: None → Short-term → Long-term → Both"
    >
      {current.label}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────
export default function EmergencyFundPage() {
  const [accounts,    setAccounts]   = useState([])
  const [loadingAcct, setLoadingAcct]= useState(true)
  const [config,      setConfig]     = useState(() => load(LS_CONFIG, { stMonths: 3, ltMonths: 6, accountTags: {} }))

  // Budget data from localStorage
  const defaults      = load(LS_DEFAULTS, {})
  const customLabels  = load(LS_CUSTOM, [])
  const neFlags       = new Set(load(LS_NE, []))

  useEffect(() => {
    Promise.allSettled([api.getLiquidAccounts(), api.getBrokerageAccounts()])
      .then(([liquidRes, brokerageRes]) => {
        const liquid    = liquidRes.status    === 'fulfilled' ? liquidRes.value    : []
        const brokerage = brokerageRes.status === 'fulfilled' ? brokerageRes.value : []
        // Tag each with a source so we can label them in the UI
        const all = [
          ...liquid.map(a    => ({ ...a, _source: 'Liquid',    _key: `liquid_${a.id}`,    balance: a.value })),
          ...brokerage.map(a => ({ ...a, _source: 'Brokerage', _key: `brokerage_${a.id}`, balance: a.value })),
        ]
        setAccounts(all)
      })
      .finally(() => setLoadingAcct(false))
  }, [])

  function updateConfig(patch) {
    setConfig(prev => {
      const next = { ...prev, ...patch }
      saveConfig(next)
      return next
    })
  }

  function setTag(key, tag) {
    updateConfig({ accountTags: { ...config.accountTags, [key]: tag } })
  }

  // ── Monthly expense math from budget defaults ─────────────────
  const { essentialMonthly, totalMonthly } = useMemo(() => {
    const housing   = parseFloat(defaults.housing)   || 0
    const utilities = parseFloat(defaults.utilities) || 0
    const groceries = parseFloat(defaults.groceries) || 0

    let essentialCustom = 0
    let allCustom       = 0
    customLabels.forEach((_, i) => {
      const key = `custom_${i}`
      const val = parseFloat(defaults[key]) || 0
      allCustom += val
      if (!neFlags.has(key)) essentialCustom += val
    })

    const essential = housing + utilities + groceries + essentialCustom
    const total     = essential + (allCustom - essentialCustom)  // total = essential + NE
    // Also add income (pay1/pay2 are income, not expenses — don't include)
    return { essentialMonthly: essential, totalMonthly: total }
  }, [defaults, customLabels, neFlags])

  // ── Targets ───────────────────────────────────────────────────
  const stTarget = essentialMonthly * config.stMonths
  const ltTarget = totalMonthly     * config.ltMonths

  // ── Current balances by tag ───────────────────────────────────
  const { stBalance, ltBalance } = useMemo(() => {
    let st = 0, lt = 0
    accounts.forEach(a => {
      const tag = config.accountTags[a._key] ?? 'none'
      if (tag === 'short' || tag === 'both') st += a.balance ?? 0
      if (tag === 'long'  || tag === 'both') lt += a.balance ?? 0
    })
    return { stBalance: st, ltBalance: lt }
  }, [accounts, config.accountTags])

  const stPct = stTarget > 0 ? (stBalance / stTarget) * 100 : 0
  const ltPct = ltTarget > 0 ? (ltBalance / ltTarget) * 100 : 0

  const hasBudgetData = essentialMonthly > 0 || totalMonthly > 0

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-semibold">Emergency Fund</h1>
        <p className="text-xs text-muted mt-0.5">
          Track your short and long-term safety nets — funded from your budget expenses.
        </p>
      </div>

      {/* ── No budget data warning ───────────────────────────────── */}
      {!hasBudgetData && (
        <div className="card border-amber-500/20 bg-amber-500/[0.04] text-amber-300 text-sm px-4 py-3 flex items-start gap-2">
          <ShieldAlert size={16} className="shrink-0 mt-0.5" />
          <span>
            No budget defaults found. Head to the <strong>Budget</strong> page and fill in your monthly expenses —
            those numbers drive the targets here.
          </span>
        </div>
      )}

      {/* ── Gauges ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Short-term */}
        <div className="card space-y-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Short-Term Fund</h2>
              <p className="text-[11px] text-muted mt-0.5">Essential expenses only · housing, utilities, groceries + non-NE categories</p>
            </div>
            <span className="text-[10px] text-blue-400 bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 rounded font-semibold shrink-0">Short-term</span>
          </div>

          <div className="flex justify-center">
            <ArcGauge
              pct={stPct}
              label={`${usd(stBalance)} saved`}
              sublabel={`Target: ${usd(stTarget)}`}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <StatTile label="Saved"    value={usd(stBalance)} color="text-slate-200" />
            <StatTile label="Target"   value={usd(stTarget)}  color="text-slate-400" />
            <StatTile label="Remaining" value={stBalance >= stTarget ? '✓ Funded' : usd(Math.max(0, stTarget - stBalance))}
              color={stBalance >= stTarget ? 'text-emerald-400' : 'text-amber-400'} />
          </div>

          <div className="border-t border-border/40 pt-4 space-y-3">
            <p className="text-[11px] text-muted uppercase tracking-widest font-medium">Coverage</p>
            <MonthSlider
              label="Months of expenses"
              value={config.stMonths} min={1} max={6}
              onChange={v => updateConfig({ stMonths: v })}
            />
            <div className="text-[11px] text-muted space-y-0.5 pt-1">
              <p>Essential monthly expenses: <span className="text-slate-300 mono font-medium">{usd(essentialMonthly)}</span></p>
              <p className="text-[10px] opacity-60">Housing + utilities + groceries + essential custom categories (non-NE)</p>
            </div>
          </div>
        </div>

        {/* Long-term */}
        <div className="card space-y-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Long-Term Fund</h2>
              <p className="text-[11px] text-muted mt-0.5">All expenses including non-essential · full lifestyle coverage</p>
            </div>
            <span className="text-[10px] text-purple-400 bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 rounded font-semibold shrink-0">Long-term</span>
          </div>

          <div className="flex justify-center">
            <ArcGauge
              pct={ltPct}
              label={`${usd(ltBalance)} saved`}
              sublabel={`Target: ${usd(ltTarget)}`}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <StatTile label="Saved"    value={usd(ltBalance)} color="text-slate-200" />
            <StatTile label="Target"   value={usd(ltTarget)}  color="text-slate-400" />
            <StatTile label="Remaining" value={ltBalance >= ltTarget ? '✓ Funded' : usd(Math.max(0, ltTarget - ltBalance))}
              color={ltBalance >= ltTarget ? 'text-emerald-400' : 'text-amber-400'} />
          </div>

          <div className="border-t border-border/40 pt-4 space-y-3">
            <p className="text-[11px] text-muted uppercase tracking-widest font-medium">Coverage</p>
            <MonthSlider
              label="Months of expenses"
              value={config.ltMonths} min={3} max={24}
              onChange={v => updateConfig({ ltMonths: v })}
            />
            <div className="text-[11px] text-muted space-y-0.5 pt-1">
              <p>Total monthly expenses: <span className="text-slate-300 mono font-medium">{usd(totalMonthly)}</span></p>
              <p className="text-[10px] opacity-60">All budget categories including non-essential spending</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Account tagging ──────────────────────────────────────── */}
      <div className="card space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Linked Accounts</h2>
          <p className="text-[11px] text-muted mt-0.5">
            Tag each liquid or brokerage account to count toward your short-term fund, long-term fund, or both.
            Click the badge to cycle through options.
          </p>
        </div>

        {loadingAcct ? (
          <p className="text-sm text-muted py-4 text-center">Loading accounts…</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">
            No accounts found. Add liquid accounts on the <strong className="text-slate-300">Liquid Assets</strong> page
            or brokerage accounts on the <strong className="text-slate-300">Brokerage</strong> page.
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {accounts.map(a => {
              const tag = config.accountTags[a._key] ?? 'none'
              return (
                <div key={a._key} className="flex items-center justify-between py-3 gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{a.name}</p>
                    <p className="text-[11px] text-muted">
                      {a._source} · {a.account_type}
                      {a.apy ? ` · ${a.apy}% APY` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="mono text-sm font-semibold text-emerald-400">{usd(a.balance)}</span>
                    <TagCycle value={tag} onChange={v => setTag(a._key, v)} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Tag legend */}
        <div className="border-t border-border/30 pt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[10px] text-muted">
          <span className="font-medium text-slate-400 uppercase tracking-wider">Tags:</span>
          {TAG_OPTS.filter(t => t.value !== 'none').map(t => (
            <span key={t.value}>
              <span className={`font-semibold ${t.cls.includes('blue') ? 'text-blue-400' : t.cls.includes('purple') ? 'text-purple-400' : 'text-accent'}`}>{t.label}</span>
              {' '}— counts toward {t.value === 'both' ? 'both funds' : `${t.value}-term fund`}
            </span>
          ))}
        </div>
      </div>

      {/* ── Guidance card ────────────────────────────────────────── */}
      <div className="card border-border/40 bg-surface/30 space-y-3">
        <h2 className="text-sm font-semibold text-slate-200">Emergency Fund Guidelines</h2>
        <div className="grid grid-cols-2 gap-4 text-[11px] text-muted">
          <div className="space-y-2">
            <p className="font-semibold text-slate-300 uppercase tracking-wide text-[10px]">Short-Term (1–3 months)</p>
            <p>Covers immediate disruptions — job loss, medical bill, car repair. Should be in a liquid, instantly accessible account like a HYSA or checking account. Rule of thumb: <span className="text-slate-300">3 months of essential expenses</span>.</p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-slate-300 uppercase tracking-wide text-[10px]">Long-Term (6–12 months)</p>
            <p>Covers extended disruptions — prolonged job loss, major health events, economic downturns. Can be in slightly less liquid accounts (money market, short-term CD). Rule of thumb: <span className="text-slate-300">6–12 months of total expenses</span>.</p>
          </div>
        </div>
        <div className="border-t border-border/30 pt-3 flex flex-wrap gap-x-8 gap-y-1.5 text-[10px] text-muted">
          <span className="font-medium text-slate-400 uppercase tracking-wider">Status:</span>
          <span><span className="font-semibold text-rose-400">Danger</span> — under 25% funded</span>
          <span><span className="font-semibold text-orange-400">Warning</span> — 25–49% funded</span>
          <span><span className="font-semibold text-yellow-400">Caution</span> — 50–74% funded</span>
          <span><span className="font-semibold text-emerald-400">Secure</span> — 100%+ funded</span>
        </div>
      </div>

    </div>
  )
}

function StatTile({ label, value, color }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-border/40 px-3 py-2.5">
      <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className={`mono text-sm font-bold leading-none ${color}`}>{value}</p>
    </div>
  )
}
