import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DemoPublicationPackage } from '../src/lib/demoWorkspace/dto';
import { buildDemoWorkspaceExport, demoWorkspaceExportFileName } from '../src/lib/demoWorkspace/export';

const root = resolve(__dirname, '..');
const demoPackage = JSON.parse(
  readFileSync(resolve(root, 'fixtures/demo/demo-v1-publication-package.json'), 'utf8'),
) as DemoPublicationPackage;

describe('demo workspace export', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('buildDemoWorkspaceExport produz envelope de rascunho local com pacote intacto', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:34:56.789Z'));

    const envelope = buildDemoWorkspaceExport(demoPackage, 2);

    expect(envelope).toEqual({
      exportMode: 'LOCAL_DRAFT',
      localDraftRevision: 2,
      exportedAt: '2026-07-18T12:34:56.789Z',
      package: demoPackage,
    });
    expect(envelope.package).toBe(demoPackage);
    expect(envelope.package.workspace.workspaceId).toBe('demo-v1');
    expect(envelope.package.teams.map((team) => team.id)).toEqual(demoPackage.teams.map((team) => team.id));
    expect(envelope.package.scheduleAssignments.map((assignment) => assignment.id)).toEqual(
      demoPackage.scheduleAssignments.map((assignment) => assignment.id),
    );
    expect(envelope.package.teamManagerAssignments.map((assignment) => assignment.id)).toEqual(
      demoPackage.teamManagerAssignments.map((assignment) => assignment.id),
    );
    expect(envelope).not.toHaveProperty('published');
    expect(envelope).not.toHaveProperty('firebasePublished');
  });

  it('demoWorkspaceExportFileName formata revisoes com zero a esquerda', () => {
    expect(demoWorkspaceExportFileName(1)).toBe('demo-v1-local-revision-001.json');
    expect(demoWorkspaceExportFileName(2)).toBe('demo-v1-local-revision-002.json');
    expect(demoWorkspaceExportFileName(15)).toBe('demo-v1-local-revision-015.json');
  });
});
