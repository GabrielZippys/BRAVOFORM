import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { id, status, current_stage_id, assigned_to } = await request.json();

    console.log('📊 Atualizando status no PostgreSQL:', {
      responseId: id,
      newStatus: status,
      stageId: current_stage_id,
      assignedTo: assigned_to
    });

    // TODO: Quando schema estiver deployado:
    // const { dataConnect } = await import('@/src/services/dataConnectService');
    // await dataConnect.mutation.updateResponseStatus({
    //   id,
    //   status,
    //   current_stage_id,
    //   assigned_to
    // });

    return NextResponse.json({
      success: true,
      message: 'Status atualizado no PostgreSQL (simulado)',
      data: { id, status }
    });

  } catch (error: any) {
    console.error('Erro ao atualizar status:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
