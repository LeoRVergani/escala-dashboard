import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Rede de segurança de última linha: sem isto, qualquer erro de render (ex.: um valor
 * inesperado do backend virando filho inválido do React) derruba a árvore inteira e deixa
 * `#root` em branco, sem nenhuma indicação do que aconteceu. Não substitui corrigir a causa
 * raiz (ver `formatRemoteTimestamp` em App.tsx) - só garante que o próximo bug parecido
 * mostre um erro legível em vez de uma tela branca "carregando para sempre".
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro não tratado no Dashboard:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-crash" role="alert">
          <h1>Algo quebrou nesta tela</h1>
          <p>{this.state.error.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => this.setState({ error: null })}>
            Tentar novamente
          </button>
          <p className="muted">
            Se o problema persistir, recarregue a página. Nenhum dado do rascunho é apagado
            por isto.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
