const log = require('loglevel').getLogger('ScanLock');

// Single scanner = one scan at a time. The lock is session-scoped so
// the same session can make multiple requests for a multi-page batch scan
// without being blocked, while other sessions get a 409.
class ScanLock {
  constructor() {
    this._sessionId = null;
    this._timer = null;
  }

  // Acquire for sessionId. Throws if held by a different session.
  // Auto-releases after timeoutMs to recover from crashed/abandoned scans.
  acquire(sessionId, timeoutMs = 300000) {
    if (this._sessionId !== null && this._sessionId !== sessionId) {
      const err = new Error('Scanner is busy');
      err.code = 'SCANNER_BUSY';
      throw err;
    }
    this._sessionId = sessionId;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      log.warn(`Scan lock auto-released after timeout (session: ${sessionId})`);
      this._sessionId = null;
    }, timeoutMs);
  }

  release(sessionId) {
    if (this._sessionId === sessionId) {
      clearTimeout(this._timer);
      this._sessionId = null;
    }
  }

  get busy() {
    return this._sessionId !== null;
  }
}

module.exports = new ScanLock();
