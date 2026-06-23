const { Issuer, generators } = require('openid-client');
const log = require('loglevel').getLogger('OidcAuth');

class OidcAuth {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.initialized = false;
  }

  async init() {
    if (!this.config.oidc.enabled) {
      log.info('OIDC disabled');
      return;
    }

    if (!this.config.oidc.issuer) {
      throw new Error('OIDC_ISSUER is required when OIDC_ENABLED=true');
    }
    if (!this.config.oidc.clientId) {
      throw new Error('OIDC_CLIENT_ID is required when OIDC_ENABLED=true');
    }
    if (!this.config.oidc.redirectUri) {
      throw new Error('OIDC_REDIRECT_URI is required when OIDC_ENABLED=true');
    }

    log.info(`Discovering OIDC issuer: ${this.config.oidc.issuer}`);
    const issuer = await Issuer.discover(this.config.oidc.issuer);
    log.info(`OIDC issuer discovered: ${issuer.metadata.issuer}`);

    this.client = new issuer.Client({
      client_id: this.config.oidc.clientId,
      client_secret: this.config.oidc.clientSecret,
      redirect_uris: [this.config.oidc.redirectUri],
      response_types: ['code'],
    });

    this.initialized = true;
    log.info('OIDC client ready');
  }

  // Express middleware: populates req.user from session (null for guests)
  middleware() {
    return (req, _res, next) => {
      req.user = (req.session && req.session.user) ? req.session.user : null;
      next();
    };
  }

  isAdmin(user) {
    if (!user || !this.config.oidc.adminGroup) {
      return false;
    }
    const groups = user.groups || [];
    return groups.includes(this.config.oidc.adminGroup);
  }

  // Route handler: GET /auth/login
  loginHandler() {
    return (req, res) => {
      if (!this.initialized) {
        return res.status(503).json({ message: 'OIDC not initialized' });
      }

      const state = generators.state();
      const nonce = generators.nonce();
      const codeVerifier = generators.codeVerifier();

      req.session.oidcState = state;
      req.session.oidcNonce = nonce;
      req.session.oidcCodeVerifier = codeVerifier;
      // Only accept same-origin paths — reject absolute URLs (open redirect)
      const returnTo = req.query.returnTo || '/';
      req.session.returnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';

      const url = this.client.authorizationUrl({
        scope: this.config.oidc.scope,
        state,
        nonce,
        code_challenge: generators.codeChallenge(codeVerifier),
        code_challenge_method: 'S256',
      });

      req.session.save((err) => {
        if (err) { log.warn('Session save failed before OIDC redirect:', err.message); }
        res.redirect(url);
      });
    };
  }

  // Route handler: GET /auth/callback
  callbackHandler(userStore) {
    return async (req, res) => {
      if (!this.initialized) {
        return res.status(503).json({ message: 'OIDC not initialized' });
      }

      const params = this.client.callbackParams(req);
      const checks = {
        state: req.session.oidcState,
        nonce: req.session.oidcNonce,
        code_verifier: req.session.oidcCodeVerifier,
      };

      let tokenSet;
      try {
        tokenSet = await this.client.callback(
          this.config.oidc.redirectUri,
          params,
          checks
        );
      } catch (err) {
        log.error('OIDC callback failed:', err.message);
        return res.redirect('/?error=auth_failed');
      }

      const claims = tokenSet.claims();
      let userinfo = claims;
      try {
        userinfo = await this.client.userinfo(tokenSet);
      } catch (e) {
        // Pocket-ID may include all claims in the id_token; fall back gracefully
        log.warn('userinfo request failed, using id_token claims:', e.message);
      }

      const user = {
        id: claims.sub,
        name: userinfo.name || userinfo.preferred_username || claims.sub,
        email: userinfo.email || claims.email || '',
        // groups claim may live in userinfo or id_token depending on provider config
        groups: userinfo[this.config.oidc.groupsClaim]
          || claims[this.config.oidc.groupsClaim]
          || [],
        idToken: tokenSet.id_token,
      };

      // Persist/update the user record (minus the id_token)
      userStore.upsert(user.id, {
        id: user.id,
        name: user.name,
        email: user.email,
        groups: user.groups,
        lastLogin: new Date().toISOString(),
      });

      // Clean OIDC flow state from session then store the user
      delete req.session.oidcState;
      delete req.session.oidcNonce;
      delete req.session.oidcCodeVerifier;
      req.session.user = user;

      const returnTo = req.session.returnTo || '/';
      delete req.session.returnTo;

      log.info(`User logged in: ${user.email || user.id}`);
      req.session.save((err) => {
        if (err) { log.warn('Session save failed after OIDC callback:', err.message); }
        res.redirect(returnTo);
      });
    };
  }

  // Route handler: GET /auth/logout
  logoutHandler() {
    return (req, res) => {
      const idToken = req.session.user && req.session.user.idToken;

      req.session.destroy(() => {
        res.clearCookie('connect.sid');

        if (
          this.initialized &&
          idToken &&
          this.client.issuer.metadata.end_session_endpoint
        ) {
          const postLogout = this.config.oidc.postLogoutRedirectUri
            || this.config.oidc.redirectUri.replace('/auth/callback', '/');

          const logoutUrl = this.client.endSessionUrl({
            id_token_hint: idToken,
            post_logout_redirect_uri: postLogout,
          });
          return res.redirect(logoutUrl);
        }

        res.redirect('/');
      });
    };
  }
}

module.exports = OidcAuth;
