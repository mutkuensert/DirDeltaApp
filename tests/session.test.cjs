const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DirectorySession } = require('../dist/application/session.js')

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
function fixture(overrides = {}, interactionOverrides = {}) {
  const comparison = { roots: { left: '/left', right: '/right' }, rows: [], warnings: [], sha256: false, elapsed: 0 }
  const calls = []
  const session = new DirectorySession({
    compareDirectories: async () => comparison,
    planCopy: async () => [{ kind: 'file', exists: true, relative: 'file' }],
    executeCopy: async (...args) => { calls.push(args); return 1 },
    safePath: async (root, relative) => `${root}/${relative}`,
    ...overrides
  }, {
    selectFolder: async side => `/${side}`,
    confirmOverwrite: async () => true,
    reveal: () => {}, progress: () => {},
    ...interactionOverrides
  })
  return { session, calls, comparison }
}
async function prepare(session) {
  await session.selectFolder('left')
  await session.selectFolder('right')
  await session.compare(false)
}

test('folder selection holds the operation lock until the dialog completes', async () => {
  const selection = deferred()
  const { session } = fixture({}, { selectFolder: () => selection.promise })
  const pending = session.selectFolder('left')
  await assert.rejects(session.compare(false), /Devam eden/)
  await assert.rejects(session.selectFolder('right'), /Devam eden/)
  selection.resolve('/left')
  assert.equal(await pending, '/left')
  await assert.rejects(session.compare(false), /iki klasör/)
})

test('copy approval authorizes overwrite and invalidates the comparison', async () => {
  const { session, calls } = fixture()
  await prepare(session)
  assert.deepEqual(await session.copy('left', ['file']), { copied: 1, cancelled: false })
  assert.equal(calls[0][3], true)
  await assert.rejects(session.copy('left', ['file']), /karşılaştırın/)
})

test('declining overwrite never executes a copy', async () => {
  const { session, calls } = fixture({}, { confirmOverwrite: async () => false })
  await prepare(session)
  assert.deepEqual(await session.copy('left', ['file']), { copied: 0, cancelled: true })
  assert.equal(calls.length, 0)
})

test('cancelling while overwrite approval is pending prevents copying', async () => {
  const approval = deferred()
  const shown = deferred()
  const { session, calls } = fixture({}, { confirmOverwrite: () => { shown.resolve(); return approval.promise } })
  await prepare(session)
  const pending = session.copy('left', ['file'])
  await shown.promise
  session.cancel()
  approval.resolve(true)
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(calls.length, 0)
  await session.compare(false)
})

test('disposing a session discards late comparison results and rejects further work', async () => {
  const result = deferred()
  const { session, comparison } = fixture({ compareDirectories: () => result.promise })
  await session.selectFolder('left')
  await session.selectFolder('right')
  const pending = session.compare(false)
  session.dispose()
  result.resolve(comparison)
  await assert.rejects(pending, { name: 'AbortError' })
  await assert.rejects(session.compare(false), /Pencere kapatıldı/)
  await assert.rejects(session.reveal('left', 'file'), /karşılaştırma/)
})

test('failed copy releases the lock and requires a new comparison', async () => {
  const { session } = fixture({ executeCopy: async () => { throw new Error('disk unavailable') } })
  await prepare(session)
  await assert.rejects(session.copy('left', ['file']), /disk unavailable/)
  await assert.rejects(session.copy('left', ['file']), /karşılaştırın/)
  await session.compare(false)
})
