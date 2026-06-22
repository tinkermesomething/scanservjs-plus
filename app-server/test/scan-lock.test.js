/* eslint-env mocha */
const assert = require('assert');

// ScanLock is a singleton — require a fresh instance for each test
// by deleting the cache entry between tests.
function freshLock() {
  const key = require.resolve('../src/classes/scan-lock');
  delete require.cache[key];
  return require('../src/classes/scan-lock');
}

describe('ScanLock', () => {
  it('acquires when idle', () => {
    const lock = freshLock();
    assert.doesNotThrow(() => lock.acquire('session-a'));
    assert.strictEqual(lock.busy, true);
  });

  it('same session can re-acquire (multi-page batch)', () => {
    const lock = freshLock();
    lock.acquire('session-a');
    assert.doesNotThrow(() => lock.acquire('session-a'));
  });

  it('different session is blocked while lock held', () => {
    const lock = freshLock();
    lock.acquire('session-a');
    let thrown;
    try { lock.acquire('session-b'); } catch (e) { thrown = e; }
    assert.ok(thrown, 'should have thrown');
    assert.strictEqual(thrown.code, 'SCANNER_BUSY');
  });

  it('releases correctly', () => {
    const lock = freshLock();
    lock.acquire('session-a');
    lock.release('session-a');
    assert.strictEqual(lock.busy, false);
    // another session can now acquire
    assert.doesNotThrow(() => lock.acquire('session-b'));
  });

  it('release from wrong session does nothing', () => {
    const lock = freshLock();
    lock.acquire('session-a');
    lock.release('session-b'); // wrong session — should be a no-op
    assert.strictEqual(lock.busy, true);
  });

  it('auto-releases after timeout', function (done) {
    this.timeout(500);
    const lock = freshLock();
    lock.acquire('session-a', 100); // 100ms timeout
    setTimeout(() => {
      assert.strictEqual(lock.busy, false);
      done();
    }, 150);
  });

  it('timeout resets on re-acquire by same session', function (done) {
    this.timeout(600);
    const lock = freshLock();
    lock.acquire('session-a', 200);
    setTimeout(() => {
      // Re-acquire at 100ms — resets the 200ms timer
      lock.acquire('session-a', 200);
    }, 100);
    setTimeout(() => {
      // At 250ms from start: first timer would have fired (100+200=300ms from start)
      // but the re-acquire reset it, so it should still be busy
      assert.strictEqual(lock.busy, true);
      done();
    }, 250);
  });
});
