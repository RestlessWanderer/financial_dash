import { useState, useEffect } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { BarChart2, Bell, Landmark, Home, PiggyBank, Briefcase, Layers, LayoutDashboard, Scale, Sun, Moon, Wallet, TrendingUp, Calculator, Milestone, CreditCard, UserCircle2, Pencil, Check, X } from 'lucide-react'
import { useAlertNotifications } from '../hooks/useAlertNotifications'
import ToastContainer from './ToastContainer'

const LS_PROFILE = 'user_profile'

function loadProfile() {
  try { return JSON.parse(localStorage.getItem(LS_PROFILE) ?? 'null') ?? {} } catch { return {} }
}

export default function Layout() {
  const { toasts, dismiss } = useAlertNotifications()

  const [light, setLight] = useState(() => {
    const saved = localStorage.getItem('theme') === 'light'
    // Apply class immediately (before first paint) to avoid flash
    if (saved) document.documentElement.classList.add('light')
    return saved
  })

  const [profile,        setProfile]        = useState(() => loadProfile())
  const [editingProfile, setEditingProfile] = useState(false)
  const [ageDraft,       setAgeDraft]       = useState('')
  const [retireDraft,    setRetireDraft]    = useState('')

  const openProfile = () => {
    setAgeDraft(profile.age    ?? '')
    setRetireDraft(profile.retireAge ?? '')
    setEditingProfile(true)
  }

  const cancelProfile = () => setEditingProfile(false)

  const saveProfile = () => {
    const age      = parseInt(ageDraft)    || null
    const retireAge = parseInt(retireDraft) || null
    const next = { ...profile, age, retireAge }
    setProfile(next)
    localStorage.setItem(LS_PROFILE, JSON.stringify(next))
    setEditingProfile(false)
  }

  const profileKd = (e) => {
    if (e.key === 'Enter') saveProfile()
    if (e.key === 'Escape') cancelProfile()
  }

  useEffect(() => {
    document.documentElement.classList.toggle('light', light)
    localStorage.setItem('theme', light ? 'light' : 'dark')
  }, [light])

  const nav = (to, Icon, label) => (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-accent/10 text-accent'
            : 'text-muted hover:text-slate-200 hover:bg-white/5'
        }`
      }
    >
      <Icon size={16} className="shrink-0" />
      <span>{label}</span>
    </NavLink>
  )

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-border bg-panel overflow-y-auto">

        {/* Logo / brand */}
        <div className="px-4 py-5 border-b border-border flex items-center gap-3 shrink-0">
          <Milestone size={22} className="text-accent shrink-0" />
          <span className="font-semibold tracking-tight text-base leading-tight text-slate-200">Financial Journey</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-2 space-y-0.5">
          <p className="text-[10px] text-muted uppercase tracking-widest px-3 pt-2 pb-1 select-none">Overview</p>
          {nav('/',          LayoutDashboard, 'Dashboard')}

          <p className="text-[10px] text-muted uppercase tracking-widest px-3 pt-3 pb-1">Stocks</p>
          {nav('/watchlist', BarChart2, 'Watchlist')}
          {nav('/alerts',    Bell,      'Alerts')}

          <p className="text-[10px] text-muted uppercase tracking-widest px-3 pt-3 pb-1">Financial Assets</p>
          {nav('/retirement', PiggyBank,   'Retirement')}
          {nav('/workstock',  Briefcase,  'Work Stock')}
          {nav('/brokerage',  TrendingUp, 'Brokerage')}
          {nav('/assets',     Layers,     'Physical Assets')}
          {nav('/liquid',     Wallet,     'Liquid Assets')}

          <p className="text-[10px] text-muted uppercase tracking-widest px-3 pt-3 pb-1">Planning</p>
          {nav('/budget',    Calculator, 'Budget')}
          {nav('/loans',     CreditCard, 'Loans')}
          {nav('/mortgage',  Home,       'Mortgage')}
          {nav('/strategy',  Scale,      'Payoff vs. Invest')}
          {nav('/dividends', Landmark,   'Dividends')}
        </nav>

        {/* ── Profile ───────────────────────────────────────────── */}
        <div className="p-2 border-t border-border shrink-0">
          {editingProfile ? (
            <div className="px-3 py-2 space-y-2">
              <p className="text-[10px] text-slate-200 uppercase tracking-widest font-medium">Profile</p>
              <div className="space-y-1.5">
                <div>
                  <label className="text-[10px] text-slate-200 block mb-0.5">Current Age</label>
                  <input
                    type="number" min="1" max="120"
                    value={ageDraft}
                    onChange={e => setAgeDraft(e.target.value)}
                    onKeyDown={profileKd}
                    placeholder="e.g. 34"
                    className="w-full bg-surface border border-border rounded px-2 py-1 text-xs mono focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-200 block mb-0.5">Desired Retirement Age</label>
                  <input
                    type="number" min="1" max="120"
                    value={retireDraft}
                    onChange={e => setRetireDraft(e.target.value)}
                    onKeyDown={profileKd}
                    placeholder="e.g. 65"
                    className="w-full bg-surface border border-border rounded px-2 py-1 text-xs mono focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-0.5">
                <button onClick={saveProfile}
                  className="flex items-center gap-1 bg-accent/15 text-accent border border-accent/30 px-2.5 py-1 rounded text-[11px] font-medium hover:bg-accent/25 transition-colors">
                  <Check size={11} /> Save
                </button>
                <button onClick={cancelProfile}
                  className="p-1 text-muted hover:text-slate-200 transition-colors">
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={openProfile}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-slate-200 hover:bg-white/5 transition-colors group"
            >
              <UserCircle2 size={16} className="shrink-0" />
              <span className="flex-1 text-left">
                {profile.age && profile.retireAge
                  ? <span className="text-xs">Age {profile.age} · Retire {profile.retireAge}</span>
                  : profile.age
                  ? <span className="text-xs">Age {profile.age}</span>
                  : 'Profile'}
              </span>
              <Pencil size={11} className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
            </button>
          )}
        </div>

        {/* ── Theme toggle ──────────────────────────────────────── */}
        <div className="p-2 border-t border-border shrink-0">
          <button
            onClick={() => setLight(l => !l)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-slate-200 hover:bg-white/5 transition-colors"
          >
            {light ? <Moon size={16} className="shrink-0" /> : <Sun size={16} className="shrink-0" />}
            <span>{light ? 'Dark mode' : 'Light mode'}</span>
          </button>
        </div>

      </aside>

      {/* ── Main content ────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>

      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
