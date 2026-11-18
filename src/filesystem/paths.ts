import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Side } from '../types'

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
