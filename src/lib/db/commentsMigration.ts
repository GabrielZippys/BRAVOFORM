/**
 * BravoForm — Migração da tabela `fact_stage_comments`.
 *
 * Comments threads em stages — diferencial competitivo.
 *
 * Pipefy/Asana só permitem comentários EM INSTÂNCIAS (cards/cases).
 * Aqui permitimos comentários NA DEFINIÇÃO da etapa (stage), permitindo
 * que admins discutam mudanças no design do workflow ANTES de afetar
 * instâncias em produção.
 *
 * Use cases:
 *   • "Por que essa etapa exige anexo?" — discussão entre admins
 *   • "@joao — vamos adicionar timer aqui?" — @-mention
 *   • Documentação inline da decisão de design (auditoria/onboarding)
 *
 * Schema:
 *   • workflow_id   — workflow ao qual a etapa pertence
 *   • stage_id      — id da etapa (firebase_id)
 *   • parent_id     — null = comentário raiz; preenchido = reply
 *   • author_*      — denormalizado para evitar JOIN
 *   • body          — markdown
 *   • mentions      — JSONB array de userIds mencionados
 *   • resolved_at   — quando alguém marcou como "resolvido"
 *   • resolved_by   — quem marcou como resolvido
 *   • deleted_at    — soft delete
 */

let migrationApplied = false;

export async function ensureCommentsSchema(client: any): Promise<void> {
  if (migrationApplied) return;

  await client.query(`
    CREATE TABLE IF NOT EXISTS fact_stage_comments (
      comment_id        BIGSERIAL    PRIMARY KEY,

      -- Hierarquia (workflow > stage > comment > replies)
      workflow_id       VARCHAR(255) NOT NULL,
      stage_id          VARCHAR(255) NOT NULL,
      parent_id         BIGINT       REFERENCES fact_stage_comments(comment_id) ON DELETE CASCADE,

      -- Autor (denormalizado)
      author_id         VARCHAR(255) NOT NULL,
      author_username   VARCHAR(255),
      author_name       VARCHAR(255),
      author_avatar_url TEXT,

      -- Conteúdo
      body              TEXT         NOT NULL,
      mentions          JSONB        DEFAULT '[]'::jsonb,

      -- Estado
      resolved_at       TIMESTAMP,
      resolved_by       VARCHAR(255),
      resolved_by_name  VARCHAR(255),

      -- Soft delete
      deleted_at        TIMESTAMP,
      deleted_by        VARCHAR(255),

      -- Timestamps
      created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
      edited_at         TIMESTAMP
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_stage_comments_stage    ON fact_stage_comments(workflow_id, stage_id);
    CREATE INDEX IF NOT EXISTS idx_stage_comments_parent   ON fact_stage_comments(parent_id);
    CREATE INDEX IF NOT EXISTS idx_stage_comments_author   ON fact_stage_comments(author_id);
    CREATE INDEX IF NOT EXISTS idx_stage_comments_created  ON fact_stage_comments(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stage_comments_unresolv ON fact_stage_comments(stage_id) WHERE resolved_at IS NULL AND deleted_at IS NULL;
  `);

  migrationApplied = true;
  console.log('✅ ensureCommentsSchema: fact_stage_comments aplicado');
}
