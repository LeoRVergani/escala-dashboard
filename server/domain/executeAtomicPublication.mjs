import { assertDemoOnlyWritePlan } from './assertDemoOnlyWritePlan.mjs';
import { buildPublicationPlan } from './demoPublicationPlanner.mjs';
import { PublicationError } from '../errors.mjs';

export async function executeAtomicPublication({
  store,
  workspaceId,
  expectedActiveRevision,
  idempotencyKey,
  meta,
  package: pkg,
  writeFailureCode,
  writeFailureMessage,
  activationFailureCode,
  activationFailureMessage,
  onFailureLog,
}) {
  const reservation = await store.reserveRevision(
    workspaceId,
    expectedActiveRevision,
    idempotencyKey,
    meta,
  );

  if (reservation.outcome === 'ALREADY_ACTIVE') {
    return { outcome: 'ALREADY_ACTIVE', record: reservation.record };
  }

  const { nextRevision } = reservation;
  const plan = buildPublicationPlan({
    package: pkg,
    currentActiveRevision: nextRevision - 1,
  });
  assertDemoOnlyWritePlan(plan);

  let writeCounts;
  try {
    writeCounts = await store.writeRevisionDocuments(plan);
  } catch (err) {
    onFailureLog?.({
      workspaceId,
      revision: nextRevision,
      errorMessage: err?.message,
      errorCode: err?.code,
    });
    await store.markPublicationFailed(workspaceId, nextRevision, 'Falha ao gravar documentos da revisão.');
    throw new PublicationError(writeFailureCode, writeFailureMessage);
  }

  let activated;
  try {
    activated = await store.activateRevision(
      workspaceId,
      nextRevision,
      plan.workspaceActivationWrite.data,
      writeCounts,
    );
  } catch (err) {
    onFailureLog?.({
      workspaceId,
      revision: nextRevision,
      errorMessage: err?.message,
      errorCode: err?.code,
    });
    await store.markPublicationFailed(workspaceId, nextRevision, 'Falha ao ativar a nova revisão.');
    throw new PublicationError(activationFailureCode, activationFailureMessage);
  }

  return {
    outcome: 'PUBLISHED',
    nextRevision,
    counts: writeCounts,
    publishedAt: activated.publishedAt,
  };
}
