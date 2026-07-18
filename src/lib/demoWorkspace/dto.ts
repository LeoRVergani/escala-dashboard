export type DemoWorkspaceType = 'PRODUCTION' | 'DEMO';

export interface DemoWorkspaceDto {
  workspaceId: string;
  workspaceType: DemoWorkspaceType;
  scenarioId: string | null;
  seedVersion: number | null;
  publicationRevision: number;
  externalEffectsAllowed: boolean;
  notificationsEnabled: boolean;
}

export interface DemoTeamDto {
  id: string;
  workspaceId: string;
  name: string;
  acronym: string;
  active: boolean;
  schemaVersion: number;
}

export interface DemoMemberDto {
  id: string;
  workspaceId: string;
  displayName: string;
  corporateLogin: string | null;
  emailNormalized: string;
  active: boolean;
  schemaVersion: number;
}

export interface DemoMembershipDto {
  id: string;
  workspaceId: string;
  memberId: string;
  teamId: string;
  startDate: string;
  endDate: string | null;
  active: boolean;
  isPrimary: boolean;
  schemaVersion: number;
}

export interface DemoManagerPermissions {
  viewTeamSchedule: boolean;
  viewTeamMembers: boolean;
  editTeamSchedule: boolean;
  approveScheduleChanges: boolean;
  publishSchedule: boolean;
  manageTeamAssignments: boolean;
}

export type DemoManagerRole =
  | 'PRIMARY_MANAGER'
  | 'PRIMARY_APPROVER'
  | 'BACKUP_APPROVER'
  | 'SCHEDULE_EDITOR'
  | 'PUBLISHER'
  | 'VIEW_ONLY';

export interface DemoManagerAssignmentDto {
  id: string;
  workspaceId: string;
  managerMemberId: string;
  teamId: string;
  role: DemoManagerRole;
  permissions: DemoManagerPermissions;
  active: boolean;
  validFrom: string;
  validTo: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  schemaVersion: number;
}

export type DemoChangeRequestType =
  | 'SHIFT_CHANGE'
  | 'DAY_OFF_CHANGE'
  | 'SWAP_WITH_MEMBER'
  | 'SCHEDULE_CORRECTION'
  | 'OTHER';

export type DemoChangeRequestStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';

export interface DemoScheduleChangeRequestDto {
  id: string;
  workspaceId: string;
  requesterMemberId: string;
  requesterTeamId: string;
  assignedManagerMemberId: string;
  schedulePeriodId: string;
  assignmentId?: string | null;
  requestType: DemoChangeRequestType;
  status: DemoChangeRequestStatus;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByMemberId: string | null;
  resolutionNote: string | null;
  schemaVersion: number;
}

export interface DemoSchedulePeriodDto {
  id: string;
  workspaceId: string;
  teamId: string;
  name: string;
  startDate: string;
  endDate: string;
  active: boolean;
  publicationRevision: number;
  schemaVersion: number;
}

export type DemoScheduleAssignmentType =
  | 'WORK_SHIFT'
  | 'OFF'
  | 'VACATION'
  | 'ABSENCE'
  | 'TRAINING'
  | 'OTHER';

export interface DemoScheduleAssignmentDto {
  id: string;
  workspaceId: string;
  periodId: string;
  teamId: string;
  memberId: string;
  date: string;
  assignmentType: DemoScheduleAssignmentType;
  shiftName: string | null;
  startTime: string | null;
  endTime: string | null;
  schemaVersion: number;
}

export interface DemoPublicationRecordDto {
  id: string;
  workspaceId: string;
  publicationRevision: number;
  publishedAt: string;
  publishedByMode: 'LOCAL_TEST_MODE' | 'CORPORATE_MSAL';
  publishedByLogin?: string;
  dryRun: boolean;
  countsCreated: number;
  countsUpdated: number;
  countsDeleted: number;
  source: 'DASHBOARD_MANUAL_PUBLISH' | 'DEMO_RESET' | 'DEMO_SEED';
  schemaVersion: number;
}

export interface DemoPublicationPackage {
  schemaVersion: number;
  workspace: DemoWorkspaceDto;
  teams: DemoTeamDto[];
  members: DemoMemberDto[];
  memberTeamMemberships: DemoMembershipDto[];
  teamManagerAssignments: DemoManagerAssignmentDto[];
  scheduleChangeRequests: DemoScheduleChangeRequestDto[];
  schedulePeriods: DemoSchedulePeriodDto[];
  scheduleAssignments: DemoScheduleAssignmentDto[];
  publicationRecords: DemoPublicationRecordDto[];
}
