#!/usr/bin/env node
const express = require('express');
const application = require('./application');
const config = application.config();
const OidcAuth = require('./classes/oidc-auth');
const UserStore = require('./classes/user-store');
const scanLock = require('./classes/scan-lock');
const ExpressConfigurer = require('./express-configurer');

async function start() {
  const oidcAuth = new OidcAuth(config);
  const userStore = new UserStore(config.usersDirectory);

  await oidcAuth.init();

  const app = express();

  ExpressConfigurer.with(app)
    .encoding()
    .session()
    .oidcMiddleware(oidcAuth)
    .userRecordMiddleware(userStore)
    .statics()
    .authRoutes(oidcAuth, userStore)
    .basicAuth()
    .swagger()
    .scanEndpoint(scanLock)
    .ephemeralEndpoint()
    .endpoints()
    .userEndpoints(oidcAuth, userStore);

  const server = app.listen(config.port, config.host, () => {
    const log = require('loglevel').getLogger('server');
    log.info(`scanservjs started listening on ${config.host}:${config.port}`);
  });

  server.setTimeout(config.timeout);
}

start().catch(err => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
