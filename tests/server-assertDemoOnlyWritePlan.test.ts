import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertDemoOnlyWritePlan } from '../server/domain/assertDemoOnlyWritePlan.mjs';
import { buildPublicationPlan, type PublicationPlan } from '../server/domain/demoPublicationPlanner.mjs';
import { PublicationError } from '../server/errors.mjs';

function readRealPlan() {
  const pkg = JSON.parse(readFileSync('fixtures/demo/demo-v1-publication-package.json', 'utf8')) as Record<string, any>;
  return buildPublicationPlan({ package: pkg, currentActiveRevision: 1 });
}

function expectWorkspaceError(fn: () => unknown) {
  expect(fn).toThrow(PublicationError);
  expect(fn).toThrow(/demo-v1|workspace|coleção|identificador/i);
}

describe('assertDemoOnlyWritePlan', () => {
  it('nao lanca para plano valido', () => {
    expect(assertDemoOnlyWritePlan(readRealPlan())).toBe(true);
  });

  it('lanca quando workspaceId raiz nao e demo-v1', () => {
    const plan = { ...readRealPlan(), workspaceId: 'ici' };

    expectWorkspaceError(() => assertDemoOnlyWritePlan(plan));
  });

  it('lanca quando uma escrita aponta para outro workspace', () => {
    const plan = readRealPlan();
    plan.entityWrites[0] = {
      ...plan.entityWrites[0],
      data: { ...plan.entityWrites[0].data, workspaceId: 'ici' },
    };

    expectWorkspaceError(() => assertDemoOnlyWritePlan(plan));
  });

  it('lanca quando uma colecao nao esta na lista permitida', () => {
    const plan = readRealPlan();
    plan.entityWrites[0] = { ...plan.entityWrites[0], collection: 'production_collection' };

    expectWorkspaceError(() => assertDemoOnlyWritePlan(plan));
  });

  it('lanca quando o caminho da entidade nao esta sob a revisao candidata do demo-v1', () => {
    const plan = readRealPlan();
    plan.entityWrites[0] = {
      ...plan.entityWrites[0],
      collectionPath: 'teams',
    };

    expectWorkspaceError(() => assertDemoOnlyWritePlan(plan));
  });

  it('lanca quando o caminho contem identificador de producao', () => {
    const plan = readRealPlan();
    plan.entityWrites[0] = {
      ...plan.entityWrites[0],
      collectionPath: 'workspaces/demo-v1/revisions/2/teams-ici',
    };

    expectWorkspaceError(() => assertDemoOnlyWritePlan(plan));
  });

  it('lanca quando um id contem ici em qualquer posicao', () => {
    const plan = readRealPlan();
    plan.entityWrites[0] = { ...plan.entityWrites[0], id: 'team-demO-ICI-contaminado' };

    expectWorkspaceError(() => assertDemoOnlyWritePlan(plan));
  });

  it('confirma que o plano real da fixture passa pela guarda', () => {
    const plan: PublicationPlan = readRealPlan();

    expect(() => assertDemoOnlyWritePlan(plan)).not.toThrow();
  });

  it('confirma que nenhuma escrita de entidade usa colecao viva de producao', () => {
    const plan = readRealPlan();

    expect(plan.entityWrites.every((write) => (
      write.collectionPath?.startsWith(`workspaces/demo-v1/revisions/${plan.expectedNextRevision}/`)
    ))).toBe(true);
  });
});
