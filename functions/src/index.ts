import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { Twilio } from "twilio";

// Inicializa o Firebase Admin SDK para ter acesso ao Firestore
admin.initializeApp();
const db = admin.firestore();

// --- Configuração dos Serviços Externos ---
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

/**
 * Gera um e-mail em HTML com o tema BioShock.
 * @param {any} formData - Os dados do formulário (título, etc.).
 * @param {any} responseData - Os dados da resposta submetida.
 * @return {string} O corpo do e-mail em HTML.
 */
const generateBioShockEmailHTML = (formData: any, responseData: any): string => {
  let answersHTML = "";
  for (const [question, answer] of Object.entries(responseData.answers)) {
    // Verifica se a resposta é uma assinatura em base64 para a renderizar como imagem
    if (typeof answer === "string" && answer.startsWith("data:image/png;base64,")) {
      answersHTML += `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #b18f42; color: #c9a25e; font-family: 'Roboto', sans-serif; vertical-align: top;">${question}</td>
          <td style="padding: 10px; border-bottom: 1px solid #b18f42; color: #f0ead6; font-family: 'Roboto', sans-serif;">
            <img src="${answer}" alt="Assinatura Digital" style="max-width: 250px; height: auto; background-color: #f0ead6; border: 1px solid #b18f42; border-radius: 4px;"/>
          </td>
        </tr>
      `;
    } else {
      answersHTML += `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #b18f42; color: #c9a25e; font-family: 'Roboto', sans-serif; vertical-align: top;">${question}</td>
          <td style="padding: 10px; border-bottom: 1px solid #b18f42; color: #f0ead6; font-family: 'Roboto', sans-serif;">${Array.isArray(answer) ? answer.join(", ") : answer}</td>
        </tr>
      `;
    }
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
              <!-- Cabeçalho -->
              <tr>
                <td align="center" style="padding: 20px 0; border-bottom: 2px solid #c9a25e;">
                  <h1 style="font-family: 'Limelight', cursive; color: #c9a25e; margin: 0; text-shadow: 1px 1px 3px #000;">BRAVOFORM</h1>
                  <p style="color: #f0ead6; margin: 5px 0 0;">Nova Resposta Recebida</p>
                </td>
              </tr>
              <!-- Corpo -->
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
              <!-- Rodapé -->
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
};


/**
 * Gatilho do Firestore que é acionado na criação de uma nova resposta de formulário.
 */
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
        const htmlBody = generateBioShockEmailHTML(formData, responseData);

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
        let messageBody = `Nova resposta recebida para o formulário: "${formData.title}"\n\n`;
        for (const [question, answer] of Object.entries(responseData.answers)) {
          if (typeof answer === "string" && answer.startsWith("data:image/png;base64,")) {
             messageBody += `*${question}:* [Assinatura Digital]\n`;
          } else {
             messageBody += `*${question}:* ${Array.isArray(answer) ? answer.join(", ") : answer}\n`;
          }
        }
        
        console.log(`Enviando WhatsApp para ${target}...`);
        await twilioClient.messages.create({
          from: `whatsapp:${functions.config().twilio.phone_number}`,
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
