import type { DemoPublicationPackage } from './dto';

export interface DemoWorkspaceDiff {
  teamsAdded: number;
  teamsChanged: number;
  membersAdded: number;
  membersChanged: number;
  managerAssignmentsAdded: number;
  managerAssignmentsChanged: number;
  scheduleAssignmentsChanged: number;
  requestsChanged: number;
  deletions: number;
}

type IdentifiedItem = { id: string };

interface CollectionDiff {
  added: number;
  changed: number;
  deleted: number;
}

function byId<T extends IdentifiedItem>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function diffCollection<T extends IdentifiedItem>(baselineItems: T[], draftItems: T[]): CollectionDiff {
  const baselineById = byId(baselineItems);
  const draftById = byId(draftItems);
  let added = 0;
  let changed = 0;
  let deleted = 0;

  for (const [id, draftItem] of draftById) {
    const baselineItem = baselineById.get(id);
    if (!baselineItem) {
      added += 1;
    } else if (JSON.stringify(baselineItem) !== JSON.stringify(draftItem)) {
      changed += 1;
    }
  }

  for (const id of baselineById.keys()) {
    if (!draftById.has(id)) deleted += 1;
  }

  return { added, changed, deleted };
}

export function diffDemoPackages(
  baseline: DemoPublicationPackage,
  draft: DemoPublicationPackage,
): DemoWorkspaceDiff {
  const teams = diffCollection(baseline.teams, draft.teams);
  const members = diffCollection(baseline.members, draft.members);
  const managerAssignments = diffCollection(baseline.teamManagerAssignments, draft.teamManagerAssignments);
  const scheduleAssignments = diffCollection(baseline.scheduleAssignments, draft.scheduleAssignments);
  const requests = diffCollection(baseline.scheduleChangeRequests, draft.scheduleChangeRequests);

  return {
    teamsAdded: teams.added,
    teamsChanged: teams.changed,
    membersAdded: members.added,
    membersChanged: members.changed,
    managerAssignmentsAdded: managerAssignments.added,
    managerAssignmentsChanged: managerAssignments.changed,
    scheduleAssignmentsChanged: scheduleAssignments.changed,
    requestsChanged: requests.changed,
    deletions: teams.deleted + members.deleted + managerAssignments.deleted + scheduleAssignments.deleted + requests.deleted,
  };
}
