'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { toastReducer, type Toast, type ToastInput, type ToastVariant } from './toast-reducer'

const AUTO_DISMISS_MS = 4000
const EXIT_MS = 200

interface ToastApi {
  readonly show: (input: ToastInput) => void
  readonly success: (title: string, description?: string) => void
  readonly error: (title: string, description?: string) => void
  readonly info: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

function makeToast(input: ToastInput): Toast {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return {
    id,
    variant: input.variant,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, [])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const clearTimer = useCallback((id: string) => {
    const handle = timers.current.get(id)
    if (handle) {
      clearTimeout(handle)
      timers.current.delete(id)
    }
  }, [])

  const scheduleRemoval = useCallback(
    (id: string) => {
      clearTimer(id)
      const handle = setTimeout(() => dispatch({ type: 'remove', id }), EXIT_MS)
      timers.current.set(id, handle)
    },
    [clearTimer],
  )

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id)
      dispatch({ type: 'dismiss', id })
      scheduleRemoval(id)
    },
    [clearTimer, scheduleRemoval],
  )

  const show = useCallback(
    (input: ToastInput) => {
      const toast = makeToast(input)
      dispatch({ type: 'add', toast })
      if (input.variant !== 'error') {
        const handle = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS)
        timers.current.set(toast.id, handle)
      }
    },
    [dismiss],
  )

  const api: ToastApi = {
    show,
    success: (title, description) =>
      show({ variant: 'success', title, ...(description ? { description } : {}) }),
    error: (title, description) =>
      show({ variant: 'error', title, ...(description ? { description } : {}) }),
    info: (title, description) =>
      show({ variant: 'info', title, ...(description ? { description } : {}) }),
  }

  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((handle) => clearTimeout(handle))
      map.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-4 z-[500] flex w-[min(92vw,24rem)] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(handle)
  }, [])
  const entered = mounted && !toast.leaving
  const transform = entered || toast.leaving ? 'translate-y-0' : 'translate-y-4'
  const opacity = entered ? 'opacity-100' : 'opacity-0'
  const duration = toast.leaving ? 'duration-200' : 'duration-[420ms]'
  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      className={[
        'pointer-events-auto flex items-start gap-3 border border-[var(--color-muted)]/40 bg-[var(--color-surface)] px-4 py-3',
        'shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-[opacity,transform] ease-out',
        duration,
        transform,
        opacity,
      ].join(' ')}
    >
      <ToastIcon variant={toast.variant} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--color-primary)]">{toast.title}</p>
        {toast.description ? (
          <p className="mt-1 break-words text-xs text-[var(--color-muted)]">{toast.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-primary)]"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') {
    return (
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" aria-hidden />
    )
  }
  if (variant === 'error') {
    return (
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger)]" aria-hidden />
    )
  }
  return <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-taupe)]" aria-hidden />
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}
