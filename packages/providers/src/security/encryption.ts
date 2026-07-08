import crypto from 'crypto'
import { db, aetherSecrets } from '@aether/database'
import { AppError, ErrorCode } from '@aether/shared'
import { eq } from 'drizzle-orm'

const ALGORITHM = 'aes-256-gcm'

function getEncryptionKey(): Buffer {
  const rawKey = process.env.ENCRYPTION_KEY
  if (!rawKey) {
    throw new AppError({
      code: ErrorCode.NOT_CONFIGURED,
      message: 'ENCRYPTION_KEY environment variable is not defined',
    })
  }
  // Generate a 32-byte key from the configured key using SHA-256 hash
  return crypto.createHash('sha256').update(rawKey).digest()
}

export async function encryptSecret(secret: string): Promise<string> {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(secret, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')

  const id = crypto.randomUUID()
  await db.insert(aetherSecrets).values({
    id,
    encryptedValue: encrypted,
    iv: iv.toString('hex'),
    tag,
  })

  return id
}

export async function decryptSecret(secretId: string): Promise<string> {
  const secretRow = await db.query.aetherSecrets.findFirst({
    where: eq(aetherSecrets.id, secretId),
  })

  if (!secretRow) {
    throw new AppError({
      code: ErrorCode.INVALID_INPUT,
      message: `Secret with ID ${secretId} not found`,
    })
  }

  const key = getEncryptionKey()
  const iv = Buffer.from(secretRow.iv, 'hex')
  const tag = Buffer.from(secretRow.tag, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(secretRow.encryptedValue, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

export async function resolveSecret(secretRef: string): Promise<string> {
  if (secretRef.startsWith('env:')) {
    const varName = secretRef.slice(4)
    const val = process.env[varName]
    if (!val) {
      throw new AppError({
        code: ErrorCode.NOT_CONFIGURED,
        message: `Environment secret ${varName} is missing`,
      })
    }
    return val
  }
  return decryptSecret(secretRef)
}
