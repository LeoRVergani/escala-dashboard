import type { DemoPublicationPackage } from '../lib/demoWorkspace/dto';
import type { OfficialCorporateLink } from '../lib/officialWorkspace/retarget';
import { eligibleOfficialMembers, eligibleOfficialTeams } from '../lib/officialWorkspace/retarget';

interface OfficialCorporateLinkFormProps {
  pkg: DemoPublicationPackage;
  link: Partial<OfficialCorporateLink>;
  onChange: (link: Partial<OfficialCorporateLink>) => void;
}

// Vinculo da conta corporativa (adendo FASE 14D): o usuario escolhe aqui qual membro do
// pacote importado corresponde a conta lvergani. entraTenantId/entraObjectId ficam em
// branco de proposito - nao ha valor real para preencher automaticamente nesta fase, e
// nenhum valor real deve ser versionado no repositorio. O e-mail normalizado e o fallback
// documentado enquanto o objectId nao estiver configurado.
//
// FASE 14E: os selects abaixo só oferecem membros/equipes elegíveis (workspaceId ici-dev e
// sem "demo" no id) - nunca um `member-demo-*`/`team-demo-*` da fixture do Ambiente Demo.
// Isso é o que impede, na origem, o cenário relatado de "Gestor de Segurança Demo" acabar
// selecionado no fluxo oficial e disparar WORKSPACE_NOT_ALLOWED só no COMMIT.
export function OfficialCorporateLinkForm({ pkg, link, onChange }: OfficialCorporateLinkFormProps) {
  const eligibleMembers = eligibleOfficialMembers(pkg);
  const eligibleTeams = eligibleOfficialTeams(pkg);
  const noEligibleData = eligibleMembers.length === 0 || eligibleTeams.length === 0;

  return (
    <fieldset className="official-corporate-link" aria-label="Vínculo da conta corporativa">
      <legend>Vínculo da conta corporativa</legend>
      {noEligibleData && (
        <p className="official-corporate-link-empty" role="status">
          Nenhum membro oficial disponível ainda. Os dados carregados pertencem ao Ambiente
          Demo (<code>demo-v1</code>) e nunca são oferecidos aqui — importe ou publique um
          pacote com <code>workspaceId: ici-dev</code> real para habilitar o vínculo.
        </p>
      )}
      <label>
        Membro
        <select
          value={link.memberId ?? ''}
          disabled={eligibleMembers.length === 0}
          onChange={(event) => onChange({ ...link, memberId: event.target.value || undefined })}
        >
          <option value="">Selecione um membro</option>
          {eligibleMembers.map((member) => (
            <option key={member.id} value={member.id}>{member.displayName}</option>
          ))}
        </select>
      </label>
      <label>
        Equipe
        <select
          value={link.teamId ?? ''}
          disabled={eligibleTeams.length === 0}
          onChange={(event) => onChange({ ...link, teamId: event.target.value || undefined })}
        >
          <option value="">Selecione uma equipe</option>
          {eligibleTeams.map((team) => (
            <option key={team.id} value={team.id}>{team.name}</option>
          ))}
        </select>
      </label>
      <label>
        E-mail normalizado (fallback)
        <input
          type="email"
          value={link.email ?? ''}
          placeholder="lvergani@ici.tec.br"
          onChange={(event) => onChange({ ...link, email: event.target.value || undefined })}
        />
      </label>
      <p className="official-corporate-link-hint">
        entraTenantId/entraObjectId reais não são preenchidos aqui — configure-os localmente
        fora do Git quando o objectId estiver disponível (ver runbook da FASE 14D).
      </p>
    </fieldset>
  );
}
