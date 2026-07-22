export type PushRecipient = {
  id: string;
  memberId: string;
  uid?: string;
  platform: 'android' | 'web';
  token: unknown;
  endpoint?: string;
};

export function resolvePushRecipients(params: {
  db: any;
  req?: any;
  memberId?: string;
  teamId?: string;
}): Promise<PushRecipient[]>;
