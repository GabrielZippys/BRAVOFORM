import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function POST(request: NextRequest) {
  // Inicializar Resend apenas quando chamado
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const { to, subject, message } = await request.json();

    if (!to || !Array.isArray(to) || to.length === 0) {
      return NextResponse.json(
        { error: 'Destinatários de email são obrigatórios' },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { error: 'Mensagem é obrigatória' },
        { status: 400 }
      );
    }

    // Enviar email usando Resend
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: to,
      subject: subject || 'Notificação do Workflow',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3B82F6;">Notificação do Workflow</h2>
          <div style="background: #F3F4F6; padding: 1.5rem; border-radius: 0.5rem; margin: 1rem 0;">
            <p style="margin: 0; white-space: pre-line; color: #374151;">${message}</p>
          </div>
          <p style="color: #6B7280; font-size: 0.875rem;">
            Esta é uma notificação automática do sistema BravoForm.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('Erro ao enviar email:', error);
      return NextResponse.json(
        { error: 'Erro ao enviar email', details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: data?.id,
      recipients: to,
    });
  } catch (error) {
    console.error('Erro na API de email:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
