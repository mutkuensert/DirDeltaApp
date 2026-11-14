export type Side = 'left' | 'right'
export type Status = 'left-only' | 'right-only' | 'different' | 'same' | 'unchecked' | 'conflict'
export interface Entry { kind: 'file' | 'directory'; size: number; modified: number; hash?: string }
export interface Row { path: string; left?: Entry; right?: Entry; status: Status }
export interface ScanWarning { kind: 'skipped' | 'read-error'; reason: 'symlink' | 'special-file' | 'read-failure'; side: Side; path: string; message: string; suggestion: string; code?: string }
export interface Comparison { roots: Record<Side, string>; rows: Row[]; warnings: ScanWarning[]; sha256: boolean; elapsed: number }
export interface Progress { phase: string; path: string; count: number }
export interface DesktopAPI {
  selectFolder(side: Side): Promise<string | null>
  compare(sha256: boolean): Promise<Comparison>
  copy(side: Side, paths: string[]): Promise<{ copied: number; cancelled: boolean }>
  cancel(): Promise<void>
  reveal(side: Side, relative: string): Promise<void>
  onProgress(callback: (progress: Progress) => void): void
}
