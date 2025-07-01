import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { Twilio } from "twilio";

// Inicializa o Firebase Admin SDK para ter acesso ao Firestore
admin.initializeApp();
const db = admin.firestore();

// --- Configuração dos Serviços Externos ---
// As configurações são carregadas das variáveis de ambiente do Firebase
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
 * Gatilho do Firestore que é acionado na criação de uma nova resposta de formulário.
 * Caminho: /forms/{formId}/responses/{responseId}
 * CORREÇÃO: Adicionando tipos explícitos para 'snap' e 'context'.
 */
export const onNewFormResponse = functions.firestore
  .document("forms/{formId}/responses/{responseId}")
  .onCreate(async (
    snap: functions.firestore.QueryDocumentSnapshot,
    context: functions.EventContext
  ) => {
    // Pega os dados da resposta que foi criada
    const responseData = snap.data();
    const { formId } = context.params;

    if (!responseData) {
      console.log("Dados da resposta não encontrados.");
      return null;
    }

    try {
      // Busca o documento do formulário pai para obter as configurações de automação
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

      // Constrói uma mensagem bonita com as respostas
      let messageBody = `Nova resposta recebida para o formulário: "${
        formData.title
      }"\n\n`;
      messageBody += "----------------------------------------\n";
      for (const [question, answer] of Object.entries(responseData.answers)) {
        messageBody += `Pergunta: ${question}\nResposta: ${answer}\n\n`;
      }
      messageBody += "----------------------------------------";

      // Decide qual notificação enviar com base na configuração
      if (type === "email") {
        const mailOptions = {
          from: `"BRAVOFORM" <${functions.config().nodemailer.user}>`,
          to: target,
          subject: `Nova Resposta Recebida: ${formData.title}`,
          text: messageBody,
        };

        console.log(`Enviando e-mail para ${target}...`);
        await mailTransport.sendMail(mailOptions);
        console.log("E-mail enviado com sucesso!");
      } else if (type === "whatsapp") {
        console.log(`Enviando WhatsApp para ${target}...`);
        await twilioClient.messages.create({
          from: `whatsapp:${functions.config().twilio.phone_number}`,
          to: `whatsapp:${target}`, // O número precisa incluir o código do país
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
