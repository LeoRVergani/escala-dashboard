export const REQUIRED_ARRAY_KEYS: string[];

export function validateDemoPackage(params: {
  packageRaw: string;
  manifestRaw: string;
}): { ok: true; package: Record<string, unknown> } | { ok: false; code: string; message: string };
