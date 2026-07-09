import { describe, expect, it } from 'vitest'
import { getBuiltIn, listBuiltIn } from '../index.js'

describe('built-in agents', () => {
  it('lists only the QA Web Agent in PR-2', () => {
    const ids = listBuiltIn().map((agent) => agent.manifest.id)
    expect(ids).toEqual(['qa-web-agent'])
  })

  it('registers qa-web-agent as published, protected, code-defined', () => {
    const agent = getBuiltIn('qa-web-agent')
    expect(agent).toBeDefined()
    expect(agent?.manifest.source).toBe('code')
    expect(agent?.manifest.status).toBe('published')
    expect(agent?.manifest.protected).toBe(true)
    expect(agent?.manifest.category).toBe('qa')
  })

  it('declares the browser tool ids for qa-web-agent', () => {
    const agent = getBuiltIn('qa-web-agent')
    expect(agent?.manifest.toolIds).toEqual([
      'browser.navigate',
      'browser.snapshot',
      'browser.click',
      'browser.type',
      'browser.screenshot',
    ])
  })

  it('returns undefined for unknown agents', () => {
    expect(getBuiltIn('nope')).toBeUndefined()
  })
})
