import { useState } from 'react';
import { Brand } from './Brand';
import { FlowSteps } from './FlowSteps';
import { DestinationSeal, ShiftRail } from './OperationalMotifs';

interface EntryScreenProps {
  configured: boolean;
  loading: boolean;
  error: string | null;
  devEnabled: boolean;
  onLogin: () => void;
  onDevLogin?: (login: string) => Promise<void>;
}

export function EntryScreen({ configured, loading, error, devEnabled, onLogin, onDevLogin }: EntryScreenProps) {
  const [showTestAccess, setShowTestAccess] = useState(false);
  const [login, setLogin] = useState('');

  return (
    <main className="entry-screen">
      <div className="entry-screen__top"><Brand /></div>
      <div className="entry-screen__content">
        <section className="entry-screen__copy" aria-labelledby="entry-title">
          <span className="entry-screen__eyebrow">Escala ICI · acesso corporativo</span>
          <h1 id="entry-title">Gestão de escalas, sem desvios.</h1>
          <p>Organize equipes autorizadas, revise períodos e publique com rastreabilidade.</p>
          <FlowSteps current={1} labels={['Escolher equipe', 'Revisar escala', 'Publicar']} />
          <div className="entry-screen__actions">
            <button type="button" className="btn btn-primary entry-screen__login" onClick={onLogin} disabled={loading || !configured}>
              {loading ? 'Restaurando sessão…' : 'Entrar com Microsoft'}
            </button>
            {!configured && <p className="entry-screen__hint">O acesso corporativo está indisponível porque o Firebase não foi configurado neste ambiente.</p>}
            {error && <p className="entry-screen__error" role="alert">{error}</p>}
          </div>
          {devEnabled && onDevLogin && (
            <div className="entry-screen__test">
              <button type="button" className="link-btn" aria-expanded={showTestAccess} onClick={() => setShowTestAccess((value) => !value)}>
                Acessar ambiente de teste
              </button>
              {showTestAccess && (
                <form onSubmit={(event) => { event.preventDefault(); if (login.trim()) void onDevLogin(login.trim()); }}>
                  <label htmlFor="entry-test-login">Login de teste</label>
                  <div className="entry-screen__test-row">
                    <input id="entry-test-login" value={login} onChange={(event) => setLogin(event.target.value)} autoFocus />
                    <button type="submit" className="btn">Entrar no teste</button>
                  </div>
                  <small>Somente dados locais de teste, sem publicação oficial.</small>
                </form>
              )}
            </div>
          )}
        </section>
        <aside className="entry-screen__visual" aria-label="Fluxo de operação">
          <DestinationSeal area="Escala ICI" team="Fluxo autorizado" period="Importar · revisar · publicar" />
          <ShiftRail />
          <div className="entry-screen__note"><strong>Um fluxo claro para cada período.</strong><span>Equipe autorizada, revisão consistente e histórico preservado.</span></div>
        </aside>
      </div>
    </main>
  );
}
