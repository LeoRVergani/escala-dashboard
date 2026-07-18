import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dashboardRoot = resolve(here, '..');
const workspaceId = 'demo-v1';

export const sourceFiles = {
  package: 'composeApp/src/commonMain/composeResources/files/demo/demo-v1-publication-package.json',
  manifest: 'fixtures/demo/demo-v1-manifest.json',
  schema: 'docs/contracts/organization-approval-v1.schema.json',
};

export const destinationFiles = {
  package: 'fixtures/demo/demo-v1-publication-package.json',
  manifest: 'fixtures/demo/demo-v1-manifest.json',
  schema: 'contracts/organization-approval-v1.schema.json',
};

const countedArrays = [
  'teams',
  'members',
  'memberTeamMemberships',
  'teamManagerAssignments',
  'schedulePeriods',
  'scheduleAssignments',
  'scheduleChangeRequests',
  'publicationRecords',
];

export function computeSha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseJsonInput(value, label) {
  if (Buffer.isBuffer(value) || typeof value === 'string') {
    try {
      return { ok: true, value: JSON.parse(value.toString('utf8')) };
    } catch (error) {
      return { ok: false, reason: `${label} JSON invalido: ${error.message}` };
    }
  }

  if (value && typeof value === 'object') {
    return { ok: true, value };
  }

  return { ok: false, reason: `${label} JSON invalido: conteudo ausente ou inesperado` };
}

function bytesForChecksum(packageJson, packageBytes) {
  if (packageBytes !== undefined) return packageBytes;
  if (Buffer.isBuffer(packageJson) || typeof packageJson === 'string') return packageJson;
  return undefined;
}

export function validateRequiredSourceFiles({ sourceRoot, files = sourceFiles, fileExists = existsSync }) {
  if (!sourceRoot) return { ok: false, reason: 'Raiz de origem nao informada' };

  for (const relativePath of Object.values(files)) {
    const fullPath = resolve(sourceRoot, relativePath);
    if (!fileExists(fullPath)) {
      return { ok: false, reason: `Arquivo de origem ausente: ${relativePath} (${fullPath})` };
    }
  }

  return { ok: true };
}

export function validateSyncPayload({ manifestJson, packageJson, schemaJson, packageBytes, destRoot, sourceRoot }) {
  if (destRoot && sourceRoot && resolve(destRoot) === resolve(sourceRoot)) {
    return { ok: false, reason: `Destino nao pode ser igual a origem: ${resolve(destRoot)}` };
  }

  const manifestResult = parseJsonInput(manifestJson, 'Manifesto');
  if (!manifestResult.ok) return manifestResult;

  const packageResult = parseJsonInput(packageJson, 'Pacote');
  if (!packageResult.ok) return packageResult;

  const schemaResult = parseJsonInput(schemaJson, 'Schema');
  if (!schemaResult.ok) return schemaResult;

  const manifest = manifestResult.value;
  const publicationPackage = packageResult.value;

  const packageWorkspaceId = publicationPackage?.workspace?.workspaceId;
  if (packageWorkspaceId !== workspaceId) {
    return { ok: false, reason: `Pacote com workspaceId invalido: esperado ${workspaceId}, recebido ${packageWorkspaceId ?? 'ausente'}` };
  }

  if (manifest?.workspaceId !== workspaceId) {
    return { ok: false, reason: `Manifesto com workspaceId invalido: esperado ${workspaceId}, recebido ${manifest?.workspaceId ?? 'ausente'}` };
  }

  const rawPackageBytes = bytesForChecksum(packageJson, packageBytes);
  if (rawPackageBytes === undefined) {
    return { ok: false, reason: 'Bytes brutos do pacote ausentes para validar SHA-256' };
  }

  const packageSha256 = computeSha256(rawPackageBytes);
  if (packageSha256 !== manifest.sha256) {
    return { ok: false, reason: `Checksum do pacote nao confere: esperado ${manifest.sha256 ?? 'ausente'}, calculado ${packageSha256}` };
  }

  const manifestRevision = manifest.publicationRevision;
  const packageRevision = publicationPackage?.workspace?.publicationRevision;
  if (typeof manifestRevision !== 'number' || !Number.isFinite(manifestRevision)) {
    return { ok: false, reason: 'Manifesto publicationRevision deve ser um numero' };
  }

  if (manifestRevision !== packageRevision) {
    return { ok: false, reason: `Revisao divergente: manifesto ${manifestRevision}, pacote ${packageRevision ?? 'ausente'}` };
  }

  for (const key of countedArrays) {
    const expected = manifest?.counts?.[key];
    const actualArray = publicationPackage?.[key];
    if (!Array.isArray(actualArray)) {
      return { ok: false, reason: `Pacote sem array esperado: ${key}` };
    }

    if (expected !== actualArray.length) {
      return { ok: false, reason: `Contagem divergente em ${key}: manifesto ${expected ?? 'ausente'}, pacote ${actualArray.length}` };
    }
  }

  for (const key of countedArrays) {
    const items = publicationPackage[key];
    for (const [index, item] of items.entries()) {
      if (item && typeof item === 'object' && Object.hasOwn(item, 'workspaceId') && item.workspaceId !== workspaceId) {
        return { ok: false, reason: `Item com workspaceId invalido em ${key}[${index}]: esperado ${workspaceId}, recebido ${item.workspaceId}` };
      }
    }
  }

  return {
    ok: true,
    workspaceId,
    revision: manifestRevision,
    sha256: packageSha256,
    counts: manifest.counts,
  };
}

