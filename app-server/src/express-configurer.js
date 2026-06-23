const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const basicAuth = require('express-basic-auth');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const rootLog = require('loglevel');
const prefix = require('loglevel-plugin-prefix');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const FileInfo = require('./classes/file-info');
const application = require('./application');
const config = application.config();

// We need to apply logging setting prior to anything else using a logger
prefix.reg(rootLog);
rootLog.enableAll();
rootLog.setLevel(config.log.level);
prefix.apply(rootLog, config.log.prefix);

const log = rootLog.getLogger('Http');
const api = require('./api');

/**
 * @param {import('express').Response} res
 * @param {number} code
 * @param {any} data
 */
function sendError(res, code, data) {
  let content = {
    message: ''
  };
  log.error(data);
  if (typeof data === 'object') {
    content.message = data.message || JSON.stringify(data);
    content.code = data.code || -1;
  } else if (typeof data === 'string') {
    content.message = data;
  }
  res.status(code).send(content);
}

/**
 * @param {import('express').Request} req
 */
function formatForLog(req) {
  const properties = ['method', 'path', 'params', 'query', 'body'];
  const output = properties
    .filter(property => property in req)
    .filter(property => typeof req[property] === 'string'
      || (typeof req[property] === 'object' && Object.keys(req[property]).length > 0))
    .reduce((accumulator, property) => {
      accumulator[property] = req[property];
      return accumulator;
    }, {});
  return output;
}

/**
 * Returns the output directory for the requesting user.
 * Falls back to global outputDirectory when OIDC is disabled (unchanged behaviour).
 * Returns null for guests or users with no directory assigned when OIDC is on.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function resolveDir(req) {
  if (!config.oidc.enabled) {
    return config.outputDirectory;
  }
  return (req.userRecord && req.userRecord.outputDirectory) || null;
}

/**
 * Definition of all endpoints
 */
const EndpointSpecs = [
  {
    method: 'delete',
    path: '/api/v1/context',
    callback: async (req, res) => {
      api.deleteContext();
      res.send({});
    }
  },
  {
    method: 'get',
    path: '/api/v1/context',
    callback: async (req, res) => res.send(await api.readContext())
  },
  {
    method: 'get',
    path: '/api/v1/files',
    callback: async (req, res) => {
      const dir = resolveDir(req);
      if (!dir) {
        return res.send([]);
      }
      res.send(await api.fileList(dir));
    }
  },
  {
    method: 'post',
    path: /\/api\/v1\/files\/([^/]+)\/actions\/([^/]+)/,
    callback: async (req, res) => {
      const dir = resolveDir(req);
      if (!dir) {
        return res.status(403).json({ message: 'No output directory assigned' });
      }
      const fileName = req.params[0];
      const actionName = req.params[1];
      await api.fileAction(actionName, fileName, dir);
      res.send('200');
    }
  },
  {
    method: 'get',
    path: /\/api\/v1\/files\/([^/]+)\/thumbnail/,
    callback: async (req, res) => {
      const name = req.params[0];
      const buffer = await api.readThumbnail(name);
      res.type('jpg');
      res.send(buffer);
    }
  },
  {
    method: 'get',
    path: /\/api\/v1\/files\/([^/]+)/,
    callback: async (req, res) => {
      const dir = resolveDir(req);
      if (!dir) {
        return res.status(403).json({ message: 'No output directory assigned' });
      }
      const name = req.params[0];
      const file = FileInfo.unsafe(dir, name);
      res.download(file.fullname);
    }
  },
  {
    method: 'delete',
    path: '/api/v1/files/*',
    callback: async (req, res) => {
      const dir = resolveDir(req);
      if (!dir) {
        return res.status(403).json({ message: 'No output directory assigned' });
      }
      res.send(api.fileDelete(req.params[0], dir));
    }
  },
  {
    method: 'put',
    path: '/api/v1/files/*',
    callback: async (req, res) => {
      const dir = resolveDir(req);
      if (!dir) {
        return res.status(403).json({ message: 'No output directory assigned' });
      }
      const name = req.params[0];
      const newName = req.body.newName;
      await FileInfo.unsafe(dir, name).rename(newName);
      const thumbnail = FileInfo.unsafe(config.thumbnailDirectory, name);
      if (thumbnail.exists()) {
        thumbnail.rename(newName);
      }
      res.send('200');
    }
  },
  {
    method: 'get',
    path: '/api/v1/preview',
    callback: async (req, res) => {
      const buffer = await api.readPreview(req.query.filter);
      res.send({
        content: buffer.toString('base64')
      });
    }
  },
  {
    method: 'delete',
    path: '/api/v1/preview',
    callback: async (req, res) => res.send(api.deletePreview())
  },
  {
    method: 'post',
    path: '/api/v1/preview',
    callback: async (req, res) => res.send(await api.createPreview(req.body))
  },
  {
    method: 'get',
    path: '/api/v1/system',
    callback: async (req, res) => res.send(await api.readSystem())
  }
];

