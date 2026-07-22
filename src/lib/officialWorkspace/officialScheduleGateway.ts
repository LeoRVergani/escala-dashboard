import type { ScheduleState } from '../../types';
import { demoPackageToScheduleState } from '../demoWorkspace/scheduleAdapter';
import type { DemoPublicationPackage } from '../demoWorkspace/dto';
import { requestJson, type OfficialApiError } from './apiClient';
import { OFFICIAL_WORKSPACE_ID } from './retarget';

type OfficialScheduleResponse =
  | { status: 'OK'; workspaceId: string; revision: number; package: DemoPublicationPackage }
  | { status: 'EMPTY'; workspaceId: string }
  | { status: 'TEAM_NOT_FOUND'; workspaceId: string; revision: number };

export type OfficialScheduleLoadResult =
  | {
    status: 'OK';
    workspaceId: typeof OFFICIAL_WORKSPACE_ID;
    teamId: string;
    revision: number;
    package: DemoPublicationPackage;
    schedule: ScheduleState;
  }
  | { status: 'EMPTY'; workspaceId: typeof OFFICIAL_WORKSPACE_ID }
  | { status: 'TEAM_NOT_FOUND'; workspaceId: typeof OFFICIAL_WORKSPACE_ID; teamId: string; revision: number }
  | { status: 'OFFLINE'; error: OfficialApiError }
  | { status: 'ERROR'; error: OfficialApiError };

export async function loadOfficialSchedule(teamId: string, revision?: number): Promise<OfficialScheduleLoadResult> {
  const params = new URLSearchParams({ teamId });
  if (revision !== undefined) params.set('revision', String(revision));

  const result = await requestJson<OfficialScheduleResponse>(`/api/official/schedule?${params.toString()}`);
  if (!result.ok) {
    return result.offline
      ? { status: 'OFFLINE', error: result.error }
      : { status: 'ERROR', error: result.error };
  }

  if (result.body.status === 'EMPTY') {
    return { status: 'EMPTY', workspaceId: OFFICIAL_WORKSPACE_ID };
  }

  if (result.body.status === 'TEAM_NOT_FOUND') {
    return {
      status: 'TEAM_NOT_FOUND',
      workspaceId: OFFICIAL_WORKSPACE_ID,
      teamId,
      revision: result.body.revision,
    };
  }

  const schedule = demoPackageToScheduleState(result.body.package, teamId);
  return {
    status: 'OK',
    workspaceId: OFFICIAL_WORKSPACE_ID,
    teamId,
    revision: result.body.revision,
    package: result.body.package,
    schedule: {
      ...schedule,
      sourceLabel: `Publicação Oficial ici-dev — revisão ${result.body.revision}`,
      isDemo: false,
      origin: 'official-firebase',
      demoTeamId: undefined,
      officialTeamId: teamId,
    },
  };
}
