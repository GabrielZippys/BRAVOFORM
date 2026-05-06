/**
 * BravoFlow — Workflow Triggers v2
 *
 * ─── O problema da versão anterior ──────────────────────────────────────────
 *  1) `const db = admin.firestore()` na linha 7 executava ANTES de
 *     `admin.initializeApp()` no index.ts → bug de inicialização.
 *  2) Os triggers escutavam `workflow_instances/{id}`, coleção que o
 *     workflow-action (Next.js) NUNCA escreve — todo código era morto.
 *  3) Notificações só para status "completed" e "rejected" — faltavam
 *     approved, in_routing, in_pickup, cancelled.
 *  4) Transporter de e-mail recriado em cada handler.
 *  5) `console.log` em vez de `logger`.
 *
 * ─── Arquitetura corrigida ───────────────────────────────────────────────────
 *  • `bravoflowNotify` — HTTP trigger chamado pelo Next.js workflow-action
 *    imediatamente após commit SQL. Recebe o payload da ação e despacha
 *    notificações por e-mail / WhatsApp para os destinatários corretos.
 *
 *  • `onWorkflowInstanceCreated` / `onWorkflowInstanceUpdated` — mantidos
 *    para cenários onde documentos são criados em `workflow_instances/{id}`
 *    (ex: outros formulários que usam a coleção diretamente).
 *
 *  • `onBravoFlowResponseUpdated` — escuta mudanças em
 *    `forms/{formId}/responses/{responseId}` (path real do BravoFlow).
 *    Acionado quando workflow-action atualiza o Firestore via Firebase Admin
 *    no Next.js (requer FIREBASE_ADMIN configurado no app Next.js).
 *
 * ─── Variáveis de ambiente (Firebase Functions params) ──────────────────────
 *   NODEMAILER_USER      E-mail remetente
 *   NODEMAILER_PASS      App Password
 *   SMTP_HOST            Host SMTP (default: smtp.gmail.com)
 *   SMTP_PORT            Porta SMTP (default: 587)
 *   BRAVOFLOW_NOTIFY_SECRET  Segredo compartilhado para autenticar chamadas
 *                            do Next.js ao endpoint bravoflowNotify
 *
 *   Configurar com:
 *     firebase functions:params:set NODEMAILER_USER="..." NODEMAILER_PASS="..." \
 *       BRAVOFLOW_NOTIFY_SECRET="um-segredo-forte"
 */

import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { defineString } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { Twilio } from "twilio";

// ✅ CORREÇÃO CRÍTICA: accessor lazy em vez de `const db = admin.firestore()` no
//    escopo do módulo. Isso evita chamar firestore() ANTES de initializeApp()
//    no index.ts.
const getDb = () => admin.firestore();

// ─── Params ───────────────────────────────────────────────────────────────────
const nodemailerUser    = defineString("NODEMAILER_USER",          { default: "" });
const nodemailerPass    = defineString("NODEMAILER_PASS",          { default: "" });
const smtpHost          = defineString("SMTP_HOST",                { default: "smtp.gmail.com" });
const smtpPort          = defineString("SMTP_PORT",                { default: "587" });
const notifySecret      = defineString("BRAVOFLOW_NOTIFY_SECRET",  { default: "" });

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

/** Ações do BravoFlow workflow de Retirada */
type BravoFlowAction =
  | "approve"
  | "reject"
  | "route"
  | "mark-picked-up"
  | "cancel"
  | "transition"
  | "replicate";

/** Papéis de colaboradores no BravoFlow */
type BravoFlowRole =
  | "AprovadorQualidade"
  | "Roteirizador"
  | "OperadorRetirada"
  | "Supervisor"
  | "Solicitante"
  | "Colaborador";

/**
 * Payload recebido pelo HTTP trigger `bravoflowNotify` (enviado pelo
 * Next.js workflow-action após o commit SQL).
 */
