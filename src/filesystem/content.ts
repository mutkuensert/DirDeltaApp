import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { pipeline } from 'node:stream/promises'

export function checkCancelled(signal: AbortSignal) { signal.throwIfAborted() }
export async function hashFile(file: string, signal: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash, { signal })
  return hash.digest('hex')
}
