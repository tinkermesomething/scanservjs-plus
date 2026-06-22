/* eslint-env mocha */
const assert = require('assert');
const lock = require('../src/classes/scan-lock');

// Reset singleton state between tests
function reset() {
  if (lock._timer) {
    clearTimeout(lock._timer);
    lock._timer = null;
  }
  lock._sessionId = null;
}

describe('ScanLock', () => {
  afterEach(reset);

  it('acquires when idle', () => {
    assert.doesNotThrow(() => lock.acquire('session-a'));
    assert.strictEqual(lock.busy, true);
  });

  it('same session can re-acquire (multi-page batch)', () => {
    lock.acquire('session-a');
    assert.doesNotThrow(() => lock.acquire('session-a'));
  });

  it('different session is blocked while lock held', () => {
    lock.acquire('session-a');
    assert.throws(
      () => lock.acquire('session-b'),
      (err) => {
        assert.strictEqual(err.code, 'SCANNER_BUSY');
        return true;
      }
    );
  });

  it('releases correctly', () => {
    lock.acquire('session-a');
    lock.release('session-a');
    assert.strictEqual(lock.busy, false);
    assert.doesNotThrow(() => lock.acquire('session-b'));
  });

  it('release from wrong session does nothing', () => {
    lock.acquire('session-a');
    lock.release('session-b'); // wrong session — no-op
    assert.strictEqual(lock.busy, true);
  });

  it('auto-releases after timeout', function (done) {
    this.timeout(500);
    lock.acquire('session-a', 100);
    setTimeout(() => {
      assert.strictEqual(lock.busy, false);
      done();
    }, 150);
  });

  it('timeout resets on re-acquire by same session', function (done) {
    this.timeout(600);
    lock.acquire('session-a', 200);
    setTimeout(() => {
      lock.acquire('session-a', 200); // re-acquire at 100ms resets 200ms timer
    }, 100);
    setTimeout(() => {
      // 250ms: original timer would have fired at 200ms, but reset means it fires at 300ms
      assert.strictEqual(lock.busy, true);
      done();
    }, 250);
  });
});
