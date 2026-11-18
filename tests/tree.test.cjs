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
test('shared directory is omitted even when all its contents are missing on one side', () => {
  const rows = [row('shared', dir, dir, 'same'), row('shared/file', file, undefined, 'left-only')]
  const tree = create(rows, '/')
  assert.equal(tree.visible(new Set())[0].row.status, 'left-only')
  assert.equal(rows[0].status, 'same')
  assert.deepEqual(paths(tree.visible(new Set())), ['shared/file'])
  assert.deepEqual(paths(tree.visible(new Set(['shared']))), ['shared/file'])
})
test('search reveals matching descendants and their parents inside closed groups', () => {
  const rows = [row('a', dir, undefined, 'left-only'), row('a/sub', dir, undefined, 'left-only'), row('a/sub/needle', file, undefined, 'left-only'), row('a/other', file, undefined, 'left-only')]
  const tree = create(rows, '/')
  assert.deepEqual(paths(tree.visible(new Set(), 'needle')), ['a', 'a/sub', 'a/sub/needle'])
  assert.deepEqual(paths(tree.visible(new Set())), ['a'])
})
test('partial matches, empty directories and type conflicts stay visible', () => {
  const rows = [row('a', dir, dir, 'same'), row('a/shared', file, file, 'same'), row('a/missing', file, undefined, 'left-only'), row('empty', dir, undefined, 'left-only'), row('conflict', dir, file, 'conflict'), row('conflict/file', file, undefined, 'left-only')]
  assert.deepEqual(paths(create(rows, '/').visible(new Set())), ['a/missing', 'empty', 'conflict', 'conflict/file'])
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

test('identical directory trees are hidden in both modes without changing comparison rows', () => {
  const rows = [row('a', dir, dir, 'same'), row('a/sub', dir, dir, 'same'), row('a/sub/needle', file, file, 'same'), row('a/other', file, file, 'same')]
  for (const sha256 of [false, true]) {
    const tree = create(rows, '/', sha256)
    assert.deepEqual(paths(tree.visible(new Set())), [])
    assert.deepEqual(paths(tree.visible(new Set(['a', 'a/sub']))), [])
    assert.deepEqual(paths(tree.visible(new Set(), 'needle')), [])
    assert.equal(tree.has('a/sub/needle'), true)
  }
  assert.equal(rows.length, 4)
})

test('a differing, missing or conflicting descendant prevents matching grouping', () => {
  for (const status of ['different', 'left-only', 'right-only', 'conflict']) {
    const rows = [row('a', dir, dir, 'same'), row('a/sub', dir, dir, 'same'), row('a/sub/file', file, file, status)]
    assert.deepEqual(paths(create(rows, '/').visible(new Set())), ['a/sub/file'], status)
  }
})

test('identical hiding uses Windows path separators', () => {
  const rows = [row('a', dir, dir, 'same'), row('a\\file', file, file, 'same')]
  assert.deepEqual(paths(create(rows, '\\').visible(new Set())), [])
})


test('unverified directory trees are hidden including their parent, even during search', () => {
  for (const separator of ['/', '\\']) {
    const sub = `a${separator}sub`, needle = `${sub}${separator}needle`
    const rows = [row('a', dir, dir, 'same'), row(sub, dir, dir, 'same'), row(needle, file, file, 'unchecked'), row(`a${separator}equal`, file, file, 'same')]
    const tree = create(rows, separator, false)
    assert.deepEqual(paths(tree.visible(new Set())), [])
    assert.deepEqual(paths(tree.visible(new Set(['a', sub]))), [])
    assert.deepEqual(paths(tree.visible(new Set(), 'needle')), [])
    assert.equal(rows.length, 4)
    assert.equal(rows[0].status, 'same')
    assert.equal(tree.has(needle), true)
  }
})

test('unverified subtrees and standalone files are hidden while sibling differences remain', () => {
  const rows = [row('a', dir, dir, 'same'), row('a/sub', dir, dir, 'same'), row('a/sub/file', file, file, 'unchecked'), row('a/changed', file, undefined, 'left-only'), row('standalone', file, file, 'unchecked')]
  assert.deepEqual(paths(create(rows, '/', false).visible(new Set())), ['a/changed'])
})

test('unverified files do not conceal a known difference in the same directory', () => {
  const rows = [row('a', dir, dir, 'same'), row('a/unverified', file, file, 'unchecked'), row('a/different', file, file, 'different')]
  assert.deepEqual(paths(create(rows, '/').visible(new Set())), ['a/different'])
})

test('unverified folders are hidden at every depth without listing shared ancestors', () => {
  for (const separator of ['/', '\\']) {
    const p = value => value.replaceAll('/', separator)
    const rows = [
      row('root', dir, dir, 'same'),
      row(p('root/changed'), file, file, 'different'),
      row(p('root/hidden'), dir, dir, 'same'),
      row(p('root/hidden/file'), file, file, 'unchecked'),
      row(p('root/nested'), dir, dir, 'same'),
      row(p('root/nested/missing'), file, undefined, 'left-only'),
      row(p('root/nested/deeper'), dir, dir, 'same'),
      row(p('root/nested/deeper/changed'), file, undefined, 'left-only'),
      row(p('root/nested/deeper/hidden'), dir, dir, 'same'),
      row(p('root/nested/deeper/hidden/file'), file, file, 'unchecked')
    ]
    const tree = create(rows, separator, false)
    const expected = ['root/changed', 'root/nested/missing', 'root/nested/deeper/changed'].map(p)
    assert.deepEqual(paths(tree.visible(new Set())), expected)
    assert.deepEqual(paths(tree.visible(new Set(rows.map(item => item.path)))), expected)
    assert.deepEqual(paths(tree.visible(new Set(), 'root')), expected)
  }
})


test('size differences remain visible and shared empty directories are hidden', () => {
  const rows = [row('a', dir, dir, 'same'), row('a/file', file, { ...file, size: 20 }, 'different'), row('empty', dir, dir, 'same')]
  assert.deepEqual(paths(create(rows, '/', false).visible(new Set())), ['a/file'])
  assert.deepEqual(paths(create(rows, '/', true).visible(new Set())), ['a/file'])
})

test('different descendant names and types remain visible without shared parent rows', () => {
  for (const descendants of [
    [row('a/left', file, undefined, 'left-only'), row('a/right', undefined, file, 'right-only')],
    [row('a/item', dir, file, 'conflict')],
    [row('a/sub', dir, dir, 'same'), row('a/sub/left', file, undefined, 'left-only'), row('a/sub/right', undefined, file, 'right-only')]
  ]) {
    const rows = [row('a', dir, dir, 'same'), row('a/unverified', file, file, 'unchecked'), ...descendants]
    assert.deepEqual(paths(create(rows, '/', false).visible(new Set())), descendants.filter(item => item.status !== 'same').map(item => item.path))
  }
})


test('verified matching subfolders are hidden without listing shared ancestors', () => {
  const rows = [row('a', dir, dir, 'same'), row('a/changed', file, file, 'different'), row('a/sub', dir, dir, 'same'), row('a/sub/deep', dir, dir, 'same'), row('a/sub/deep/file', file, file, 'same'), row('empty', dir, dir, 'same')]
  assert.deepEqual(paths(create(rows, '/', true).visible(new Set())), ['a/changed'])
})


test('equal and unchecked files never appear in results or search, including at the root', () => {
  const rows = [row('equal', file, file, 'same'), row('unchecked', file, file, 'unchecked'), row('folder', dir, dir, 'same'), row('folder/equal', file, file, 'same'), row('folder/changed', file, file, 'different')]
  const tree = create(rows, '/')
  assert.deepEqual(paths(tree.visible(new Set())), ['folder/changed'])
  assert.deepEqual(paths(tree.visible(new Set(), 'unchecked')), [])
  assert.deepEqual(paths(tree.visible(new Set(), 'equal')), [])
  assert.deepEqual(paths(tree.visible(new Set(), 'changed')), ['folder/changed'])
  assert.equal(rows.length, 5)
})

test('hidden-item filter hides dotfiles and dot directories at every depth and is reversible', () => {
  for (const separator of ['/', '\\']) {
    const p = value => value.replaceAll('/', separator)
    const rows = [row('.git', dir, undefined, 'left-only'), row(p('.git/config'), file, undefined, 'left-only'), row('.env', file, undefined, 'left-only'), row('shared', dir, dir, 'same'), row(p('shared/.cache'), dir, dir, 'same'), row(p('shared/.cache/item'), file, file, 'different'), row(p('shared/visible'), file, file, 'different'), row('version.1', dir, undefined, 'left-only')]
    const tree = create(rows, separator)
    const expanded = new Set(['.git'])
    const before = paths(tree.visible(expanded))
    assert.deepEqual(paths(tree.visible(expanded, '', true)), [p('shared/visible'), 'version.1'])
    assert.deepEqual(paths(tree.visible(expanded, '.env', true)), [])
    assert.deepEqual(paths(tree.visible(expanded, 'config', true)), [])
    assert.deepEqual(paths(tree.visible(expanded, 'item', true)), [])
    assert.deepEqual(paths(tree.visible(expanded)), before)
    assert.equal(rows.length, 8)
    assert.deepEqual(Array.from(context.DirDeltaTree.missingPaths(rows, 'left', separator)), ['.git', '.env', 'version.1'])
  }
})
