import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

/**
 * API Route para envio de emails
 * POST /api/send-email
 */
export async function POST(request: NextRequest) {
  try {
    const { to, subject, message } = await request.json();

    // Validar campos obrigatórios
    if (!to || !subject || !message) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: to, subject, message' },
        { status: 400 }
      );
    }

    // Configurar transporter do Nodemailer
    // TODO: Configurar com credenciais reais (Gmail, SendGrid, etc.)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Enviar email
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@bravoform.com',
      to,
      subject,
      html: message,
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
    });
  } catch (error) {
    console.error('Erro ao enviar email:', error);
    return NextResponse.json(
      { error: 'Erro ao enviar email' },
      { status: 500 }
    );
  }
}
