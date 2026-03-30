import { NextRequest, NextResponse } from 'next/server';
import { saveResponseToPg } from '@/lib/db/saveResponse';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { responseId, formId, formTitle, companyId, departmentId, department,
            collaboratorId, collaboratorUsername, status, answers, fieldMetadata } = body;

    const result = await saveResponseToPg({
      responseId, formId, formTitle, companyId, departmentId, department,
      collaboratorId, collaboratorUsername, status, answers, fieldMetadata,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        response_id: responseId,
        response_key: result.responseKey,
        counts: result.counts,
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao salvar no PostgreSQL:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
