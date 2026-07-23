import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');

describe('manifesto Web/PWA do Dashboard', () => {
  it('referencia a marca versionada local e os ícones compatíveis', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8')) as {
      icons: Array<{ src: string; sizes: string; purpose?: string }>;
    };

    expect(html).toContain('/favicon.ico');
    expect(html).toContain('/brand/icon-192.png');
    expect(html).toContain('/brand/apple-touch-icon.png');
    expect(html).toContain('/manifest.webmanifest');
    expect(html).not.toContain('/manus-storage/');

    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/brand/icon-192.png', sizes: '192x192' }),
      expect.objectContaining({ src: '/brand/icon-512.png', sizes: '512x512' }),
      expect.objectContaining({ src: '/brand/icon-maskable-192.png', sizes: '192x192', purpose: 'maskable' }),
      expect.objectContaining({ src: '/brand/icon-maskable-512.png', sizes: '512x512', purpose: 'maskable' }),
    ]));
  });
});
