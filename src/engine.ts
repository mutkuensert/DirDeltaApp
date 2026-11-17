// Stable engine exports for existing callers. Implementations are owned by filesystem/.
export { explainReadError } from './filesystem/errors'
export { checkCancelled, hashFile } from './filesystem/content'
export { inside, validateRoots, safePath } from './filesystem/paths'
export { compareDirectories } from './filesystem/comparison'
export { planCopy, executeCopy } from './filesystem/copy'
export type { CopyItem } from './application/contracts'