module.exports = class ExpressConfigurer {
  /**
   * Constructor
   * @param {import('express').Express} app
   */
  constructor(app) {
    this.app = app;
    this.app.use(cors());

    try {
      fs.mkdirSync(config.outputDirectory, { recursive: true });
      fs.mkdirSync(config.thumbnailDirectory, { recursive: true });
      fs.mkdirSync(config.tempDirectory, { recursive: true });
      fs.mkdirSync(config.ephemeralDirectory, { recursive: true });
      this._cleanupEphemeral();
    } catch (exception) {
      log.warn(`Error ensuring output and temp directories exist: ${exception}`);
      log.warn(`Currently running node version ${process.version}.`);
    }
  }

  /**
   * Configures session middleware (required for OIDC)
   * @returns {ExpressConfigurer}
   */
  session() {
    const FileStore = require('session-file-store')(session);
    fs.mkdirSync(config.sessionsDirectory, { recursive: true });

    this.app.use(session({
      store: new FileStore({
        path: config.sessionsDirectory,
        ttl: config.session.maxAge / 1000,
        reapInterval: 3600,
        logFn: () => {},
      }),
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: config.session.secure,
        sameSite: 'lax',
        maxAge: config.session.maxAge,
        httpOnly: true,
      },
    }));
    return this;
  }

  /**
   * Installs OIDC middleware that populates req.user from session
   * @param {import('./classes/oidc-auth')} oidcAuth
   * @returns {ExpressConfigurer}
   */
  oidcMiddleware(oidcAuth) {
    this.app.use(oidcAuth.middleware());
    this._oidcAuth = oidcAuth;
    return this;
  }

  /**
   * Registers /auth/* routes (must be before basicAuth)
   * @param {import('./classes/oidc-auth')} oidcAuth
   * @param {import('./classes/user-store')} userStore
   * @returns {ExpressConfigurer}
   */
  authRoutes(oidcAuth, userStore) {
    if (!config.oidc.enabled) {
      return this;
    }
    this.app.get('/auth/login', oidcAuth.loginHandler());
    this.app.get('/auth/callback', oidcAuth.callbackHandler(userStore));
    this.app.get('/auth/logout', oidcAuth.logoutHandler());
    return this;
  }

  /**
   * Registers /api/v1/user/* endpoints
   * @param {import('./classes/oidc-auth')} oidcAuth
   * @param {import('./classes/user-store')} userStore
   * @returns {ExpressConfigurer}
   */
  userEndpoints(oidcAuth, userStore) {
    // Who am I?
    this.app.get('/api/v1/user/me', (req, res) => {
      res.json({
        isGuest: !req.user,
        oidcEnabled: config.oidc.enabled,
        user: req.user ? {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          isAdmin: oidcAuth.isAdmin(req.user),
        } : null,
      });
    });

    // Get logged-in user's stored settings
    this.app.get('/api/v1/user/settings', (req, res) => {
      if (!req.user) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      const record = userStore.get(req.user.id) || {};
      res.json({
        outputDirectory: record.outputDirectory || null,
      });
    });

    // Update logged-in user's settings
    this.app.put('/api/v1/user/settings', (req, res) => {
      if (!req.user) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const { outputDirectory } = req.body;

      // Validate the requested directory is in the configured allowlist
      if (outputDirectory !== null && outputDirectory !== undefined) {
        const allowed = config.outputDirectories.map(d => d.path);
        if (!allowed.includes(outputDirectory)) {
          return res.status(400).json({ message: 'Directory not permitted' });
        }
      }

      userStore.upsert(req.user.id, { outputDirectory: outputDirectory || null });
      res.json({ ok: true });
    });

    // Get logged-in user's stored scan params
    this.app.get('/api/v1/user/scan-params', (req, res) => {
      if (!req.user) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      const record = userStore.get(req.user.id) || {};
      res.json(record.scanParams || {});
    });

    // Store logged-in user's scan params (no server-side validation — user's own settings)
    this.app.put('/api/v1/user/scan-params', (req, res) => {
      if (!req.user) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      userStore.upsert(req.user.id, { scanParams: req.body });
      res.json({ ok: true });
    });

    return this;
  }

  /**
   * Configures basic authentication (skipped when OIDC is enabled)
   * @returns {ExpressConfigurer}
   */
  basicAuth() {
    if (config.oidc.enabled) {
      return this;
    }
    if (Object.keys(config.users).length > 0) {
      this.app.use(basicAuth({
        users: config.users,
        challenge: true,
      }));
    }
    return this;
  }

  /**
   * Configures encoding
   * @returns {ExpressConfigurer}
   */
  encoding() {
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.json());
    return this;
  }

  /**
   * Configures endpoints
   * @returns {ExpressConfigurer}
   */
  endpoints() {
    EndpointSpecs.forEach(spec => {
      this.app[spec.method](spec.path, async (req, res) => {
        log.info(formatForLog(req));
        try {
          await spec.callback(req, res);
        } catch (error) {
          sendError(res, 500, error);
        }
      });
    });
    return this;
  }

  /**
   * Configures statics
   * @returns {ExpressConfigurer}
   */
  statics() {
    this.app.use(express.static('client'));
    return this;
  }

  /**
   * Configures swagger
   * @returns {ExpressConfigurer}
   */
  swagger() {
    const swaggerSpec = swaggerJsdoc({
      failOnErrors: true,
      swaggerDefinition: {
        openapi: '3.0.0',
        info: {
          title: config.applicationName,
          description: config.applicationDescription,
          version: config.version,
        },
      },
      apis: [
        path.join(__dirname, 'swagger.yml')
      ],
    });

    const swaggerUiOptions = {
      swaggerOptions: {
        url: '/api-docs/swagger.json',
      },
    };

    this.app.get(
      swaggerUiOptions.swaggerOptions.url,
      (req, res) => res.json(swaggerSpec));

    this.app.use(
      '/api-docs',
      swaggerUi.serveFiles(swaggerSpec, swaggerUiOptions),
      swaggerUi.setup(swaggerSpec, swaggerUiOptions));

    return this;
  }

  /**
   * Deletes ephemeral files older than the session max age on startup.
   * Handles the case where a session expired before the download happened.
   */
  _cleanupEphemeral() {
    const cutoff = Date.now() - config.session.maxAge;
    try {
      fs.readdirSync(config.ephemeralDirectory).forEach(f => {
        const fp = path.join(config.ephemeralDirectory, f);
        try {
          if (fs.statSync(fp).mtimeMs < cutoff) {
            fs.unlinkSync(fp);
            log.info(`Removed stale ephemeral file: ${f}`);
          }
        } catch { /* already gone */ }
      });
    } catch { /* directory may not exist yet on first boot */ }
  }

  /**
   * Middleware that loads the user's stored record and attaches it to req.userRecord.
   * Must run after oidcMiddleware so req.user is already populated.
   * @param {import('./classes/user-store')} userStore
   * @returns {ExpressConfigurer}
   */
  userRecordMiddleware(userStore) {
    this.app.use((req, _res, next) => {
      req.userRecord = req.user ? (userStore.get(req.user.id) || {}) : null;
      next();
    });
    return this;
  }

  /**
   * Registers POST /api/v1/scan with concurrency lock and ephemeral download flow.
   * @param {import('./classes/scan-lock')} scanLock
   * @returns {ExpressConfigurer}
   */
  scanEndpoint(scanLock) {
    this.app.post('/api/v1/scan', async (req, res) => {
      log.info(formatForLog(req));
      const sessionId = req.session.id;
      const isFirstPass = req.body.index === 1;

      if (isFirstPass) {
        try {
          scanLock.acquire(sessionId);
        } catch (e) {
          return sendError(res, 409, e);
        }
      }

      // Determine whether this scan goes to a persistent directory or is ephemeral
      const outputDirectory = resolveDir(req);
      const ephemeral = !outputDirectory;
      const scanContext = {
        outputDirectory: ephemeral ? config.ephemeralDirectory : outputDirectory,
      };

      try {
        const result = await api.scan(req.body, scanContext);
        const isComplete = result && result.file;

        if (isComplete) {
          scanLock.release(sessionId);

          if (ephemeral) {
            // One-time download token stored in the session
            const token = crypto.randomUUID();
            if (!req.session.ephemeralTokens) {
              req.session.ephemeralTokens = {};
            }
            req.session.ephemeralTokens[token] = {
              path: result.file.fullname,
              filename: result.file.name,
            };
            return res.send({ ephemeral: true, token, filename: result.file.name });
          }

          return res.send({ file: { name: result.file.name } });
        }

        // Intermediate batch pass — pass through index/image for the BatchDialog
        res.send(result);
      } catch (err) {
        scanLock.release(sessionId);
        sendError(res, 500, err);
      }
    });
    return this;
  }

  /**
   * Registers GET /api/v1/ephemeral/:token — one-time authenticated file download.
   * File is deleted from disk immediately after being served.
   * @returns {ExpressConfigurer}
   */
  ephemeralEndpoint() {
    this.app.get('/api/v1/ephemeral/:token', (req, res) => {
      const { token } = req.params;
      const tokens = (req.session && req.session.ephemeralTokens) || {};
      const entry = tokens[token];

      if (!entry) {
        return sendError(res, 404, 'Download token not found or already used');
      }

      // Consume the token immediately — one-time use
      delete req.session.ephemeralTokens[token];

      const { path: filePath, filename } = entry;

      if (!fs.existsSync(filePath)) {
        return sendError(res, 404, 'File not found');
      }

      res.download(filePath, filename, (err) => {
        try {
          fs.unlinkSync(filePath);
        } catch { /* already gone */ }
        if (err) {
          log.warn(`Ephemeral download error for ${filename}: ${err.message}`);
        }
      });
    });
    return this;
  }

  /**
   * Admin endpoints: user list, directory assignment, user removal.
   * All routes require admin group membership (checked via OIDC groups claim).
   * @param {import('./classes/oidc-auth')} oidcAuth
   * @param {import('./classes/user-store')} userStore
   * @returns {ExpressConfigurer}
   */
  adminEndpoints(oidcAuth, userStore) {
    if (!config.oidc.enabled) {
      return this;
    }

    const adminGuard = (req, res, next) => {
      if (!req.user || !oidcAuth.isAdmin(req.user)) {
        return res.status(403).json({ message: 'Admin access required' });
      }
      next();
    };

    this.app.get('/api/v1/admin/users', adminGuard, (_req, res) => {
      res.json(userStore.list());
    });

    this.app.put('/api/v1/admin/users/:id', adminGuard, (req, res) => {
      const { outputDirectory } = req.body;
      if (outputDirectory) {
        const allowed = config.outputDirectories.map(d => d.path);
        if (!allowed.includes(outputDirectory)) {
          return res.status(400).json({ message: 'Directory not permitted' });
        }
      }
      const updated = userStore.upsert(req.params.id, { outputDirectory: outputDirectory || null });
      res.json(updated);
    });

    this.app.delete('/api/v1/admin/users/:id', adminGuard, (req, res) => {
      const deleted = userStore.delete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json({ ok: true });
    });

    this.app.get('/api/v1/admin/directories', adminGuard, (_req, res) => {
      res.json(config.outputDirectories);
    });

    return this;
  }

  /**
   * Configures express
   * @param {import('express').Express} app
   */
  static with(app) {
    return new ExpressConfigurer(app);
  }
};
