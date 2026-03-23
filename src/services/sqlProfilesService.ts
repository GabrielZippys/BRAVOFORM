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
import type { SQLIntegrationProfile } from '@/types';

const PROFILES_COLLECTION = 'sql_integration_profiles';

export const sqlProfilesService = {
  async getCompanyProfiles(companyId: string): Promise<SQLIntegrationProfile[]> {
    try {
      const profilesQuery = query(
        collection(db, PROFILES_COLLECTION),
        where('companyId', '==', companyId)
      );
      
      const snapshot = await getDocs(profilesQuery);
      const profiles: SQLIntegrationProfile[] = [];
      
      snapshot.forEach(doc => {
        profiles.push({
          id: doc.id,
          ...doc.data()
        } as SQLIntegrationProfile);
      });
      
      return profiles.sort((a, b) => {
        const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });
    } catch (error) {
      console.error('Erro ao buscar perfis da empresa:', error);
      throw error;
    }
  },

  async getProfileById(profileId: string): Promise<SQLIntegrationProfile | null> {
    try {
      const docRef = doc(db, PROFILES_COLLECTION, profileId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        } as SQLIntegrationProfile;
      }
      
      return null;
    } catch (error) {
      console.error('Erro ao buscar perfil:', error);
      throw error;
    }
  },

  async saveProfile(profile: SQLIntegrationProfile): Promise<string> {
    try {
      const profileData = {
        ...profile,
        updatedAt: serverTimestamp(),
        createdAt: profile.createdAt || serverTimestamp()
      };

      if (profile.id) {
        const docRef = doc(db, PROFILES_COLLECTION, profile.id);
        await updateDoc(docRef, profileData as any);
        return profile.id;
      } else {
        const docRef = doc(collection(db, PROFILES_COLLECTION));
        await setDoc(docRef, profileData);
        return docRef.id;
      }
    } catch (error) {
      console.error('Erro ao salvar perfil:', error);
      throw error;
    }
  },

  async deleteProfile(profileId: string): Promise<void> {
    try {
      const docRef = doc(db, PROFILES_COLLECTION, profileId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Erro ao deletar perfil:', error);
      throw error;
    }
  },

  async toggleProfileActive(profileId: string, isActive: boolean): Promise<void> {
    try {
      const docRef = doc(db, PROFILES_COLLECTION, profileId);
      await updateDoc(docRef, {
        isActive,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Erro ao alternar status do perfil:', error);
      throw error;
    }
  },

  async updateProfileStatus(
    profileId: string, 
    status: 'offline' | 'online' | 'error' | 'testing',
    lastConnectionTest?: Date
  ): Promise<void> {
    try {
      const docRef = doc(db, PROFILES_COLLECTION, profileId);
      const updateData: any = {
        status,
        updatedAt: serverTimestamp()
      };
      
      if (lastConnectionTest) {
        updateData.lastConnectionTest = Timestamp.fromDate(lastConnectionTest);
      }
      
      await updateDoc(docRef, updateData);
    } catch (error) {
      console.error('Erro ao atualizar status do perfil:', error);
      throw error;
    }
  },

  async updateLastSync(
    profileId: string,
    syncStatus: 'success' | 'failed' | 'partial',
    syncError?: string
  ): Promise<void> {
    try {
      const docRef = doc(db, PROFILES_COLLECTION, profileId);
      await updateDoc(docRef, {
        lastSyncAt: serverTimestamp(),
        lastSyncStatus: syncStatus,
        lastSyncError: syncError || null,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Erro ao atualizar última sincronização:', error);
      throw error;
    }
  },

  async getActiveProfiles(companyId: string): Promise<SQLIntegrationProfile[]> {
    try {
      const profilesQuery = query(
        collection(db, PROFILES_COLLECTION),
        where('companyId', '==', companyId),
        where('isActive', '==', true)
      );
      
      const snapshot = await getDocs(profilesQuery);
      const profiles: SQLIntegrationProfile[] = [];
      
      snapshot.forEach(doc => {
        profiles.push({
          id: doc.id,
          ...doc.data()
        } as SQLIntegrationProfile);
      });
      
      return profiles;
    } catch (error) {
      console.error('Erro ao buscar perfis ativos:', error);
      throw error;
    }
  },

  async getProfilesByType(
    companyId: string, 
    type: 'import' | 'export' | 'bidirectional'
  ): Promise<SQLIntegrationProfile[]> {
    try {
      const profilesQuery = query(
        collection(db, PROFILES_COLLECTION),
        where('companyId', '==', companyId),
        where('type', '==', type)
      );
      
      const snapshot = await getDocs(profilesQuery);
      const profiles: SQLIntegrationProfile[] = [];
      
      snapshot.forEach(doc => {
        profiles.push({
          id: doc.id,
          ...doc.data()
        } as SQLIntegrationProfile);
      });
      
      return profiles;
    } catch (error) {
      console.error('Erro ao buscar perfis por tipo:', error);
      throw error;
    }
  }
};
