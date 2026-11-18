import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Comparison, Entry, Progress, Row, ScanWarning, Side } from '../types'
import { safePath, validateRoots } from './paths'
import { checkCancelled, hashFile } from './content'
import { explainReadError } from './errors'
import { compareEntries } from '../application/comparison'

export async function compareDirectories(left: string, right: string, sha256: boolean, signal: AbortSignal, progress: (p: Progress) => void = () => {}): Promise<Comparison> {
  const start = Date.now(), roots = await validateRoots(left, right), warnings: ScanWarning[] = []
  let count = 0
  async function scan(root: string, side: Side) {
    const entries = new Map<string, Entry>()
    async function walk(relative: string) {
      checkCancelled(signal)
      const directory = relative ? await safePath(root, relative) : root
      const children = await fs.readdir(directory, { withFileTypes: true })
      for (const child of children) {
        checkCancelled(signal)
        const rel = path.join(relative, child.name), absolute = path.join(root, rel)
        try {
          const stat = await fs.lstat(absolute)
          if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
            const symlink = stat.isSymbolicLink()
            warnings.push({ kind: 'skipped', reason: symlink ? 'symlink' : 'special-file', side, path: absolute,
              message: symlink ? 'Symbolic link: not followed because it points to another location.' : 'Special file: excluded because it is not a regular file or folder.',
              suggestion: symlink ? 'If needed, select the actual folder the link points to separately.' : 'Sockets, pipes, and device files are not compared or copied.' })
            continue
          }
          entries.set(rel, { kind: stat.isDirectory() ? 'directory' : 'file', size: stat.isFile() ? stat.size : 0, modified: stat.mtimeMs })
          progress({ phase: 'Scanning folders', path: rel, count: ++count })
          if (stat.isDirectory()) await walk(rel)
        } catch (error) { if (signal.aborted) throw error; warnings.push({ kind: 'read-error', reason: 'read-failure', side, path: absolute, ...explainReadError(error) }) }
      }
    }
    try { await walk('') }
    catch (error) {
      if (signal.aborted) throw error
      const detail = explainReadError(error)
      throw new Error(`${side === 'left' ? 'Left' : 'Right'} root folder could not be read: ${root}. ${detail.message} ${detail.suggestion}`)
    }
    return entries
  }
  const a = await scan(roots.left, 'left'), b = await scan(roots.right, 'right'), rows: Row[] = []
  for (const relative of [...new Set([...a.keys(), ...b.keys()])].sort((a, b) => a.localeCompare(b, 'en'))) {
    checkCancelled(signal)
    let l = a.get(relative), r = b.get(relative)
    if (sha256 && l?.kind === 'file' && r?.kind === 'file') {
      progress({ phase: 'Calculating SHA-256', path: relative, count: ++count })
      // Any hash failure aborts comparison; unreadable content must never appear equal.
      const beforeL = await fs.stat(await safePath(roots.left, relative)), beforeR = await fs.stat(await safePath(roots.right, relative))
      for (const side of ['left', 'right'] as const) {
        try {
          const hash = await hashFile(await safePath(roots[side], relative), signal)
          if (side === 'left') l = { ...l, hash }
          else r = { ...r, hash }
        }
        catch (error) {
          if (signal.aborted) throw error
          const detail = explainReadError(error)
          throw new Error(`SHA-256 comparison stopped. ${side === 'left' ? 'Left' : 'Right'} file could not be read: ${path.join(roots[side], relative)}. ${detail.message} ${detail.suggestion} Could not verify whether the file is identical or different.`)
        }
      }
      const afterL = await fs.stat(await safePath(roots.left, relative)), afterR = await fs.stat(await safePath(roots.right, relative))
      if (beforeL.mtimeMs !== afterL.mtimeMs || beforeL.size !== afterL.size || beforeR.mtimeMs !== afterR.mtimeMs || beforeR.size !== afterR.size) throw new Error(`File changed during comparison: ${relative}`)
    }
    rows.push({ path: relative, left: l, right: r, status: compareEntries(l, r) })
  }
  return { roots, rows, warnings, sha256, elapsed: Date.now() - start }
}
