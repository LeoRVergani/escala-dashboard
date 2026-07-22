import { describe, expect, it, vi } from 'vitest';
import { buildIndividualDayChangedEvent, buildScheduleChangedEvent } from '../server/domain/pushEventBuilder.mjs';
import { planPushDispatch } from '../server/domain/pushDispatchPlanner.mjs';
import { resolvePushRecipients } from '../server/domain/pushRecipients.mjs';
import { createFakeFirebaseAdmin } from './fakeFirebaseAdmin';

function recipientsDb() {
  const fake = createFakeFirebaseAdmin({
    data: {
      user_links: {
        'uid-member-1': { firebaseUid: 'uid-member-1', active: true, login: 'member1@ici.test', teamIds: ['team-a'] },
        'uid-member-2': { firebaseUid: 'uid-member-2', active: true, login: 'member2@ici.test', teamIds: ['team-a'] },
        'uid-member-3': { firebaseUid: 'uid-member-3', active: true, login: 'member3@ici.test', teamIds: ['team-b'] },
      },
      push_subscriptions: {
        sub_active_1: { id: 'sub_active_1', memberId: 'member1@ici.test', uid: 'uid-member-1', platform: 'android', token: 'token-1', active: true },
        sub_inactive_1: { id: 'sub_inactive_1', memberId: 'member1@ici.test', uid: 'uid-member-1', platform: 'web', token: 'token-inactive', active: false },
        sub_active_2: { id: 'sub_active_2', memberId: 'member2@ici.test', uid: 'uid-member-2', platform: 'web', token: { endpoint: 'endpoint-2' }, active: true },
        sub_other_team: { id: 'sub_other_team', memberId: 'member3@ici.test', uid: 'uid-member-3', platform: 'android', token: 'token-3', active: true },
      },
    },
  });
  return fake.getFirebaseAdmin().db;
}

describe('push recipients', () => {
  it('resolve destinatários por memberId retornando só assinaturas ativas correspondentes', async () => {
    const recipients = await resolvePushRecipients({ db: recipientsDb(), memberId: 'member1@ici.test' });

    expect(recipients).toEqual([{
      id: 'sub_active_1',
      memberId: 'member1@ici.test',
      uid: 'uid-member-1',
      platform: 'android',
      token: 'token-1',
      endpoint: undefined,
    }]);
  });

  it('resolve destinatários por teamId retornando só assinaturas ativas dos membros da equipe', async () => {
    const req = { caller: { login: 'manager@ici.test', role: 'SCHEDULE_ADMIN', teamIds: ['team-a'], isSystemAdmin: false } };
    const recipients = await resolvePushRecipients({ db: recipientsDb(), req, teamId: 'team-a' });

    expect(recipients.map((item) => item.id).sort()).toEqual(['sub_active_1', 'sub_active_2']);
  });

  it('rejeita seleção por teamId sem autorização pelo mesmo padrão FORBIDDEN_TEAM', async () => {
    const req = { caller: { login: 'manager@ici.test', role: 'SCHEDULE_ADMIN', teamIds: ['team-b'], isSystemAdmin: false } };

    await expect(resolvePushRecipients({ db: recipientsDb(), req, teamId: 'team-a' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN_TEAM' });
  });
});

describe('push event builders', () => {
  it('buildScheduleChangedEvent produz payload correto e determinístico', () => {
    expect(buildScheduleChangedEvent({ workspaceId: 'ici-dev', teamId: 'team-a', revision: 7 })).toEqual({
      type: 'SCHEDULE_CHANGED',
      title: 'Nova escala publicada',
      body: 'A escala do time team-a foi publicada na revisão 7.',
      data: {
        kind: 'schedule.changed',
        workspaceId: 'ici-dev',
        teamId: 'team-a',
        revision: '7',
      },
    });
  });

  it('buildIndividualDayChangedEvent produz payload correto e determinístico', () => {
    expect(buildIndividualDayChangedEvent({
      workspaceId: 'ici-dev',
      teamId: 'team-a',
      memberId: 'member1@ici.test',
      date: '2026-07-22',
    })).toEqual({
      type: 'INDIVIDUAL_DAY_CHANGED',
      title: 'Seu dia mudou',
      body: 'Sua escala de 2026-07-22 foi atualizada.',
      data: {
        kind: 'schedule.day.changed',
        workspaceId: 'ici-dev',
        teamId: 'team-a',
        memberId: 'member1@ici.test',
        date: '2026-07-22',
      },
    });
  });
});

describe('push dispatch planner', () => {
  it('planeja dry-run e nunca chama cliente de envio ou rede', () => {
    const send = vi.fn();
    const sendEach = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const event = buildScheduleChangedEvent({ workspaceId: 'ici-dev', teamId: 'team-a', revision: 7 });

    try {
      const plan = planPushDispatch({
        event,
        recipients: [
          { id: 'sub1', memberId: 'member1@ici.test', platform: 'android', token: 'token-1' },
          { id: 'sub2', memberId: 'member2@ici.test', platform: 'web', token: { endpoint: 'endpoint-2' } },
        ],
        pushClient: { send, sendEach },
      });

      expect(plan).toEqual({
        recipientCount: 2,
        recipients: [
          { memberId: 'member1@ici.test', platform: 'android' },
          { memberId: 'member2@ici.test', platform: 'web' },
        ],
        event,
      });
      expect(send).not.toHaveBeenCalled();
      expect(sendEach).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
