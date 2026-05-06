/**
 * /api/stage-comments — CRUD de comentários em etapas de workflow.
 *
 * GET    ?workflowId=xxx&stageId=yyy   → lista comentários da etapa
 * POST   {workflowId, stageId, body, parentId?, authorId, ...}  → cria
 * PATCH  {commentId, body?, resolved?}                          → edita/resolve
 * DELETE ?commentId=xxx&deletedBy=user                          → soft-delete
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';
import { ensureCommentsSchema } from '@/lib/db/commentsMigration';
import { auditLog, AuditEventType } from '@/lib/audit';
import { rateLimitMutation, rateLimitRead } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

// ─── GET ─────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const rl = await rateLimitRead(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureCommentsSchema(client);

    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get('workflowId');
    const stageId    = searchParams.get('stageId');

    if (!workflowId || !stageId) {
      return NextResponse.json(
        { success: false, error: 'workflowId e stageId são obrigatórios' },
        { status: 400 }
      );
    }

    const result = await client.query(`
      SELECT
        comment_id,
        parent_id,
        author_id,
        author_username,
        author_name,
        author_avatar_url,
        body,
        mentions,
        resolved_at,
        resolved_by,
        resolved_by_name,
        created_at,
        updated_at,
        edited_at
      FROM fact_stage_comments
      WHERE workflow_id = $1
        AND stage_id    = $2
        AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 500
    `, [workflowId, stageId]);

    return NextResponse.json({
      success: true,
      data: result.rows,
      count:  result.rowCount,
    });
  } catch (error: any) {
    logger.error('stage-comments GET error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// ─── POST (criar) ────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureCommentsSchema(client);

    const body = await request.json();
    const {
      workflowId,
      stageId,
      parentId,
      body: text,
      authorId,
      authorUsername,
      authorName,
      authorAvatarUrl,
      mentions,
    } = body;

    if (!workflowId || !stageId || !text || !authorId) {
      return NextResponse.json(
        { success: false, error: 'workflowId, stageId, body e authorId são obrigatórios' },
        { status: 400 }
      );
    }

    if (typeof text !== 'string' || text.length > 4000) {
      return NextResponse.json(
        { success: false, error: 'body deve ser string de até 4000 caracteres' },
        { status: 400 }
      );
    }

    const inserted = await client.query(`
      INSERT INTO fact_stage_comments (
        workflow_id, stage_id, parent_id,
        author_id, author_username, author_name, author_avatar_url,
        body, mentions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING comment_id, created_at
    `, [
      workflowId,
      stageId,
      parentId || null,
      authorId,
      authorUsername || null,
      authorName || null,
      authorAvatarUrl || null,
      text.trim(),
      JSON.stringify(Array.isArray(mentions) ? mentions : []),
    ]);

    const newComment = inserted.rows[0];

    await auditLog({
      eventType: 'workflow.updated' as any,
      severity: 'info',
      actor: { id: authorId, username: authorUsername },
      target: { type: 'workflow_stage', id: stageId, label: `comment on stage` },
      payload: {
        action: 'comment_created',
        workflowId,
        stageId,
        commentId: newComment.comment_id,
        replyTo: parentId || null,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        commentId: newComment.comment_id,
        createdAt: newComment.created_at,
      },
    });
  } catch (error: any) {
    logger.error('stage-comments POST error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// ─── PATCH (editar / resolver) ───────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureCommentsSchema(client);

    const body = await request.json();
    const {
      commentId,
      body: text,
      resolved,
      resolvedBy,
      resolvedByName,
      authorId,
    } = body;

    if (!commentId) {
      return NextResponse.json(
        { success: false, error: 'commentId é obrigatório' },
        { status: 400 }
      );
    }

    // Editar texto (apenas o autor)
    if (typeof text === 'string' && authorId) {
      if (text.length > 4000) {
        return NextResponse.json(
          { success: false, error: 'body deve ter até 4000 caracteres' },
          { status: 400 }
        );
      }
      const result = await client.query(`
        UPDATE fact_stage_comments
        SET body = $2, edited_at = NOW(), updated_at = NOW()
        WHERE comment_id = $1
          AND author_id = $3
          AND deleted_at IS NULL
        RETURNING comment_id
      `, [commentId, text.trim(), authorId]);

      if (result.rowCount === 0) {
        return NextResponse.json(
          { success: false, error: 'Comentário não encontrado ou você não é o autor' },
          { status: 403 }
        );
      }
    }

    // Marcar como resolvido / não-resolvido
    if (typeof resolved === 'boolean') {
      if (resolved) {
        await client.query(`
          UPDATE fact_stage_comments
          SET resolved_at = NOW(), resolved_by = $2, resolved_by_name = $3, updated_at = NOW()
          WHERE comment_id = $1
        `, [commentId, resolvedBy || null, resolvedByName || null]);
      } else {
        await client.query(`
          UPDATE fact_stage_comments
          SET resolved_at = NULL, resolved_by = NULL, resolved_by_name = NULL, updated_at = NOW()
          WHERE comment_id = $1
        `, [commentId]);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error('stage-comments PATCH error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// ─── DELETE (soft) ───────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const rl = await rateLimitMutation(request);
  if (!rl.ok) return rl.response;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureCommentsSchema(client);

    const { searchParams } = new URL(request.url);
    const commentId = searchParams.get('commentId');
    const deletedBy = searchParams.get('deletedBy');

    if (!commentId) {
      return NextResponse.json(
        { success: false, error: 'commentId é obrigatório' },
        { status: 400 }
      );
    }

    await client.query(`
      UPDATE fact_stage_comments
      SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
      WHERE comment_id = $1
    `, [commentId, deletedBy || 'unknown']);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error('stage-comments DELETE error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
