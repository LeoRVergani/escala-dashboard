export type PushEvent = {
  type: 'SCHEDULE_CHANGED' | 'INDIVIDUAL_DAY_CHANGED';
  title: string;
  body: string;
  data: Record<string, string>;
};

export function buildScheduleChangedEvent(params: {
  workspaceId: string;
  teamId: string;
  revision: number;
}): PushEvent;

export function buildIndividualDayChangedEvent(params: {
  workspaceId: string;
  teamId: string;
  memberId: string;
  date: string;
}): PushEvent;
