import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { PublicationError } from './errors.mjs';
import { getFirebaseAdmin as defaultGetFirebaseAdmin } from './infra/firebaseAdmin.mjs';
import { createAdminRouter } from './routes/admin.mjs';
import { createDemoResetRouter } from './routes/demoReset.mjs';
import { createDemoStatusRouter } from './routes/demoStatus.mjs';
import { createDevLoginRouter } from './routes/devLogin.mjs';
import { createHealthRouter } from './routes/health.mjs';
import { createOfficialPublishRouter } from './routes/officialPublish.mjs';
import { createOfficialScheduleRouter } from './routes/officialSchedule.mjs';
import { createOfficialStatusRouter } from './routes/officialStatus.mjs';
import { createPublishRouter } from './routes/publish.mjs';

function isSafeDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return false;
  }

  return Object.values(details).every((value) => {
    if (typeof value === 'string') {
      return value.length <= 120;
    }

    return typeof value === 'number' || typeof value === 'boolean' || value === null;
  });
}

function buildPublicationErrorBody(err, requestId) {
  const error = {
    code: err.code,
    message: err.message,
    requestId,
  };

  if (isSafeDetails(err.details)) {
    error.details = err.details;
  }

  return { error };
}

export function createApp(config, overrides = {}) {
  const app = express();
  const allowedOrigins = new Set(config.allowedOrigins);
  const routeDependencies = {
    getFirebaseAdmin: overrides.getFirebaseAdmin ?? defaultGetFirebaseAdmin,
    config,
    store: overrides.store,
    loadDemoFixture: overrides.loadDemoFixture,
  };

  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, origin || false);
        return;
      }

      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  }));

  app.use(express.json({ limit: config.maxJsonBodyBytes }));

  app.use('/api/health', createHealthRouter());
  app.use('/api/demo/status', createDemoStatusRouter(routeDependencies));
  app.use('/api/demo/reset', createDemoResetRouter(routeDependencies));
  app.use('/api/publish', createPublishRouter(routeDependencies));
  app.use('/api/official/status', createOfficialStatusRouter(routeDependencies));
  app.use('/api/official/schedule', createOfficialScheduleRouter(routeDependencies));
  app.use('/api/publish/official', createOfficialPublishRouter(routeDependencies));
  app.use('/api/admin', createAdminRouter(routeDependencies));
  if (config.devLocalAuthEnabled === true && config.nodeEnv !== 'production') {
    app.use('/api/dev', createDevLoginRouter(routeDependencies));
  }

  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'API_UNAVAILABLE',
        message: 'Rota não encontrada.',
        requestId: req.requestId,
      },
    });
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    if (err instanceof PublicationError) {
      res.status(err.httpStatus).json(buildPublicationErrorBody(err, req.requestId));
      return;
    }

    if (err.type === 'entity.too.large') {
      res.status(err.status ?? 413).json({
        error: {
          code: 'API_UNAVAILABLE',
          message: 'Corpo JSON excede o limite permitido.',
          requestId: req.requestId,
        },
      });
      return;
    }

    console.error(err);
    res.status(500).json({
      error: {
        code: 'API_UNAVAILABLE',
        message: 'Erro interno.',
        requestId: req.requestId,
      },
    });
  });

  return app;
}
