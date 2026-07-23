import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

const root = resolve(__dirname, '..');

describe('versão visual do Dashboard', () => {
  it('deriva a versão exibida do package.json e não usa literal fixo no App', () => {
    const appSource = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');

    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(appSource).toContain('APP_VERSION = packageJson.version');
    expect(appSource).toContain('v{APP_VERSION}');
    expect(appSource).not.toMatch(/v1\.14\.0/);
    expect(appSource).not.toMatch(/<small>v\d+\.\d+\.\d+/);
  });
});
