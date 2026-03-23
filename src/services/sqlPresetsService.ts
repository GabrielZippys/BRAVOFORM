import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { SQLPreset, CompanySQLPresets } from '@/types';

const PRESETS_COLLECTION = 'sql_presets';

export const sqlPresetsService = {
  async getCompanyPresets(companyId: string): Promise<SQLPreset[]> {
    try {
      const presetsQuery = query(
        collection(db, PRESETS_COLLECTION),
        where('companyId', '==', companyId)
      );
      
      const snapshot = await getDocs(presetsQuery);
      const presets: SQLPreset[] = [];
      
      snapshot.forEach(doc => {
        presets.push({
          id: doc.id,
          ...doc.data()
        } as SQLPreset);
      });
      
      return presets.sort((a, b) => {
        const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });
    } catch (error) {
      console.error('Erro ao buscar presets da empresa:', error);
      throw error;
    }
  },

  async getPresetById(presetId: string): Promise<SQLPreset | null> {
    try {
      const docRef = doc(db, PRESETS_COLLECTION, presetId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        } as SQLPreset;
      }
      
      return null;
    } catch (error) {
      console.error('Erro ao buscar preset:', error);
      throw error;
    }
  },

  async savePreset(preset: SQLPreset): Promise<string> {
    try {
      const presetData = {
        ...preset,
        updatedAt: serverTimestamp(),
        createdAt: preset.createdAt || serverTimestamp()
      };

      if (preset.id) {
        const docRef = doc(db, PRESETS_COLLECTION, preset.id);
        await updateDoc(docRef, presetData as any);
        return preset.id;
      } else {
        const docRef = doc(collection(db, PRESETS_COLLECTION));
        await setDoc(docRef, presetData);
        return docRef.id;
      }
    } catch (error) {
      console.error('Erro ao salvar preset:', error);
      throw error;
    }
  },

  async deletePreset(presetId: string): Promise<void> {
    try {
      const docRef = doc(db, PRESETS_COLLECTION, presetId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Erro ao deletar preset:', error);
      throw error;
    }
  },

  async updateLastUsed(presetId: string): Promise<void> {
    try {
      const docRef = doc(db, PRESETS_COLLECTION, presetId);
      await updateDoc(docRef, {
        lastUsedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Erro ao atualizar último uso:', error);
    }
  },

  async getPresetsByType(companyId: string, type: 'import' | 'export'): Promise<SQLPreset[]> {
    try {
      const presetsQuery = query(
        collection(db, PRESETS_COLLECTION),
        where('companyId', '==', companyId),
        where('type', '==', type)
      );
      
      const snapshot = await getDocs(presetsQuery);
      const presets: SQLPreset[] = [];
      
      snapshot.forEach(doc => {
        presets.push({
          id: doc.id,
          ...doc.data()
        } as SQLPreset);
      });
      
      return presets;
    } catch (error) {
      console.error('Erro ao buscar presets por tipo:', error);
      throw error;
    }
  },

  async getActivePresets(companyId: string): Promise<SQLPreset[]> {
    try {
      const presetsQuery = query(
        collection(db, PRESETS_COLLECTION),
        where('companyId', '==', companyId),
        where('isActive', '==', true)
      );
      
      const snapshot = await getDocs(presetsQuery);
      const presets: SQLPreset[] = [];
      
      snapshot.forEach(doc => {
        presets.push({
          id: doc.id,
          ...doc.data()
        } as SQLPreset);
      });
      
      return presets;
    } catch (error) {
      console.error('Erro ao buscar presets ativos:', error);
      throw error;
    }
  },

  async togglePresetActive(presetId: string, isActive: boolean): Promise<void> {
    try {
      const docRef = doc(db, PRESETS_COLLECTION, presetId);
      await updateDoc(docRef, {
        isActive,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Erro ao alternar status do preset:', error);
      throw error;
    }
  },

  encryptPassword(password: string): string {
    return btoa(password);
  },

  decryptPassword(encryptedPassword: string): string {
    try {
      return atob(encryptedPassword);
    } catch {
      return encryptedPassword;
    }
  }
};
