import type { Comparison, Entry, Progress, Side } from '../types'

export interface CopyItem {
  readonly relative: string
  readonly source: string
  readonly target: string
  readonly kind: Entry['kind']
  readonly exists: boolean
  readonly size: number
  readonly modified: number
}

export interface DirectoryOperations {
  compareDirectories(left: string, right: string, sha256: boolean, signal: AbortSignal, progress: (value: Progress) => void): Promise<Comparison>
  planCopy(comparison: Comparison, side: Side, paths: readonly string[]): Promise<readonly CopyItem[]>
  executeCopy(comparison: Comparison, side: Side, items: readonly CopyItem[], overwrite: boolean, signal: AbortSignal, progress: (value: Progress) => void): Promise<number>
  safePath(root: string, relative: string): Promise<string>
}

export interface SessionInteraction {
  selectFolder(side: Side, current?: string): Promise<string | null>
  confirmOverwrite(comparison: Comparison, side: Side, items: readonly CopyItem[]): Promise<boolean>
  reveal(absolute: string): void
  progress(value: Progress): void
}
