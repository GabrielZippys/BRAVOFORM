'use client';

/**
 * Skeleton — placeholders animados durante carregamento.
 *
 * Substitui mensagens "Carregando..." por placeholders visuais que mantêm
 * o layout estável e dão sensação de performance superior.
 *
 * Componentes exportados:
 *   - <Skeleton />          → bloco genérico (passa width/height/radius)
 *   - <SkeletonText />      → 1+ linhas de texto
 *   - <SkeletonCard />      → card completo (avatar + texto + ações)
 *   - <SkeletonList />      → N items repetidos (para listas)
 *   - <SkeletonTable />     → tabela (rows × cols)
 *
 * Uso típico:
 *   {loading ? <SkeletonList count={5} variant="card" /> : <ListaReal />}
 */

import React from 'react';
import styles from '../../app/styles/Skeleton.module.css';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'sm',
  className = '',
  style,
}: SkeletonProps) {
  const radiusMap = {
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    full: 'var(--radius-full)',
  };
  return (
    <div
      className={`${styles.skeleton} ${className}`}
      style={{
        width,
        height,
        borderRadius: radiusMap[radius],
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

interface SkeletonTextProps {
  /** Número de linhas */
  lines?: number;
  /** Largura da última linha (geralmente menor para parecer texto real) */
  lastLineWidth?: string;
}

export function SkeletonText({ lines = 3, lastLineWidth = '60%' }: SkeletonTextProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={i === lines - 1 ? lastLineWidth : '100%'}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div
      className={styles.card}
      style={{
        padding: 'var(--space-5)',
        background: 'var(--surface-card)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <Skeleton width={40} height={40} radius="full" />
        <div style={{ flex: 1 }}>
          <Skeleton height={14} width="50%" style={{ marginBottom: 'var(--space-2)' }} />
          <Skeleton height={10} width="30%" />
        </div>
        <Skeleton width={60} height={24} radius="md" />
      </div>
      <SkeletonText lines={2} />
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
        <Skeleton height={28} width={80} radius="md" />
        <Skeleton height={28} width={80} radius="md" />
      </div>
    </div>
  );
}

interface SkeletonListProps {
  count?: number;
  variant?: 'card' | 'row';
}

export function SkeletonList({ count = 4, variant = 'card' }: SkeletonListProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: variant === 'card' ? 'repeat(auto-fill, minmax(360px, 1fr))' : '1fr',
        gap: 'var(--space-4)',
      }}
    >
      {Array.from({ length: count }).map((_, i) =>
        variant === 'card' ? <SkeletonCard key={i} /> : <SkeletonRow key={i} />
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div
      style={{
        padding: 'var(--space-4)',
        background: 'var(--surface-card)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
      }}
    >
      <Skeleton width={32} height={32} radius="full" />
      <div style={{ flex: 1 }}>
        <Skeleton height={14} width="40%" style={{ marginBottom: 'var(--space-2)' }} />
        <Skeleton height={10} width="70%" />
      </div>
      <Skeleton width={100} height={28} radius="md" />
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
}

export function SkeletonTable({ rows = 5, columns = 4 }: SkeletonTableProps) {
  return (
    <div
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 'var(--space-4)',
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--color-gray-50)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} height={12} width="60%" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: 'var(--space-4)',
            padding: 'var(--space-4)',
            borderBottom: r < rows - 1 ? '1px solid var(--color-border-subtle)' : 'none',
          }}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} height={14} width={c === 0 ? '80%' : '60%'} />
          ))}
        </div>
      ))}
    </div>
  );
}
