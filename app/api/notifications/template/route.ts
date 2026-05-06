import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { renderTemplate, listTemplates, type TemplateId } from '@/lib/email/templates';

/**
 * GET /api/notifications/template
 *   → Lista todos os templates disponíveis (id + subject de exemplo)
 *
 * POST /api/notifications/template
 *   Body: {
 *     templateId: TemplateId,
 *     to: string | string[],
 *     vars: Record<string, string|number|boolean>
 *   }
 *
 *   Renderiza o template com as variáveis e envia via nodemailer.
 *   Retorna { success, messageId, subject } em caso de sucesso.
 */

export async function GET() {
  return NextResponse.json({
    success: true,
    data: listTemplates().map(t => ({ id: t.id, subjectExample: t.subject })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const { templateId, to, vars } = await request.json() as {
      templateId: TemplateId;
      to: string | string[];
      vars?: Record<string, string | number | boolean>;
    };

    if (!templateId || !to) {
      return NextResponse.json(
        { success: false, error: 'templateId e to são obrigatórios' },
        { status: 400 }
      );
    }

    // Renderiza o template
    const { subject, html } = renderTemplate(templateId, vars || {});

    // Envia o email
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@bravoform.com',
      to: Array.isArray(to) ? to.join(',') : to,
      subject,
      html,
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      subject,
      templateId,
    });
  } catch (error: any) {
    console.error('❌ Erro ao enviar email com template:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro desconhecido' },
      { status: 500 }
    );
  }
}
