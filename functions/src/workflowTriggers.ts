import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { Twilio } from "twilio";
import { defineString } from "firebase-functions/params";

const db = admin.firestore();

// Config parameters
const nodemailerUser = defineString("NODEMAILER_USER");
const nodemailerPass = defineString("NODEMAILER_PASS");

/**
 * Trigger: Quando uma nova instância de workflow é criada
 * Notifica o colaborador atribuído
 */
export const onWorkflowInstanceCreated = onDocumentCreated(
  "workflow_instances/{instanceId}",
  async (event) => {
    const instance = event.data?.data();
    if (!instance) return;

    console.log("Nova instância de workflow criada:", event.params.instanceId);

    try {
      // Buscar dados do workflow
      const workflowDoc = await db.collection("workflows").doc(instance.workflowId).get();
      if (!workflowDoc.exists) {
        console.error("Workflow não encontrado:", instance.workflowId);
        return;
      }

      const workflow = workflowDoc.data();
      const creatorId = workflow?.createdBy;

      // Buscar dados do colaborador atribuído
      const collaboratorDoc = await db.collection("collaborators").doc(instance.assignedTo).get();
      if (!collaboratorDoc.exists) {
        console.log("Colaborador não encontrado:", instance.assignedTo);
        return;
      }

      const collaborator = collaboratorDoc.data();
      const collaboratorEmail = collaborator?.email;
      const collaboratorPhone = collaborator?.phone;

      if (!collaboratorEmail && !collaboratorPhone) {
        console.log("Colaborador sem email ou telefone");
        return;
      }

      // Buscar configurações de integração do criador
      const integrationDoc = await db.collection("integrations").doc(creatorId).get();
      const integrationData = integrationDoc.data();
      const twilioConfig = integrationData?.twilio;

      // Enviar WhatsApp se configurado
      if (collaboratorPhone && twilioConfig) {
        try {
          const client = new Twilio(twilioConfig.accountSid, twilioConfig.authToken);
          const message = `🔔 BRAVOFORM: Novo workflow atribuído!\n\n` +
            `Workflow: ${instance.workflowName}\n` +
            `Acesse o sistema para iniciar.`;

          const toNumber = collaboratorPhone.startsWith("whatsapp:") 
            ? collaboratorPhone 
            : `whatsapp:${collaboratorPhone}`;

          await client.messages.create({
            from: twilioConfig.whatsappFrom,
            to: toNumber,
            body: message,
          });

          console.log("WhatsApp enviado para:", collaboratorPhone);
        } catch (error) {
          console.error("Erro ao enviar WhatsApp:", error);
        }
      }

      // Enviar Email
      if (collaboratorEmail) {
        try {
          const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 587,
            secure: false,
            auth: {
              user: nodemailerUser.value(),
              pass: nodemailerPass.value(),
            },
          });

          await transporter.sendMail({
            from: nodemailerUser.value(),
            to: collaboratorEmail,
            subject: "Novo Workflow Atribuído - BRAVOFORM",
            html: `
              <h2>Novo Workflow Atribuído</h2>
              <p>Você recebeu um novo workflow:</p>
              <p><strong>${instance.workflowName}</strong></p>
              <p>Acesse o sistema BRAVOFORM para iniciar a execução.</p>
            `,
          });

          console.log("Email enviado para:", collaboratorEmail);
        } catch (error) {
          console.error("Erro ao enviar email:", error);
        }
      }
    } catch (error) {
      console.error("Erro no trigger de criação de workflow:", error);
    }
  }
);

/**
 * Trigger: Quando uma instância de workflow é atualizada
 * Detecta mudanças de etapa e conclusão
 */
