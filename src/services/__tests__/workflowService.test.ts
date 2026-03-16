import { WorkflowService } from '../workflowService';
import { db } from '../../../firebase/config';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import type { Form, FormResponse, WorkflowStage } from '../../types';

// Mock Firebase
jest.mock('../../../firebase/config', () => ({
  db: {}
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  getDocs: jest.fn(),
  serverTimestamp: jest.fn(() => ({ toMillis: () => Date.now() }))
}));

describe('WorkflowService', () => {
  const mockResponseId = 'response-123';
  const mockUserId = 'user-456';
  const mockUsername = 'João Silva';
  const mockStageId = 'stage-789';

  const mockWorkflowStage: WorkflowStage = {
    id: mockStageId,
    name: 'Em Execução',
    color: '#3B82F6',
    allowedRoles: ['dept-123'],
    allowedUsers: [mockUserId],
    requireComment: false,
    requireAttachments: false,
    autoNotifications: {
      email: false,
      sms: false,
      recipients: []
    },
    order: 1,
    isFinalStage: false,
    isInitialStage: false
  };

  const mockForm: Partial<Form> = {
    id: 'form-123',
    title: 'Formulário Teste',
    isWorkflowEnabled: true,
    workflowStages: [mockWorkflowStage]
  };

  const mockResponse: Partial<FormResponse> = {
    id: mockResponseId,
    formId: 'form-123',
    companyId: 'company-123',
    departmentId: 'dept-123',
    collaboratorId: 'collab-123',
    currentStageId: 'stage-initial',
    workflowHistory: [],
    stageMetadata: {}
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('moveResponse', () => {
    it('deve mover uma resposta para uma nova etapa com sucesso', async () => {
      // Arrange
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockResponse
      });

      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockForm
      });

      (getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ uid: mockUserId }) }]
      });

      (updateDoc as jest.Mock).mockResolvedValueOnce(undefined);

      // Act
      await WorkflowService.moveResponse(
        mockResponseId,
        mockStageId,
        mockUserId,
        mockUsername
      );

      // Assert
      expect(getDoc).toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalled();
    });

    it('deve lançar erro se a resposta não existir', async () => {
      // Arrange
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false
      });

      // Act & Assert
      await expect(
        WorkflowService.moveResponse(
          mockResponseId,
          mockStageId,
          mockUserId,
          mockUsername
        )
      ).rejects.toThrow('Resposta não encontrada');
    });

    it('deve incluir comentário no histórico quando fornecido', async () => {
      // Arrange
      const comment = 'Movendo para execução';
      
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockResponse
      });

      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockForm
      });

      (getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ uid: mockUserId }) }]
      });

      (updateDoc as jest.Mock).mockResolvedValueOnce(undefined);

      // Act
      await WorkflowService.moveResponse(
        mockResponseId,
        mockStageId,
        mockUserId,
        mockUsername,
        comment
      );

      // Assert
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          workflowHistory: expect.arrayContaining([
            expect.objectContaining({
              comment
            })
          ])
        })
      );
    });
  });

  describe('validateStageTransition', () => {
    it('deve lançar erro se workflow não estiver ativo', async () => {
      // Arrange
      const formWithoutWorkflow = { ...mockForm, isWorkflowEnabled: false };
      
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockResponse
      });

      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => formWithoutWorkflow
      });

      // Act & Assert
      await expect(
        WorkflowService.moveResponse(
          mockResponseId,
          mockStageId,
          mockUserId,
          mockUsername
        )
      ).rejects.toThrow('Workflow não está ativo');
    });

    it('deve lançar erro se etapa de destino não existir', async () => {
      // Arrange
      const formWithoutStage = { 
        ...mockForm, 
        workflowStages: [] 
      };
      
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockResponse
      });

      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => formWithoutStage
      });

      // Act & Assert
      await expect(
        WorkflowService.moveResponse(
          mockResponseId,
          mockStageId,
          mockUserId,
          mockUsername
        )
      ).rejects.toThrow('Etapa de destino não encontrada');
    });

    it('deve lançar erro se usuário não tiver permissão', async () => {
      // Arrange
      const stageWithoutPermission = {
        ...mockWorkflowStage,
        allowedRoles: [],
        allowedUsers: []
      };

      const formWithRestrictedStage = {
        ...mockForm,
        workflowStages: [stageWithoutPermission]
      };

      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockResponse
      });

      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => formWithRestrictedStage
      });

      (getDocs as jest.Mock).mockResolvedValueOnce({
        empty: true
      });

      (getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ id: mockUserId }) }]
      });

      // Act & Assert
      await expect(
        WorkflowService.moveResponse(
          mockResponseId,
          mockStageId,
          mockUserId,
          mockUsername
        )
      ).rejects.toThrow('Usuário não tem permissão');
    });
  });

  describe('checkUserStagePermission', () => {
    it('deve permitir acesso para admins', async () => {
      // Arrange
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockResponse
      });

      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockForm
      });

      (getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ uid: mockUserId }) }]
      });

      (updateDoc as jest.Mock).mockResolvedValueOnce(undefined);

      // Act
      await WorkflowService.moveResponse(
        mockResponseId,
        mockStageId,
        mockUserId,
        mockUsername
      );

      // Assert - não deve lançar erro
      expect(updateDoc).toHaveBeenCalled();
    });

    it('deve permitir acesso para usuários na lista allowedUsers', async () => {
      // Arrange
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockResponse
      });

      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockForm
      });

      (getDocs as jest.Mock).mockResolvedValueOnce({
        empty: true
      });

      (getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ id: mockUserId }) }]
      });

      (updateDoc as jest.Mock).mockResolvedValueOnce(undefined);

      // Act
      await WorkflowService.moveResponse(
        mockResponseId,
        mockStageId,
        mockUserId,
        mockUsername
      );

      // Assert
      expect(updateDoc).toHaveBeenCalled();
    });
  });

  describe('getWorkflowHistory', () => {
    it('deve retornar o histórico de uma resposta', async () => {
      // Arrange
      const mockHistory = [
        {
          id: 'hist-1',
          stageId: 'stage-1',
          changedBy: mockUserId,
          changedByUsername: mockUsername,
          changedAt: new Date(),
          actionType: 'forward' as const
        }
      ];

      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ ...mockResponse, workflowHistory: mockHistory })
      });

      // Act
      const result = await WorkflowService.getWorkflowHistory(mockResponseId);

      // Assert
      expect(result).toEqual(mockHistory);
    });

    it('deve lançar erro se resposta não existir', async () => {
      // Arrange
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false
      });

      // Act & Assert
      await expect(
        WorkflowService.getWorkflowHistory(mockResponseId)
      ).rejects.toThrow('Resposta não encontrada');
    });
  });

  describe('getResponsesByStage', () => {
    it('deve retornar respostas de uma etapa específica', async () => {
      // Arrange
      const mockResponses = [
        { id: 'resp-1', formId: 'form-123', currentStageId: mockStageId },
        { id: 'resp-2', formId: 'form-123', currentStageId: mockStageId }
      ];

      (getDocs as jest.Mock).mockResolvedValueOnce({
        docs: mockResponses.map(r => ({
          id: r.id,
          data: () => r
        }))
      });

      // Act
      const result = await WorkflowService.getResponsesByStage('form-123', mockStageId);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].currentStageId).toBe(mockStageId);
    });
  });

  describe('canUserViewStage', () => {
    it('deve permitir visualização para admins', async () => {
      // Arrange
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockForm
      });

      (getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ uid: mockUserId }) }]
      });

      // Act
      const result = await WorkflowService.canUserViewStage(
        mockUserId,
        mockStageId,
        'form-123'
      );

      // Assert
      expect(result).toBe(true);
    });

    it('deve negar visualização se formulário não existir', async () => {
      // Arrange
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false
      });

      // Act
      const result = await WorkflowService.canUserViewStage(
        mockUserId,
        mockStageId,
        'form-123'
      );

      // Assert
      expect(result).toBe(false);
    });

    it('deve permitir visualização para usuários na allowedUsers', async () => {
      // Arrange
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockForm
      });

      (getDocs as jest.Mock).mockResolvedValueOnce({
        empty: true
      });

      // Act
      const result = await WorkflowService.canUserViewStage(
        mockUserId,
        mockStageId,
        'form-123'
      );

      // Assert
      expect(result).toBe(true);
    });
  });
});
