import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../firebase/config';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await params;
    const body = await request.json();
    
    // Verificar se o formulário existe e está ativo
    const formDoc = await getDoc(doc(db, 'forms', formId));
    if (!formDoc.exists()) {
      return NextResponse.json(
        { success: false, error: 'Formulário não encontrado' },
        { status: 404 }
      );
    }

    const formData = formDoc.data();
    
    // Verificar se o formulário está pausado ou arquivado
    if (formData.paused || formData.archived) {
      return NextResponse.json(
        { success: false, error: 'Formulário não está disponível para respostas' },
        { status: 403 }
      );
    }

    // Extrair dados do corpo da requisição
    const { answers, fieldMetadata } = body;

    // Gerar ID único para a resposta
    const responseId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Montar payload para o Firestore
    const payload: Record<string, any> = {
      collaboratorId: '', // Vazio para respostas anônimas
      collaboratorUsername: 'Anônimo',
      formId: formId,
      formTitle: formData.title,
      department: '', // Vazio para anônimos
      companyId: formData.companyId || '',
      departmentId: formData.departmentId || '',
      status: 'pending',
      submittedAt: serverTimestamp(),
      isAnonymous: true, // Flag para identificar respostas anônimas
      userAgent: request.headers.get('user-agent') || '',
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
    };

    // Adicionar respostas por label
    if (fieldMetadata) {
      Object.entries(fieldMetadata).forEach(([fieldId, meta]: [string, any]) => {
        const label = meta.label || fieldId;
        payload[label] = answers[fieldId] || '';
      });
    }

    // Adicionar answers por ID
    payload.answers = answers || {};
    payload.fieldMetadata = fieldMetadata || {};

    // Salvar no Firestore
    const docRef = await addDoc(collection(db, 'forms', formId, 'responses'), payload);

    // Salvar no PostgreSQL (fire-and-forget)
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/dataconnect/save-response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          responseId: docRef.id,
          formId: formId,
          formTitle: formData.title,
          companyId: formData.companyId || '',
          departmentId: formData.departmentId || '',
          department: '',
          collaboratorId: '', // Vazio para anônimos
          collaboratorUsername: 'Anônimo',
          status: 'pending',
          answers,
          fieldMetadata,
        }),
      });
    } catch (pgError) {
      console.error('Erro ao salvar no PostgreSQL (não crítico):', pgError);
      // Não falha a requisição se PostgreSQL falhar
    }

    console.log(`✅ Resposta anônima salva: ${docRef.id} para formulário ${formId}`);

    return NextResponse.json({
      success: true,
      data: {
        responseId: docRef.id,
        message: 'Resposta enviada com sucesso!'
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao processar resposta anônima:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao processar a resposta' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await params;
    
    // Buscar dados do formulário
    const formDoc = await getDoc(doc(db, 'forms', formId));
    if (!formDoc.exists()) {
      return NextResponse.json(
        { success: false, error: 'Formulário não encontrado' },
        { status: 404 }
      );
    }

    const formData = formDoc.data();
    
    // Verificar se o formulário está disponível
    if (formData.paused || formData.archived) {
      return NextResponse.json(
        { success: false, error: 'Formulário não está disponível' },
        { status: 403 }
      );
    }

    // Retornar dados públicos do formulário (sem informações sensíveis)
    return NextResponse.json({
      success: true,
      data: {
        id: formId,
        title: formData.title,
        description: formData.description,
        fields: formData.fields,
        theme: formData.theme,
        logoUrl: formData.logo?.url || formData.logoUrl || null,
        logoSize: formData.logo?.size ?? formData.logoSize ?? 40,
        logoAlignment: formData.logo?.align || formData.logoAlignment || 'center',
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar formulário público:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao buscar o formulário' },
      { status: 500 }
    );
  }
}
