import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { Twilio } from "twilio";
import { defineString } from "firebase-functions/params";

admin.initializeApp();
const db = admin.firestore();

// Define config parameters
const nodemailerUser = defineString("NODEMAILER_USER");
const nodemailerPass = defineString("NODEMAILER_PASS");
const twilioSid = defineString("TWILIO_SID");
const twilioToken = defineString("TWILIO_TOKEN");

const mailTransport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: nodemailerUser.value(),
    pass: nodemailerPass.value(),
  },
});
const twilioClient = new Twilio(
  twilioSid.value(),
  twilioToken.value(),
);

// Utils de formatação/segurança
const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const truncate = (s: string, max = 600) => (s.length > max ? s.slice(0, max) + "…" : s);

// Função utilitária para transformar respostas em texto legível (sem [object Object])
function formatAnswerValue(answer: any, field?: any): string {
  // Assinatura (imagem base64)
  if (typeof answer === 'string' && answer.startsWith('data:image')) {
    return '[Assinatura anexada]';
  }
  // Outros data URLs longos
  if (typeof answer === 'string' && answer.startsWith('data:')) {
    return '[Arquivo incorporado]';
  }
  // Tabela será tratada no HTML (retorna marcador)
  if (field && field.type === 'Tabela' && typeof answer === 'object' && answer !== null) {
    return '__TABLE__';
  }
  // Arrays
  if (Array.isArray(answer)) {
    if (answer.length === 0) return '';
    // Array de primitvos
    if (answer.every((x) => x == null || ['string','number','boolean'].includes(typeof x))) {
      return answer.map((x) => (x == null ? '' : typeof x === 'boolean' ? (x ? 'Sim' : 'Não') : String(x))).join(', ');
    }
    // Array de objetos (imagens/arquivos ou pares label/valor)
    return answer.map((it: any, i: number) => {
      if (!it) return '';
      // imagem/arquivo
      if (typeof it === 'object' && (it.type?.startsWith?.('image') || it.url)) {
        const name = it.name || `Arquivo ${i + 1}`;
        const url = it.url ? ` (${it.url})` : '';
        return `${name}${url}`;
      }
      // par label/valor comum
      const label = it.label || it.question || it.name || it.title || `item_${i + 1}`;
      const value = it.value ?? it.answer ?? it.response ?? it[label];
      if (value != null) return `${label}: ${String(value)}`;
      try { return JSON.stringify(it); } catch { return String(it); }
    }).filter(Boolean).join('\n');
  }
  // Boolean, number, string
  if (typeof answer === 'boolean') return answer ? 'Sim' : 'Não';
  if (typeof answer === 'number') return String(answer);
  if (typeof answer === 'string') return truncate(answer);
  // Objeto solto
  if (typeof answer === 'object' && answer !== null) {
    // Arquivo
    if (answer.url) return `${answer.name || 'Arquivo'} (${answer.url})`;
    try { return truncate(JSON.stringify(answer)); } catch { return String(answer); }
  }
  return '';
}

