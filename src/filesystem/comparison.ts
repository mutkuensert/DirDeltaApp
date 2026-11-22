import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Comparison, Entry, Progress, Row, ScanWarning, Side } from '../types'
import { safePath, validateRoots } from './paths'
import { checkCancelled, hashFile } from './content'
import { explainReadError } from './errors'
import { compareEntries } from '../application/comparison'

export async function compareDirectories(left: string, right: string, sha256: boolean, signal: AbortSignal, progress: (p: Progress) => void = () => {}): Promise<Comparison> {
  const startedAt = Date.now()
  const roots = await validateRoots(left, right)
  let count = 0
  const onEntry = (relative: string) => progress({ phase: 'Scanning folders', path: relative, count: ++count })
  const leftScan = await scanDirectory(roots.left, 'left', signal, onEntry)
  const rightScan = await scanDirectory(roots.right, 'right', signal, onEntry)
  const leftEntries = leftScan.entries
  const rightEntries = rightScan.entries
  const warnings = [...leftScan.warnings, ...rightScan.warnings]
  const rows: Row[] = []
  for (const relative of [...new Set([...leftEntries.keys(), ...rightEntries.keys()])].sort((a, b) => a.localeCompare(b, 'en'))) {
    checkCancelled(signal)
    let leftEntry = leftEntries.get(relative)
    let rightEntry = rightEntries.get(relative)
    if (sha256 && leftEntry?.kind === 'file' && rightEntry?.kind === 'file') {
      progress({ phase: 'Calculating SHA-256', path: relative, count: ++count })
      const hashed = await hashComparedFiles(roots, relative, { left: leftEntry, right: rightEntry }, signal)
      leftEntry = hashed.left
      rightEntry = hashed.right
    }
    rows.push({ path: relative, left: leftEntry, right: rightEntry, status: compareEntries(leftEntry, rightEntry) })
  }
  return { roots, rows, warnings, sha256, elapsed: Date.now() - startedAt }
}

async function scanDirectory(root: string, side: Side, signal: AbortSignal, onEntry: (relative: string) => void) {
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
          warnings.push(skippedEntryWarning(side, absolute, stat.isSymbolicLink()))
          continue
        }
        entries.set(relativePath, { kind: stat.isDirectory() ? 'directory' : 'file', size: stat.isFile() ? stat.size : 0, modified: stat.mtimeMs })
        onEntry(relativePath)
        if (stat.isDirectory()) await walk(relativePath)
      } catch (error) { if (signal.aborted) throw error; warnings.push({ kind: 'read-error', reason: 'read-failure', side, path: absolute, ...explainReadError(error) }) }
    }
  }
  try { await walk('') }
  catch (error) {
    if (signal.aborted) throw error
    const detail = explainReadError(error)
    throw new Error(`${side === 'left' ? 'Left' : 'Right'} root folder could not be read: ${root}. ${detail.message} ${detail.suggestion}`)
  }
  return { entries, warnings }
}

async function hashComparedFiles(roots: Comparison['roots'], relative: string, entries: Record<Side, Entry>, signal: AbortSignal) {
  let leftEntry = entries.left
  let rightEntry = entries.right
  // Any hash failure aborts comparison; unreadable content must never appear equal.
  const leftBefore = await fs.stat(await safePath(roots.left, relative)), rightBefore = await fs.stat(await safePath(roots.right, relative))
  for (const side of ['left', 'right'] as const) {
    try {
      const hash = await hashFile(await safePath(roots[side], relative), signal)
      if (side === 'left') leftEntry = { ...leftEntry, hash }
      else rightEntry = { ...rightEntry, hash }
    }
    catch (error) {
      if (signal.aborted) throw error
      const detail = explainReadError(error)
      throw new Error(`SHA-256 comparison stopped. ${side === 'left' ? 'Left' : 'Right'} file could not be read: ${path.join(roots[side], relative)}. ${detail.message} ${detail.suggestion} Could not verify whether the file is identical or different.`)
    }
  }
  const leftAfter = await fs.stat(await safePath(roots.left, relative)), rightAfter = await fs.stat(await safePath(roots.right, relative))
  if (leftBefore.mtimeMs !== leftAfter.mtimeMs || leftBefore.size !== leftAfter.size || rightBefore.mtimeMs !== rightAfter.mtimeMs || rightBefore.size !== rightAfter.size) throw new Error(`File changed during comparison: ${relative}`)
  return { left: leftEntry, right: rightEntry }
}

function skippedEntryWarning(side: Side, absolute: string, isSymbolicLink: boolean): ScanWarning {
  return {
    kind: 'skipped',
    reason: isSymbolicLink ? 'symlink' : 'special-file',
    side,
    path: absolute,
    message: isSymbolicLink ? 'Symbolic link: not followed because it points to another location.' : 'Special file: excluded because it is not a regular file or folder.',
    suggestion: isSymbolicLink ? 'If needed, select the actual folder the link points to separately.' : 'Sockets, pipes, and device files are not compared or copied.'
  }
}
