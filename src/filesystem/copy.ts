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
  for (const relative of selected) if (!comparison.rows.some(row => row.path === relative && row[side])) throw new Error('Öğe bulunamadı. Yeniden karşılaştırın.')
  const selectedPaths = [...selected]
  const items: CopyItem[] = []
  for (const row of comparison.rows) {
    const entry = row[side]
    if (!entry || !selectedPaths.some(selectedPath => row.path === selectedPath || row.path.startsWith(selectedPath + path.sep))) continue
    const source = await safePath(comparison.roots[side], row.path), target = await safePath(comparison.roots[destinationSide], row.path)
    const stat = await fs.lstat(source)
    if ((stat.isDirectory() ? 'directory' : 'file') !== entry.kind) throw new Error('Kaynak türü değişti. Yeniden karşılaştırın.')
    let exists = false
    try {
      const destinationStat = await fs.lstat(target); exists = true
      if (destinationStat.isDirectory() !== stat.isDirectory() || (!destinationStat.isDirectory() && !destinationStat.isFile())) throw new Error(`Dosya/klasör çakışması: ${row.path}. Önce çakışmayı elle çözün.`)
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
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
    progress({ phase: 'Kopyalanıyor', path: item.relative, count: copied })
    if (item.kind === 'directory') { await fs.mkdir(target, { recursive: true }); copied++; continue }
    await copyFile(item, source, target)
    copied++
  }
  return copied

  async function copyFile(item: CopyItem, source: string, target: string) {
    await fs.mkdir(path.dirname(target), { recursive: true })
    await safePath(comparison.roots[destinationSide], item.relative)
    const temporaryPath = path.join(path.dirname(target), `.dirdelta-${randomUUID()}.tmp`)
    try {
      const before = await fs.stat(source)
      if (before.size !== item.size || before.mtimeMs !== item.modified) throw new Error(`Kaynak değişti: ${item.relative}. Yeniden karşılaştırın.`)
      await pipeline(createReadStream(source), createWriteStream(temporaryPath, { flags: 'wx' }), { signal })
      checkCancelled(signal)
      if (comparison.sha256 && await hashFile(source, signal) !== await hashFile(temporaryPath, signal)) throw new Error(`SHA-256 doğrulaması başarısız: ${item.relative}`)
      const after = await fs.stat(source)
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error(`Kopyalama sırasında kaynak değişti: ${item.relative}`)
      await fs.chmod(temporaryPath, before.mode)
      await fs.utimes(temporaryPath, before.atime, before.mtime)
      await safePath(comparison.roots[destinationSide], item.relative)
      checkCancelled(signal)
      if (overwrite && item.exists) await fs.rename(temporaryPath, target)
      else { await fs.link(temporaryPath, target); await fs.unlink(temporaryPath) }
    } finally { await fs.rm(temporaryPath, { force: true }) }
  }
}
