import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createReadStream, createWriteStream } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import type { Comparison, Progress, Side } from '../types'
import type { CopyItem } from '../application/contracts'
import { safePath } from './paths'
import { checkCancelled, hashFile } from './content'

export async function planCopy(comparison: Comparison, side: Side, requested: readonly string[]): Promise<CopyItem[]> {
  const destinationSide: Side = side === 'left' ? 'right' : 'left', selected = new Set(requested)
  if (!selected.size) return []
  for (const relative of selected) if (!comparison.rows.some(row => row.path === relative && row[side])) throw new Error('Item not found. Compare again.')
  const selectedPaths = [...selected]
  const items: CopyItem[] = []
  for (const row of comparison.rows) {
    const entry = row[side]
    if (!entry || !selectedPaths.some(selectedPath => row.path === selectedPath || row.path.startsWith(selectedPath + path.sep))) continue
    const source = await safePath(comparison.roots[side], row.path), target = await safePath(comparison.roots[destinationSide], row.path)
    const stat = await fs.lstat(source)
    if ((stat.isDirectory() ? 'directory' : 'file') !== entry.kind) throw new Error('The source type has changed. Compare again.')
    const exists = await validateDestination(target, stat.isDirectory(), row.path)
    items.push({ relative: row.path, source, target, kind: entry.kind, exists, size: stat.size, modified: stat.mtimeMs })
  }
  return items.sort((a, b) => a.relative.split(path.sep).length - b.relative.split(path.sep).length)
}
export async function executeCopy(comparison: Comparison, side: Side, items: readonly CopyItem[], overwrite: boolean, signal: AbortSignal, progress: (p: Progress) => void = () => {}) {
  let copied = 0
  const destinationSide: Side = side === 'left' ? 'right' : 'left'
  for (const item of items) {
    checkCancelled(signal)
    const source = await safePath(comparison.roots[side], item.relative), target = await safePath(comparison.roots[destinationSide], item.relative)
    progress({ phase: 'Copying', path: item.relative, count: copied })
    if (item.kind === 'directory') { await fs.mkdir(target, { recursive: true }); copied++; continue }
    await copyFile({ ...item, source, target }, comparison.roots[destinationSide], { verifyHash: comparison.sha256, overwrite }, signal)
    copied++
  }
  return copied
}

async function validateDestination(target: string, sourceIsDirectory: boolean, relative: string): Promise<boolean> {
  try {
    const destination = await fs.lstat(target)
    if (destination.isDirectory() !== sourceIsDirectory || (!destination.isDirectory() && !destination.isFile())) {
      throw new Error(`File/folder conflict: ${relative}. Resolve the conflict manually first.`)
    }
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return false
  }
}

interface CopyPolicy {
  readonly verifyHash: boolean
  readonly overwrite: boolean
}

async function copyFile(item: CopyItem, destinationRoot: string, policy: CopyPolicy, signal: AbortSignal) {
  const { source, target } = item
  await fs.mkdir(path.dirname(target), { recursive: true })
  await safePath(destinationRoot, item.relative)
  const temporaryPath = path.join(path.dirname(target), `.dirdelta-${randomUUID()}.tmp`)
  try {
    const before = await fs.stat(source)
    if (before.size !== item.size || before.mtimeMs !== item.modified) throw new Error(`Source changed: ${item.relative}. Compare again.`)
    await pipeline(createReadStream(source), createWriteStream(temporaryPath, { flags: 'wx' }), { signal })
    checkCancelled(signal)
    if (policy.verifyHash && await hashFile(source, signal) !== await hashFile(temporaryPath, signal)) throw new Error(`SHA-256 verification failed: ${item.relative}`)
    const after = await fs.stat(source)
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error(`Source changed during copying: ${item.relative}`)
    await fs.chmod(temporaryPath, before.mode)
    await fs.utimes(temporaryPath, before.atime, before.mtime)
    await safePath(destinationRoot, item.relative)
    checkCancelled(signal)
    if (policy.overwrite && item.exists) await fs.rename(temporaryPath, target)
    else { await fs.link(temporaryPath, target); await fs.unlink(temporaryPath) }
  } finally { await fs.rm(temporaryPath, { force: true }) }
}
