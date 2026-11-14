import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createReadStream, createWriteStream } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import type { Comparison, Entry, Progress, Row, ScanWarning, Side } from './types'

export function explainReadError(error: unknown): { message: string; suggestion: string; code?: string } {
  const code = (error as NodeJS.ErrnoException | null)?.code
  switch (code) {
    case 'EACCES': case 'EPERM': return { code, message: 'Bu öğeye erişim izni yok.', suggestion: 'Dosya veya klasörün okuma izinlerini kontrol edip yeniden karşılaştırın.' }
    case 'ENOENT': return { code, message: 'Öğe tarama sırasında silinmiş, taşınmış veya bağlantısı kesilmiş olabilir.', suggestion: 'Öğenin hâlâ yerinde olduğunu kontrol edip yeniden karşılaştırın.' }
    case 'ENOTDIR': return { code, message: 'Klasör yolu artık geçerli değil; bir klasör taşınmış veya dosyayla değiştirilmiş olabilir.', suggestion: 'Klasör yapısını kontrol edip yeniden karşılaştırın.' }
    case 'EIO': return { code, message: 'Depolama aygıtı veriyi okuyamadı.', suggestion: 'Diskin durumunu ve bağlantısını kontrol edip yeniden deneyin.' }
    case 'ENODEV': case 'ENXIO': case 'ESTALE': case 'ENOTCONN': case 'ETIMEDOUT': case 'EHOSTUNREACH': case 'ENETUNREACH': return { code, message: 'Disk veya ağ konumuna erişilemiyor.', suggestion: 'Harici disk ya da ağ bağlantısını kontrol edip yeniden karşılaştırın.' }
    case 'EBUSY': return { code, message: 'Öğe şu anda kullanımda olduğu için okunamadı.', suggestion: 'Öğeyi kullanan işlemin bitmesini bekleyip yeniden deneyin.' }
    case 'EMFILE': case 'ENFILE': return { code, message: 'Sistemin aynı anda açabileceği dosya sınırına ulaşıldı.', suggestion: 'Gereksiz uygulamaları kapatıp yeniden deneyin.' }
    default: return { code, message: `Öğe okunamadı: ${error instanceof Error ? error.message : String(error)}`, suggestion: 'Yolu, erişim izinlerini ve disk bağlantısını kontrol edip yeniden karşılaştırın.' }
  }
}

