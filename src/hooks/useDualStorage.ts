import { useState, useCallback } from 'react';
import { FormResponse } from '@/types';
import { ResponseStorageService } from '@/services/responseStorageService';

/**
 * Hook para salvar respostas em AMBOS os bancos (Firestore + PostgreSQL)
 * Mantém compatibilidade total com sistema existente
 */
export function useDualStorage() {
  const [isSavingToPostgres, setIsSavingToPostgres] = useState(false);
  const [postgresError, setPostgresError] = useState<string | null>(null);

  /**
   * Salva resposta em ambos os bancos
   * Firestore é prioritário (não pode falhar)
   * PostgreSQL é secundário (falha não bloqueia)
   */
  const saveResponse = useCallback(async (
    response: FormResponse,
    firestoreSaveFn: () => Promise<void>
  ): Promise<void> => {
    try {
      // 1. SEMPRE salvar no Firestore primeiro (sistema existente)
      await firestoreSaveFn();
      console.log('✅ Resposta salva no Firestore:', response.id);

      // 2. Tentar salvar no PostgreSQL (não bloqueia se falhar)
      setIsSavingToPostgres(true);
      setPostgresError(null);

      try {
        const savedToPostgres = await ResponseStorageService.saveToPostgreSQL(response);
        
        if (savedToPostgres) {
          console.log('✅ Resposta salva no PostgreSQL:', response.id);
        } else {
          console.warn('⚠️ Falha ao salvar no PostgreSQL (não crítico):', response.id);
          setPostgresError('Falha ao salvar no PostgreSQL');
        }
      } catch (pgError: any) {
        // Erro no PostgreSQL não deve quebrar o fluxo
        console.error('⚠️ Erro ao salvar no PostgreSQL (não crítico):', pgError);
        setPostgresError(pgError.message);
      }

    } finally {
      setIsSavingToPostgres(false);
    }
  }, []);

  /**
   * Atualiza status em ambos os bancos
   */
  const updateStatus = useCallback(async (
    responseId: string,
    status: string,
    firestoreUpdateFn: () => Promise<void>,
    currentStageId?: string,
    assignedTo?: string
  ): Promise<void> => {
    try {
      // 1. Atualizar Firestore primeiro
      await firestoreUpdateFn();
      console.log('✅ Status atualizado no Firestore:', responseId);

      // 2. Tentar atualizar PostgreSQL
      try {
        await ResponseStorageService.updateStatus(responseId, status, currentStageId, assignedTo);
        console.log('✅ Status atualizado no PostgreSQL:', responseId);
      } catch (pgError) {
        console.error('⚠️ Erro ao atualizar PostgreSQL (não crítico):', pgError);
      }

    } catch (error) {
      console.error('❌ Erro ao atualizar status:', error);
      throw error;
    }
  }, []);

  /**
   * Marca como deletada em ambos os bancos
   */
  const markAsDeleted = useCallback(async (
    responseId: string,
    deletedBy: string,
    deletedByUsername: string,
    firestoreDeleteFn: () => Promise<void>
  ): Promise<void> => {
    try {
      // 1. Deletar no Firestore primeiro
      await firestoreDeleteFn();
      console.log('✅ Resposta deletada no Firestore:', responseId);

      // 2. Tentar marcar como deletada no PostgreSQL
      try {
        await ResponseStorageService.markAsDeleted(responseId, deletedBy, deletedByUsername);
        console.log('✅ Resposta deletada no PostgreSQL:', responseId);
      } catch (pgError) {
        console.error('⚠️ Erro ao deletar no PostgreSQL (não crítico):', pgError);
      }

    } catch (error) {
      console.error('❌ Erro ao deletar resposta:', error);
      throw error;
    }
  }, []);

  return {
    saveResponse,
    updateStatus,
    markAsDeleted,
    isSavingToPostgres,
    postgresError
  };
}
