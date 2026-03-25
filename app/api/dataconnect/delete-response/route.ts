import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { id, deleted_by, deleted_by_username } = await request.json();

    console.log('📊 Marcando resposta como deletada no PostgreSQL:', {
      responseId: id,
      deletedBy: deleted_by_username
    });

    // TODO: Quando schema estiver deployado:
    // const { dataConnect } = await import('@/src/services/dataConnectService');
    // await dataConnect.mutation.deleteResponse({
    //   id,
    //   deleted_by,
    //   deleted_by_username
    // });

    return NextResponse.json({
      success: true,
      message: 'Resposta marcada como deletada no PostgreSQL (simulado)',
      data: { id }
    });

  } catch (error: any) {
    console.error('Erro ao deletar resposta:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
