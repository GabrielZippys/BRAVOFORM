/**
 * BravoFlow — Scheduled Triggers
 *
 * Funções agendadas (Cloud Scheduler + Pub/Sub) que executam ações
 * temporais sobre instâncias de workflow.
 *
 * Cron timezone: America/Sao_Paulo
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

// admin.initializeApp() já é chamado em ./index.ts — aqui apenas reusamos.
const getDb = () => admin.firestore();

// ----------------------------------------------------------------------------
// 19h30 todo dia — reenvia retiradas pendentes para a roteirização
// ----------------------------------------------------------------------------
//
// Regra do workflow de Retirada (PDF do cliente):
//   "19h30 reenvia a Roteirização" — toda retirada que ainda esteja
//   em status 'in_routing' ou 'in_pickup' (não-retirada) volta para a fila
//   da roteirização para o turno seguinte.
//
// O que esta função faz:
//   1) Busca todas as responses com status in_routing ou in_pickup,
//      ainda não-retiradas e não-canceladas.
//   2) Atualiza Firestore: marca lastReroutedAt e mantém status in_routing.
//   3) Chama o endpoint Next.js /api/dataconnect/workflow-action para
//      registrar histórico em fact_workflow_history (auditoria de SLA).
//   4) Notifica o roteirizador via e-mail (se config existir).
//
export const reenviarRetiradasPendentes = onSchedule(
  {
    schedule: "30 19 * * *",
    timeZone: "America/Sao_Paulo",
  },
  async (_event) => {
    const db = getDb();
    logger.info("🔁 [19h30] Iniciando reenvio de retiradas pendentes para roteirização");

    try {
      // Pega todas as responses pendentes/em retirada que precisam voltar
      const snap = await db.collectionGroup("responses")
        .where("status", "in", ["in_routing", "in_pickup"])
        .get();

      if (snap.empty) {
        logger.info("✅ Sem retiradas pendentes para reenviar.");
        return;
      }

      logger.info(`🔁 ${snap.size} retirada(s) pendente(s) — reenviando para roteirização`);

      const batch = db.batch();
      const now = admin.firestore.Timestamp.now();
      const reenviadas: string[] = [];

      snap.docs.forEach((doc) => {
        const data = doc.data();
        if (data.deletedAt) return;
        batch.update(doc.ref, {
          status: "in_routing",
          lastReroutedAt: now,
          rerouteCount: (data.rerouteCount || 0) + 1,
        });
        reenviadas.push(doc.id);
      });

      await batch.commit();
      logger.info(`✅ ${reenviadas.length} retirada(s) reenviadas. IDs:`, reenviadas);

      // Registra no SQL via API (best-effort, não bloqueante)
      const apiBase = process.env.NEXT_PUBLIC_BASE_URL || process.env.BRAVOFORM_API_URL;
      if (apiBase) {
        await Promise.all(reenviadas.map(async (responseId) => {
          try {
            await fetch(`${apiBase}/api/dataconnect/workflow-action`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                responseId,
                action: "transition",
                performedBy: "system-cron-19h30",
                performedByUsername: "Sistema (19h30)",
                newStatus: "in_routing",
                comment: "Reenvio automático às 19h30 — workflow de Retirada",
              }),
            });
          } catch (e) {
            logger.warn(`⚠️ Falha ao registrar histórico SQL para ${responseId}`, e);
          }
        }));
      } else {
        logger.warn("⚠️ NEXT_PUBLIC_BASE_URL não configurada — histórico SQL não registrado.");
      }
    } catch (error) {
      logger.error("❌ Erro no reenvio das 19h30:", error);
    }
  }
);

// ----------------------------------------------------------------------------
// Limpeza diária da Lixeira (3h da manhã)
//
// Como reforço ao auto-cleanup do TrashPanel: executa às 3h e remove
// permanentemente do banco SQL e Firestore os itens com 30+ dias na lixeira.
// ----------------------------------------------------------------------------
export const limpezaLixeira30Dias = onSchedule(
  {
    schedule: "0 3 * * *",
    timeZone: "America/Sao_Paulo",
  },
  async (_event) => {
    const db = getDb();
    logger.info("🧹 [03h] Limpeza da lixeira: removendo itens com 30+ dias");

    const cutoff = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );

    try {
      const snap = await db.collectionGroup("responses")
        .where("deletedAt", "<", cutoff)
        .get();

      if (snap.empty) {
        logger.info("✅ Nenhum item expirado na lixeira.");
        return;
      }

      const apiBase = process.env.NEXT_PUBLIC_BASE_URL || process.env.BRAVOFORM_API_URL;
      let removidos = 0;
      for (const doc of snap.docs) {
        try {
          if (apiBase) {
            await fetch(`${apiBase}/api/dataconnect/responses?id=${encodeURIComponent(doc.id)}`, {
              method: "DELETE",
            });
          }
          await doc.ref.delete();
          removidos++;
        } catch (e) {
          logger.warn(`⚠️ Falha ao remover ${doc.id}:`, e);
        }
      }
      logger.info(`✅ ${removidos} item(ns) removido(s) permanentemente da lixeira.`);
    } catch (error) {
      logger.error("❌ Erro na limpeza da lixeira:", error);
    }
  }
);
