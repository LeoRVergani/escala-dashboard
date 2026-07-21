import type { DemoPublicationPackage } from '../lib/demoWorkspace/dto';
import type { OfficialCorporateLink } from '../lib/officialWorkspace/retarget';

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
export function OfficialCorporateLinkForm({ pkg, link, onChange }: OfficialCorporateLinkFormProps) {
  const activeMembers = pkg.members.filter((member) => member.active);

  return (
    <fieldset className="official-corporate-link" aria-label="Vínculo da conta corporativa">
      <legend>Vínculo da conta corporativa</legend>
      <label>
        Membro
        <select
          value={link.memberId ?? ''}
          onChange={(event) => onChange({ ...link, memberId: event.target.value || undefined })}
        >
          <option value="">Selecione um membro</option>
          {activeMembers.map((member) => (
            <option key={member.id} value={member.id}>{member.displayName}</option>
          ))}
        </select>
      </label>
      <label>
        Equipe
        <select
          value={link.teamId ?? ''}
          onChange={(event) => onChange({ ...link, teamId: event.target.value || undefined })}
        >
          <option value="">Selecione uma equipe</option>
          {pkg.teams.map((team) => (
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
