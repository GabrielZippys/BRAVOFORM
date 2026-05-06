/**
 * GET /api/audit/events
 *
 * Lista eventos do audit log com filtros. Usado pelo painel
 * /dashboard/audit para visualização e auditoria SOC 2 / LGPD.
 *
 * Query params (todos opcionais):
 *   ?eventType=workflow.action   — filtra por tipo
 *   ?actorId=user123             — filtra por quem fez
 *   ?targetType=response         — filtra por tipo do alvo
 *   ?targetId=resp123            — filtra por id do alvo
 *   ?companyId=xxx               — multi-tenant
 *   ?severity=critical           — info|warn|critical
 *   ?from=2026-01-01             — data inicial
 *   ?to=2026-12-31               — data final
 *   ?limit=100&offset=0          — paginação (max 500)
 *
 * Retorno:
 *   { success, data: { rows: [...], total }, pagination: { limit, offset } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryAuditEvents, AuditQueryFilters } from '@/lib/audit';
import { rateLimitRead } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const rl = await rateLimitRead(request);
  if (!rl.ok) return rl.response;

  try {
    const { searchParams } = new URL(request.url);
    const filters: AuditQueryFilters = {
      eventType:  searchParams.get('eventType')  || undefined,
      actorId:    searchParams.get('actorId')    || undefined,
      targetType: searchParams.get('targetType') || undefined,
      targetId:   searchParams.get('targetId')   || undefined,
      companyId:  searchParams.get('companyId')  || undefined,
      severity:   (searchParams.get('severity') as any) || undefined,
      from:       searchParams.get('from')       || undefined,
      to:         searchParams.get('to')         || undefined,
      limit:      parseInt(searchParams.get('limit')  || '100', 10),
      offset:     parseInt(searchParams.get('offset') || '0',   10),
    };

    const result = await queryAuditEvents(filters);

    return NextResponse.json({
      success: true,
      data: result,
      pagination: {
        limit:  filters.limit,
        offset: filters.offset,
      },
    });
  } catch (error: any) {
    logger.error('audit events query failed', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
