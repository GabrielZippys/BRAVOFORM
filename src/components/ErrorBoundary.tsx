'use client';

/**
 * ErrorBoundary — captura erros não tratados em árvores de componentes.
 *
 * SEM ele, qualquer erro de render (`undefined.map(...)`, fetch que retorna
 * formato inesperado, etc.) crasha a tela inteira mostrando overlay branco
 * para o usuário corporativo. COM ele, mostramos uma tela amigável com:
 *   - Botão "Tentar novamente" (re-render)
 *   - Botão "Voltar ao início"
 *   - Stack trace COLAPSADO (apenas em dev, ou se admin clicar para expandir)
 *   - Hook para Sentry/Datadog via logger.error
 *
 * Uso:
 *   // Wrapping uma página inteira
 *   <ErrorBoundary>
 *     <MinhaPagina />
 *   </ErrorBoundary>
 *
 *   // Com fallback custom
 *   <ErrorBoundary fallback={<MinhaTelaErroCustom />}>
 *     ...
 *   </ErrorBoundary>
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Texto custom mostrado no topo (default: "Algo deu errado") */
  title?: string;
  /** Função chamada quando o erro acontece — útil para tracking */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Se true, mostra botão "Voltar ao início" */
  showHomeButton?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showStack: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showStack: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    logger.error('ErrorBoundary caught an error', error, {
      componentStack: errorInfo.componentStack,
    });
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showStack: false });
  };

  handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/dashboard';
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    const isDev = process.env.NODE_ENV !== 'production';

    return (
      <div
        role="alert"
        style={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-8)',
          background: 'var(--surface-page)',
        }}
      >
        <div
          style={{
            maxWidth: 560,
            width: '100%',
            background: 'var(--surface-card)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-8)',
            boxShadow: 'var(--shadow-lg)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-danger-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto var(--space-4)',
            }}
          >
            <AlertTriangle size={32} color="var(--color-danger-600)" />
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: 'var(--font-size-xl)',
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--color-text-primary)',
            }}
          >
            {this.props.title || 'Algo deu errado'}
          </h2>

          <p
            style={{
              margin: 'var(--space-2) 0 var(--space-6)',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              lineHeight: 'var(--line-height-relaxed)',
            }}
          >
            Encontramos um erro inesperado nesta tela. A equipe técnica já foi notificada.
            Você pode tentar novamente ou voltar ao início.
          </p>

          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={this.handleReset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-3) var(--space-5)',
                background: 'var(--color-brand-500)',
                color: 'var(--color-text-inverse)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-semibold)',
                cursor: 'pointer',
                transition: 'background var(--duration-base) var(--ease-in-out)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-brand-600)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-brand-500)')}
            >
              <RefreshCw size={16} />
              Tentar novamente
            </button>
            {(this.props.showHomeButton ?? true) && (
              <button
                onClick={this.handleGoHome}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-3) var(--space-5)',
                  background: 'var(--surface-card)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 'var(--font-weight-medium)',
                  cursor: 'pointer',
                  transition: 'background var(--duration-base) var(--ease-in-out)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-card)')}
              >
                <Home size={16} />
                Voltar ao início
              </button>
            )}
          </div>

          {/* Detalhes técnicos — colapsado, expandível em dev */}
          {(isDev || this.state.showStack) && this.state.error && (
            <details
              style={{
                marginTop: 'var(--space-6)',
                textAlign: 'left',
                background: 'var(--color-gray-50)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontWeight: 'var(--font-weight-semibold)',
                  color: 'var(--color-text-primary)',
                }}
              >
                Detalhes técnicos
              </summary>
              <pre
                style={{
                  marginTop: 'var(--space-3)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'monospace',
                  fontSize: 'var(--font-size-xs)',
                }}
              >
                <strong>{this.state.error.name}:</strong> {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}

          {!isDev && (
            <button
              onClick={() => this.setState({ showStack: !this.state.showStack })}
              style={{
                marginTop: 'var(--space-4)',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-tertiary)',
                fontSize: 'var(--font-size-xs)',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {this.state.showStack ? 'Ocultar detalhes técnicos' : 'Mostrar detalhes técnicos'}
            </button>
          )}
        </div>
      </div>
    );
  }
}
