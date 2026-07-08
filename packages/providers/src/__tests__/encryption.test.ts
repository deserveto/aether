import { describe, it, expect, beforeAll } from 'vitest'
import { initDb } from '@aether/database'
import { encryptSecret, decryptSecret, resolveSecret } from '../security/encryption.js'

describe('Secrets Management', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = 'file::memory:'
    process.env.ENCRYPTION_KEY = 'super-secret-key'
    await initDb()
  })

  it('can encrypt and decrypt a secret key', async () => {
    const secret = 'my-api-key-12345'
    const secretRef = await encryptSecret(secret)

    expect(secretRef).toBeDefined()
    expect(secretRef).not.toBe(secret)

    const decrypted = await decryptSecret(secretRef)
    expect(decrypted).toBe(secret)
  })

  it('can resolve secret from environment variable', async () => {
    process.env.TEST_API_KEY = 'env-value-999'
    const resolved = await resolveSecret('env:TEST_API_KEY')
    expect(resolved).toBe('env-value-999')
  })
})
