import type { Comparison, Side } from '../types'
import type { DirectoryOperations, SessionInteraction } from './contracts'

// One session belongs to one window. All asynchronous commands share its operation lock.
export class DirectorySession {
  private roots: Partial<Record<Side, string>> = {}
  private comparison?: Comparison
  private operation?: AbortController
  private disposed = false

  constructor(private readonly directories: DirectoryOperations, private readonly interaction: SessionInteraction) {}

  selectFolder(side: Side) {
    return this.run(async signal => {
      const folder = await this.interaction.selectFolder(side, this.roots[side])
      signal.throwIfAborted()
      if (folder) {
        this.roots[side] = folder
        this.comparison = undefined
      }
      return folder
    })
  }

  compare(sha256: boolean) {
    return this.run(async signal => {
      const { left, right } = this.roots
      if (!left || !right) throw new Error('Select two folders first.')
      this.comparison = undefined
      const result = await this.directories.compareDirectories(left, right, sha256, signal, this.interaction.progress)
      signal.throwIfAborted()
      this.comparison = result
      return result
    })
  }

  copy(side: Side, paths: readonly string[]) {
    return this.run(async signal => {
      const current = this.comparison
      if (!current) throw new Error('Compare the folders first.')
      try {
        const items = await this.directories.planCopy(current, side, paths)
        signal.throwIfAborted()
        const replacements = items.filter(item => item.kind === 'file' && item.exists)
        if (replacements.length && !await this.interaction.confirmOverwrite(current, side, replacements)) {
          return { copied: 0, cancelled: true }
        }
        signal.throwIfAborted()
        const copied = await this.directories.executeCopy(current, side, items, replacements.length > 0, signal, this.interaction.progress)
        return { copied, cancelled: false }
      } finally {
        // Partial copies and external changes both require a fresh comparison.
        this.comparison = undefined
      }
    })
  }

  async reveal(side: Side, relative: string) {
    const root = this.comparison?.roots[side]
    if (!root || this.disposed) throw new Error('Run a comparison first.')
    const absolute = await this.directories.safePath(root, relative)
    if (!this.disposed) this.interaction.reveal(absolute)
  }

  cancel() { this.operation?.abort() }

  dispose() {
    this.disposed = true
    this.cancel()
    this.comparison = undefined
    this.roots = {}
  }

  private async run<T>(action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.disposed) throw new Error('The window has been closed.')
    if (this.operation) throw new Error('Wait for the current operation to finish.')
    const operation = new AbortController()
    this.operation = operation
    try {
      const result = await action(operation.signal)
      operation.signal.throwIfAborted()
      return result
    } finally {
      this.operation = undefined
    }
  }
}
