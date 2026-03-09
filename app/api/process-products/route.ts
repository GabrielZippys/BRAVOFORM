import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('🤖 Iniciando processamento com IA...');
    
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      console.error('❌ Texto inválido recebido');
      return NextResponse.json(
        { error: 'Texto inválido' },
        { status: 400 }
      );
    }

    console.log('📝 Texto recebido:', text.substring(0, 100) + '...');

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error('❌ OPENAI_API_KEY não configurada no .env.local');
      return NextResponse.json(
        { error: 'Chave da API não configurada. Adicione OPENAI_API_KEY no arquivo .env.local' },
        { status: 500 }
      );
    }

    console.log('✅ Chave da API encontrada');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Você é um assistente especializado em extrair informações de produtos de textos não estruturados. 
Analise o texto fornecido e extraia uma lista de produtos com as seguintes informações:
- nome: nome do produto (obrigatório)
- codigo: código/SKU do produto (opcional)
- unidade: unidade de medida - deve ser exatamente um destes valores: "UN", "KG", "L", "CX", "PC" (padrão "UN")

Retorne APENAS um array JSON válido de objetos, sem texto adicional. Exemplo:
[{"nome":"Coca-Cola 2L","codigo":"1234","unidade":"UN"},{"nome":"Pepsi 2L","codigo":"5678","unidade":"UN"}]`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Erro da OpenAI:', errorData);
      return NextResponse.json(
        { error: 'Erro ao processar com IA' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '[]';
    
    // Extrair JSON do conteúdo (caso venha com markdown)
    let jsonContent = content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonContent = jsonMatch[0];
    }

    const parsedProducts = JSON.parse(jsonContent);

    return NextResponse.json({ products: parsedProducts });
  } catch (error) {
    console.error('Erro ao processar produtos:', error);
    return NextResponse.json(
      { error: 'Erro interno ao processar produtos' },
      { status: 500 }
    );
  }
}
