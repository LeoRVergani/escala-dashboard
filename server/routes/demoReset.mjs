import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Router } from 'express';
import { validateDemoPackage } from '../domain/demoPackageValidator.mjs';
import { executeAtomicPublication } from '../domain/executeAtomicPublication.mjs';
import { PublicationError } from '../errors.mjs';
import { resolvePublicationStore } from '../infra/resolvePublicationStore.mjs';

const DEMO_WORKSPACE_ID = 'demo-v1';
const RESET_CONFIRMATION = 'RESET DEMO demo-v1';

const ROUTE_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(ROUTE_DIR, '../../fixtures/demo');

export async function loadCanonicalDemoFixture() {
  const [packageRaw, manifestRaw] = await Promise.all([
    readFile(resolve(FIXTURE_DIR, 'demo-v1-publication-package.json'), 'utf8'),
    readFile(resolve(FIXTURE_DIR, 'demo-v1-manifest.json'), 'utf8'),
  ]);
  JSON.parse(packageRaw);
  JSON.parse(manifestRaw);

  return { packageRaw, manifestRaw };
}

export function createDemoResetRouter({
  getFirebaseAdmin,
  config,
  store,
  loadDemoFixture = loadCanonicalDemoFixture,
}) {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      if (req.body?.workspaceId !== DEMO_WORKSPACE_ID) {
        throw new PublicationError('WORKSPACE_NOT_ALLOWED', 'Somente o workspace demo-v1 pode ser restaurado.');
      }

      if (req.body?.confirmation !== RESET_CONFIRMATION) {
        throw new PublicationError('INVALID_CONFIRMATION', 'Frase de confirmação ausente ou incorreta.');
      }

      const idempotencyKey = req.body?.idempotencyKey;
      if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
        throw new PublicationError('INVALID_PACKAGE', 'idempotencyKey é obrigatório para restaurar.');
      }

      if (config.allowDemoFirestoreWrite !== true) {
        throw new PublicationError(
          'DEMO_WRITE_DISABLED',
          'A escrita no Firestore está desabilitada (ALLOW_DEMO_FIRESTORE_WRITE não é true).',
        );
      }

      const resolved = resolvePublicationStore({ getFirebaseAdmin, config, store });
      if (!resolved.configured) {
        throw new PublicationError('FIREBASE_ADMIN_NOT_CONFIGURED', 'Firebase Admin não está configurado.');
      }

      let fixture;
      try {
        fixture = await loadDemoFixture();
      } catch (err) {
        // err.message de falhas de fs (ENOENT, etc.) costuma incluir o caminho absoluto do
        // arquivo - loga só o code/name para não vazar o path local do servidor.
        console.error('demo_reset_fixture_load_failed', {
          requestId: req.requestId,
          workspaceId: DEMO_WORKSPACE_ID,
          errorName: err?.name,
          errorCode: err?.code,
        });
        throw new PublicationError(
          'DEMO_RESET_FAILED',
          'Não foi possível carregar a fixture canônica do demo-v1.',
        );
      }

      const validation = validateDemoPackage({
        packageRaw: fixture.packageRaw,
        manifestRaw: fixture.manifestRaw,
      });

      if (!validation.ok) {
        throw new PublicationError(validation.code, validation.message);
      }

      const result = await executeAtomicPublication({
        store: resolved.store,
        workspaceId: DEMO_WORKSPACE_ID,
        expectedActiveRevision: req.body.expectedActiveRevision ?? 0,
        idempotencyKey,
        meta: {
          publishedByMode: 'RESET',
          source: 'DEMO_REMOTE_RESET',
          dryRun: false,
          schemaVersion: 1,
        },
        package: validation.package,
        writeFailureCode: 'DEMO_RESET_FAILED',
        writeFailureMessage: 'Não foi possível gravar os documentos da restauração.',
        activationFailureCode: 'DEMO_RESET_FAILED',
        activationFailureMessage: 'A restauração foi preparada mas não pôde ser ativada. A revisão anterior continua ativa.',
        onFailureLog: ({ workspaceId, revision, errorMessage, errorCode }) => {
          console.error('demo_reset_failed', {
            requestId: req.requestId,
            workspaceId,
            revision,
            errorMessage,
            errorCode,
          });
        },
      });

      if (result.outcome === 'ALREADY_ACTIVE') {
        const { record } = result;
        res.status(200).json({
          status: 'RESET',
          workspaceId: DEMO_WORKSPACE_ID,
          publicationRevision: record.publicationRevision,
          counts: record.counts,
          publishedAt: record.publishedAt,
          idempotencyKey: record.idempotencyKey,
        });
        return;
      }

      res.status(200).json({
        status: 'RESET',
        workspaceId: DEMO_WORKSPACE_ID,
        publicationRevision: result.nextRevision,
        counts: result.counts,
        publishedAt: result.publishedAt,
        idempotencyKey,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
