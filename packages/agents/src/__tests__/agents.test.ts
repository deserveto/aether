import { describe, expect, it } from 'vitest'
import { getBuiltIn, listBuiltIn } from '../index.js'

describe('built-in agents', () => {
  it('lists both built-in agents (QA Web and Web Research)', () => {
    const ids = listBuiltIn().map((agent) => agent.manifest.id)
    expect(ids).toContain('qa-web-agent')
    expect(ids).toContain('web-research-agent')
    expect(ids).toHaveLength(2)
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
