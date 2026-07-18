import { useMemo, useState } from 'react';
import type {
  DemoManagerAssignmentDto,
  DemoManagerPermissions,
  DemoManagerRole,
  DemoPublicationPackage,
} from '../lib/demoWorkspace/dto';

interface DemoManagerAssignmentsDialogProps {
  pkg: DemoPublicationPackage;
  onSave: (next: DemoPublicationPackage) => void;
  onCancel: () => void;
}

const MANAGER_ROLES: DemoManagerRole[] = [
  'PRIMARY_MANAGER',
  'PRIMARY_APPROVER',
  'BACKUP_APPROVER',
  'SCHEDULE_EDITOR',
  'PUBLISHER',
  'VIEW_ONLY',
];

const ROLE_LABELS: Record<DemoManagerRole, string> = {
  PRIMARY_MANAGER: 'Gestor principal',
  PRIMARY_APPROVER: 'Aprovador principal',
  BACKUP_APPROVER: 'Aprovador reserva',
  SCHEDULE_EDITOR: 'Editor de escala',
  PUBLISHER: 'Publicador',
  VIEW_ONLY: 'Somente leitura',
};

const PERMISSION_LABELS: Array<{ key: keyof DemoManagerPermissions; label: string }> = [
  { key: 'viewTeamSchedule', label: 'Ver escala' },
  { key: 'viewTeamMembers', label: 'Ver membros' },
  { key: 'editTeamSchedule', label: 'Editar escala' },
  { key: 'approveScheduleChanges', label: 'Aprovar mudanças' },
  { key: 'publishSchedule', label: 'Publicar escala' },
  { key: 'manageTeamAssignments', label: 'Gerir vínculos' },
];

const emptyPermissions = (): DemoManagerPermissions => ({
  viewTeamSchedule: false,
  viewTeamMembers: false,
  editTeamSchedule: false,
  approveScheduleChanges: false,
  publishSchedule: false,
  manageTeamAssignments: false,
});

interface NewAssignmentForm {
  teamId: string;
  managerMemberId: string;
  role: DemoManagerRole;
  validFrom: string;
  validTo: string;
  permissions: DemoManagerPermissions;
}

function localAssignmentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `manager-local-${crypto.randomUUID()}`;
  }
  return `manager-local-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

export function DemoManagerAssignmentsDialog({ pkg, onSave, onCancel }: DemoManagerAssignmentsDialogProps) {
  const [assignments, setAssignments] = useState<DemoManagerAssignmentDto[]>(() => (
    [...pkg.teamManagerAssignments].sort((a, b) => a.teamId.localeCompare(b.teamId) || a.managerMemberId.localeCompare(b.managerMemberId))
  ));
  const [error, setError] = useState<string | null>(null);
  const [newAssignment, setNewAssignment] = useState<NewAssignmentForm>(() => ({
    teamId: pkg.teams[0]?.id ?? '',
    managerMemberId: pkg.members[0]?.id ?? '',
    role: 'PRIMARY_MANAGER',
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: '',
    permissions: emptyPermissions(),
  }));

  const teamsById = useMemo(() => new Map(pkg.teams.map((team) => [team.id, team])), [pkg.teams]);
  const membersById = useMemo(() => new Map(pkg.members.map((member) => [member.id, member])), [pkg.members]);

  const updateAssignment = (id: string, updater: (assignment: DemoManagerAssignmentDto) => DemoManagerAssignmentDto) => {
    setAssignments((current) => current.map((assignment) => (assignment.id === id ? updater(assignment) : assignment)));
  };

  const updatePermission = (id: string, permission: keyof DemoManagerPermissions, checked: boolean) => {
    updateAssignment(id, (assignment) => ({
      ...assignment,
      permissions: { ...assignment.permissions, [permission]: checked },
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateNewPermission = (permission: keyof DemoManagerPermissions, checked: boolean) => {
    setNewAssignment((current) => ({
      ...current,
      permissions: { ...current.permissions, [permission]: checked },
    }));
  };

  const addAssignment = () => {
    setError(null);
    const team = teamsById.get(newAssignment.teamId);
    const member = membersById.get(newAssignment.managerMemberId);
    const workspaceId = pkg.workspace.workspaceId;

    if (!team) {
      setError('Selecione um time cadastrado no pacote Demo.');
      return;
    }
    if (!member) {
      setError('Selecione um responsável cadastrado no pacote Demo.');
      return;
    }
    if (team.workspaceId !== workspaceId || member.workspaceId !== workspaceId) {
      setError('Time e responsável precisam pertencer ao mesmo workspace Demo.');
      return;
    }
    if (!newAssignment.validFrom) {
      setError('Informe a data inicial da vigência.');
      return;
    }
    const duplicated = assignments.some((assignment) => (
      assignment.active
      && assignment.teamId === newAssignment.teamId
      && assignment.managerMemberId === newAssignment.managerMemberId
      && assignment.role === newAssignment.role
    ));
    if (duplicated) {
      setError('Já existe um vínculo ativo com o mesmo time, responsável e papel.');
      return;
    }

    const now = new Date().toISOString();
    const next: DemoManagerAssignmentDto = {
      id: localAssignmentId(),
      workspaceId,
      managerMemberId: newAssignment.managerMemberId,
      teamId: newAssignment.teamId,
      role: newAssignment.role,
      permissions: { ...newAssignment.permissions },
      active: true,
      validFrom: newAssignment.validFrom,
      validTo: newAssignment.validTo || null,
      createdAt: now,
      updatedAt: now,
      // Modo local de teste: este e-mail fictício nunca representa autenticação real.
      createdBy: 'local-test-mode@example.invalid',
      schemaVersion: 1,
    };

    setAssignments((current) => [...current, next].sort((a, b) => a.teamId.localeCompare(b.teamId) || a.managerMemberId.localeCompare(b.managerMemberId)));
    setNewAssignment((current) => ({
      ...current,
      permissions: emptyPermissions(),
    }));
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="demo-manager-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Responsáveis e aprovações"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ ...pkg, teamManagerAssignments: assignments });
        }}
      >
        <h2>Responsáveis e aprovações</h2>

        <section>
          <h3>Responsáveis cadastrados</h3>
          <div className="demo-manager-table-wrap">
            <table className="demo-manager-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Responsável</th>
                  <th>Login fictício</th>
                  <th>Papel</th>
                  <th>Vigência</th>
                  <th>Status</th>
                  <th>Permissões</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => {
                  const team = teamsById.get(assignment.teamId);
                  const member = membersById.get(assignment.managerMemberId);
                  return (
                    <tr key={assignment.id}>
                      <td>{team?.name ?? assignment.teamId}</td>
                      <td>{member?.displayName ?? assignment.managerMemberId}</td>
                      <td><span className="muted">{member?.corporateLogin ?? 'sem login'}</span></td>
                      <td>
                        <select
                          aria-label={`Papel do vínculo ${assignment.id}`}
                          value={assignment.role}
                          onChange={(event) => updateAssignment(assignment.id, (current) => ({
                            ...current,
                            role: event.target.value as DemoManagerRole,
                            updatedAt: new Date().toISOString(),
                          }))}
                        >
                          {MANAGER_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="demo-manager-dates">
                          <input
                            type="date"
                            aria-label={`Vigência inicial do vínculo ${assignment.id}`}
                            value={assignment.validFrom}
                            onChange={(event) => updateAssignment(assignment.id, (current) => ({ ...current, validFrom: event.target.value, updatedAt: new Date().toISOString() }))}
                          />
                          <input
                            type="date"
                            aria-label={`Vigência final do vínculo ${assignment.id}`}
                            value={assignment.validTo ?? ''}
                            onChange={(event) => updateAssignment(assignment.id, (current) => ({ ...current, validTo: event.target.value || null, updatedAt: new Date().toISOString() }))}
                          />
                        </div>
                      </td>
                      <td>
                        <label className="demo-manager-inline">
                          <input
                            type="checkbox"
                            checked={assignment.active}
                            onChange={(event) => updateAssignment(assignment.id, (current) => ({ ...current, active: event.target.checked, updatedAt: new Date().toISOString() }))}
                          />
                          Ativo
                        </label>
                      </td>
                      <td>
                        <div className="demo-manager-permissions">
                          {PERMISSION_LABELS.map((permission) => (
                            <label key={permission.key}>
                              <input
                                type="checkbox"
                                checked={assignment.permissions[permission.key]}
                                onChange={(event) => updatePermission(assignment.id, permission.key, event.target.checked)}
                              />
                              {permission.label}
                            </label>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="demo-manager-add">
          <h3>Adicionar responsável</h3>
          <div className="demo-manager-add-grid">
            <label>
              Time
              <select
                aria-label="Time do novo responsável"
                value={newAssignment.teamId}
                onChange={(event) => setNewAssignment((current) => ({ ...current, teamId: event.target.value }))}
              >
                {pkg.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <label>
              Responsável
              <select
                aria-label="Membro do novo responsável"
                value={newAssignment.managerMemberId}
                onChange={(event) => setNewAssignment((current) => ({ ...current, managerMemberId: event.target.value }))}
              >
                {pkg.members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
              </select>
            </label>
            <label>
              Papel
              <select
                aria-label="Papel do novo responsável"
                value={newAssignment.role}
                onChange={(event) => setNewAssignment((current) => ({ ...current, role: event.target.value as DemoManagerRole }))}
              >
                {MANAGER_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
              </select>
            </label>
            <label>
              Início da vigência
              <input
                required
                type="date"
                value={newAssignment.validFrom}
                onChange={(event) => setNewAssignment((current) => ({ ...current, validFrom: event.target.value }))}
              />
            </label>
            <label>
              Fim da vigência
              <input
                type="date"
                value={newAssignment.validTo}
                onChange={(event) => setNewAssignment((current) => ({ ...current, validTo: event.target.value }))}
              />
            </label>
          </div>
          <fieldset>
            <legend>Permissões</legend>
            <div className="demo-manager-permissions">
              {PERMISSION_LABELS.map((permission) => (
                <label key={permission.key}>
                  <input
                    type="checkbox"
                    checked={newAssignment.permissions[permission.key]}
                    onChange={(event) => updateNewPermission(permission.key, event.target.checked)}
                  />
                  {permission.label}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p className="error-text" role="alert">{error}</p>}
          <button type="button" className="btn" onClick={addAssignment}>Adicionar</button>
        </section>

        <div className="modal-actions">
          <span className="modal-actions-spacer" />
          <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary">Salvar alterações</button>
        </div>
      </form>
    </div>
  );
}
