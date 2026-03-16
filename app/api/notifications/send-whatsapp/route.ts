import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM; // Ex: whatsapp:+5511999999999

export async function POST(request: NextRequest) {
  try {
    const { to, message } = await request.json();

    if (!to || !Array.isArray(to) || to.length === 0) {
      return NextResponse.json(
        { error: 'Números de WhatsApp são obrigatórios' },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { error: 'Mensagem é obrigatória' },
        { status: 400 }
      );
    }

    if (!accountSid || !authToken || !whatsappFrom) {
      return NextResponse.json(
        { error: 'Credenciais do Twilio não configuradas' },
        { status: 500 }
      );
    }

    const client = twilio(accountSid, authToken);
    const results = [];

    // Enviar para cada número
    for (const number of to) {
      try {
        // Formatar número para WhatsApp (adicionar whatsapp: prefix)
        const formattedNumber = number.startsWith('whatsapp:') 
          ? number 
          : `whatsapp:${number}`;

        const messageResult = await client.messages.create({
          from: whatsappFrom,
          to: formattedNumber,
          body: `🔔 *Notificação do Workflow*\n\n${message}\n\n_Esta é uma notificação automática do sistema BravoForm._`,
        });

        results.push({
          number: number,
          success: true,
          sid: messageResult.sid,
        });
      } catch (error: any) {
        console.error(`Erro ao enviar para ${number}:`, error);
        results.push({
          number: number,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: successCount > 0,
      sent: successCount,
      failed: failureCount,
      results: results,
    });
  } catch (error) {
    console.error('Erro na API de WhatsApp:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
