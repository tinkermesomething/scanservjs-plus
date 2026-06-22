const fs = require('fs');
const path = require('path');
const log = require('loglevel').getLogger('UserStore');

class UserStore {
  constructor(usersDirectory) {
    this.usersDir = usersDirectory;
    fs.mkdirSync(this.usersDir, { recursive: true });
  }

  // Prevent path traversal: only allow safe chars, then strip any leading dots
  // so the result is never a hidden file and can't start a relative traversal.
  _filePath(userId) {
    const safe = userId.replace(/[^a-zA-Z0-9@._-]/g, '_').replace(/^\.+/, '_');
    return path.join(this.usersDir, `${safe}.json`);
  }

  get(userId) {
    const file = this._filePath(userId);
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  }

  save(userId, data) {
    const file = this._filePath(userId);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    log.debug(`Saved user: ${userId}`);
  }

  // Merge updates into existing record; creates if absent
  upsert(userId, updates) {
    const existing = this.get(userId) || {};
    this.save(userId, Object.assign(existing, updates));
  }

  list() {
    try {
      return fs.readdirSync(this.usersDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          try {
            return JSON.parse(fs.readFileSync(path.join(this.usersDir, f), 'utf8'));
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch (e) {
      log.warn('Failed to list users:', e.message);
      return [];
    }
  }

  delete(userId) {
    const file = this._filePath(userId);
    try {
      fs.unlinkSync(file);
      log.debug(`Deleted user: ${userId}`);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = UserStore;
