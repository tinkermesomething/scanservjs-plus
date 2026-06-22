/* eslint-env mocha */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const UserStore = require('../src/classes/user-store');

describe('UserStore', () => {
  let store;
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'userstore-test-'));
    store = new UserStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for unknown user', () => {
    assert.strictEqual(store.get('nobody'), null);
  });

  it('saves and retrieves a user', () => {
    store.save('sub123', { id: 'sub123', name: 'Alice', email: 'alice@test.com' });
    const user = store.get('sub123');
    assert.strictEqual(user.id, 'sub123');
    assert.strictEqual(user.name, 'Alice');
    assert.strictEqual(user.email, 'alice@test.com');
  });

  it('upsert merges into existing record', () => {
    store.save('sub123', { id: 'sub123', name: 'Alice', outputDirectory: null });
    store.upsert('sub123', { outputDirectory: '/mnt/nas/family', lastLogin: '2026-01-01' });
    const user = store.get('sub123');
    assert.strictEqual(user.name, 'Alice');
    assert.strictEqual(user.outputDirectory, '/mnt/nas/family');
  });

  it('upsert creates record if absent', () => {
    store.upsert('sub456', { id: 'sub456', name: 'Bob' });
    assert.strictEqual(store.get('sub456').name, 'Bob');
  });

  it('lists all users', () => {
    store.save('sub1', { id: 'sub1', name: 'Alice' });
    store.save('sub2', { id: 'sub2', name: 'Bob' });
    const users = store.list();
    assert.strictEqual(users.length, 2);
  });

  it('delete removes user', () => {
    store.save('sub1', { id: 'sub1', name: 'Alice' });
    const removed = store.delete('sub1');
    assert.strictEqual(removed, true);
    assert.strictEqual(store.get('sub1'), null);
  });

  it('delete returns false for unknown user', () => {
    assert.strictEqual(store.delete('nobody'), false);
  });

  it('sanitises path traversal characters in userId', () => {
    store.save('../../../etc/passwd', { id: 'evil', name: 'Hacker' });
    const files = fs.readdirSync(tmpDir);
    // Resulting filename must not escape the directory
    assert(files.every(f => !f.startsWith('.')));
    assert(files.every(f => !f.includes('/')));
  });

  it('sanitises special characters in userId', () => {
    // userId with special chars should produce a safe filename
    store.save('user with spaces!@#', { id: 'x', name: 'X' });
    const files = fs.readdirSync(tmpDir);
    assert.strictEqual(files.length, 1);
    assert(!files[0].includes(' '));
  });
});
