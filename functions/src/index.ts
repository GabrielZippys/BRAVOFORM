import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { Twilio } from "twilio";

admin.initializeApp();
const db = admin.firestore();

const mailTransport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: functions.config().nodemailer.user,
    pass: functions.config().nodemailer.pass,
  },
});
const twilioClient = new Twilio(
  functions.config().twilio.sid,
  functions.config().twilio.token,
);

// Função utilitária para transformar respostas em texto legível
function formatAnswerValue(answer: any, field?: any): string {
  // Assinatura (imagem base64)
  if (typeof answer === 'string' && answer.startsWith('data:image')) {
    return '[Assinatura anexada]';
  }
  // Array de imagens/arquivos
  if (Array.isArray(answer) && answer.length && typeof answer[0] === "object" && answer[0].type?.startsWith("image")) {
    return answer.map((img: any, i: number) =>
      img.url
        ? `Imagem ${i + 1}: ${img.url}`
        : '[imagem sem url]'
    ).join('\n');
  }
  // Tabela (matriz de linhas/colunas)
  if (field && field.type === 'Tabela' && typeof answer === 'object' && answer !== null) {
    const rows = field.rows || [];
    const cols = field.columns || [];
    let table = '';
    for (const row of rows) {
      table += `\n${row.label}: `;
      table += cols.map((col: any) => `${col.label}: ${answer?.[row.id]?.[col.id] ?? ''}`).join(' | ');
    }
    return table.trim();
  }
  // Array simples
  if (Array.isArray(answer)) return answer.join(', ');
  // Boolean, number, string
  if (typeof answer === 'boolean') return answer ? 'Sim' : 'Não';
  if (typeof answer === 'number') return String(answer);
  if (typeof answer === 'string') return answer;
  // Qualquer outro objeto
  if (typeof answer === 'object' && answer !== null) return JSON.stringify(answer);
  return '';
}

// Gera o HTML do e-mail igual ao site
function generateBravoformEmailHTML(formData: any, responseData: any): string {
  let answersHTML = '';
  const fields = formData.fields || [];
  for (const field of fields) {
    const label = field.label || field.id;
    const answer = responseData.answers?.[field.id] ?? '';
    if (label === 'Assinatura') continue;
    const formatted = formatAnswerValue(answer, field);
    answersHTML += `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #b18f42; color: #c9a25e; font-family: 'Roboto', sans-serif; vertical-align: top;">${label}</td>
        <td style="padding: 10px; border-bottom: 1px solid #b18f42; color: #f0ead6; font-family: 'Roboto', sans-serif;">${formatted.replace(/\n/g, "<br>")}</td>
      </tr>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Limelight&family=Roboto:wght@400;700&display=swap');
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #041a21; font-family: 'Roboto', sans-serif;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" style="padding: 20px;">
            <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #072e3b; border: 2px solid #b18f42;">
              <tr>
                <td align="center" style="padding: 20px 0; border-bottom: 2px solid #c9a25e;">
                  <h1 style="font-family: 'Limelight', cursive; color: #c9a25e; margin: 0; text-shadow: 1px 1px 3px #000;">BRAVOFORM</h1>
                  <p style="color: #f0ead6; margin: 5px 0 0;">Nova Resposta Recebida</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 30px 20px;">
                  <h2 style="font-family: 'Limelight', cursive; color: #f0ead6; margin-top: 0;">Formulário: ${formData.title}</h2>
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                    <thead>
                      <tr>
                        <th style="padding: 10px; background-color: #041a21; color: #c9a25e; text-align: left; border-bottom: 1px solid #c9a25e;">Pergunta</th>
                        <th style="padding: 10px; background-color: #041a21; color: #c9a25e; text-align: left; border-bottom: 1px solid #c9a25e;">Resposta</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${answersHTML}
                    </tbody>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding: 20px 0; border-top: 1px solid #b18f42; font-size: 12px; color: #b18f42;">
                  E-mail de notificação automático gerado pela plataforma BRAVOFORM.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
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
export const onNewFormResponse = functions.firestore
  .document("forms/{formId}/responses/{responseId}")
  .onCreate(async (snap, context) => {
    const responseData = snap.data();
    const { formId } = context.params;

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
          from: `"BRAVOFORM" <${functions.config().nodemailer.user}>`,
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
