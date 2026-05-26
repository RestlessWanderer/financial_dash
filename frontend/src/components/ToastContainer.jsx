import { X, Bell } from 'lucide-react'

export default function ToastContainer({ toasts, dismiss }) {
  if (!toasts.length) return null

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map(toast => (
        toast.isMilestone ? (
          /* ── Milestone toast ── */
          <div
            key={toast.id}
            className="flex items-start gap-3 bg-panel border border-emerald-500/40 rounded-xl px-4 py-3 shadow-2xl animate-slide-in"
          >
            <div className="mt-0.5 text-xl leading-none shrink-0">{toast.emoji}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-400">{toast.title}</p>
              <p className="text-xs text-muted mt-0.5">{toast.body}</p>
            </div>
            <button onClick={() => dismiss(toast.id)} className="text-muted hover:text-slate-200 mt-0.5 shrink-0">
              <X size={14} />
            </button>
          </div>
        ) : (
          /* ── Stock alert toast ── */
          <div
            key={toast.id}
            className="flex items-start gap-3 bg-panel border border-accent/40 rounded-xl px-4 py-3 shadow-2xl animate-slide-in"
          >
            <div className="mt-0.5 p-1.5 rounded-lg bg-accent/10 shrink-0">
              <Bell size={14} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                🚨 {toast.ticker}
                {toast.price && (
                  <span className="mono ml-1 text-accent">${toast.price.toFixed(2)}</span>
                )}
              </p>
              <p className="text-xs text-muted mt-0.5 truncate">{toast.rule_name}</p>
            </div>
            <button onClick={() => dismiss(toast.id)} className="text-muted hover:text-slate-200 mt-0.5 shrink-0">
              <X size={14} />
            </button>
          </div>
        )
      ))}
    </div>
  )
}
