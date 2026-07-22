import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocalIdentityBar } from '../src/components/LocalIdentityBar';
import type { LocalIdentity } from '../src/lib/localIdentity';

const identity: LocalIdentity = {
  chefeName: 'Claudio',
  activeTeamId: null,
  teams: [],
};

function renderBar(active: boolean) {
  return render(
    <LocalIdentityBar
      identity={identity}
      activeTeam={null}
      devSessionActive={active}
      devSessionLogin={active ? 'admin@ici.test' : undefined}
      onSetChefeName={vi.fn()}
      onAddTeam={vi.fn()}
      onSetActiveTeam={vi.fn()}
    />,
  );
}

describe('LocalIdentityBar — sessão local de desenvolvimento', () => {
  it('mostra o selo MODO DE TESTE quando a sessão está ativa', () => {
    renderBar(true);
    expect(screen.getByText('MODO DE TESTE')).toBeInTheDocument();
    expect(screen.getByText('admin@ici.test')).toBeInTheDocument();
  });

  it('não mostra o selo MODO DE TESTE quando a sessão não está ativa', () => {
    renderBar(false);
    expect(screen.queryByText('MODO DE TESTE')).not.toBeInTheDocument();
  });
});