function parseSourceRoot(argv, env) {
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--source-root=')) {
      return arg.slice('--source-root='.length);
    }

    if (arg === '--source-root') {
      return argv[index + 1];
    }
  }

  return env.ESCALAICI_KMP_ROOT;
}

function usage() {
  return [
    'Uso: ESCALAICI_KMP_ROOT=/caminho/para/EscalaICI-KMP-Lab node scripts/sync-demo-v1.mjs',
    'Ou: node scripts/sync-demo-v1.mjs --source-root=/caminho/para/EscalaICI-KMP-Lab',
  ].join('\n');
}

function main() {
  const sourceRootArg = parseSourceRoot(process.argv, process.env);
  if (!sourceRootArg) {
    console.error(usage());
    process.exit(1);
  }

  const sourceRoot = resolve(sourceRootArg);
  const sourceValidation = validateRequiredSourceFiles({ sourceRoot });
  if (!sourceValidation.ok) {
    console.error(sourceValidation.reason);
    process.exit(1);
  }

  const packagePath = resolve(sourceRoot, sourceFiles.package);
  const manifestPath = resolve(sourceRoot, sourceFiles.manifest);
  const schemaPath = resolve(sourceRoot, sourceFiles.schema);

  const packageBytes = readFileSync(packagePath);
  const manifestBytes = readFileSync(manifestPath);
  const schemaBytes = readFileSync(schemaPath);

  const validation = validateSyncPayload({
    manifestJson: manifestBytes,
    packageJson: packageBytes,
    schemaJson: schemaBytes,
    packageBytes,
    destRoot: dashboardRoot,
    sourceRoot,
  });

  if (!validation.ok) {
    console.error(validation.reason);
    process.exit(1);
  }

  const copies = [
    [packagePath, resolve(dashboardRoot, destinationFiles.package)],
    [manifestPath, resolve(dashboardRoot, destinationFiles.manifest)],
    [schemaPath, resolve(dashboardRoot, destinationFiles.schema)],
  ];

  for (const [, destination] of copies) {
    mkdirSync(dirname(destination), { recursive: true });
  }

  for (const [source, destination] of copies) {
    copyFileSync(source, destination);
  }

  console.log('Demo v1 sincronizado com sucesso');
  console.log('Checksum: MATCH');
  console.log(`Workspace: ${validation.workspaceId}`);
  console.log(`Revisao: ${validation.revision}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
