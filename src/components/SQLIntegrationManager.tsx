'use client';

import React, { useState } from 'react';
import SQLIntegrationProfiles from './SQLIntegrationProfiles';
import SQLProfileModal from './SQLProfileModal';
import type { SQLIntegrationProfile } from '@/types';

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<SQLIntegrationProfile | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCreateProfile = () => {
    setEditingProfile(undefined);
    setIsModalOpen(true);
  };

  const handleEditProfile = (profile: SQLIntegrationProfile) => {
    setEditingProfile(profile);
    setIsModalOpen(true);
  };

  const handleSaveProfile = async (profile: SQLIntegrationProfile) => {
    // A lógica de salvar já está no SQLProfileModal
    setRefreshKey(prev => prev + 1); // Força atualização da lista
    setIsModalOpen(false);
    setEditingProfile(undefined);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProfile(undefined);
  };

  return (
    <div style={{ padding: '24px' }}>
      <SQLIntegrationProfiles
        key={refreshKey}
        companyId={companyId}
        companyName={companyName}
        userId={userId}
        onCreateProfile={handleCreateProfile}
        onEditProfile={handleEditProfile}
      />

      <SQLProfileModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveProfile}
        profile={editingProfile}
        companyId={companyId}
        companyName={companyName}
        userId={userId}
      />
    </div>
  );
}
