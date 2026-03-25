import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, data } = body;

    // Por enquanto, retornar dados mockados até configurarmos as queries reais
    // Isso permite testar a interface sem depender do schema estar deployado
    
    if (action === 'createProduct') {
      // Simular criação de produto
      const newProduct = {
        id: crypto.randomUUID(),
        name: data.name,
        price: data.price,
        description: data.description,
        stock: data.stock,
        created_at: new Date().toISOString()
      };

      return NextResponse.json({
        success: true,
        product: newProduct,
        message: 'Produto criado (simulado - aguardando deploy do schema)'
      });
    }

    // Teste de conexão - retornar produtos mockados
    const mockProducts = [
      {
        id: '1',
        name: 'Produto Demo 1',
        price: 99.90,
        description: 'Produto de demonstração',
        stock: 10,
        created_at: new Date().toISOString()
      },
      {
        id: '2',
        name: 'Produto Demo 2',
        price: 149.90,
        description: 'Outro produto de teste',
        stock: 5,
        created_at: new Date().toISOString()
      }
    ];

    return NextResponse.json({
      success: true,
      products: mockProducts,
      message: 'Dados mockados - Data Connect configurado mas aguardando schema deployment',
      info: {
        service: 'formbravo-8854e-service',
        location: 'southamerica-east1',
        database: 'formbravo-8854e-database',
        status: 'Schema pendente de deployment'
      }
    });

  } catch (error: any) {
    console.error('Erro no teste Data Connect:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Erro ao testar Data Connect',
        details: error.stack
      },
      { status: 500 }
    );
  }
}
