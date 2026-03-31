import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { db } from '../../../../firebase/config';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';

// Credenciais do PostgreSQL Data Connect (hardcoded)
const PG_CONFIG = {
  host: '34.39.165.146',
  port: 5432,
  database: 'formbravo-8854e-database',
  user: 'ipanema',
  password: 'Br@v0x00',
  ssl: false,
  connectionTimeoutMillis: 5000,
};

interface TriggerConfig {
  tableName: string;
  triggerColumn: string;
  lastProcessedValue?: any;
  pollingInterval: number;
}

export async function POST(request: NextRequest) {
  try {
    const { workflowId, stageId } = await request.json();

    if (!workflowId || !stageId) {
      return NextResponse.json(
        { success: false, error: 'workflowId e stageId são obrigatórios' },
        { status: 400 }
      );
    }

    // Buscar workflow
    const workflowDoc = await getDoc(doc(db, 'workflows', workflowId));
    if (!workflowDoc.exists()) {
      return NextResponse.json(
        { success: false, error: 'Workflow não encontrado' },
        { status: 404 }
      );
    }

    const workflow = workflowDoc.data();
    const stage = workflow.stages?.find((s: any) => s.id === stageId);

    if (!stage || !stage.trigger?.enabled || stage.trigger.type !== 'sql_database') {
      return NextResponse.json(
        { success: false, error: 'Trigger SQL não configurado para esta etapa' },
        { status: 400 }
      );
    }

    const triggerConfig: TriggerConfig = stage.trigger.sqlConfig;

    // Conectar ao banco PostgreSQL Data Connect
    const pool = new Pool(PG_CONFIG);

    try {
      // Buscar novos registros
      const lastValue = triggerConfig.lastProcessedValue || 0;
      const queryText = `
        SELECT * FROM ${triggerConfig.tableName}
        WHERE ${triggerConfig.triggerColumn} > $1
        ORDER BY ${triggerConfig.triggerColumn} ASC
        LIMIT 100
      `;

      const result = await pool.query(queryText, [lastValue]);
      const newRecords = result.rows;

      if (newRecords.length === 0) {
        await pool.end();
        return NextResponse.json({
          success: true,
          message: 'Nenhum novo registro encontrado',
          recordsProcessed: 0
        });
      }

      // Criar instâncias de workflow para cada novo registro
      const instancesCreated = [];
      
      for (const record of newRecords) {
        // Criar instância de workflow
        const instanceData = {
          workflowId,
          workflowName: workflow.name,
          currentStageId: stage.id,
          currentStageIndex: workflow.stages.findIndex((s: any) => s.id === stageId),
          assignedTo: stage.assignedUsers?.[0] || workflow.createdBy,
          assignedToName: 'Sistema',
          status: 'in_progress',
          startedAt: serverTimestamp(),
          stageHistory: [{
            stageId: stage.id,
            stageName: stage.name,
            enteredAt: new Date(),
            action: 'created_by_trigger'
          }],
          fieldData: record, // Dados do SQL como fieldData
          companyId: workflow.companies?.[0] || '',
          departmentId: workflow.departments?.[0] || '',
          triggerSource: {
            type: 'sql_database',
            tableName: triggerConfig.tableName,
            recordId: record[triggerConfig.triggerColumn]
          }
        };

        const instanceRef = await addDoc(collection(db, 'workflow_instances'), instanceData);
        instancesCreated.push({
          instanceId: instanceRef.id,
          recordId: record[triggerConfig.triggerColumn]
        });
      }

      // Atualizar lastProcessedValue no workflow
      const maxValue = Math.max(...newRecords.map(r => r[triggerConfig.triggerColumn]));
      const updatedStages = workflow.stages.map((s: any) => {
        if (s.id === stageId) {
          return {
            ...s,
            trigger: {
              ...s.trigger,
              sqlConfig: {
                ...s.trigger.sqlConfig,
                lastProcessedValue: maxValue
              }
            }
          };
        }
        return s;
      });

      await updateDoc(doc(db, 'workflows', workflowId), {
        stages: updatedStages
      });

      await pool.end();

      return NextResponse.json({
        success: true,
        message: `${instancesCreated.length} workflow(s) criado(s) automaticamente`,
        recordsProcessed: instancesCreated.length,
        instances: instancesCreated,
        lastProcessedValue: maxValue
      });

    } catch (dbError: any) {
      await pool.end();
      console.error('Erro ao consultar banco SQL:', dbError);
      return NextResponse.json(
        { success: false, error: `Erro ao consultar banco: ${dbError.message}` },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Erro no monitor de triggers:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
