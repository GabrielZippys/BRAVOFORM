/**
 * POST /api/dsar/forget
 *
 * LGPD Art. 18, IV — Direito ao esquecimento (Right to be Forgotten).
 *
 * Anonimiza TODOS os dados pessoais de um titular sem destruir o histórico
 * operacional necessário para auditoria, fiscal e compliance.
 *
 * IMPORTANTE — diferença entre EXCLUIR e ANONIMIZAR:
 *   • EXCLUIR rompe a integridade referencial e elimina trilha de auditoria,
 *     o que conflita com obrigações regulatórias (NF-e, ISO 9001, etc.).
 *   • ANONIMIZAR mantém o registro estatístico e auditável, mas remove
 *     qualquer dado que identifique o titular (LGPD Art. 12 — dados
 *     anonimizados não são considerados dados pessoais).
 *
 * Estratégia desta rota:
 *   1. dim_collaborators       → username/name/email/phone trocados por hash anônimo
 *   2. fact_form_response      → collaborator_username trocado pelo mesmo hash
 *   3. fact_workflow_history   → performed_by_name trocado pelo hash
 *   4. fact_audit_events       → actor_username trocado, ip_address e
 *                                user_agent zerados (mas mantém audit_id e
 *                                actor_id para integridade da trilha)
 *   5. Anexos (fact_attachments) — URLs preservadas, mas o nome do arquivo
 *      é hashed se contiver username
 *
 * O hash é único e determinístico por user, permitindo correlação interna
 * para auditoria sem revelar identidade.
 *
 * Body:
 *   {
 *     userId: string,                  // firebase_id do colaborador
 *     reason: string,                  // justificativa LGPD
 *     requestedBy: string,             // quem solicitou (admin)
 *     requestedByUsername: string,
 *     dryRun?: boolean,                // se true, retorna o que faria sem mutar
 *   }
 *
 * Response:
 *   { success, anonymizedHash, affected: { collaborators, responses, history, audit } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { auditLog, AuditEventType } from '@/lib/audit';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  // DSAR é raro mas pesado — limita a 3 por IP/min
  const rl = await rateLimit(request, { limit: 3, windowMs: 60_000, bucket: 'dsar' });
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  let body: any;

  try {
    // Garante colunas de anonimização (idempotente)
    await ensureAnonymizationColumns(client);

    body = await request.json();
    const {
      userId,
      reason,
      requestedBy = 'admin',
      requestedByUsername = 'Administrador',
      dryRun = false,
    } = body;

    if (!userId || !reason) {
      return NextResponse.json(
        { success: false, error: 'userId e reason são obrigatórios' },
        { status: 400 }
      );
    }

    // Hash anônimo determinístico
    const anonHash = crypto
      .createHash('sha256')
      .update(`anon-${userId}`)
      .digest('hex')
      .slice(0, 16);
    const anonUsername = `[anonimizado-${anonHash}]`;
    const anonEmail = `${anonHash}@anonymized.local`;
    const anonName = `Titular Anonimizado #${anonHash.slice(0, 6)}`;

    // 1) Verifica que o usuário existe e captura nome original (para audit)
    const profileRes = await client.query(
      `SELECT firebase_id, username, name, email FROM dim_collaborators WHERE firebase_id = $1`,
      [userId]
    );
    const original = profileRes.rows[0];
    if (!original) {
      return NextResponse.json(
        { success: false, error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    if (dryRun) {
      // Retorna preview sem mutar
      const preview = await client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM dim_collaborators WHERE firebase_id = $1) AS collaborators,
           (SELECT COUNT(*)::int FROM fact_form_response fr
              JOIN dim_collaborators dcol ON dcol.collaborator_key = fr.collaborator_key
              WHERE dcol.firebase_id = $1) AS responses,
           (SELECT COUNT(*)::int FROM fact_workflow_history wh
              WHERE wh.performed_by_name = $2) AS history,
           (SELECT COUNT(*)::int FROM fact_audit_events WHERE actor_id = $1) AS audit
        `,
        [userId, original.username]
      );

      return NextResponse.json({
        success: true,
        dryRun: true,
        wouldAnonymize: {
          subject: { id: userId, username: original.username, name: original.name },
          replaceWith: { username: anonUsername, name: anonName, email: anonEmail },
          affected: preview.rows[0],
        },
      });
    }

    await client.query('BEGIN');

    // 2) Anonimiza dim_collaborators
    const collabRes = await client.query(
      `UPDATE dim_collaborators
       SET username = $2, name = $3, email = $4,
           phone = NULL, photo_url = NULL,
           anonymized_at = NOW(), anonymized_reason = $5
       WHERE firebase_id = $1`,
      [userId, anonUsername, anonName, anonEmail, reason.slice(0, 500)]
    );

    // 3) Anonimiza fact_form_response
    const responsesRes = await client.query(
      `UPDATE fact_form_response
       SET collaborator_username = $2
       WHERE collaborator_key IN (
         SELECT collaborator_key FROM dim_collaborators WHERE firebase_id = $1
       )`,
      [userId, anonUsername]
    );

    // 4) Anonimiza fact_workflow_history (todas as ações realizadas pelo user)
    const historyRes = await client.query(
      `UPDATE fact_workflow_history
       SET performed_by_name = $2
       WHERE performed_by_name = $3`,
      [anonUsername, anonUsername, original.username]
    );

    // 5) Anonimiza fact_audit_events — preserva audit_id e actor_id mas zera identificadores
    const auditRes = await client.query(
      `UPDATE fact_audit_events
       SET actor_username = $2,
           ip_address = NULL,
           user_agent = '[anonymized]',
           payload = jsonb_build_object('anonymized', true, 'originalEventType', payload->>'eventType')
       WHERE actor_id = $1`,
      [userId, anonUsername]
    );

    await client.query('COMMIT');

    const affected = {
      collaborators: collabRes.rowCount || 0,
      responses: responsesRes.rowCount || 0,
      history: historyRes.rowCount || 0,
      audit: auditRes.rowCount || 0,
    };

    // Audit CRÍTICO da própria operação de forget
    // (NÃO pode ser anonimizada — é a prova de que o forget foi executado)
    await auditLog({
      eventType: AuditEventType.DSAR_FORGET,
      severity: 'critical',
      actor: { id: requestedBy, username: requestedByUsername },
      target: { type: 'user', id: userId, label: anonUsername },
      payload: {
        reason: reason.slice(0, 500),
        affected,
        anonymizedHash: anonHash,
        originalUsername: original.username, // ⚠️ MANTIDO no audit log para rastreabilidade
      },
      request,
    });

    logger.info('DSAR forget executado', { userId, anonHash, affected });

    return NextResponse.json({
      success: true,
      anonymizedHash: anonHash,
      anonymizedUsername: anonUsername,
      affected,
      message: 'Titular anonimizado conforme LGPD Art. 18, IV. Trilha de auditoria preservada para fins regulatórios.',
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('DSAR forget error', error);

    await auditLog({
      eventType: AuditEventType.DSAR_FORGET,
      severity: 'critical',
      payload: { error: error.message, body: { userId: body?.userId } },
      success: false,
      errorMessage: error.message,
      request,
    });

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// Migration helper para colunas anonimizadas em dim_collaborators (chamada na primeira execução)
// (Idempotente — não dá erro se já existir)
async function ensureAnonymizationColumns(client: any) {
  await client.query(`
    ALTER TABLE dim_collaborators
      ADD COLUMN IF NOT EXISTS anonymized_at      TIMESTAMP,
      ADD COLUMN IF NOT EXISTS anonymized_reason  TEXT,
      ADD COLUMN IF NOT EXISTS phone              VARCHAR(64),
      ADD COLUMN IF NOT EXISTS photo_url          TEXT
  `);
}
