export type Side = 'left' | 'right'
export type Status = 'left-only' | 'right-only' | 'different' | 'same' | 'unchecked' | 'conflict'

export interface Entry {
  readonly kind: 'file' | 'directory'
  readonly size: number
  readonly modified: number
  readonly hash?: string
}

export interface Row {
  readonly path: string
  readonly left?: Entry
  readonly right?: Entry
  readonly status: Status
}

export interface ScanWarning {
  readonly kind: 'skipped' | 'read-error'
  readonly reason: 'symlink' | 'special-file' | 'read-failure'
  readonly side: Side
  readonly path: string
  readonly message: string
  readonly suggestion: string
  readonly code?: string
}

export interface Comparison {
  readonly roots: Readonly<Record<Side, string>>
  readonly rows: readonly Row[]
  readonly warnings: readonly ScanWarning[]
  readonly sha256: boolean
  readonly elapsed: number
}

export interface Progress {
  readonly phase: string
  readonly path: string
  readonly count: number
}

export interface DesktopAPI {
  selectFolder(side: Side): Promise<string | null>
  compare(sha256: boolean): Promise<Comparison>
  copy(side: Side, paths: readonly string[]): Promise<{ copied: number; cancelled: boolean }>
  cancel(): Promise<void>
  reveal(side: Side, relative: string): Promise<void>
  onProgress(callback: (progress: Progress) => void): () => void
}
