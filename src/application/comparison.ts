import type { Entry, Status } from '../types'

export function compareEntries(left?: Entry, right?: Entry): Status {
  if (!left) return 'right-only'
  if (!right) return 'left-only'
  if (left.kind !== right.kind) return 'conflict'
  if (left.kind === 'directory') return 'same'
  if (left.hash !== undefined && right.hash !== undefined) return left.hash === right.hash ? 'same' : 'different'
  return left.size === right.size ? 'unchecked' : 'different'
}
