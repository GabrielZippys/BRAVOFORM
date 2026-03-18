import { db } from '../../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Serviço de Notificações
 * Envia notificações por Email e WhatsApp (via Twilio)
 */
export class NotificationService {
  /**
   * Envia notificação por WhatsApp via Twilio
   */
  static async sendWhatsApp(
    to: string,
    message: string,
    userId: string
  ): Promise<boolean> {
    try {
      // Carregar credenciais do Twilio
      const integrationRef = doc(db, 'integrations', userId);
      const integrationDoc = await getDoc(integrationRef);
      
      if (!integrationDoc.exists()) {
        console.error('Integração não encontrada');
        return false;
      }

      const data = integrationDoc.data();
      const twilioConfig = data.twilio;

      if (!twilioConfig) {
        console.error('Twilio não configurado');
        return false;
      }

      const { accountSid, authToken, whatsappFrom } = twilioConfig;

      // Formatar número de destino
      const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

      // Enviar via Twilio API
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: whatsappFrom,
            To: toNumber,
            Body: message,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.error('Erro ao enviar WhatsApp:', error);
        return false;
      }

      console.log('WhatsApp enviado com sucesso');
      return true;
    } catch (error) {
      console.error('Erro no serviço de WhatsApp:', error);
      return false;
    }
  }

  /**
   * Envia notificação por Email
   */
  static async sendEmail(
    to: string,
    subject: string,
    message: string
  ): Promise<boolean> {
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, message })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Erro ao enviar email:', error);
        return false;
      }

      console.log('Email enviado com sucesso');
      return true;
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      return false;
    }
  }

  /**
   * Notifica colaborador sobre novo workflow atribuído
   */
  static async notifyWorkflowAssigned(
    collaboratorPhone: string,
    collaboratorEmail: string,
    workflowName: string,
    userId: string
  ): Promise<void> {
    const message = `🔔 BRAVOFORM: Novo workflow atribuído!\n\n` +
      `Workflow: ${workflowName}\n` +
      `Acesse o sistema para iniciar.`;

    const emailSubject = 'Novo Workflow Atribuído - BRAVOFORM';
    const emailMessage = `
      <h2>Novo Workflow Atribuído</h2>
      <p>Você recebeu um novo workflow:</p>
      <p><strong>${workflowName}</strong></p>
      <p>Acesse o sistema BRAVOFORM para iniciar a execução.</p>
    `;

    await Promise.all([
      this.sendWhatsApp(collaboratorPhone, message, userId),
      this.sendEmail(collaboratorEmail, emailSubject, emailMessage)
    ]);
  }

  /**
   * Notifica colaborador que é sua vez de agir
   */
  static async notifyYourTurn(
    collaboratorPhone: string,
    collaboratorEmail: string,
    workflowName: string,
    stageName: string,
    userId: string
  ): Promise<void> {
    const message = `⏰ BRAVOFORM: É sua vez!\n\n` +
      `Workflow: ${workflowName}\n` +
      `Etapa: ${stageName}\n` +
      `Aguardando sua ação.`;

    const emailSubject = 'Ação Necessária - BRAVOFORM';
    const emailMessage = `
      <h2>É sua vez de agir!</h2>
      <p><strong>Workflow:</strong> ${workflowName}</p>
      <p><strong>Etapa:</strong> ${stageName}</p>
      <p>Acesse o sistema para completar esta etapa.</p>
    `;

    await Promise.all([
      this.sendWhatsApp(collaboratorPhone, message, userId),
      this.sendEmail(collaboratorEmail, emailSubject, emailMessage)
    ]);
  }

  /**
   * Notifica sobre workflow concluído
   */
  static async notifyWorkflowCompleted(
    collaboratorPhone: string,
    collaboratorEmail: string,
    workflowName: string,
    userId: string
  ): Promise<void> {
    const message = `✅ BRAVOFORM: Workflow concluído!\n\n` +
      `Workflow: ${workflowName}\n` +
      `Todas as etapas foram finalizadas.`;

    const emailSubject = 'Workflow Concluído - BRAVOFORM';
    const emailMessage = `
      <h2>Workflow Concluído!</h2>
      <p><strong>Workflow:</strong> ${workflowName}</p>
      <p>Todas as etapas foram finalizadas com sucesso.</p>
    `;

    await Promise.all([
      this.sendWhatsApp(collaboratorPhone, message, userId),
      this.sendEmail(collaboratorEmail, emailSubject, emailMessage)
    ]);
  }

  /**
   * Notifica sobre workflow rejeitado
   */
  static async notifyWorkflowRejected(
    collaboratorPhone: string,
    collaboratorEmail: string,
    workflowName: string,
    stageName: string,
    reason: string,
    userId: string
  ): Promise<void> {
    const message = `❌ BRAVOFORM: Etapa rejeitada\n\n` +
      `Workflow: ${workflowName}\n` +
      `Etapa: ${stageName}\n` +
      `Motivo: ${reason}\n` +
      `Refaça a etapa.`;

    const emailSubject = 'Etapa Rejeitada - BRAVOFORM';
    const emailMessage = `
      <h2>Etapa Rejeitada</h2>
      <p><strong>Workflow:</strong> ${workflowName}</p>
      <p><strong>Etapa:</strong> ${stageName}</p>
      <p><strong>Motivo:</strong> ${reason}</p>
      <p>Por favor, refaça a etapa conforme solicitado.</p>
    `;

    await Promise.all([
      this.sendWhatsApp(collaboratorPhone, message, userId),
      this.sendEmail(collaboratorEmail, emailSubject, emailMessage)
    ]);
  }
}
