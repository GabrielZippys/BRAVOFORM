import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgresql';

/**
 * GET /api/dataconnect/dashboard
 *   ?type=all                          → companies + forms + responses em uma chamada
 *   ?type=companies
 *   ?type=departments&companyId=xxx
 *   ?type=forms[&companyId=xxx][&departmentId=xxx]
 */
export async function GET(request: NextRequest) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const { searchParams } = new URL(request.url);
    const type       = searchParams.get('type');
    const companyId  = searchParams.get('companyId');
    const deptId     = searchParams.get('departmentId');

    // ── Carga inicial única: companies + forms + responses ──────────────────
    if (type === 'all') {
      const [companiesRes, formsRes, responsesRes] = await Promise.all([
        client.query(`SELECT firebase_id AS id, name FROM dim_companies ORDER BY name`),
        client.query(`
          SELECT
            df.firebase_id AS id,
            df.title,
            df.created_at AS "createdAt",
            dc.firebase_id AS "companyId",
            dd.firebase_id AS "departmentId"
          FROM dim_forms df
          LEFT JOIN dim_companies   dc ON dc.company_key    = df.company_key
          LEFT JOIN dim_departments dd ON dd.department_key = df.department_key
          WHERE df.is_active = true
          ORDER BY df.created_at DESC
        `),
        client.query(`
          SELECT
            fr.firebase_id              AS id,
            df.firebase_id              AS "formId",
            COALESCE(fr.form_title, df.title, '') AS "formTitle",
            fr.collaborator_username    AS "collaboratorUsername",
            dcol.firebase_id            AS "collaboratorId",
            dc.firebase_id              AS "companyId",
            dd.firebase_id              AS "departmentId",
            fr.submitted_at             AS "submittedAt",
            fr.created_at               AS "createdAt"
          FROM fact_form_response fr
          LEFT JOIN dim_forms         df   ON df.form_key         = fr.form_key
          LEFT JOIN dim_companies     dc   ON dc.company_key      = fr.company_key
          LEFT JOIN dim_departments   dd   ON dd.department_key   = fr.department_key
          LEFT JOIN dim_collaborators dcol ON dcol.collaborator_key = fr.collaborator_key
          WHERE fr.deleted_at IS NULL
          ORDER BY COALESCE(fr.submitted_at, fr.created_at) DESC
          LIMIT 2000
        `),
      ]);
      return NextResponse.json({
        success: true,
        companies:  companiesRes.rows,
        forms:      formsRes.rows,
        responses:  responsesRes.rows,
      });
    }

    if (type === 'companies') {
      const result = await client.query(
        `SELECT firebase_id AS id, name FROM dim_companies ORDER BY name`
      );
      return NextResponse.json({ success: true, data: result.rows });
    }

    if (type === 'departments') {
      if (!companyId || companyId === 'all') {
        return NextResponse.json({ success: true, data: [] });
      }
      const result = await client.query(
        `SELECT dd.firebase_id AS id, dd.name
         FROM dim_departments dd
         JOIN dim_companies dc ON dc.company_key = dd.company_key
         WHERE dc.firebase_id = $1
         ORDER BY dd.name`,
        [companyId]
      );
      return NextResponse.json({ success: true, data: result.rows });
    }

    if (type === 'forms') {
      const conditions: string[] = ['df.is_active = true'];
      const params: any[] = [];
      let p = 1;

      if (companyId && companyId !== 'all') {
        conditions.push(`dc.firebase_id = $${p++}`);
        params.push(companyId);
      }
      if (deptId && deptId !== 'all') {
        conditions.push(`dd.firebase_id = $${p++}`);
        params.push(deptId);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await client.query(`
        SELECT
          df.firebase_id AS id,
          df.title,
          df.created_at AS "createdAt",
          dc.firebase_id AS "companyId",
          dd.firebase_id AS "departmentId"
        FROM dim_forms df
        LEFT JOIN dim_companies   dc ON dc.company_key    = df.company_key
        LEFT JOIN dim_departments dd ON dd.department_key = df.department_key
        ${where}
        ORDER BY df.created_at DESC
      `, params);

      return NextResponse.json({ success: true, data: result.rows });
    }

    return NextResponse.json({ success: false, error: 'type required' }, { status: 400 });
  } catch (error: any) {
    console.error('❌ Erro no dashboard API:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
