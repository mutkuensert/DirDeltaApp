import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Side } from '../types'

export function inside(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}
export async function validateRoots(left: string, right: string): Promise<Record<Side, string>> {
  const roots = { left: await fs.realpath(left), right: await fs.realpath(right) }
  for (const root of Object.values(roots)) if (!(await fs.stat(root)).isDirectory()) throw new Error('The selected path is not a folder.')
  if (inside(roots.left, roots.right) || inside(roots.right, roots.left)) throw new Error('You cannot compare the same folder or nested folders.')
  return roots
}
export async function safePath(root: string, relative: string): Promise<string> {
  if (path.isAbsolute(relative) || !relative || relative.split(/[\\/]/).some(part => part === '..' || part === '.')) throw new Error('Invalid relative path.')
  const target = path.resolve(root, relative)
  if (!inside(root, target) || target === root) throw new Error('Access outside the folder was blocked.')
  if ((await fs.lstat(root)).isSymbolicLink() || await fs.realpath(root) !== root) throw new Error('The root folder has changed. Select the folder again.')
  let current = root
  for (const component of path.relative(root, target).split(path.sep)) {
    current = path.join(current, component)
    try {
      const stat = await fs.lstat(current)
      if (stat.isSymbolicLink()) throw new Error(`Operations through symbolic links are not allowed: ${relative}`)
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  return target
}
