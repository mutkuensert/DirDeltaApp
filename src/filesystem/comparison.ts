import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Comparison, Entry, Progress, Row, ScanWarning, Side } from '../types'
import { safePath, validateRoots } from './paths'
import { checkCancelled, hashFile } from './content'
import { explainReadError } from './errors'
import { compareEntries } from '../application/comparison'

export async function compareDirectories(left: string, right: string, sha256: boolean, signal: AbortSignal, progress: (p: Progress) => void = () => {}): Promise<Comparison> {
  const startedAtMilliseconds = Date.now()
  const roots = await validateRoots(left, right)
  let count = 0
  const reportScannedEntry = (relative: string) => progress({ phase: 'Klasörler taranıyor', path: relative, count: ++count })
  const leftScan = await scanDirectory(roots.left, 'left', signal, reportScannedEntry)
  const rightScan = await scanDirectory(roots.right, 'right', signal, reportScannedEntry)
  const leftEntries = leftScan.entries, rightEntries = rightScan.entries
  const warnings = [...leftScan.warnings, ...rightScan.warnings]
  const rows: Row[] = []
  for (const relative of [...new Set([...leftEntries.keys(), ...rightEntries.keys()])].sort((a, b) => a.localeCompare(b, 'tr'))) {
    checkCancelled(signal)
    let leftEntry = leftEntries.get(relative), rightEntry = rightEntries.get(relative)
    if (sha256 && leftEntry?.kind === 'file' && rightEntry?.kind === 'file') {
      progress({ phase: 'SHA-256 hesaplanıyor', path: relative, count: ++count })
      const hashes = await hashComparedFiles(roots, relative, signal)
      leftEntry = { ...leftEntry, hash: hashes.left }
      rightEntry = { ...rightEntry, hash: hashes.right }
    }
    rows.push({ path: relative, left: leftEntry, right: rightEntry, status: compareEntries(leftEntry, rightEntry) })
  }
  return { roots, rows, warnings, sha256, elapsed: Date.now() - startedAtMilliseconds }
}

async function scanDirectory(root: string, side: Side, signal: AbortSignal, reportScannedEntry: (relative: string) => void) {
  const entries = new Map<string, Entry>()
  const warnings: ScanWarning[] = []
  async function walk(relative: string) {
    checkCancelled(signal)
    const directory = relative ? await safePath(root, relative) : root
    const children = await fs.readdir(directory, { withFileTypes: true })
    for (const child of children) {
      checkCancelled(signal)
      const relativePath = path.join(relative, child.name), absolute = path.join(root, relativePath)
      try {
        const stat = await fs.lstat(absolute)
        if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
          const symlink = stat.isSymbolicLink()
          warnings.push({ kind: 'skipped', reason: symlink ? 'symlink' : 'special-file', side, path: absolute,
            message: symlink ? 'Sembolik bağlantı: başka bir konuma işaret ettiği için takip edilmedi.' : 'Özel dosya: normal dosya veya klasör olmadığı için işleme dahil edilmedi.',
            suggestion: symlink ? 'Gerekirse bağlantının işaret ettiği gerçek klasörü ayrı olarak seçin.' : 'Soket, kanal ve aygıt dosyaları karşılaştırılmaz veya kopyalanmaz.' })
          continue
        }
        entries.set(relativePath, { kind: stat.isDirectory() ? 'directory' : 'file', size: stat.isFile() ? stat.size : 0, modified: stat.mtimeMs })
        reportScannedEntry(relativePath)
        if (stat.isDirectory()) await walk(relativePath)
      } catch (error) { if (signal.aborted) throw error; warnings.push({ kind: 'read-error', reason: 'read-failure', side, path: absolute, ...explainReadError(error) }) }
    }
  }
  try { await walk('') }
  catch (error) {
    if (signal.aborted) throw error
    const detail = explainReadError(error)
    throw new Error(`${side === 'left' ? 'Sol' : 'Sağ'} kök klasör okunamadı: ${root}. ${detail.message} ${detail.suggestion}`)
  }
  return { entries, warnings }
}

async function hashComparedFiles(roots: Comparison['roots'], relative: string, signal: AbortSignal): Promise<Record<Side, string>> {
  const hashes = { left: '', right: '' }
  // Any hash failure aborts comparison; unreadable content must never appear equal.
  const leftBefore = await fs.stat(await safePath(roots.left, relative)), rightBefore = await fs.stat(await safePath(roots.right, relative))
  for (const side of ['left', 'right'] as const) {
    try {
      const hash = await hashFile(await safePath(roots[side], relative), signal)
      hashes[side] = hash
    }
    catch (error) {
      if (signal.aborted) throw error
      const detail = explainReadError(error)
      throw new Error(`SHA-256 karşılaştırması durduruldu. ${side === 'left' ? 'Sol' : 'Sağ'} dosya okunamadı: ${path.join(roots[side], relative)}. ${detail.message} ${detail.suggestion} Dosyanın aynı veya farklı olduğu doğrulanamadı.`)
    }
  }
  const leftAfter = await fs.stat(await safePath(roots.left, relative)), rightAfter = await fs.stat(await safePath(roots.right, relative))
  if (leftBefore.mtimeMs !== leftAfter.mtimeMs || leftBefore.size !== leftAfter.size || rightBefore.mtimeMs !== rightAfter.mtimeMs || rightBefore.size !== rightAfter.size) throw new Error(`Karşılaştırma sırasında dosya değişti: ${relative}`)
  return hashes
}