export const onWorkflowInstanceUpdated = onDocumentUpdated(
  "workflow_instances/{instanceId}",
  async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    if (!beforeData || !afterData) return;

    const instanceId = event.params.instanceId;
    console.log("Instância de workflow atualizada:", instanceId);

    try {
      // Detectar mudança de etapa
      if (beforeData.currentStageId !== afterData.currentStageId) {
        console.log("Mudança de etapa detectada");
        await handleStageChange(afterData, instanceId);
      }

      // Detectar conclusão
      if (beforeData.status !== "completed" && afterData.status === "completed") {
        console.log("Workflow concluído detectado");
        await handleWorkflowCompleted(afterData, instanceId);
      }

      // Detectar rejeição
      if (beforeData.status !== "rejected" && afterData.status === "rejected") {
        console.log("Workflow rejeitado detectado");
        await handleWorkflowRejected(afterData, instanceId);
      }
    } catch (error) {
      console.error("Erro no trigger de atualização de workflow:", error);
    }
  }
);

/**
 * Notifica colaborador sobre mudança de etapa
 */
async function handleStageChange(instance: any, instanceId: string) {
  try {
    // Buscar workflow
    const workflowDoc = await db.collection("workflows").doc(instance.workflowId).get();
    if (!workflowDoc.exists) return;

    const workflow = workflowDoc.data();
    const creatorId = workflow?.createdBy;
    const currentStage = workflow?.stages?.[instance.currentStageIndex];

    if (!currentStage) return;

    // Buscar colaborador
    const collaboratorDoc = await db.collection("collaborators").doc(instance.assignedTo).get();
    if (!collaboratorDoc.exists) return;

    const collaborator = collaboratorDoc.data();
    const collaboratorEmail = collaborator?.email;
    const collaboratorPhone = collaborator?.phone;

    // Buscar configurações
    const integrationDoc = await db.collection("integrations").doc(creatorId).get();
    const twilioConfig = integrationDoc.data()?.twilio;

    // Enviar WhatsApp
    if (collaboratorPhone && twilioConfig) {
      try {
        const client = new Twilio(twilioConfig.accountSid, twilioConfig.authToken);
        const message = `⏰ BRAVOFORM: É sua vez!\n\n` +
          `Workflow: ${instance.workflowName}\n` +
          `Etapa: ${currentStage.name}\n` +
          `Aguardando sua ação.`;

        const toNumber = collaboratorPhone.startsWith("whatsapp:") 
          ? collaboratorPhone 
          : `whatsapp:${collaboratorPhone}`;

        await client.messages.create({
          from: twilioConfig.whatsappFrom,
          to: toNumber,
          body: message,
        });
      } catch (error) {
        console.error("Erro ao enviar WhatsApp:", error);
      }
    }

    // Enviar Email
    if (collaboratorEmail) {
      try {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 587,
          secure: false,
          auth: {
            user: nodemailerUser.value(),
            pass: nodemailerPass.value(),
          },
        });

        await transporter.sendMail({
          from: nodemailerUser.value(),
          to: collaboratorEmail,
          subject: "Ação Necessária - BRAVOFORM",
          html: `
            <h2>É sua vez de agir!</h2>
            <p><strong>Workflow:</strong> ${instance.workflowName}</p>
            <p><strong>Etapa:</strong> ${currentStage.name}</p>
            <p>Acesse o sistema para completar esta etapa.</p>
          `,
        });
      } catch (error) {
        console.error("Erro ao enviar email:", error);
      }
    }
  } catch (error) {
    console.error("Erro ao processar mudança de etapa:", error);
  }
}

/**
 * Notifica sobre workflow concluído
 */
