/**
 * BravoFlow — Scheduled Triggers v2
 *
 * ─── Cron Jobs ───────────────────────────────────────────────────────────────
 *  reenviarRetiradasPendentes  19h30 BRT  Re-roteiriza instâncias pendentes
 *  limpezaLixeira               3h00 BRT  Exclusão permanente de itens na lixeira
 *
 * ─── Configuração via Firestore: bravoflow_config/global ────────────────────
 * {
 *   rerouteEnabled       boolean    Habilita o reenvio das 19h30  (default: true)
 *   rerouteStatuses      string[]   Status que disparam reenvio   (default: ["in_routing","in_pickup"])
 *   rerouteFormIds       string[]   Apenas esses formIds (vazio = todos)
 *   rerouteCompanyIds    string[]   Apenas essas empresas  (vazio = todas)
 *   supervisorEmails     string[]   E-mails que recebem o relatório de reenvio
 *   notifyOnReroute      boolean    Envia e-mail de resumo aos supervisores (default: false)
 *   dryRun               boolean    Apenas loga, sem mutações              (default: false)
 *
 *   trashCleanupEnabled  boolean    Habilita limpeza noturna   (default: true)
 *   trashRetentionDays   number     Dias antes da exclusão     (default: 30)
 *   notifyOnTrashCleanup boolean    E-mail de resumo da limpeza
 * }
 *
 * ─── Variáveis de ambiente (Firebase Functions params) ──────────────────────
 *   BRAVOFORM_API_URL    URL base do Next.js  ex: https://bravoform.com.br
 *   NODEMAILER_USER      Conta Gmail usada no transporte de e-mail
 *   NODEMAILER_PASS      App Password do Gmail
 *
 *   Configurar com:
 *     firebase functions:params:set BRAVOFORM_API_URL="https://..." \
 *       NODEMAILER_USER="email@gmail.com" NODEMAILER_PASS="xxxx"
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineString } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";

// ─── Lazy Firestore accessor (evita chamar antes do initializeApp) ────────────
const getDb = () => admin.firestore();

// ─── Params (setados via Firebase CLI, não hardcoded) ────────────────────────
const bravoformApiUrl = defineString("BRAVOFORM_API_URL", { default: "" });
const nodemailerUser  = defineString("NODEMAILER_USER",    { default: "" });
const nodemailerPass  = defineString("NODEMAILER_PASS",    { default: "" });

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de configuração
// ─────────────────────────────────────────────────────────────────────────────
interface BravoflowConfig {
  rerouteEnabled:       boolean;
  rerouteStatuses:      string[];
  rerouteFormIds:       string[];
  rerouteCompanyIds:    string[];
  supervisorEmails:     string[];
  notifyOnReroute:      boolean;
  dryRun:               boolean;
  trashCleanupEnabled:  boolean;
  trashRetentionDays:   number;
  notifyOnTrashCleanup: boolean;
}

const DEFAULT_CONFIG: BravoflowConfig = {
  rerouteEnabled:       true,
  rerouteStatuses:      ["in_routing", "in_pickup"],
  rerouteFormIds:       [],
  rerouteCompanyIds:    [],
  supervisorEmails:     [],
  notifyOnReroute:      false,
  dryRun:               false,
  trashCleanupEnabled:  true,
  trashRetentionDays:   30,
  notifyOnTrashCleanup: false,
};

async function loadConfig(): Promise<BravoflowConfig> {
  try {
    const snap = await getDb().collection("bravoflow_config").doc("global").get();
    if (!snap.exists) {
      logger.info("ℹ️ bravoflow_config/global não encontrado — usando configuração padrão.");
      return DEFAULT_CONFIG;
    }
    return { ...DEFAULT_CONFIG, ...snap.data() } as BravoflowConfig;
  } catch (e) {
    logger.warn("⚠️ Falha ao ler bravoflow_config/global, usando padrões:", e);
    return DEFAULT_CONFIG;
  }
}

// Divide array em lotes de `size` (Firestore batch suporta máximo 500 operações)
function chunk<T>(arr: T[], size = 499): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function buildTransporter() {
  const user = nodemailerUser.value();
  const pass = nodemailerPass.value();
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CRON 1 — 19h30 BRT — Re-roteirização de instâncias pendentes
// ─────────────────────────────────────────────────────────────────────────────
export const reenviarRetiradasPendentes = onSchedule(
  {
    schedule:       "30 19 * * *",
    timeZone:       "America/Sao_Paulo",
    memory:         "256MiB",
    timeoutSeconds: 300,
  },
  async (_event) => {
    const cfg = await loadConfig();
    const tag = cfg.dryRun ? "[DRY-RUN] " : "";

    logger.info(`${tag}🔁 [19h30] Iniciando reenvio de instâncias de workflow`, {
      rerouteEnabled:  cfg.rerouteEnabled,
      rerouteStatuses: cfg.rerouteStatuses,
      rerouteFormIds:  cfg.rerouteFormIds,
      dryRun:          cfg.dryRun,
    });

    if (!cfg.rerouteEnabled) {
      logger.info("ℹ️ Reenvio desabilitado (rerouteEnabled=false). Pulando.");
      return;
    }

    if (!cfg.rerouteStatuses.length) {
      logger.warn("⚠️ rerouteStatuses está vazio — nada para processar.");
      return;
    }

    const db = getDb();

    try {
      // Firestore `in` aceita máximo 30 valores; use chunk se necessário
      const statusChunks = chunk(cfg.rerouteStatuses, 30);
      const allDocs: admin.firestore.QueryDocumentSnapshot[] = [];

      for (const statuses of statusChunks) {
        const snap = await db
          .collectionGroup("responses")
          .where("status", "in", statuses)
          .get();
        allDocs.push(...snap.docs);
      }

      if (!allDocs.length) {
        logger.info("✅ Sem instâncias pendentes para reenviar.");
        return;
      }

      // Aplica filtros opcionais de formId / companyId e ignora deletados
      const elegíveis = allDocs.filter((doc) => {
        const d = doc.data();
        if (d.deletedAt) return false;
        if (cfg.rerouteFormIds.length > 0 && !cfg.rerouteFormIds.includes(d.formId)) return false;
        if (cfg.rerouteCompanyIds.length > 0 && !cfg.rerouteCompanyIds.includes(d.companyId)) return false;
        return true;
      });

      logger.info(
        `${tag}${elegíveis.length} instância(s) elegível(is) de ${allDocs.length} encontrada(s)`
      );

      if (!elegíveis.length) {
        logger.info("✅ Nenhuma instância passou pelos filtros de formId/companyId.");
        return;
      }

      const now       = admin.firestore.Timestamp.now();
      const reenviadas: string[] = [];
      const errosSql:   { id: string; error: string }[] = [];

      if (!cfg.dryRun) {
        // Processa em lotes de 499 (limite seguro do Firestore batch)
        for (const lote of chunk(elegíveis)) {
          const batch = db.batch();
          lote.forEach((doc) => {
            batch.update(doc.ref, {
              status:          "in_routing",
              lastReroutedAt:  now,
              rerouteCount:    admin.firestore.FieldValue.increment(1),
            });
            reenviadas.push(doc.id);
          });
          await batch.commit();
        }

        // Registra histórico SQL via API Next.js (best-effort)
        const apiBase = bravoformApiUrl.value();
        if (apiBase) {
          const results = await Promise.allSettled(
            reenviadas.map(async (responseId) => {
              const res = await fetch(`${apiBase}/api/dataconnect/workflow-action`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  responseId,
                  action:              "transition",
                  performedBy:         "system-cron-1930",
                  performedByUsername: "Sistema (Cron 19h30)",
                  newStatus:           "in_routing",
                  comment:             "Reenvio automático às 19h30 — BravoFlow",
                }),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
            })
          );
          results.forEach((r, i) => {
            if (r.status === "rejected") {
              errosSql.push({ id: reenviadas[i], error: (r.reason as Error).message });
            }
          });
        } else {
          logger.warn(
            "⚠️ BRAVOFORM_API_URL não configurada — histórico SQL não registrado. " +
            "Configure com: firebase functions:params:set BRAVOFORM_API_URL=\"https://...\""
          );
        }
      } else {
        elegíveis.forEach((doc) => {
          logger.info(`[DRY-RUN] Reenviaria ${doc.id} (status atual: ${doc.data().status})`);
          reenviadas.push(doc.id);
        });
      }

      logger.info(`✅ Reenvio concluído.`, {
        reenviadas: reenviadas.length,
        errosSql:   errosSql.length,
        ...(errosSql.length ? { erros: errosSql } : {}),
      });

      // Notificação por e-mail para supervisores
      if (cfg.notifyOnReroute && cfg.supervisorEmails.length > 0) {
        const transporter = buildTransporter();
        if (transporter) {
          const dryNote = cfg.dryRun ? " [SIMULAÇÃO — sem alterações reais]" : "";
          const subject = `[BravoFlow] Reenvio 19h30${dryNote} — ${reenviadas.length} instância(s)`;
          const html = `
            <h3>Relatório de Reenvio Automático — 19h30${dryNote}</h3>
            <p><strong>${reenviadas.length}</strong> instância(s) reenviada(s) para roteirização.</p>
            ${errosSql.length > 0
              ? `<p style="color:red"><strong>${errosSql.length}</strong> erro(s) ao registrar histórico SQL.</p>`
              : "<p style='color:green'>Histórico SQL registrado com sucesso.</p>"}
            <details>
              <summary>IDs processados (${reenviadas.length})</summary>
              <pre style="font-size:11px">${reenviadas.join("\n")}</pre>
            </details>
            ${errosSql.length > 0 ? `
            <details>
              <summary>Erros SQL (${errosSql.length})</summary>
              <pre style="font-size:11px">${JSON.stringify(errosSql, null, 2)}</pre>
            </details>` : ""}
            <p style="color:#888;font-size:12px">Gerado automaticamente pelo BravoFlow Cron</p>
          `;
          await transporter
            .sendMail({
              from:    `"BravoForm Sistema" <${nodemailerUser.value()}>`,
              to:      cfg.supervisorEmails.join(","),
              subject,
              html,
            })
            .catch((e) => logger.warn("⚠️ Falha ao enviar e-mail de reenvio:", e.message));
        } else {
          logger.warn("⚠️ Transporter de e-mail não configurado (NODEMAILER_USER/PASS ausentes).");
        }
      }
    } catch (error) {
      logger.error("❌ Erro fatal no reenvio das 19h30:", error);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// CRON 2 — 3h00 BRT — Exclusão permanente de itens na lixeira
// ─────────────────────────────────────────────────────────────────────────────
export const limpezaLixeira = onSchedule(
  {
    schedule:       "0 3 * * *",
    timeZone:       "America/Sao_Paulo",
    memory:         "256MiB",
    timeoutSeconds: 540, // 9min — limpeza pode ser demorada
  },
  async (_event) => {
    const cfg = await loadConfig();
    const tag = cfg.dryRun ? "[DRY-RUN] " : "";

    logger.info(`${tag}🧹 [03h] Limpeza da lixeira`, {
      enabled:       cfg.trashCleanupEnabled,
      retentionDays: cfg.trashRetentionDays,
      dryRun:        cfg.dryRun,
    });

    if (!cfg.trashCleanupEnabled) {
      logger.info("ℹ️ Limpeza desabilitada (trashCleanupEnabled=false). Pulando.");
      return;
    }

    const db         = getDb();
    const retentionMs = cfg.trashRetentionDays * 24 * 60 * 60 * 1000;
    const cutoff      = admin.firestore.Timestamp.fromDate(new Date(Date.now() - retentionMs));

    try {
      const snap = await db
        .collectionGroup("responses")
        .where("deletedAt", "<=", cutoff)
        .get();

      if (snap.empty) {
        logger.info("✅ Nenhum item expirado na lixeira.");
        return;
      }

      logger.info(`${tag}${snap.size} item(ns) expirado(s) encontrado(s) (>${cfg.trashRetentionDays} dias)`);

      const apiBase = bravoformApiUrl.value();
      let removidos = 0;
      const erros: { id: string; error: string }[] = [];

      for (const doc of snap.docs) {
        if (cfg.dryRun) {
          const deletedAt = doc.data().deletedAt?.toDate?.()?.toISOString() ?? "desconhecido";
          logger.info(`[DRY-RUN] Removeria: ${doc.id} (deletedAt=${deletedAt})`);
          removidos++;
          continue;
        }

        try {
          // 1) Exclusão no PostgreSQL (fonte de verdade)
          if (apiBase) {
            const res = await fetch(
              `${apiBase}/api/dataconnect/responses?id=${encodeURIComponent(doc.id)}`,
              { method: "DELETE" }
            );
            if (!res.ok) {
              logger.warn(`⚠️ SQL DELETE falhou para ${doc.id}: HTTP ${res.status}`);
            }
          }

          // 2) Exclusão no Firestore
          await doc.ref.delete();
          removidos++;

        } catch (e: any) {
          erros.push({ id: doc.id, error: e.message });
          logger.warn(`⚠️ Falha ao remover ${doc.id}: ${e.message}`);
        }
      }

      logger.info(`✅ Limpeza concluída.`, {
        removidos,
        erros: erros.length,
        ...(erros.length ? { detalhesErros: erros } : {}),
      });

      // Notificação de resumo
      if (cfg.notifyOnTrashCleanup && cfg.supervisorEmails.length > 0) {
        const transporter = buildTransporter();
        if (transporter) {
          const dryNote = cfg.dryRun ? " [SIMULAÇÃO]" : "";
          await transporter
            .sendMail({
              from:    `"BravoForm Sistema" <${nodemailerUser.value()}>`,
              to:      cfg.supervisorEmails.join(","),
              subject: `[BravoFlow] Limpeza de Lixeira${dryNote} — ${removidos} item(ns)`,
              html: `
                <h3>Relatório de Limpeza Automática (Retenção: ${cfg.trashRetentionDays} dias)${dryNote}</h3>
                <p><strong>${removidos}</strong> item(ns) removido(s) permanentemente.</p>
                ${erros.length > 0
                  ? `<p style="color:red"><strong>${erros.length}</strong> erro(s) durante a limpeza.</p>`
                  : ""}
                <p style="color:#888;font-size:12px">Gerado automaticamente pelo BravoFlow Cron</p>
              `,
            })
            .catch((e) => logger.warn("⚠️ Falha ao enviar e-mail de limpeza:", e.message));
        }
      }
    } catch (error) {
      logger.error("❌ Erro fatal na limpeza da lixeira:", error);
    }
  }
);
