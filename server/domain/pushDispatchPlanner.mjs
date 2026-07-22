export function planPushDispatch({ event, recipients, pushClient } = {}) {
  void pushClient;
  const normalizedRecipients = Array.isArray(recipients) ? recipients : [];

  return {
    recipientCount: normalizedRecipients.length,
    recipients: normalizedRecipients.map((recipient) => ({
      memberId: recipient.memberId,
      platform: recipient.platform,
    })),
    event,
  };
}
