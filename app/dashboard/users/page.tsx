'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/Modal';
import { db, auth } from '../../../firebase/config';
import { collection, addDoc, onSnapshot, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, AuthError } from 'firebase/auth';

interface AppUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

type UserRole = 'Admin' | 'Editor' | 'Visualizador';
type ModalType = 'company' | 'department' | 'user' | 'adminUser';

export default function UsersPage() {
  const [isModalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<ModalType | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  const [formState, setFormState] = useState({
    companyName: '',
    departmentName: '',
    userName: '',
    userEmail: '',
    userPassword: '',
    userPasswordConfirm: '',
    userRole: 'Visualizador' as UserRole,
  });
  const [formError, setFormError] = useState('');

  const closeModal = () => {
    setModalOpen(false);
    setEditingUser(null);
    setFormState({
      companyName: '',
      departmentName: '',
      userName: '',
      userEmail: '',
      userPassword: '',
      userPasswordConfirm: '',
      userRole: 'Visualizador'
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    try {
      switch (modalContent) {
        case 'company':
          if (formState.companyName.trim()) {
            await addDoc(collection(db, "companies"), { name: formState.companyName });
          }
          break;
        case 'adminUser':
        case 'user':
          if (modalMode === 'create' && formState.userPassword !== formState.userPasswordConfirm) {
            return setFormError('As senhas não coincidem.');
          }

          if (modalMode === 'create') {
            const userCredential = await createUserWithEmailAndPassword(auth, formState.userEmail, formState.userPassword);
            await addDoc(collection(db, "users"), {
              uid: userCredential.user.uid,
              name: formState.userName,
              email: formState.userEmail,
              role: modalContent === 'adminUser' ? 'Admin' : formState.userRole,
              companyId: null,
              departmentId: null,
            });
          } else if (modalMode === 'edit' && editingUser) {
            const userRef = doc(db, "users", editingUser.id);
            await updateDoc(userRef, {
              name: formState.userName,
              role: formState.userRole,
            });
          }
          break;
      }
      closeModal();
    } catch (error) {
      const authError = error as AuthError;
      if (authError.code === 'auth/weak-password') setFormError('A senha deve ter pelo menos 6 caracteres.');
      else if (authError.code === 'auth/email-already-in-use') setFormError('Este e-mail já está em uso.');
      else setFormError('Erro ao salvar.');
    }
  };

  return (
    <>
      <div>
        {/* Coloque aqui o conteúdo da página */}
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title="Novo usuário">
        <form onSubmit={handleFormSubmit}>
          {/* Campos do formulário */}
        </form>
      </Modal>
    </>
  );
}
