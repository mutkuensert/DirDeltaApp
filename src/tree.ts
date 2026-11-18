// Shared browser-side presentation model. Full comparison rows remain intact for copying.
namespace DirDeltaTree {
  type Row = import('./types').Row
  export interface Item { row: Row; depth: number; grouped: boolean; open: boolean; descendants: number }
  export function missingPaths(rows: readonly Row[], side: import('./types').Side, separator: string): string[] {
    const missing = rows.filter(row => row.status === `${side}-only`)
    const selected = new Set(missing.map(row => row.path))
    return missing.filter(row => {
      const parts = row.path.split(separator)
      parts.pop()
      while (parts.length) {
        if (selected.has(parts.join(separator))) return false
        parts.pop()
      }
      return true
    }).map(row => row.path)
  }
  export function create(rows: readonly Row[], separator: string) {
    const byPath = new Map(rows.map(row => [row.path, row]))
    const children = new Map<string, Row[]>()
    const summaries = new Map<string, { count: number; left: boolean; right: boolean; different: boolean }>()
    const parent = (value: string) => value.includes(separator) ? value.slice(0, value.lastIndexOf(separator)) : ''
    for (const row of rows) {
      const container = parent(row.path)
      const siblings = children.get(container) ?? []
      siblings.push(row); children.set(container, siblings)
      for (let ancestor = container; ancestor; ancestor = parent(ancestor)) {
        const summary = summaries.get(ancestor) ?? { count: 0, left: false, right: false, different: false }
        summary.count++; summary.left ||= Boolean(row.left); summary.right ||= Boolean(row.right)
        summary.different ||= row.status !== 'same' && row.status !== 'unchecked'
        summaries.set(ancestor, summary)
      }
    }
    const hiddenItems = new Set(rows.filter(row =>
      row.path.split(separator).some(component => component.startsWith('.'))
    ).map(row => row.path))
    const hidden = new Set<string>()
    const groups = new Map<string, Row['status']>()
    for (const row of rows) {
      if (row.status === 'conflict') continue
      const summary = summaries.get(row.path)
      if ((row.status === 'same' || row.status === 'unchecked') && !summary?.different) hidden.add(row.path)
      if (!summary?.count) continue
      if (row.left?.kind === 'directory' && !summary.right) groups.set(row.path, 'left-only')
      else if (row.right?.kind === 'directory' && !summary.left) groups.set(row.path, 'right-only')
    }
    return {
      visible(expanded: ReadonlySet<string>, query = '', hideHiddenItems = false): Item[] {
        const excluded = (relative: string) => hidden.has(relative) || (hideHiddenItems && hiddenItems.has(relative))
        const matching = new Set<string>()
        if (query) for (const row of rows) {
          if (excluded(row.path) || !row.path.toLocaleLowerCase('en').includes(query)) continue
          matching.add(row.path)
          for (let ancestor = parent(row.path); ancestor; ancestor = parent(ancestor)) matching.add(ancestor)
        }
        const output: Item[] = []
        function visit(container: string, depth: number) {
          for (const original of children.get(container) ?? []) {
            if (excluded(original.path) || (query && !matching.has(original.path))) continue
            if (original.status === 'same' || original.status === 'unchecked') {
              visit(original.path, depth)
              continue
            }
            const groupStatus = groups.get(original.path), grouped = Boolean(groupStatus)
            const open = grouped && (Boolean(query) || expanded.has(original.path))
            const row = groupStatus ? { ...original, status: groupStatus } : original
            output.push({ row, depth, grouped, open, descendants: summaries.get(row.path)?.count ?? 0 })
            if (!grouped || open) visit(row.path, grouped ? depth + 1 : depth)
          }
        }
        visit('', 0)
        return output
      },
      has: (relative: string) => byPath.has(relative)
    }
  }
}
