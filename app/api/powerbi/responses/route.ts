import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../../../../firebase/config';

/**
 * API REST simples para Power BI consumir dados do Firestore
 * Sem necessidade de configuração ODBC ou PostgreSQL
 * 
 * Uso no Power BI:
 * Get Data → Web → https://bravoform.vercel.app/api/powerbi/responses
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parâmetros opcionais para filtrar
    const companyId = searchParams.get('companyId');
    const departmentId = searchParams.get('departmentId');
    const formId = searchParams.get('formId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Buscar respostas do Firestore
    const responsesRef = collection(db, 'responses');
    let q = query(responsesRef);

    // Aplicar filtros se fornecidos
    if (companyId) {
      q = query(q, where('companyId', '==', companyId));
    }
    if (departmentId) {
      q = query(q, where('departmentId', '==', departmentId));
    }
    if (formId) {
      q = query(q, where('formId', '==', formId));
    }

    const snapshot = await getDocs(q);
    
    // Transformar dados para formato tabular (fácil para Power BI)
    const responses = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // Achatar estrutura para facilitar análise no Power BI
      const flatResponse: any = {
        id: doc.id,
        formId: data.formId,
        formTitle: data.formTitle,
        companyId: data.companyId,
        departmentId: data.departmentId,
        departmentName: data.department || data.departmentId,
        collaboratorId: data.collaboratorId,
        collaboratorUsername: data.collaboratorUsername,
        status: data.status,
        currentStageId: data.currentStageId || null,
        assignedTo: data.assignedTo || null,
        createdAt: data.createdAt instanceof Timestamp 
          ? data.createdAt.toDate().toISOString() 
          : new Date(data.createdAt).toISOString(),
        submittedAt: data.submittedAt instanceof Timestamp 
          ? data.submittedAt.toDate().toISOString() 
          : new Date(data.submittedAt).toISOString(),
        deletedAt: data.deletedAt instanceof Timestamp 
          ? data.deletedAt.toDate().toISOString() 
          : null,
        deletedBy: data.deletedBy || null,
        deletedByUsername: data.deletedByUsername || null
      };

      // Adicionar respostas como colunas separadas
      if (data.answers) {
        Object.entries(data.answers).forEach(([fieldId, value]) => {
          // Criar nome de coluna limpo
          const columnName = `answer_${fieldId.replace(/[^a-zA-Z0-9]/g, '_')}`;
          
          // Converter valores complexos para string
          if (typeof value === 'object' && value !== null) {
            flatResponse[columnName] = JSON.stringify(value);
          } else {
            flatResponse[columnName] = value;
          }
        });
      }

      return flatResponse;
    });

    // Filtrar por data se fornecido
    let filteredResponses = responses;
    if (startDate) {
      const start = new Date(startDate);
      filteredResponses = filteredResponses.filter(r => new Date(r.submittedAt) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      filteredResponses = filteredResponses.filter(r => new Date(r.submittedAt) <= end);
    }

    return NextResponse.json({
      success: true,
      count: filteredResponses.length,
      data: filteredResponses,
      metadata: {
        generatedAt: new Date().toISOString(),
        filters: {
          companyId: companyId || 'all',
          departmentId: departmentId || 'all',
          formId: formId || 'all',
          startDate: startDate || 'none',
          endDate: endDate || 'none'
        }
      }
    });

  } catch (error: any) {
    console.error('Erro ao buscar dados para Power BI:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message,
        data: []
      },
      { status: 500 }
    );
  }
}
