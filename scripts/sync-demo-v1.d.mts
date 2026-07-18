export const sourceFiles: Record<'package' | 'manifest' | 'schema', string>;
export const destinationFiles: Record<'package' | 'manifest' | 'schema', string>;

export function computeSha256(bytes: string | Buffer): string;

export function validateRequiredSourceFiles(input: {
  sourceRoot?: string;
  files?: Record<string, string>;
  fileExists?: (path: string) => boolean;
}): { ok: true } | { ok: false; reason: string };

export function validateSyncPayload(input: {
  manifestJson: unknown;
  packageJson: unknown;
  schemaJson: unknown;
  packageBytes?: string | Buffer;
  destRoot?: string;
  sourceRoot?: string;
}): {
  ok: true;
  workspaceId: string;
  revision: number;
  sha256: string;
  counts: Record<string, number>;
} | {
  ok: false;
  reason: string;
};
