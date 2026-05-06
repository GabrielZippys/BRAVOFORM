'use client';

/**
 * ThemeToggle — botão para alternar tema.
 *
 * Mostra: ☀️ Light · 🌙 Dark · 💻 Auto (acompanha sistema)
 *
 * Cliques: cicla em ordem light → dark → auto → light.
 * Tooltip mostra qual é o tema atual.
 *
 * Use em qualquer header/sidebar:
 *   import ThemeToggle from '@/components/ThemeToggle';
 *   <ThemeToggle />
 */

import React from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  /** Compacto: só ícone, sem texto */
  compact?: boolean;
  className?: string;
}

export default function ThemeToggle({ compact = false, className = '' }: Props) {
  const { theme, cycleTheme } = useTheme();

  const config = {
    light: { Icon: Sun,    label: 'Claro' },
    dark:  { Icon: Moon,   label: 'Escuro' },
    auto:  { Icon: Laptop, label: 'Sistema' },
  };

  const { Icon, label } = config[theme];

  return (
    <button
      onClick={cycleTheme}
      title={`Tema: ${label} — clique para alternar`}
      aria-label={`Alternar tema (atual: ${label})`}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: compact ? 'var(--space-2)' : 'var(--space-2) var(--space-3)',
        background: 'var(--surface-card)',
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 'var(--font-weight-medium)',
        transition: 'all var(--duration-fast) var(--ease-in-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--surface-hover)';
        e.currentTarget.style.color = 'var(--color-text-primary)';
        e.currentTarget.style.borderColor = 'var(--color-border-strong)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--surface-card)';
        e.currentTarget.style.color = 'var(--color-text-secondary)';
        e.currentTarget.style.borderColor = 'var(--color-border-default)';
      }}
    >
      <Icon size={16} />
      {!compact && <span>{label}</span>}
    </button>
  );
}
