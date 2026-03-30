import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

// Helper: resolve firebase_id → surrogate key
async function getKey(client: any, table: string, idCol: string, keyCol: string, fbId: string | null): Promise<number | null> {
  if (!fbId) return null;
  const res = await client.query(`SELECT ${keyCol} FROM ${table} WHERE ${idCol} = $1`, [fbId]);
  return res.rows[0]?.[keyCol] || null;
}

export async function POST(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { responseId, formId, formTitle, companyId, departmentId, department,
            collaboratorId, collaboratorUsername, status, answers, fieldMetadata } = body;

    await client.query('BEGIN');

    // Resolver surrogate keys
    const formKey   = await getKey(client, 'dim_forms', 'firebase_id', 'form_key', formId);
    const companyKey = await getKey(client, 'dim_companies', 'firebase_id', 'company_key', companyId);
    const deptKey   = await getKey(client, 'dim_departments', 'firebase_id', 'department_key', departmentId);
    const collabKey = await getKey(client, 'dim_collaborators', 'firebase_id', 'collaborator_key', collaboratorId);

    // 1) UPSERT fact_form_response
    const respResult = await client.query(`
      INSERT INTO fact_form_response (
        firebase_id, form_key, company_key, department_key, collaborator_key,
        form_title, department_name, collaborator_username,
        status, submitted_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (firebase_id) DO UPDATE SET
        status = EXCLUDED.status,
        submitted_at = NOW(),
        form_key = EXCLUDED.form_key,
        company_key = EXCLUDED.company_key,
        department_key = EXCLUDED.department_key,
        collaborator_key = EXCLUDED.collaborator_key
      RETURNING response_key
    `, [responseId, formKey, companyKey, deptKey, collabKey,
        formTitle, department || '', collaboratorUsername, status || 'pending']);

    const responseKey = respResult.rows[0].response_key;

    // 2) Limpar dados antigos desta resposta (para re-submit/update)
    await client.query('DELETE FROM fact_answers WHERE response_key = $1', [responseKey]);
    await client.query('DELETE FROM fact_order_items WHERE response_key = $1', [responseKey]);
    await client.query('DELETE FROM fact_checkbox_answers WHERE response_key = $1', [responseKey]);
    await client.query('DELETE FROM fact_table_answers WHERE response_key = $1', [responseKey]);
    await client.query('DELETE FROM fact_attachments WHERE response_key = $1', [responseKey]);

    // 3) Processar cada campo
    let simpleCount = 0, orderCount = 0, checkboxCount = 0, tableCount = 0;

    if (answers && typeof answers === 'object') {
      for (const [fieldId, value] of Object.entries(answers)) {
        const meta = fieldMetadata?.[fieldId] || {} as any;
        const fieldLabel = meta.label || fieldId;
        const fieldType = meta.type || '';
        const inputType = meta.inputType || '';

        // ── Grade de Pedidos ──
        if (inputType === 'order' || fieldType === 'Grade de Pedidos') {
          if (Array.isArray(value)) {
            for (let i = 0; i < (value as any[]).length; i++) {
              const item = (value as any[])[i];
              if (!item || typeof item !== 'object') continue;

              const price = parseFloat(item.price || item.preco || 0) || null;
              const qty = parseFloat(item.quantity || item.quantidade || 0) || 0;
              const subtotal = price && qty ? Math.round(price * qty * 100) / 100 : null;
              const productFbId = item.productId || item.id || '';
              const productKey = await getKey(client, 'dim_products', 'firebase_id', 'product_key', productFbId);

              await client.query(`
                INSERT INTO fact_order_items (
                  response_key, form_key, field_id, field_label, item_index,
                  product_fb_id, product_key, product_name_snap, product_code_snap,
                  price_snap, quantity, unit, subtotal, extra_data
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
              `, [responseKey, formKey, fieldId, fieldLabel, i,
                  productFbId, productKey,
                  item.productName || item.name || item.nome || 'Produto',
                  item.productCode || item.codigo || '',
                  price, qty, item.unit || item.unidade || '',
                  subtotal, JSON.stringify(item)]);
              orderCount++;
            }
          }
          // NÃO duplica no fact_answers — dados estão em fact_order_items
          continue;
        }

        // ── Caixa de Seleção (Checkbox) ──
        if (inputType === 'checkbox' || fieldType === 'Caixa de Seleção') {
          if (Array.isArray(value)) {
            for (let i = 0; i < (value as any[]).length; i++) {
              await client.query(`
                INSERT INTO fact_checkbox_answers (response_key, form_key, field_id, field_label, option_value, option_index)
                VALUES ($1,$2,$3,$4,$5,$6)
              `, [responseKey, formKey, fieldId, fieldLabel, String((value as any[])[i]), i]);
              checkboxCount++;
            }
          }
          // NÃO duplica no fact_answers — dados estão em fact_checkbox_answers
          continue;
        }

        // ── Tabela ──
        if (inputType === 'table' || fieldType === 'Tabela') {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            const rowCount = Object.keys(value as object).length;
            await client.query(`
              INSERT INTO fact_table_answers (response_key, form_key, field_id, field_label, table_data, row_count)
              VALUES ($1,$2,$3,$4,$5::jsonb,$6)
            `, [responseKey, formKey, fieldId, fieldLabel, JSON.stringify(value), rowCount]);
            tableCount++;
          }
          // NÃO duplica no fact_answers — dados estão em fact_table_answers
          continue;
        }

        // ── Assinatura (base64 → só salva indicador, não o blob) ──
        if (inputType === 'signature' || fieldType === 'Assinatura') {
          const strVal = String(value || '');
          const isBase64 = strVal.startsWith('data:image/');
          const isUrl = strVal.startsWith('http');
          const fileUrl = isUrl ? strVal : (isBase64 ? `base64://assinatura/${responseId}/${fieldId}` : null);
          if (fileUrl) {
            await client.query(`
              INSERT INTO fact_attachments (response_key, form_key, field_id, field_label, field_type, file_url, file_type, file_name)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            `, [responseKey, formKey, fieldId, fieldLabel, 'Assinatura', fileUrl, 'image/png', `assinatura_${fieldId}`]);
          }
          await client.query(`
            INSERT INTO fact_answers (response_key, form_key, field_id, field_label, field_type, input_type, answer_text)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
          `, [responseKey, formKey, fieldId, fieldLabel, 'Assinatura', 'signature',
              isUrl ? strVal : (isBase64 ? '[assinatura-base64]' : strVal)]);
          simpleCount++;
          continue;
        }

        // ── Anexo ──
        if (inputType === 'attachment' || fieldType === 'Anexo') {
          const strVal = String(value || '');
          if (strVal.startsWith('http')) {
            await client.query(`
              INSERT INTO fact_attachments (response_key, form_key, field_id, field_label, field_type, file_url)
              VALUES ($1,$2,$3,$4,$5,$6)
            `, [responseKey, formKey, fieldId, fieldLabel, 'Anexo', strVal]);
          }
          await client.query(`
            INSERT INTO fact_answers (response_key, form_key, field_id, field_label, field_type, input_type, answer_text)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
          `, [responseKey, formKey, fieldId, fieldLabel, 'Anexo', 'attachment', strVal]);
          simpleCount++;
          continue;
        }

        // ── Pular Cabeçalho (headers de seção do formulário) ──
        if (fieldType === 'Cabeçalho') continue;

        // ── Campo simples (Texto, Data, Número, Múltipla Escolha, etc.) ──
        let answerText: string | null = null;
        let answerNumber: number | null = null;
        let answerDate: string | null = null;
        let answerBoolean: boolean | null = null;
        let detectedInputType = inputType || 'text';

        if (value === null || value === undefined || value === '') {
          answerText = null;
        } else if (typeof value === 'boolean') {
          answerBoolean = value;
          answerText = value ? 'Sim' : 'Não';
          detectedInputType = 'boolean';
        } else if (typeof value === 'number') {
          answerNumber = value;
          answerText = String(value);
          detectedInputType = Number.isInteger(value) ? 'number' : 'decimal';
        } else {
          answerText = String(value);
          const num = parseFloat(answerText);
          if (!isNaN(num) && answerText.trim() === String(num)) {
            answerNumber = num;
            detectedInputType = answerText.includes('.') ? 'decimal' : 'number';
          }
          // Detectar data (YYYY-MM-DD ou YYYY-MM-DDTHH:MM)
          if (/^\d{4}-\d{2}-\d{2}/.test(answerText)) {
            answerDate = answerText.substring(0, 10);
            detectedInputType = 'date';
          }
        }

        // Pular campos completamente vazios
        if (answerText === null && answerNumber === null && answerDate === null && answerBoolean === null) {
          continue;
        }

        await client.query(`
          INSERT INTO fact_answers (
            response_key, form_key, field_id, field_label, field_type, input_type,
            answer_text, answer_number, answer_date, answer_boolean
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [responseKey, formKey, fieldId, fieldLabel,
            fieldType || 'Texto', detectedInputType,
            answerText, answerNumber, answerDate, answerBoolean]);
        simpleCount++;
      }
    }

    await client.query('COMMIT');

    console.log(`✅ PostgreSQL: resposta ${responseId} salva | ` +
      `${simpleCount} simples, ${orderCount} itens pedido, ${checkboxCount} checkbox, ${tableCount} tabelas`);

    return NextResponse.json({
      success: true,
      data: {
        response_id: responseId,
        response_key: responseKey,
        counts: { simple: simpleCount, orders: orderCount, checkboxes: checkboxCount, tables: tableCount },
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
