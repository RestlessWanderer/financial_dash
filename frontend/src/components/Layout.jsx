import { Outlet, NavLink } from 'react-router-dom'
import { BarChart2, Bell, Activity, Landmark, Home, Stethoscope, PiggyBank, Briefcase } from 'lucide-react'
import { useAlertNotifications } from '../hooks/useAlertNotifications'
import ToastContainer from './ToastContainer'

export default function Layout() {
  const { toasts, dismiss } = useAlertNotifications()

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
      <Icon size={16} />
      {label}
    </NavLink>
  )

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Stethoscope size={20} className="text-accent" />
            <span className="absolute -bottom-0.5 -right-1.5 text-[9px] font-black text-green-400 leading-none">$</span>
          </div>
          <span className="font-semibold tracking-tight">Financial Wellness</span>
        </div>
        <nav className="flex items-center gap-1">
          {nav('/',          BarChart2, 'Stock Watchlist')}
          {nav('/alerts',    Bell,      'Stock Alerts')}
          {nav('/dividends', Landmark,  'Dividends')}
          {nav('/mortgage',   Home,      'Mortgage')}
          {nav('/retirement', PiggyBank,  'Retirement')}
          {nav('/workstock',  Briefcase, 'Work Stock')}
        </nav>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>

      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
