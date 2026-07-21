export const REQUIRED_ARRAY_KEYS: string[];

export function validateOfficialPackage(params: {
  packageRaw: string;
  manifestRaw: string;
}): { ok: true; package: Record<string, any> } | { ok: false; code: string; message: string };

export function validateOfficialCorporateLink(
  pkg: Record<string, any>,
  corporateLink: unknown,
): { ok: true } | { ok: false; code: string; message: string };
