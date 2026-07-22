function requireString(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} é obrigatório.`);
  }
  return value.trim();
}

export function buildScheduleChangedEvent({ workspaceId, teamId, revision }) {
  const normalizedWorkspaceId = requireString('workspaceId', workspaceId);
  const normalizedTeamId = requireString('teamId', teamId);
  const normalizedRevision = Number(revision);
  if (!Number.isInteger(normalizedRevision) || normalizedRevision < 1) {
    throw new TypeError('revision deve ser um inteiro positivo.');
  }

  // Fase atual: apenas contrato de payload. Entrega push real fica para infraestrutura futura.
  return {
    type: 'SCHEDULE_CHANGED',
    title: 'Nova escala publicada',
    body: `A escala do time ${normalizedTeamId} foi publicada na revisão ${normalizedRevision}.`,
    data: {
      kind: 'schedule.changed',
      workspaceId: normalizedWorkspaceId,
      teamId: normalizedTeamId,
      revision: String(normalizedRevision),
    },
  };
}

export function buildIndividualDayChangedEvent({ workspaceId, teamId, memberId, date }) {
  const normalizedWorkspaceId = requireString('workspaceId', workspaceId);
  const normalizedTeamId = requireString('teamId', teamId);
  const normalizedMemberId = requireString('memberId', memberId);
  const normalizedDate = requireString('date', date);

  // Fase atual: apenas contrato de payload. Entrega push real fica para infraestrutura futura.
  return {
    type: 'INDIVIDUAL_DAY_CHANGED',
    title: 'Seu dia mudou',
    body: `Sua escala de ${normalizedDate} foi atualizada.`,
    data: {
      kind: 'schedule.day.changed',
      workspaceId: normalizedWorkspaceId,
      teamId: normalizedTeamId,
      memberId: normalizedMemberId,
      date: normalizedDate,
    },
  };
}
