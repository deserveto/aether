import { describe, it, expect } from 'vitest'
import { toastReducer, MAX_VISIBLE, type Toast } from '../toast-reducer'

const toast = (id: string): Toast => ({ id, variant: 'info', title: id })

describe('toastReducer', () => {
  it('adds a toast to an empty queue', () => {
    const next = toastReducer([], { type: 'add', toast: toast('a') })
    expect(next).toHaveLength(1)
    expect(next[0]?.id).toBe('a')
  })

  it('drops the oldest (FIFO) when exceeding MAX_VISIBLE', () => {
    const start: Toast[] = Array.from({ length: MAX_VISIBLE }, (_, i) => toast(`t${i}`))
    const next = toastReducer(start, { type: 'add', toast: toast('new') })
    expect(next).toHaveLength(MAX_VISIBLE)
    expect(next[0]?.id).toBe('t1')
    expect(next[next.length - 1]?.id).toBe('new')
  })

  it('marks a toast as leaving on dismiss without removing it', () => {
    const start = [toast('a'), toast('b')]
    const next = toastReducer(start, { type: 'dismiss', id: 'a' })
    expect(next).toHaveLength(2)
    expect(next[0]?.leaving).toBe(true)
    expect(next[1]?.leaving).toBeUndefined()
  })

  it('removes a toast by id', () => {
    const start = [toast('a'), toast('b')]
    const next = toastReducer(start, { type: 'remove', id: 'a' })
    expect(next).toHaveLength(1)
    expect(next[0]?.id).toBe('b')
  })

  it('returns state unchanged for unknown action types', () => {
    const start = [toast('a')]
    const next = toastReducer(start, { type: 'noop' } as never)
    expect(next).toBe(start)
  })
})
