/**
 * Encrypted backup file: your budget plan + all account data, encrypted in
 * the browser with a password (PBKDF2-SHA256 -> AES-256-GCM). The file is
 * useless without the password, and the password is never stored.
 */
import { z } from 'zod'
import { ProfileSchema, type Profile } from '../model/profile'
import { FinanceDataSchema, type FinanceData } from './types'

export const BACKUP_ITERATIONS = 600_000

const FileSchema = z.object({
  app: z.literal('take-home-budget'),
  format: z.literal(1),
  kdf: z.object({ name: z.literal('PBKDF2'), hash: z.literal('SHA-256'), iterations: z.number().int().min(100_000) }),
  cipher: z.literal('AES-GCM'),
  compressed: z.boolean(),
  salt: z.string(),
  iv: z.string(),
  data: z.string(),
  createdAt: z.string(),
})

const PayloadSchema = z.object({ profile: ProfileSchema, finance: FinanceDataSchema })
export interface BackupPayload {
  profile: Profile
  finance: FinanceData
}

const b64 = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function key(password: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer())
}

export async function createBackup(payload: BackupPayload, password: string, opts: { iterations?: number; now?: Date } = {}): Promise<string> {
  if (password.length < 8) throw new Error('Use a password of at least 8 characters.')
  const iterations = opts.iterations ?? BACKUP_ITERATIONS
  let bytes: Uint8Array = new TextEncoder().encode(JSON.stringify(payload))
  const compressed = typeof CompressionStream !== 'undefined'
  if (compressed) bytes = await pipe(bytes, new CompressionStream('gzip'))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(password, salt, iterations), bytes as BufferSource))
  return JSON.stringify({
    app: 'take-home-budget',
    format: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations },
    cipher: 'AES-GCM',
    compressed,
    salt: b64(salt),
    iv: b64(iv),
    data: b64(cipher),
    createdAt: (opts.now ?? new Date()).toISOString(),
  })
}

export class BackupError extends Error {}

export async function readBackup(fileText: string, password: string): Promise<BackupPayload> {
  let header: z.infer<typeof FileSchema>
  try {
    header = FileSchema.parse(JSON.parse(fileText))
  } catch {
    throw new BackupError("This isn't a Take-Home Budget backup file.")
  }
  let bytes: Uint8Array
  try {
    const k = await key(password, unb64(header.salt), header.kdf.iterations)
    bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(header.iv) as BufferSource }, k, unb64(header.data) as BufferSource))
  } catch {
    throw new BackupError('Wrong password, or the file was changed.')
  }
  if (header.compressed) bytes = await pipe(bytes, new DecompressionStream('gzip'))
  const parsed = PayloadSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)))
  if (!parsed.success) throw new BackupError('The backup was decrypted but its contents are not valid.')
  return parsed.data
}