async function handleWorkflowCompleted(instance: any, instanceId: string) {
  try {
    const workflowDoc = await db.collection("workflows").doc(instance.workflowId).get();
    if (!workflowDoc.exists) return;

    const workflow = workflowDoc.data();
    const creatorId = workflow?.createdBy;

    const collaboratorDoc = await db.collection("collaborators").doc(instance.assignedTo).get();
    if (!collaboratorDoc.exists) return;

    const collaborator = collaboratorDoc.data();
    const collaboratorEmail = collaborator?.email;
    const collaboratorPhone = collaborator?.phone;

    const integrationDoc = await db.collection("integrations").doc(creatorId).get();
    const twilioConfig = integrationDoc.data()?.twilio;

    // WhatsApp
    if (collaboratorPhone && twilioConfig) {
      try {
        const client = new Twilio(twilioConfig.accountSid, twilioConfig.authToken);
        const message = `✅ BRAVOFORM: Workflow concluído!\n\n` +
          `Workflow: ${instance.workflowName}\n` +
          `Todas as etapas foram finalizadas.`;

        const toNumber = collaboratorPhone.startsWith("whatsapp:") 
          ? collaboratorPhone 
          : `whatsapp:${collaboratorPhone}`;

        await client.messages.create({
          from: twilioConfig.whatsappFrom,
          to: toNumber,
          body: message,
        });
      } catch (error) {
        console.error("Erro ao enviar WhatsApp:", error);
      }
    }

    // Email
    if (collaboratorEmail) {
      try {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 587,
          secure: false,
          auth: {
            user: nodemailerUser.value(),
            pass: nodemailerPass.value(),
          },
        });

        await transporter.sendMail({
          from: nodemailerUser.value(),
          to: collaboratorEmail,
          subject: "Workflow Concluído - BRAVOFORM",
          html: `
            <h2>Workflow Concluído!</h2>
            <p><strong>Workflow:</strong> ${instance.workflowName}</p>
            <p>Todas as etapas foram finalizadas com sucesso.</p>
          `,
        });
      } catch (error) {
        console.error("Erro ao enviar email:", error);
      }
    }
  } catch (error) {
    console.error("Erro ao processar conclusão de workflow:", error);
  }
}

/**
 * Notifica sobre workflow rejeitado
 */
async function handleWorkflowRejected(instance: any, instanceId: string) {
  try {
    const workflowDoc = await db.collection("workflows").doc(instance.workflowId).get();
    if (!workflowDoc.exists) return;

    const workflow = workflowDoc.data();
    const creatorId = workflow?.createdBy;

    const collaboratorDoc = await db.collection("collaborators").doc(instance.assignedTo).get();
    if (!collaboratorDoc.exists) return;

    const collaborator = collaboratorDoc.data();
    const collaboratorEmail = collaborator?.email;
    const collaboratorPhone = collaborator?.phone;

    const integrationDoc = await db.collection("integrations").doc(creatorId).get();
    const twilioConfig = integrationDoc.data()?.twilio;

    const lastHistory = instance.stageHistory?.[instance.stageHistory.length - 1];
    const stageName = lastHistory?.stageName || "Etapa desconhecida";
    const reason = lastHistory?.comment || "Sem motivo especificado";

    // WhatsApp
    if (collaboratorPhone && twilioConfig) {
      try {
        const client = new Twilio(twilioConfig.accountSid, twilioConfig.authToken);
        const message = `❌ BRAVOFORM: Etapa rejeitada\n\n` +
          `Workflow: ${instance.workflowName}\n` +
          `Etapa: ${stageName}\n` +
          `Motivo: ${reason}\n` +
          `Refaça a etapa.`;

        const toNumber = collaboratorPhone.startsWith("whatsapp:") 
          ? collaboratorPhone 
          : `whatsapp:${collaboratorPhone}`;

        await client.messages.create({
          from: twilioConfig.whatsappFrom,
          to: toNumber,
          body: message,
        });
      } catch (error) {
        console.error("Erro ao enviar WhatsApp:", error);
      }
    }

    // Email
    if (collaboratorEmail) {
      try {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 587,
          secure: false,
          auth: {
            user: nodemailerUser.value(),
            pass: nodemailerPass.value(),
          },
        });

        await transporter.sendMail({
          from: nodemailerUser.value(),
          to: collaboratorEmail,
          subject: "Etapa Rejeitada - BRAVOFORM",
          html: `
            <h2>Etapa Rejeitada</h2>
            <p><strong>Workflow:</strong> ${instance.workflowName}</p>
            <p><strong>Etapa:</strong> ${stageName}</p>
            <p><strong>Motivo:</strong> ${reason}</p>
            <p>Por favor, refaça a etapa conforme solicitado.</p>
          `,
        });
      } catch (error) {
        console.error("Erro ao enviar email:", error);
      }
    }
  } catch (error) {
    console.error("Erro ao processar rejeição de workflow:", error);
  }
}
