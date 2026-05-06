'use client';

/**
 * Esta página foi consolidada dentro de /dashboard/bravoflow (aba "Métricas").
 * Mantemos um redirect para preservar links antigos.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BravoflowMetricsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/bravoflow');
  }, [router]);
  return null;
}
