'use client';

import React, { useState } from 'react';
import type { SQLIntegrationProfile } from '@/types';
import SQLIntegrationProfiles from './SQLIntegrationProfiles';
import SQLProfileModal from './SQLProfileModal';
import { sqlProfilesService } from '../services/sqlProfilesService';

interface SQLIntegrationManagerProps {
  companyId: string;
  companyName: string;
  userId: string;
}

export default function SQLIntegrationManager({
  companyId,
  companyName,
  userId
}: SQLIntegrationManagerProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<SQLIntegrationProfile | undefined>(undefined);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleCreateProfile = () => {
    setEditingProfile(undefined);
    setShowModal(true);
  };

  const handleEditProfile = (profile: SQLIntegrationProfile) => {
    setEditingProfile(profile);
    setShowModal(true);
  };

  const handleSaveProfile = async (profile: SQLIntegrationProfile) => {
    try {
      await sqlProfilesService.saveProfile(profile);
      setShowModal(false);
      setEditingProfile(undefined);
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Erro ao salvar perfil:', error);
      throw error;
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingProfile(undefined);
  };

  return (
    <>
      <SQLIntegrationProfiles
        key={refreshTrigger}
        companyId={companyId}
        companyName={companyName}
        userId={userId}
        onCreateProfile={handleCreateProfile}
        onEditProfile={handleEditProfile}
      />

      <SQLProfileModal
        isOpen={showModal}
        onClose={handleCloseModal}
        onSave={handleSaveProfile}
        profile={editingProfile}
        companyId={companyId}
        companyName={companyName}
        userId={userId}
      />
    </>
  );
}
