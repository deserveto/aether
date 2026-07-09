export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  readonly id: string
  readonly variant: ToastVariant
  readonly title: string
  readonly description?: string
  readonly leaving?: boolean
}

export interface ToastInput {
  readonly variant: ToastVariant
  readonly title: string
  readonly description?: string
}

export type ToastAction =
  | { readonly type: 'add'; readonly toast: Toast }
  | { readonly type: 'dismiss'; readonly id: string }
  | { readonly type: 'remove'; readonly id: string }

export const MAX_VISIBLE = 5

export function toastReducer(state: readonly Toast[], action: ToastAction): Toast[] {
  switch (action.type) {
    case 'add': {
      const base = state.length >= MAX_VISIBLE ? state.slice(1) : state
      return [...base, action.toast]
    }
    case 'dismiss':
      return state.map((item) =>
        item.id === action.id && !item.leaving ? { ...item, leaving: true } : item,
      )
    case 'remove':
      return state.filter((item) => item.id !== action.id)
    default:
      return state as Toast[]
  }
}
