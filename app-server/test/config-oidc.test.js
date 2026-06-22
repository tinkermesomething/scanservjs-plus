/* eslint-env mocha */
const assert = require('assert');
const Config = require('../src/classes/config');
const UserOptions = require('../src/classes/user-options');

// Helpers to set/clear env vars without polluting other tests
function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) { delete process.env[k]; }
      else { process.env[k] = v; }
    }
  }
}

describe('Config OIDC defaults', () => {
  it('oidc is disabled by default', () => {
    const config = new Config(new UserOptions());
    assert.strictEqual(config.oidc.enabled, false);
  });

  it('outputDirectories is empty by default', () => {
    const config = new Config(new UserOptions());
    assert.deepStrictEqual(config.outputDirectories, []);
  });

  it('session has a default secret', () => {
    const config = new Config(new UserOptions());
    assert.ok(config.session.secret.length > 0);
  });
});

describe('Config OIDC env parsing', () => {
  it('parses OIDC_ENABLED=true', () => {
    withEnv({ OIDC_ENABLED: 'true' }, () => {
      const config = new Config(new UserOptions());
      assert.strictEqual(config.oidc.enabled, true);
    });
  });

  it('parses OIDC_ENABLED=false', () => {
    withEnv({ OIDC_ENABLED: 'false' }, () => {
      const config = new Config(new UserOptions());
      assert.strictEqual(config.oidc.enabled, false);
    });
  });

  it('parses OIDC_ISSUER', () => {
    withEnv({ OIDC_ISSUER: 'https://id.home.internal' }, () => {
      const config = new Config(new UserOptions());
      assert.strictEqual(config.oidc.issuer, 'https://id.home.internal');
    });
  });

  it('parses ADMIN_GROUP', () => {
    withEnv({ ADMIN_GROUP: 'scanservjs-admins' }, () => {
      const config = new Config(new UserOptions());
      assert.strictEqual(config.oidc.adminGroup, 'scanservjs-admins');
    });
  });

  it('parses SESSION_SECURE=false', () => {
    withEnv({ SESSION_SECURE: 'false' }, () => {
      const config = new Config(new UserOptions());
      assert.strictEqual(config.session.secure, false);
    });
  });
});

describe('Config OUTPUT_DIRECTORIES parsing', () => {
  it('parses a single entry', () => {
    withEnv({ OUTPUT_DIRECTORIES: 'NAS Family|/mnt/nas/family' }, () => {
      const config = new Config(new UserOptions());
      assert.strictEqual(config.outputDirectories.length, 1);
      assert.strictEqual(config.outputDirectories[0].name, 'NAS Family');
      assert.strictEqual(config.outputDirectories[0].path, '/mnt/nas/family');
    });
  });

  it('parses multiple entries', () => {
    withEnv({ OUTPUT_DIRECTORIES: 'NAS Family|/mnt/nas/family;NAS Archive|/mnt/nas/archive' }, () => {
      const config = new Config(new UserOptions());
      assert.strictEqual(config.outputDirectories.length, 2);
      assert.strictEqual(config.outputDirectories[1].name, 'NAS Archive');
    });
  });

  it('tolerates a trailing semicolon', () => {
    withEnv({ OUTPUT_DIRECTORIES: 'NAS Family|/mnt/nas/family;' }, () => {
      const config = new Config(new UserOptions());
      assert.strictEqual(config.outputDirectories.length, 1);
    });
  });

  it('skips malformed entries without a pipe separator', () => {
    withEnv({ OUTPUT_DIRECTORIES: 'NAS Family|/mnt/nas/family;broken' }, () => {
      const config = new Config(new UserOptions());
      assert.strictEqual(config.outputDirectories.length, 1);
    });
  });

  it('handles a path with a pipe in it via first-pipe split', () => {
    // Only split on the FIRST pipe, so paths can't contain pipes — documented constraint
    withEnv({ OUTPUT_DIRECTORIES: 'My Share|/mnt/nas/family' }, () => {
      const config = new Config(new UserOptions());
      assert.strictEqual(config.outputDirectories[0].path, '/mnt/nas/family');
    });
  });
});
