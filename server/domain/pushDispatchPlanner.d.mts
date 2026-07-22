import type { PushEvent } from './pushEventBuilder.mjs';
import type { PushRecipient } from './pushRecipients.mjs';

export type PushDispatchPlan = {
  recipientCount: number;
  recipients: Array<{ memberId: string; platform: PushRecipient['platform'] }>;
  event: PushEvent;
};

export function planPushDispatch(params?: {
  event?: PushEvent;
  recipients?: PushRecipient[];
  pushClient?: unknown;
}): PushDispatchPlan;