export interface BravoFlowNotifyPayload {
  // Identificação da ação
  action:                 BravoFlowAction;
  responseId:             string;          // firebase_id no PostgreSQL

  // Dados do formulário / instância
  formId?:                string;          // firebase_id do formulário
  formTitle?:             string;
  companyId?:             string;          // firebase_id da empresa

  // Solicitante
  solicitanteId?:         string;
  solicitanteEmail?:      string;
  solicitanteUsername?:   string;

  // Executor da ação
  performedByUsername?:   string;
  performedById?:         string;

  // Campos específicos por ação
  motorista?:             string;          // route
  placa?:                 string;          // route
  boletim?:               string;          // mark-picked-up
  rejectionReason?:       string;          // reject
  protocoloCancelamento?: string;          // cancel
  motivoCancelamento?:    string;          // cancel
  setorEntrega?:          string;          // approve
  enderecoEntrega?:       string;          // approve
  diasEntrega?:           string;          // approve
  newStatus?:             string;          // transition
  comment?:               string;          // transition / genérico
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: transporter, WhatsApp, lookup de colaboradores
// ─────────────────────────────────────────────────────────────────────────────

/** Cria transporter SMTP (compartilhado por todos os handlers) */
function buildTransporter(override?: { host: string; port: number; user: string; pass: string }) {
  const user = override?.user || nodemailerUser.value();
  const pass = override?.pass || nodemailerPass.value();
  if (!user || !pass) {
    logger.warn("⚠️ NODEMAILER_USER/PASS não configurados. Notificações por e-mail desabilitadas.");
    return null;
  }
  const host = override?.host || smtpHost.value() || "smtp.gmail.com";
  const port = override?.port || parseInt(smtpPort.value() || "587", 10);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/** Envia e-mail para uma lista de destinatários (erros isolados por destinatário) */
async function sendEmails(
  recipients: Array<{ email?: string; name?: string }>,
  subject: string,
  html: string,
  smtpOverride?: { host: string; port: number; user: string; pass: string }
) {
  const emails = recipients.map((r) => r.email).filter(Boolean) as string[];
  if (!emails.length) return;

  const transporter = buildTransporter(smtpOverride);
  if (!transporter) return;

  const from = `"BravoForm" <${smtpOverride?.user || nodemailerUser.value()}>`;

  await Promise.allSettled(
    emails.map((to) =>
      transporter
        .sendMail({ from, to, subject, html })
        .then(() => logger.info(`✉️ E-mail enviado → ${to}`))
        .catch((e) => logger.warn(`⚠️ Falha e-mail → ${to}: ${e.message}`))
    )
  );
}

/** Envia WhatsApp para uma lista de destinatários */
async function sendWhatsApps(
  recipients: Array<{ phone?: string }>,
  body: string,
  twilioConfig?: { accountSid: string; authToken: string; whatsappFrom: string }
) {
  if (!twilioConfig?.accountSid) return;
  const phones = recipients.map((r) => r.phone).filter(Boolean) as string[];
  if (!phones.length) return;

  const client = new Twilio(twilioConfig.accountSid, twilioConfig.authToken);

  await Promise.allSettled(
    phones.map((phone) => {
      // Normaliza número: garante prefixo whatsapp:
      const to = phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
      return client.messages
        .create({ from: twilioConfig.whatsappFrom, to, body })
        .then(() => logger.info(`📱 WhatsApp enviado → ${phone}`))
        .catch((e) => logger.warn(`⚠️ Falha WhatsApp → ${phone}: ${e.message}`));
    })
  );
}

/**
 * Busca todos os colaboradores com um papel específico no BravoFlow.
 * Suporta dois formatos de armazenamento no Firestore:
 *   - campo `role: string`  (role único)
 *   - campo `roles: string[]`  (múltiplos papéis)
 *
 * @param companyId  Filtra por empresa (opcional — sem filtro = busca global)
 * @param role       Papel a buscar (ex: "AprovadorQualidade")
 */
async function getCollaboratorsByRole(
  companyId: string | undefined,
  role: BravoFlowRole
): Promise<{ email?: string; phone?: string; name?: string }[]> {
  const db = getDb();
  const out: { email?: string; phone?: string; name?: string }[] = [];

  try {
    // Tentativa 1: campo `role` (string simples)
    let q1 = db.collection("collaborators")
      .where("active", "==", true)
      .where("role", "==", role);
    if (companyId) q1 = q1.where("companyId", "==", companyId);

    const snap1 = await q1.get();
    snap1.docs.forEach((d) => {
      const data = d.data();
      out.push({ email: data.email, phone: data.phone, name: data.name || data.username });
    });

    // Tentativa 2: campo `roles` (array) — pode ter sobreposição com Tentativa 1
    let q2 = db.collection("collaborators")
      .where("active", "==", true)
      .where("roles", "array-contains", role);
    if (companyId) q2 = q2.where("companyId", "==", companyId);

    const snap2 = await q2.get();
    const idsJáAdicionados = new Set(snap1.docs.map((d) => d.id));
    snap2.docs
      .filter((d) => !idsJáAdicionados.has(d.id))
      .forEach((d) => {
        const data = d.data();
        out.push({ email: data.email, phone: data.phone, name: data.name || data.username });
      });
  } catch (e) {
    logger.warn(`⚠️ getCollaboratorsByRole(${role}, ${companyId ?? "global"}) falhou:`, e);
  }

  logger.info(`👥 getCollaboratorsByRole(${role}): ${out.length} encontrado(s)`);
  return out;
}

/**
 * Busca configurações de integração (SMTP personalizado, Twilio) de uma empresa.
 * Coleção: `integrations/{companyId}` ou `integrations/{creatorId}`
 */
async function getIntegrationConfig(id?: string): Promise<{
  twilio?: { accountSid: string; authToken: string; whatsappFrom: string };
  smtp?:   { host: string; port: number; user: string; pass: string };
} | null> {
  if (!id) return null;
  try {
    const snap = await getDb().collection("integrations").doc(id).get();
    return snap.exists ? (snap.data() as any) : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher central de notificações BravoFlow
// Roteamento: quem notificar para cada ação / status
// ─────────────────────────────────────────────────────────────────────────────
async function dispatchBravoFlowNotification(payload: BravoFlowNotifyPayload): Promise<void> {
  const {
    action, formTitle, companyId, solicitanteEmail,
    performedByUsername, motorista, placa, boletim,
    rejectionReason, protocoloCancelamento, motivoCancelamento,
    setorEntrega, enderecoEntrega, diasEntrega, comment,
  } = payload;

  const nome = formTitle || "Formulário";
  const quem = performedByUsername || "Sistema";

  const intCfg = await getIntegrationConfig(companyId);
  const twilio  = intCfg?.twilio;
  const smtp    = intCfg?.smtp;

  // --- Helper HTML base ---
  const wrap = (cor: string, emoji: string, titulo: string, corpo: string) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${cor};padding:16px 20px;border-radius:8px 8px 0 0;">
        <h2 style="color:#fff;margin:0;">${emoji} ${titulo}</h2>
      </div>
      <div style="background:#f9fafb;padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        ${corpo}
        <p style="margin-top:20px;color:#6b7280;font-size:12px;">
          Gerado automaticamente pelo BravoFlow · ${new Date().toLocaleString("pt-BR")}
        </p>
      </div>
    </div>`;

  const row = (label: string, value?: string) =>
    value ? `<p><strong>${label}:</strong> ${value}</p>` : "";

  switch (action) {
    // ── APROVAÇÃO ─────────────────────────────────────────────────────────────
    case "approve": {
      const roteirizadores = await getCollaboratorsByRole(companyId, "Roteirizador");
      const supervisores   = await getCollaboratorsByRole(companyId, "Supervisor");

      // Solicitante: notificado que foi aprovado
      if (solicitanteEmail) {
        const html = wrap("#10b981", "✅", "Solicitação Aprovada", `
          ${row("Formulário", nome)}
          ${row("Setor de entrega", setorEntrega)}
          ${row("Endereço", enderecoEntrega)}
          ${row("Prazo de entrega", diasEntrega)}
          ${row("Aprovada por", quem)}
          <p>Sua solicitação foi aprovada e entrará em roteirização em breve.</p>
        `);
        await sendEmails([{ email: solicitanteEmail }],
          `[BravoForm] ✅ Solicitação aprovada — ${nome}`, html, smtp);
      }

      // Roteirizadores: nova retirada para roteirizar
      const htmlRoteir = wrap("#3b82f6", "🚚", "Nova Retirada para Roteirizar", `
        ${row("Formulário", nome)}
        ${row("Setor de entrega", setorEntrega)}
        ${row("Endereço", enderecoEntrega)}
        ${row("Aprovada por", quem)}
        <p>Acesse o BravoFlow para realizar a roteirização.</p>
      `);
      await sendEmails(roteirizadores,
        `[BravoForm] 🚚 Nova retirada para roteirizar — ${nome}`, htmlRoteir, smtp);
      await sendWhatsApps(roteirizadores,
        `🚚 *BravoForm* — Nova retirada para roteirizar!\n` +
        `Formulário: ${nome}\n${setorEntrega ? `Setor: ${setorEntrega}` : ""}\n` +
        `Aprovada por: ${quem}`,
        twilio);

      // Supervisores: ciência da aprovação
      await sendEmails(supervisores,
        `[BravoForm] Aprovação registrada — ${nome}`, htmlRoteir, smtp);
      break;
    }

    // ── REPROVAÇÃO ────────────────────────────────────────────────────────────
    case "reject": {
      const supervisores = await getCollaboratorsByRole(companyId, "Supervisor");
      const html = wrap("#ef4444", "❌", "Solicitação Reprovada", `
        ${row("Formulário", nome)}
        ${row("Motivo da reprovação", rejectionReason)}
        ${row("Reprovada por", quem)}
        <p>Entre em contato com o responsável para mais informações ou reenvie a solicitação.</p>
      `);

      if (solicitanteEmail) {
        await sendEmails([{ email: solicitanteEmail }],
          `[BravoForm] ❌ Solicitação reprovada — ${nome}`, html, smtp);
        await sendWhatsApps([{ phone: payload.solicitanteId }],
          `❌ *BravoForm* — Sua solicitação foi reprovada.\n` +
          `Formulário: ${nome}\n` +
          `Motivo: ${rejectionReason || "Não especificado"}`,
          twilio);
      }
      await sendEmails(supervisores,
        `[BravoForm] Reprovação registrada — ${nome}`, html, smtp);
      break;
    }

    // ── ROTEIRIZAÇÃO ──────────────────────────────────────────────────────────
    case "route": {
      const operadores   = await getCollaboratorsByRole(companyId, "OperadorRetirada");
      const supervisores = await getCollaboratorsByRole(companyId, "Supervisor");

      const html = wrap("#8b5cf6", "📋", "Retirada Roteirizada", `
        ${row("Formulário", nome)}
        ${row("Motorista", motorista)}
        ${row("Placa", placa)}
        ${row("Roteirizada por", quem)}
        <p>A retirada está pronta para ser executada.</p>
      `);

      // Operadores de retirada: precisam executar
      await sendEmails(operadores,
        `[BravoForm] 📋 Retirada roteirizada — ${nome}`, html, smtp);
      await sendWhatsApps(operadores,
        `📋 *BravoForm* — Retirada roteirizada!\n` +
        `Formulário: ${nome}\n` +
        `${motorista ? `Motorista: ${motorista}\n` : ""}` +
        `${placa ? `Placa: ${placa}` : ""}`,
        twilio);

      // Solicitante: informado que foi roteirizado
      if (solicitanteEmail) {
        await sendEmails([{ email: solicitanteEmail }],
          `[BravoForm] Sua retirada foi roteirizada — ${nome}`, html, smtp);
      }

      // Supervisores: ciência
      await sendEmails(supervisores,
        `[BravoForm] Roteirização registrada — ${nome}`, html, smtp);
      break;
    }

    // ── RETIRADA CONCLUÍDA ────────────────────────────────────────────────────
    case "mark-picked-up": {
      const supervisores = await getCollaboratorsByRole(companyId, "Supervisor");

      const html = wrap("#059669", "✅", "Retirada Concluída", `
        ${row("Formulário", nome)}
        ${row("Boletim", boletim)}
        ${row("Motorista", motorista)}
        ${row("Placa", placa)}
        ${row("Concluída por", quem)}
      `);

      if (solicitanteEmail) {
        await sendEmails([{ email: solicitanteEmail }],
          `[BravoForm] ✅ Retirada concluída — ${nome}`, html, smtp);
        await sendWhatsApps([{ phone: payload.solicitanteId }],
          `✅ *BravoForm* — Sua retirada foi concluída!\n` +
          `Formulário: ${nome}\n${boletim ? `Boletim: ${boletim}` : ""}`,
          twilio);
      }
      await sendEmails(supervisores,
        `[BravoForm] Retirada concluída — ${nome}`, html, smtp);
      await sendWhatsApps(supervisores,
        `✅ *BravoForm* — Retirada concluída!\nFormulário: ${nome}`, twilio);
      break;
    }

    // ── CANCELAMENTO ──────────────────────────────────────────────────────────
    case "cancel": {
      const supervisores = await getCollaboratorsByRole(companyId, "Supervisor");

      const html = wrap("#6b7280", "🚫", "Retirada Cancelada", `
        ${row("Formulário", nome)}
        ${row("Protocolo de cancelamento", protocoloCancelamento)}
        ${row("Motivo", motivoCancelamento)}
        ${row("Cancelada por", quem)}
      `);

      if (solicitanteEmail) {
        await sendEmails([{ email: solicitanteEmail }],
          `[BravoForm] 🚫 Retirada cancelada — ${nome}`, html, smtp);
      }
      await sendEmails(supervisores,
        `[BravoForm] Cancelamento registrado — ${nome}`, html, smtp);
      await sendWhatsApps(supervisores,
        `🚫 *BravoForm* — Retirada cancelada!\n` +
        `Formulário: ${nome}\n${motivoCancelamento ? `Motivo: ${motivoCancelamento}` : ""}`,
        twilio);
      break;
    }

    // ── RÉPLICA ───────────────────────────────────────────────────────────────
    case "replicate": {
      const aprovadores = await getCollaboratorsByRole(companyId, "AprovadorQualidade");
      const html = wrap("#a855f7", "🔁", "Nova Réplica de Solicitação", `
        ${row("Formulário", nome)}
        ${row("Enviada por", payload.solicitanteUsername)}
        <p>Uma nova réplica está aguardando aprovação.</p>
      `);
      await sendEmails(aprovadores,
        `[BravoForm] 🔁 Nova réplica aguardando aprovação — ${nome}`, html, smtp);
      break;
    }

    // ── TRANSIÇÃO GENÉRICA ───────────────────────────────────────────────────
    case "transition": {
      if (comment) {
        const supervisores = await getCollaboratorsByRole(companyId, "Supervisor");
        const html = wrap("#64748b", "🔄", "Transição de Status", `
          ${row("Formulário", nome)}
          ${row("Novo status", payload.newStatus)}
          ${row("Comentário", comment)}
          ${row("Executado por", quem)}
        `);
        await sendEmails(supervisores,
          `[BravoForm] Transição de status — ${nome}`, html, smtp);
      }
      break;
    }

    default:
      logger.info(`ℹ️ Nenhuma notificação configurada para ação: ${action}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP TRIGGER — bravoflowNotify
//
// Chamado pelo Next.js workflow-action após o commit SQL.
// Despacha todas as notificações de forma assíncrona sem bloquear a resposta
// HTTP da API para o usuário.
//
// Autenticação: header `x-bravoflow-secret` deve bater com BRAVOFLOW_NOTIFY_SECRET.
// Se BRAVOFLOW_NOTIFY_SECRET não estiver configurado, qualquer chamada passa
// (útil em desenvolvimento).
//
// Como chamar do Next.js workflow-action:
//   const cfUrl = process.env.BRAVOFLOW_CF_NOTIFY_URL; // URL da Cloud Function
//   if (cfUrl) {
//     fetch(cfUrl, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         "x-bravoflow-secret": process.env.BRAVOFLOW_CF_SECRET || "",
//       },
//       body: JSON.stringify(notifyPayload),
//     }).catch(() => {}); // fire-and-forget
//   }
// ─────────────────────────────────────────────────────────────────────────────
export const bravoflowNotify = onRequest(
  {
    cors:           false, // Chamado apenas pelo servidor Next.js, não pelo browser
    memory:         "256MiB",
    timeoutSeconds: 60,
    invoker:        "public", // Permite chamada sem autenticação Firebase (usamos segredo próprio)
  },
  async (req, res) => {
    // Verificação de método
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Verificação de segredo compartilhado
    const secret = notifySecret.value();
    if (secret) {
      const provided = req.headers["x-bravoflow-secret"];
      if (provided !== secret) {
        logger.warn("⚠️ bravoflowNotify: segredo inválido");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    const payload = req.body as BravoFlowNotifyPayload;

    if (!payload?.action || !payload?.responseId) {
      res.status(400).json({ error: "action e responseId são obrigatórios" });
      return;
    }

    logger.info(`📬 bravoflowNotify: action=${payload.action} responseId=${payload.responseId}`);

    // Aguarda o despacho ANTES de responder.
    // O Next.js chama este endpoint fire-and-forget (sem await), portanto não
    // há problema em demorar até 60s aqui. O Cloud Function só é faturado
    // enquanto está trabalhando — await garante que tudo seja finalizado
    // antes da instância ser desalocada.
    try {
      await dispatchBravoFlowNotification(payload);
      res.status(200).json({ success: true });
    } catch (e) {
      logger.error("❌ Erro em dispatchBravoFlowNotification:", e);
      res.status(500).json({ error: "Notification dispatch failed" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FIRESTORE TRIGGER — forms/{formId}/responses/{responseId} (onUpdate)
//
// Acionado quando o status de uma resposta BravoFlow muda no Firestore.
// Para que este trigger funcione, o Next.js workflow-action precisa também
// atualizar o documento Firestore (requer firebase-admin no Next.js).
//
// Se você não usa firebase-admin no Next.js, use o HTTP trigger bravoflowNotify.
// ─────────────────────────────────────────────────────────────────────────────
export const onBravoFlowResponseUpdated = onDocumentUpdated(
  "forms/{formId}/responses/{responseId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();

    if (!before || !after) return;

    // Dispara apenas quando o status muda
    if (before.status === after.status) return;

    // Ignora respostas de formulários sem workflow
    if (!after.isWorkflowEnabled && !after.workflowId && !after.motorista && !after.approved_at) return;

    logger.info(`🔄 BravoFlow status change: ${before.status} → ${after.status}`, {
      responseId: event.params.responseId,
      formId:     event.params.formId,
    });

    // Mapeamento de status → ação BravoFlow
    const statusActionMap: Record<string, BravoFlowAction> = {
      approved:   "approve",
      rejected:   "reject",
      in_routing: "route",
      in_pickup:  "mark-picked-up",
      completed:  "mark-picked-up",
      cancelled:  "cancel",
    };

    const action = statusActionMap[after.status] as BravoFlowAction | undefined;
    if (!action) return; // status sem notificação configurada (ex: "pending")

    const payload: BravoFlowNotifyPayload = {
      action,
      responseId:           event.params.responseId,
      formId:               event.params.formId,
      formTitle:            after.formTitle || after.form_title,
      companyId:            after.companyId,
      solicitanteId:        after.collaboratorId || after.userId,
      solicitanteEmail:     after.collaboratorEmail,
      solicitanteUsername:  after.collaboratorUsername,
      performedByUsername:  after.approved_by_username || after.rejected_by_username || "Sistema",
      motorista:            after.motorista,
      placa:                after.placa,
      boletim:              after.boletim,
      rejectionReason:      after.rejection_reason,
      protocoloCancelamento: after.protocolo_cancelamento,
      motivoCancelamento:   after.motivo_cancelamento,
      setorEntrega:         after.setor_entrega,
      enderecoEntrega:      after.endereco_entrega,
    };

    await dispatchBravoFlowNotification(payload).catch((e) => {
      logger.error("❌ onBravoFlowResponseUpdated notification error:", e);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FIRESTORE TRIGGER — workflow_instances/{instanceId} (mantidos para
// compatibilidade com formulários que ainda escrevem nessa coleção)
// ─────────────────────────────────────────────────────────────────────────────

export const onWorkflowInstanceCreated = onDocumentCreated(
  "workflow_instances/{instanceId}",
  async (event) => {
    const instance = event.data?.data();
    if (!instance) return;

    logger.info("🆕 Nova instância em workflow_instances:", event.params.instanceId);

    try {
      const workflowDoc = await getDb().collection("workflows").doc(instance.workflowId).get();
      if (!workflowDoc.exists) {
        logger.warn(`Workflow não encontrado: ${instance.workflowId}`);
        return;
      }

      const workflow = workflowDoc.data();

      // Busca destinatários da primeira etapa
      const firstStage = Array.isArray(workflow?.stages) ? workflow.stages[0] : null;
      const assigneeRole: BravoFlowRole = firstStage?.requiredRole || "Colaborador";

      const recipients = await getCollaboratorsByRole(instance.companyId, assigneeRole);

      const intCfg = await getIntegrationConfig(workflow?.createdBy || instance.companyId);
      const smtpOv = intCfg?.smtp;
      const twilio = intCfg?.twilio;

      const subject = `[BravoForm] Novo workflow atribuído: ${instance.workflowName || "Workflow"}`;
      const html = `
        <h2>Novo Workflow Atribuído</h2>
        <p><strong>Workflow:</strong> ${instance.workflowName || "—"}</p>
        ${firstStage ? `<p><strong>Primeira etapa:</strong> ${firstStage.name}</p>` : ""}
        <p>Acesse o BravoForm para iniciar.</p>
      `;

      await sendEmails(recipients, subject, html, smtpOv);
      await sendWhatsApps(recipients,
        `🔔 *BravoForm* — Novo workflow atribuído!\n${instance.workflowName}\nAcesse o sistema para iniciar.`,
        twilio);
    } catch (error) {
      logger.error("❌ onWorkflowInstanceCreated error:", error);
    }
  }
);

export const onWorkflowInstanceUpdated = onDocumentUpdated(
  "workflow_instances/{instanceId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();

    if (!before || !after) return;

    const instanceId = event.params.instanceId;

    // Nada mudou de relevante
    if (before.currentStageId === after.currentStageId && before.status === after.status) return;

    logger.info(`🔄 workflow_instances ${instanceId}: ${before.status} → ${after.status}`);

    try {
      const workflowDoc = await getDb().collection("workflows").doc(after.workflowId).get();
      if (!workflowDoc.exists) return;

      const workflow = workflowDoc.data();
      const intCfg  = await getIntegrationConfig(workflow?.createdBy || after.companyId);

      // --- Mudança de etapa → notifica responsável da nova etapa ---
      if (before.currentStageId !== after.currentStageId) {
        const stages = Array.isArray(workflow?.stages) ? workflow.stages : [];
        const currentStage = stages.find((s: any) => s.id === after.currentStageId);
        const stageRole: BravoFlowRole = currentStage?.requiredRole || "Colaborador";

        const recipients = await getCollaboratorsByRole(after.companyId, stageRole);
        const html = `
          <h2>É sua vez de agir!</h2>
          <p><strong>Workflow:</strong> ${after.workflowName || "—"}</p>
          <p><strong>Etapa:</strong> ${currentStage?.name || after.currentStageId}</p>
          <p>Acesse o BravoForm para completar esta etapa.</p>
        `;
        await sendEmails(recipients,
          `[BravoForm] Ação necessária: ${after.workflowName}`, html, intCfg?.smtp);
        await sendWhatsApps(recipients,
          `⏰ *BravoForm* — É sua vez!\nWorkflow: ${after.workflowName}\n` +
          `Etapa: ${currentStage?.name || "—"}`,
          intCfg?.twilio);
      }

      // --- Workflow concluído ---
      if (before.status !== "completed" && after.status === "completed") {
        const supervisores = await getCollaboratorsByRole(after.companyId, "Supervisor");
        const html = `
          <h2 style="color:#059669;">✅ Workflow Concluído!</h2>
          <p><strong>Workflow:</strong> ${after.workflowName || "—"}</p>
          <p>Todas as etapas foram finalizadas com sucesso.</p>
        `;
        await sendEmails(supervisores,
          `[BravoForm] ✅ Workflow concluído: ${after.workflowName}`, html, intCfg?.smtp);
        await sendWhatsApps(supervisores,
          `✅ *BravoForm* — Workflow concluído!\n${after.workflowName}`, intCfg?.twilio);
      }

      // --- Workflow rejeitado ---
      if (before.status !== "rejected" && after.status === "rejected") {
        const history = Array.isArray(after.stageHistory) ? after.stageHistory : [];
        const last   = history[history.length - 1];
        const reason = last?.comment || "Sem motivo especificado";

        // Notifica solicitante
        if (after.solicitanteEmail) {
          const html = `
            <h2 style="color:#ef4444;">❌ Etapa Rejeitada</h2>
            <p><strong>Workflow:</strong> ${after.workflowName}</p>
            <p><strong>Motivo:</strong> ${reason}</p>
            <p>Por favor, corrija e reenvie.</p>
          `;
          await sendEmails([{ email: after.solicitanteEmail }],
            `[BravoForm] ❌ Etapa rejeitada: ${after.workflowName}`, html, intCfg?.smtp);
          await sendWhatsApps([{ phone: after.solicitantePhone }],
            `❌ *BravoForm* — Etapa rejeitada!\nWorkflow: ${after.workflowName}\nMotivo: ${reason}`,
            intCfg?.twilio);
        }
      }

      // --- Workflow cancelado ---
      if (before.status !== "cancelled" && after.status === "cancelled") {
        const supervisores = await getCollaboratorsByRole(after.companyId, "Supervisor");
        const html = `
          <h2 style="color:#6b7280;">🚫 Workflow Cancelado</h2>
          <p><strong>Workflow:</strong> ${after.workflowName}</p>
        `;
        await sendEmails(supervisores,
          `[BravoForm] Workflow cancelado: ${after.workflowName}`, html, intCfg?.smtp);
        if (after.solicitanteEmail) {
          await sendEmails([{ email: after.solicitanteEmail }],
            `[BravoForm] 🚫 Seu workflow foi cancelado: ${after.workflowName}`, html, intCfg?.smtp);
        }
      }
    } catch (error) {
      logger.error("❌ onWorkflowInstanceUpdated error:", error);
    }
  }
);