// Gera o HTML do e-mail igual ao site
function generateBravoformEmailHTML(formData: any, responseData: any): string {
  const BRAND_BG = '#0B1220';
  const CARD_BG = '#0E1B2A';
  const ACCENT = '#C5A05C';
  const TEXT = '#E7E6E3';
  const SUBTEXT = '#B6BDC6';

  const fields = Array.isArray(formData.fields) ? formData.fields : [];

  const rowsHtml = fields.map((field: any) => {
    const label = field?.label || field?.id;
    if (!label || label === 'Assinatura') return '';
    const raw = responseData?.answers?.[field?.id];
    const formatted = formatAnswerValue(raw, field);

    // Tabela (renderização própria)
    if (formatted === '__TABLE__') {
      const rows = field.rows || [];
      const cols = field.columns || [];
      const tableRows = rows.map((r: any) => {
        const cells = cols.map((c: any) => {
          const v = raw?.[r.id]?.[c.id] ?? '';
          const vs = escapeHtml(String(v ?? ''));
          return `<td style="padding:8px 10px;border-bottom:1px solid ${ACCENT}33;color:${TEXT};font-size:13px;">${vs}</td>`;
        }).join('');
        const rlabel = escapeHtml(String(r.label ?? r.id ?? ''));
        return `<tr>
          <th style="padding:8px 10px;border-bottom:1px solid ${ACCENT};color:${ACCENT};text-align:left;font-size:12px;background:${CARD_BG};">${rlabel}</th>
          ${cells}
        </tr>`;
      }).join('');

      const header = `<tr>
        <th style="width:28%;padding:10px;background:${BRAND_BG};color:${ACCENT};text-align:left;border-bottom:1px solid ${ACCENT};">Linha</th>
        ${cols.map((c:any)=>`<th style=\"padding:10px;background:${BRAND_BG};color:${ACCENT};text-align:left;border-bottom:1px solid ${ACCENT};\">${escapeHtml(String(c.label||c.id))}</th>`).join('')}
      </tr>`;

      return `
        <tr>
          <td style="vertical-align:top;padding:12px 14px;border-bottom:1px solid ${ACCENT}40;color:${ACCENT};font-weight:600;">${escapeHtml(String(label))}</td>
          <td style="padding:6px 0 12px;border-bottom:1px solid ${ACCENT}40;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${CARD_BG};border:1px solid ${ACCENT}40;border-radius:6px;overflow:hidden;">
              <thead>${header}</thead>
              <tbody>${tableRows}</tbody>
            </table>
          </td>
        </tr>
      `;
    }

    const safe = escapeHtml(String(formatted || ''))
      .replace(/\n/g, '<br>');
    return `
      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid ${ACCENT}40;color:${ACCENT};font-weight:600;">${escapeHtml(String(label))}</td>
        <td style="padding:12px 14px;border-bottom:1px solid ${ACCENT}40;color:${TEXT};white-space:pre-wrap;">${safe}</td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        .container { max-width: 680px; margin: 0 auto; background: ${CARD_BG}; border: 1px solid ${ACCENT}66; border-radius: 10px; overflow: hidden; }
        .header { padding: 22px 24px; background: ${BRAND_BG}; border-bottom: 2px solid ${ACCENT}; }
        .title { margin: 0; color: ${TEXT}; font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Liberation Sans', sans-serif; font-size: 18px; font-weight: 700; }
        .subtitle { margin: 6px 0 0; color: ${SUBTEXT}; font-size: 13px; }
        .table { width: 100%; border-collapse: collapse; }
      </style>
    </head>
    <body style="margin:0;padding:24px;background:${BRAND_BG};">
      <div class="container">
        <div class="header">
          <div class="title">BRAVOFORM • Nova resposta recebida</div>
          <div class="subtitle">Formulário: ${escapeHtml(String(formData.title || ''))}</div>
        </div>
        <table class="table" cellpadding="0" cellspacing="0" role="presentation">
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div style="padding:14px 18px;border-top:1px solid ${ACCENT}66;color:${SUBTEXT};font-size:12px;">Este é um e-mail automático enviado pela plataforma BRAVOFORM.</div>
      </div>
    </body>
    </html>
  `;
}

// Gera mensagem detalhada para WhatsApp
function generateWhatsappMessage(formData: any, responseData: any): string {
  const fields = formData.fields || [];
  let messageBody = `📝 *Nova resposta recebida para o formulário: "${formData.title}"*\n\n`;
  for (const field of fields) {
    const label = field.label || field.id;
    const answer = responseData.answers?.[field.id] ?? '';
    if (label === 'Assinatura') continue;
    const formatted = formatAnswerValue(answer, field);
    messageBody += `*${label}:* ${formatted}\n`;
  }
  return messageBody;
}

// Firestore Trigger
export const onNewFormResponse = onDocumentCreated(
  "forms/{formId}/responses/{responseId}",
  async (event) => {
    const responseData = event.data?.data();
    const formId = event.params.formId;

    if (!responseData) {
      console.log("Dados da resposta não encontrados.");
      return null;
    }

    try {
      const formDoc = await db.collection("forms").doc(formId).get();
      const formData = formDoc.data();

      if (!formData || !formData.automation) {
        console.log(`Formulário ${formId} não encontrado ou sem automação.`);
        return null;
      }

      const { type, target } = formData.automation;

      if (!target) {
        console.log("Nenhum alvo de notificação definido (e-mail/whatsapp).");
        return null;
      }

      if (type === "email") {
        const htmlBody = generateBravoformEmailHTML(formData, responseData);
        const mailOptions = {
          from: `"BRAVOFORM" <${nodemailerUser.value()}>`,
          to: target,
          subject: `Nova Resposta Recebida: ${formData.title}`,
          html: htmlBody,
        };
        console.log(`Enviando e-mail para ${target}...`);
        await mailTransport.sendMail(mailOptions);
        console.log("E-mail enviado com sucesso!");

      } else if (type === "whatsapp") {
        const messageBody = generateWhatsappMessage(formData, responseData);

        // Usando o número de Sandbox correto da Twilio como remetente.
        const twilioSandboxNumber = "+14155238886";
        console.log(`Enviando WhatsApp de ${twilioSandboxNumber} para ${target}...`);
        await twilioClient.messages.create({
          from: `whatsapp:${twilioSandboxNumber}`,
          to: `whatsapp:${target}`,
          body: messageBody,
        });
        console.log("Mensagem de WhatsApp enviada com sucesso!");
      }

      return null;
    } catch (error) {
      console.error("Erro ao processar a notificação:", error);
      return null;
    }
  });
