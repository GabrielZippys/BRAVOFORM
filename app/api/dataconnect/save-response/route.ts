import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// Pool de conexão PostgreSQL (reutilizado entre requests)
const pool = new Pool({
  host: process.env.PG_HOST || '34.39.165.146',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'formbravo-8854e-database',
  user: process.env.PG_USER || 'ipanema',
  password: process.env.PG_PASSWORD || 'Br@v0x00',
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
});

export async function POST(request: NextRequest) {
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { responseId, formId, formTitle, companyId, departmentId, department,
            collaboratorId, collaboratorUsername, status, answers, fieldMetadata } = body;

    await client.query('BEGIN');

    // 1) Inserir form_response (UPSERT)
    await client.query(`
      INSERT INTO form_response (
        id, form_id, form_title, company_id, department_id, department_name,
        collaborator_id, collaborator_username, status, created_at, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        submitted_at = NOW()
    `, [responseId, formId, formTitle, companyId, departmentId, department || '',
        collaboratorId, collaboratorUsername, status || 'pending']);

    // 2) Deletar answers antigos (para update)
    await client.query('DELETE FROM answer WHERE response_id = $1', [responseId]);

    // 3) Inserir cada answer normalizado
    if (answers && typeof answers === 'object') {
      for (const [fieldId, value] of Object.entries(answers)) {
        const meta = fieldMetadata?.[fieldId] || {};
        const fieldLabel = meta.label || fieldId;
        const fieldType = meta.type || 'text';
        
        // Determinar tipo de valor
        let answerText = '';
        let answerNumber: number | null = null;
        let answerBoolean: boolean | null = null;

        if (value === null || value === undefined || value === '') {
          answerText = '';
        } else if (typeof value === 'boolean') {
          answerBoolean = value;
          answerText = value ? 'Sim' : 'Não';
        } else if (typeof value === 'number') {
          answerNumber = value;
          answerText = String(value);
        } else if (Array.isArray(value)) {
          answerText = JSON.stringify(value);
        } else if (typeof value === 'object') {
          answerText = JSON.stringify(value);
        } else {
          answerText = String(value);
          const num = parseFloat(answerText);
          if (!isNaN(num) && answerText.trim() === String(num)) {
            answerNumber = num;
          }
        }

        const answerId = `${responseId}_${fieldId}`;
        
        await client.query(`
          INSERT INTO answer (
            id, response_id, field_id, field_label, field_type,
            answer_text, answer_number, answer_boolean
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            answer_text = EXCLUDED.answer_text,
            answer_number = EXCLUDED.answer_number,
            answer_boolean = EXCLUDED.answer_boolean
        `, [answerId, responseId, fieldId, fieldLabel, fieldType,
            answerText, answerNumber, answerBoolean]);
      }
    }

    await client.query('COMMIT');

    const answerCount = answers ? Object.keys(answers).length : 0;
    console.log(`✅ PostgreSQL: resposta ${responseId} salva (${answerCount} campos)`);

    return NextResponse.json({
      success: true,
      data: {
        response_id: responseId,
        answers_saved: answerCount,
      }
    });

  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Erro ao salvar no PostgreSQL:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