export function checkCancelled(signal: AbortSignal) { signal.throwIfAborted() }
export async function hashFile(file: string, signal: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash, { signal })
  return hash.digest('hex')
}
export function inside(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}
export async function validateRoots(left: string, right: string): Promise<Record<Side, string>> {
  const roots = { left: await fs.realpath(left), right: await fs.realpath(right) }
  for (const root of Object.values(roots)) if (!(await fs.stat(root)).isDirectory()) throw new Error('Seçilen yol bir klasör değil.')
  if (inside(roots.left, roots.right) || inside(roots.right, roots.left)) throw new Error('Aynı klasörü veya iç içe iki klasörü karşılaştıramazsınız.')
  return roots
}
export async function safePath(root: string, relative: string): Promise<string> {
  if (path.isAbsolute(relative) || !relative || relative.split(/[\\/]/).some(part => part === '..' || part === '.')) throw new Error('Geçersiz göreli yol.')
  const target = path.resolve(root, relative)
  if (!inside(root, target) || target === root) throw new Error('Klasör dışına erişim engellendi.')
  if ((await fs.lstat(root)).isSymbolicLink() || await fs.realpath(root) !== root) throw new Error('Kök klasör değişti. Yeniden klasör seçin.')
  let current = root
  for (const component of path.relative(root, target).split(path.sep)) {
    current = path.join(current, component)
    try {
      const stat = await fs.lstat(current)
      if (stat.isSymbolicLink()) throw new Error(`Sembolik bağlantı üzerinden işlem yapılamaz: ${relative}`)
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  return target
}
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
              message: symlink ? 'Sembolik bağlantı: başka bir konuma işaret ettiği için takip edilmedi.' : 'Özel dosya: normal dosya veya klasör olmadığı için işleme dahil edilmedi.',
              suggestion: symlink ? 'Gerekirse bağlantının işaret ettiği gerçek klasörü ayrı olarak seçin.' : 'Soket, kanal ve aygıt dosyaları karşılaştırılmaz veya kopyalanmaz.' })
            continue
          }
          entries.set(rel, { kind: stat.isDirectory() ? 'directory' : 'file', size: stat.isFile() ? stat.size : 0, modified: stat.mtimeMs })
          progress({ phase: 'Klasörler taranıyor', path: rel, count: ++count })
          if (stat.isDirectory()) await walk(rel)
        } catch (error) { if (signal.aborted) throw error; warnings.push({ kind: 'read-error', reason: 'read-failure', side, path: absolute, ...explainReadError(error) }) }
      }
    }
    try { await walk('') }
    catch (error) {
      if (signal.aborted) throw error
      const detail = explainReadError(error)
      throw new Error(`${side === 'left' ? 'Sol' : 'Sağ'} kök klasör okunamadı: ${root}. ${detail.message} ${detail.suggestion}`)
    }
    return entries
  }
  const a = await scan(roots.left, 'left'), b = await scan(roots.right, 'right'), rows: Row[] = []
  for (const relative of [...new Set([...a.keys(), ...b.keys()])].sort((a, b) => a.localeCompare(b, 'tr'))) {
    checkCancelled(signal)
    const l = a.get(relative), r = b.get(relative)
    let status: Row['status'] = !l ? 'right-only' : !r ? 'left-only' : l.kind !== r.kind ? 'conflict' : l.kind === 'directory' ? 'same' : l.size !== r.size ? 'different' : 'unchecked'
    if (sha256 && l?.kind === 'file' && r?.kind === 'file') {
      progress({ phase: 'SHA-256 hesaplanıyor', path: relative, count: ++count })
      // Any hash failure aborts comparison; unreadable content must never appear equal.
      const beforeL = await fs.stat(await safePath(roots.left, relative)), beforeR = await fs.stat(await safePath(roots.right, relative))
      for (const side of ['left', 'right'] as const) {
        try { (side === 'left' ? l : r).hash = await hashFile(await safePath(roots[side], relative), signal) }
        catch (error) {
          if (signal.aborted) throw error
          const detail = explainReadError(error)
          throw new Error(`SHA-256 karşılaştırması durduruldu. ${side === 'left' ? 'Sol' : 'Sağ'} dosya okunamadı: ${path.join(roots[side], relative)}. ${detail.message} ${detail.suggestion} Dosyanın aynı veya farklı olduğu doğrulanamadı.`)
        }
      }
      const afterL = await fs.stat(await safePath(roots.left, relative)), afterR = await fs.stat(await safePath(roots.right, relative))
      if (beforeL.mtimeMs !== afterL.mtimeMs || beforeL.size !== afterL.size || beforeR.mtimeMs !== afterR.mtimeMs || beforeR.size !== afterR.size) throw new Error(`Karşılaştırma sırasında dosya değişti: ${relative}`)
      status = l.hash === r.hash ? 'same' : 'different'
    }
    rows.push({ path: relative, left: l, right: r, status })
  }
  return { roots, rows, warnings, sha256, elapsed: Date.now() - start }
}
export interface CopyItem { relative: string; source: string; target: string; kind: Entry['kind']; exists: boolean; size: number; modified: number }
export async function planCopy(comparison: Comparison, side: Side, requested: string[]): Promise<CopyItem[]> {
  const other: Side = side === 'left' ? 'right' : 'left', selected = new Set(requested)
  if (!selected.size) return []
  for (const relative of selected) if (!comparison.rows.some(row => row.path === relative && row[side])) throw new Error('Öğe bulunamadı. Yeniden karşılaştırın.')
  const items: CopyItem[] = []
  for (const row of comparison.rows) {
    if (!row[side] || ![...selected].some(rel => row.path === rel || row.path.startsWith(rel + path.sep))) continue
    const source = await safePath(comparison.roots[side], row.path), target = await safePath(comparison.roots[other], row.path)
    const stat = await fs.lstat(source)
    if ((stat.isDirectory() ? 'directory' : 'file') !== row[side]!.kind) throw new Error('Kaynak türü değişti. Yeniden karşılaştırın.')
    let exists = false
    try {
      const dest = await fs.lstat(target); exists = true
      if (dest.isDirectory() !== stat.isDirectory() || (!dest.isDirectory() && !dest.isFile())) throw new Error(`Dosya/klasör çakışması: ${row.path}. Önce çakışmayı elle çözün.`)
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    items.push({ relative: row.path, source, target, kind: row[side]!.kind, exists, size: stat.size, modified: stat.mtimeMs })
  }
  return items.sort((a, b) => a.relative.split(path.sep).length - b.relative.split(path.sep).length)
}
export async function executeCopy(comparison: Comparison, side: Side, items: CopyItem[], overwrite: boolean, signal: AbortSignal, progress: (p: Progress) => void = () => {}) {
  let copied = 0
  const other: Side = side === 'left' ? 'right' : 'left'
  for (const item of items) {
    checkCancelled(signal)
    const source = await safePath(comparison.roots[side], item.relative), target = await safePath(comparison.roots[other], item.relative)
    progress({ phase: 'Kopyalanıyor', path: item.relative, count: copied })
    if (item.kind === 'directory') { await fs.mkdir(target, { recursive: true }); copied++; continue }
    await fs.mkdir(path.dirname(target), { recursive: true })
    await safePath(comparison.roots[other], item.relative)
    const temp = path.join(path.dirname(target), `.dirdelta-${randomUUID()}.tmp`)
    try {
      const before = await fs.stat(source)
      if (before.size !== item.size || before.mtimeMs !== item.modified) throw new Error(`Kaynak değişti: ${item.relative}. Yeniden karşılaştırın.`)
      await pipeline(createReadStream(source), createWriteStream(temp, { flags: 'wx' }), { signal })
      checkCancelled(signal)
      if (comparison.sha256 && await hashFile(source, signal) !== await hashFile(temp, signal)) throw new Error(`SHA-256 doğrulaması başarısız: ${item.relative}`)
      const after = await fs.stat(source)
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error(`Kopyalama sırasında kaynak değişti: ${item.relative}`)
      await fs.chmod(temp, before.mode)
      await fs.utimes(temp, before.atime, before.mtime)
      await safePath(comparison.roots[other], item.relative)
      checkCancelled(signal)
      if (overwrite && item.exists) await fs.rename(temp, target)
      else { await fs.link(temp, target); await fs.unlink(temp) }
      copied++
    } finally { await fs.rm(temp, { force: true }) }
  }
  return copied
}
