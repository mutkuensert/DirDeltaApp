const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const context = vm.createContext({})
vm.runInContext(fs.readFileSync(require.resolve('../dist/tree.js'), 'utf8'), context)
const create = context.DirDeltaTree.create
const dir = { kind: 'directory', size: 0, modified: 0 }
const file = { kind: 'file', size: 1, modified: 0 }
const row = (path, left, right, status) => ({ path, left, right, status })
const paths = items => Array.from(items, item => item.row.path)
test('missing directories start collapsed and support nested expansion on both sides', () => {
  const rows = [row('a', dir, undefined, 'left-only'), row('a/sub', dir, undefined, 'left-only'), row('a/sub/file', file, undefined, 'left-only'), row('ab', file, undefined, 'left-only'), row('b', undefined, dir, 'right-only'), row('b/file', undefined, file, 'right-only')]
  const tree = create(rows, '/')
  assert.deepEqual(paths(tree.visible(new Set())), ['a', 'ab', 'b'])
  assert.deepEqual(paths(tree.visible(new Set(['a']))), ['a', 'a/sub', 'ab', 'b'])
  const open = tree.visible(new Set(['a', 'a/sub', 'b']))
  assert.deepEqual(paths(open), rows.map(r => r.path))
  assert.equal(open[2].depth, 2)
  assert.equal(tree.visible(new Set())[0].descendants, 2)
  assert.equal(rows.length, 6)
})
test('shared directory with all contents missing is expandable without changing raw status', () => {
  const rows = [row('shared', dir, dir, 'same'), row('shared/file', file, undefined, 'left-only')]
  const tree = create(rows, '/')
  assert.equal(tree.visible(new Set())[0].row.status, 'left-only')
  assert.equal(rows[0].status, 'same')
  assert.deepEqual(paths(tree.visible(new Set(['shared']))), ['shared', 'shared/file'])
})
test('search reveals matching descendants and their parents inside closed groups', () => {
  const rows = [row('a', dir, undefined, 'left-only'), row('a/sub', dir, undefined, 'left-only'), row('a/sub/needle', file, undefined, 'left-only'), row('a/other', file, undefined, 'left-only')]
  const tree = create(rows, '/')
  assert.deepEqual(paths(tree.visible(new Set(), 'needle')), ['a', 'a/sub', 'a/sub/needle'])
  assert.deepEqual(paths(tree.visible(new Set())), ['a'])
})
test('partial matches, empty directories and type conflicts stay visible', () => {
  const rows = [row('a', dir, dir, 'same'), row('a/shared', file, file, 'same'), row('a/missing', file, undefined, 'left-only'), row('empty', dir, undefined, 'left-only'), row('conflict', dir, file, 'conflict'), row('conflict/file', file, undefined, 'left-only')]
  assert.deepEqual(paths(create(rows, '/').visible(new Set())), rows.map(r => r.path))
})
test('handles Windows separators and preserves literal backslashes in Unix filenames', () => {
  const windows = [row('a', dir, undefined, 'left-only'), row('a\\file', file, undefined, 'left-only')]
  assert.deepEqual(paths(create(windows, '\\').visible(new Set())), ['a'])
  const unix = [row('a', dir, undefined, 'left-only'), row('a\\file', file, undefined, 'left-only')]
  assert.deepEqual(paths(create(unix, '/').visible(new Set())), ['a', 'a\\file'])
})

test('bulk selection removes descendants using the root platform separator', () => {
  const rows = [row('a', dir, undefined, 'left-only'), row('a/file', file, undefined, 'left-only'), row('a\\file', file, undefined, 'left-only')]
  assert.deepEqual(Array.from(context.DirDeltaTree.missingPaths(rows, 'left', '/')), ['a', 'a\\file'])
  const windows = [row('a', dir, undefined, 'left-only'), row('a\\file', file, undefined, 'left-only')]
  assert.deepEqual(Array.from(context.DirDeltaTree.missingPaths(windows, 'left', '\\')), ['a'])
  assert.deepEqual(Array.from(context.DirDeltaTree.missingPaths(rows, 'right', '/')), [])
})
