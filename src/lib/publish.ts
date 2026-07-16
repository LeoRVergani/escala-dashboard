import { SHIFT_BY_ID } from '../constants';
import type { ScheduleState } from '../types';

/**
 * Publicação é deliberadamente separada da edição:
 * - nada é enviado automaticamente;
 * - o botão só existe quando as variáveis de ambiente estão configuradas;
 * - o envio exige confirmação explícita na interface.
 *
 * Usa a API REST do Firestore para não adicionar o SDK inteiro ao bundle.
 * Configure em `.env.local`:
 *   VITE_FIREBASE_PROJECT_ID=meu-projeto
 *   VITE_FIREBASE_API_KEY=AIza...
 *   VITE_FIREBASE_COLLECTION=escalas
 */
export function publishConfig() {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  const collection =
    (import.meta.env.VITE_FIREBASE_COLLECTION as string | undefined) ?? 'escalas';
  if (!projectId || !apiKey) return null;
  return { projectId, apiKey, collection };
}

export async function publishSchedule(state: ScheduleState): Promise<string> {
  const cfg = publishConfig();
  if (!cfg) throw new Error('Publicação não configurada (VITE_FIREBASE_*).');

  const { year, month } = state.monthKey;
  const docId = `${year}-${String(month).padStart(2, '0')}`;
  const cells: Record<string, string> = {};
  for (const t of state.technicians) {
    for (const [day, v] of Object.entries(state.cells[t.id] ?? {})) {
      if (!v) continue;
      const code = v.shift === 'custom' ? (v.text ?? '*') : SHIFT_BY_ID[v.shift].code;
      cells[`${t.login ?? t.name ?? t.id}:${day}`] = code;
    }
  }

  const url =
    `https://firestore.googleapis.com/v1/projects/${cfg.projectId}` +
    `/databases/(default)/documents/${cfg.collection}?documentId=${docId}&key=${cfg.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        month: { stringValue: docId },
        publishedAt: { timestampValue: new Date().toISOString() },
        technicians: {
          arrayValue: {
            values: state.technicians.map((t) => ({
              stringValue: `${t.login ?? ''}|${t.name ?? ''}`,
            })),
          },
        },
        cells: { stringValue: JSON.stringify(cells) },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Falha ao publicar (${res.status}). ${body.slice(0, 200)}`);
  }
  return docId;
}
