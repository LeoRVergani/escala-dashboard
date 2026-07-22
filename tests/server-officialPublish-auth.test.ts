import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.mjs';
import { loadConfig } from '../server/config.mjs';
import { createInMemoryPublicationStore } from '../server/domain/publicationStore.mjs';
import { dispatchExpress } from './serverTestHelpers';

describe('POST /api/publish/official auth boundary', () => {
  it('rejeita requisição sem Authorization antes de qualquer validação do pacote', async () => {
    const app = createApp(loadConfig({}), { store: createInMemoryPublicationStore() });

    const response = await dispatchExpress(app, '/api/publish/official', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'INVALID', packageRaw: 'not-json' }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });
});
