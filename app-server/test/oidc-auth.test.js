/* eslint-env mocha */
const assert = require('assert');
const OidcAuth = require('../src/classes/oidc-auth');

function makeConfig(overrides = {}) {
  return {
    oidc: Object.assign({
      enabled: false,
      issuer: '',
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      scope: 'openid profile email groups',
      groupsClaim: 'groups',
      adminGroup: 'scanservjs-admins',
      postLogoutRedirectUri: '',
    }, overrides),
  };
}

describe('OidcAuth.isAdmin', () => {
  it('returns false for null user', () => {
    const auth = new OidcAuth(makeConfig());
    assert.strictEqual(auth.isAdmin(null), false);
  });

  it('returns false when user has no groups', () => {
    const auth = new OidcAuth(makeConfig());
    assert.strictEqual(auth.isAdmin({ id: '1', groups: [] }), false);
  });

  it('returns true when user is in the admin group', () => {
    const auth = new OidcAuth(makeConfig());
    assert.strictEqual(auth.isAdmin({ id: '1', groups: ['users', 'scanservjs-admins'] }), true);
  });

  it('returns false when user is not in the admin group', () => {
    const auth = new OidcAuth(makeConfig());
    assert.strictEqual(auth.isAdmin({ id: '1', groups: ['users'] }), false);
  });

  it('returns false when adminGroup is not configured', () => {
    const auth = new OidcAuth(makeConfig({ adminGroup: '' }));
    assert.strictEqual(auth.isAdmin({ id: '1', groups: ['scanservjs-admins'] }), false);
  });

  it('returns false when user has no groups property', () => {
    const auth = new OidcAuth(makeConfig());
    assert.strictEqual(auth.isAdmin({ id: '1' }), false);
  });
});

describe('OidcAuth.middleware', () => {
  it('populates req.user from session', () => {
    const auth = new OidcAuth(makeConfig());
    const mw = auth.middleware();
    const user = { id: 'sub1', name: 'Alice' };
    const req = { session: { user } };
    let called = false;
    mw(req, {}, () => {
      called = true;
    });
    assert.strictEqual(req.user, user);
    assert.strictEqual(called, true);
  });

  it('sets req.user to null when session has no user', () => {
    const auth = new OidcAuth(makeConfig());
    const mw = auth.middleware();
    const req = { session: {} };
    mw(req, {}, () => {});
    assert.strictEqual(req.user, null);
  });

  it('sets req.user to null when there is no session', () => {
    const auth = new OidcAuth(makeConfig());
    const mw = auth.middleware();
    const req = {};
    mw(req, {}, () => {});
    assert.strictEqual(req.user, null);
  });
});

describe('OidcAuth.init (disabled)', () => {
  it('does not throw and stays uninitialized when OIDC disabled', async () => {
    const auth = new OidcAuth(makeConfig({ enabled: false }));
    await auth.init();
    assert.strictEqual(auth.initialized, false);
    assert.strictEqual(auth.client, null);
  });
});
