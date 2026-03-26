'use client';

import React, { useState, useEffect } from 'react';
import {
  Plus, Building, Users, ChevronRight, Eye, EyeOff,
  UserPlus, Edit, Trash2, KeyRound, History, Star
} from 'lucide-react';
import Modal from '@/components/Modal';
import styles from '../../styles/UsersSimple.module.css';
import modalStyles from '../../styles/Modal.module.css';
import { db } from '../../../firebase/config';
import {
  collection, addDoc, onSnapshot, query, where, doc, updateDoc, deleteDoc, getDoc, getDocs, serverTimestamp
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../../firebase/config';
import { dualSave } from '@/services/dualSaveService';

// --- Tipos de Dados ---
interface Company { id: string; name: string; }
interface Department { id: string; name: string; companyId?: string; }
interface AppUser { id: string; name: string; email: string; role: string; }
interface Collaborator {
  id: string;
  username: string;
  canViewHistory?: boolean;
  canEditHistory?: boolean;
  isLeader?: boolean;
  permissions?: {
    canViewHistory?: boolean;
    canEditHistory?: boolean;
    canDeleteForms?: boolean;
    canManageUsers?: boolean;
    canDeleteResponses?: boolean;
  };
}
type ModalType = 'company' | 'department' | 'collaborator' | 'adminUser' | 'editCollaborator';

export default function UsersPage() {
  // --- Estados ---
  const [view, setView] = useState<'overview' | 'departments' | 'collaborators'>('overview');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [adminUsers, setAdminUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<ModalType | null>(null);
  const [formState, setFormState] = useState({
    companyName: '',
    departmentName: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    adminPasswordConfirm: '',
    collabUsername: '',
    collabEmail: '',
    collabName: '',
    collabPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');

  // --- NOVOS estados para edição de nome ---
  const [editingTarget, setEditingTarget] = useState<Collaborator | null>(null);
  const [editingName, setEditingName] = useState('');

  // --- Efeitos ---
  useEffect(() => {
    setLoading(true);
    const qCompanies = onSnapshot(query(collection(db, "companies")), (snapshot) => {
      setCompanies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company)));
      setLoading(false);
    });
    const qAdminUsers = onSnapshot(query(collection(db, "admins"), where("role", "==", "Admin")), (snapshot) => {
      setAdminUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser)));
    });
    return () => { qCompanies(); qAdminUsers(); };
  }, []);

  useEffect(() => {
    if (!selectedCompany) { setDepartments([]); return; }
    const unsub = onSnapshot(
      query(collection(db, `companies/${selectedCompany.id}/departments`)),
      (snapshot) => setDepartments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department)))
    );
    return () => unsub();
  }, [selectedCompany]);

  useEffect(() => {
    if (!selectedDepartment) { setCollaborators([]); return; }
    const unsub = onSnapshot(
      query(collection(db, "collaborators"), where("department", "==", selectedDepartment.name)),
      (snapshot) => setCollaborators(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Collaborator)))
    );
    return () => unsub();
  }, [selectedDepartment]);

  // --- Funções da UI ---
  const handleSelectCompany = (company: Company) => { setSelectedCompany(company); setView('departments'); };
  const handleSelectDepartment = (department: Department) => { setSelectedDepartment(department); setView('collaborators'); };
  const resetView = () => { setView('overview'); setSelectedCompany(null); setSelectedDepartment(null); };

  const openModal = (type: ModalType) => {
    setModalContent(type);
    setModalOpen(true);
    setFormError('');
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalContent(null);
    setFormState({
      companyName: '',
      departmentName: '',
      adminName: '',
      adminEmail: '',
      adminPassword: '',
      adminPasswordConfirm: '',
      collabUsername: '',
      collabEmail: '',
      collabName: '',
      collabPassword: '',
    });
    setEditingTarget(null);
    setEditingName('');
    setFormError('');
  };

  // --- CRUD ---
  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.companyName) return;
    const docRef = await addDoc(collection(db, "companies"), { name: formState.companyName });
    await updateDoc(docRef, { id: docRef.id });
    closeModal();
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.departmentName || !selectedCompany) return;
    const docRef = await addDoc(collection(db, `companies/${selectedCompany.id}/departments`), { name: formState.departmentName });
    await updateDoc(docRef, { id: docRef.id });
    closeModal();
  };

  const handleAddAdminUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (formState.adminPassword !== formState.adminPasswordConfirm) {
      setFormError('As senhas não coincidem.');
      return;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formState.adminEmail, formState.adminPassword);
      await addDoc(collection(db, "admins"), {
        uid: userCredential.user.uid,
        name: formState.adminName,
        email: formState.adminEmail,
        role: 'Admin'
      });
      closeModal();
    } catch (error: any) {
      if (error.code === 'auth/weak-password') setFormError('A senha deve ter pelo menos 6 caracteres.');
      else if (error.code === 'auth/email-already-in-use') setFormError('Este e-mail já está em uso.');
      else setFormError('Erro ao criar usuário.');
    }
  };

  // criar colaborador diretamente com Firebase Auth e Firestore
  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formState.collabUsername.trim() || !formState.collabPassword.trim() || !selectedCompany || !selectedDepartment) {
      setFormError("Nome de usuário, senha, empresa e setor são obrigatórios.");
      return;
    }

    try {
      // Verificar se já existe um colaborador com este username
      const existingCollabQuery = query(
        collection(db, "collaborators"),
        where("username", "==", formState.collabUsername.trim())
      );
      const existingCollabSnapshot = await getDocs(existingCollabQuery);
      
      if (!existingCollabSnapshot.empty) {
        setFormError(`Já existe um colaborador com o username "${formState.collabUsername}". Por favor, escolha outro nome de usuário.`);
        return;
      }

      const email = formState.collabEmail || `${formState.collabUsername.toLowerCase()}@bravoform.com`;
      
      // Criar usuário no Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, formState.collabPassword);
      
      // Salvar dados do colaborador no Firestore
      const docRef = await addDoc(collection(db, "collaborators"), {
        uid: userCredential.user.uid,
        username: formState.collabUsername,
        email: email,
        name: formState.collabName || formState.collabUsername,
        department: selectedDepartment.name,
        role: 'collaborator',
        permissions: {
          canViewHistory: false,
          canEditHistory: false,
          canManageUsers: false,
          canDeleteResponses: false
        },
        active: true,
        createdAt: serverTimestamp(),
        lastLogin: null
      });

      // Sincronizar com PostgreSQL
      dualSave.saveCollaborator({
        collaboratorId: docRef.id,
        uid: userCredential.user.uid,
        username: formState.collabUsername,
        name: formState.collabName || formState.collabUsername,
        email: email,
        role: 'collaborator',
        active: true,
        companyId: selectedDepartment.companyId,
        departmentId: selectedDepartment.id,
        departmentName: selectedDepartment.name,
        isTemporaryPassword: true,
        permissions: {
          canViewHistory: false,
          canEditHistory: false,
          canManageUsers: false,
          canDeleteResponses: false
        }
      });
      
      console.log('Collaborator created successfully:', userCredential.user.uid);
      closeModal();
    } catch (error: any) {
      console.error("Erro ao criar acesso de colaborador:", error);
      if (error.code === 'auth/weak-password') {
        setFormError('A senha deve ter pelo menos 6 caracteres.');
      } else if (error.code === 'auth/email-already-in-use') {
        setFormError('Este e-mail já está em uso.');
      } else if (error.code === 'auth/invalid-email') {
        setFormError('E-mail inválido.');
      } else {
        setFormError("Erro ao criar o acesso: " + (error.message || "Erro desconhecido"));
      }
    }
  };

  // --- NOVAS FUNÇÕES: permissões e líder ---
  const handleTogglePermission = async (collaborator: Collaborator, permission: 'canViewHistory' | 'canEditHistory' | 'canDeleteResponses') => {
    if (!selectedDepartment) return;
    const collaboratorRef = doc(db, "collaborators", collaborator.id);
    try {
      const currentValue = collaborator.permissions?.[permission] || false;
      await updateDoc(collaboratorRef, { 
        [`permissions.${permission}`]: !currentValue 
      });
      console.log(`✅ Permissão ${permission} atualizada para:`, !currentValue);
    } catch (error) {
      console.error("Erro ao atualizar permissão:", error);
    }
  };

  const handleDeleteCollaborator = async (collaboratorId: string) => {
    if (!selectedDepartment) return;
    
    if (confirm('Tem certeza que deseja excluir este colaborador? Esta ação não pode ser desfeita.')) {
      try {
        // 1. Excluir da coleção raiz
        const collaboratorRef = doc(db, "collaborators", collaboratorId);
        await deleteDoc(collaboratorRef);
        console.log('Documento excluído da coleção raiz');
        
        // 2. Excluir da subcoleção do departamento
        const deptCollabRef = doc(db, `departments/${selectedDepartment.id}/collaborators`, collaboratorId);
        await deleteDoc(deptCollabRef);
        console.log('Documento excluído da subcoleção do departamento');
        
        console.log('Colaborador excluído do Firestore');
        alert('Colaborador excluído com sucesso! Para excluir completamente do Firebase Authentication, use o console do Firebase.');
        
      } catch (error) {
        console.error("Erro ao excluir colaborador:", error);
        alert('Erro ao excluir colaborador. Tente novamente.');
      }
    }
  };

  const handleToggleLeader = async (collaborator: Collaborator) => {
    if (!selectedDepartment) return;
    const collaboratorRef = doc(db, "collaborators", collaborator.id);
    try {
      const currentValue = collaborator.permissions?.canManageUsers || false;
      const newLeaderValue = !currentValue;
      
      // Se está ativando líder, ativa automaticamente Ver, Editar e Excluir
      if (newLeaderValue) {
        await updateDoc(collaboratorRef, { 
          'permissions.canManageUsers': true,
          'permissions.canViewHistory': true,
          'permissions.canEditHistory': true,
          'permissions.canDeleteResponses': true
        });
        console.log(`✅ Líder ativado - Permissões Ver, Editar e Excluir ativadas automaticamente`);
      } else {
        // Se está desativando líder, apenas remove a permissão de líder
        await updateDoc(collaboratorRef, { 
          'permissions.canManageUsers': false
        });
        console.log(`✅ Líder desativado`);
      }
    } catch (error) {
      console.error("Erro ao atualizar líder:", error);
    }
  };

  // --- NOVAS FUNÇÕES: edição de nome ---
  const openEditCollaborator = (collab: Collaborator) => {
    setEditingTarget(collab);
    setEditingName(collab.username || '');
    openModal('editCollaborator');
  };

  const handleSaveCollaboratorName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDepartment || !editingTarget) return;
    
    setFormError('');
    
    try {
      // Verificar se o username mudou
      if (editingName.trim() !== editingTarget.username) {
        // Verificar se já existe outro colaborador com este username
        const existingCollabQuery = query(
          collection(db, "collaborators"),
          where("username", "==", editingName.trim())
        );
        const existingCollabSnapshot = await getDocs(existingCollabQuery);
        
        if (!existingCollabSnapshot.empty) {
          setFormError(`Já existe um colaborador com o username "${editingName.trim()}". Por favor, escolha outro nome de usuário.`);
          return;
        }
      }
      
      const ref = doc(db, "collaborators", editingTarget.id);
      await updateDoc(ref, { username: editingName.trim() });
      closeModal();
    } catch (err) {
      console.error('Erro ao salvar nome do colaborador:', err);
      setFormError('Não foi possível salvar o novo nome.');
    }
  };

  // --- Render ---
  const sortedCollaborators = [...collaborators].sort((a, b) => {
    const la = !!a.isLeader ? 1 : 0;
    const lb = !!b.isLeader ? 1 : 0;
    if (lb !== la) return lb - la;
    return (a.username || '').localeCompare(b.username || '');
  });

  const renderContent = () => {
    try {
      switch (view) {
        case 'collaborators':
          console.log('📍 Rendering collaborators, count:', sortedCollaborators.length);
          return (
            <div className={styles.frame}>
            <div className={styles.frameHeader}>
              <h3 className={styles.frameTitle}>Acesso dos Colaboradores</h3>
              <button onClick={() => openModal('collaborator')} className={styles.button}>
                <KeyRound size={16} /><span>Criar Acesso</span>
              </button>
            </div>

            <div className={styles.list}>
              {sortedCollaborators.length > 0 ? sortedCollaborators.map(c => {
                console.log('📍 Rendering collaborator:', c.username, c.id);
                return (
                <div key={c.id} className={styles.itemCard} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <h4
                    className={styles.itemName}
                    style={{
                      textAlign: 'center',
                      marginBottom: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8
                    }}
                  >
                    {c.username}

                    {c.permissions?.canManageUsers && (
                      <span className={styles.leaderBadge}>
                        <Star size={14} fill="currentColor" />
                        Líder
                      </span>
                    )}

                    {/* Botão editar nome */}
                    <button
                      type="button"
                      onClick={() => openEditCollaborator(c)}
                      title="Editar nome"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'inherit',
                        cursor: 'pointer',
                        padding: 4,
                        lineHeight: 0,
                      }}
                    >
                      <Edit size={16} />
                    </button>
                  </h4>

                  <div className={styles.permissionsGrid}>
                    <div className={`${styles.permissionItem} ${c.permissions?.canManageUsers ? styles.lockedByLeader : ''}`}>
                      <span>Ver Histórico</span>
                      <label className={styles.switch}>
                        <input
                          id={`history-toggle-${c.id}`}
                          type="checkbox"
                          checked={!!c.permissions?.canViewHistory}
                          onChange={() => handleTogglePermission(c, 'canViewHistory')}
                          disabled={!!c.permissions?.canManageUsers}
                        />
                        <span className={styles.slider}></span>
                      </label>
                    </div>
                    <div className={`${styles.permissionItem} ${c.permissions?.canManageUsers ? styles.lockedByLeader : ''}`}>
                      <span>Editar Histórico</span>
                      <label className={styles.switch}>
                        <input
                          id={`edit-toggle-${c.id}`}
                          type="checkbox"
                          checked={!!c.permissions?.canEditHistory}
                          onChange={() => handleTogglePermission(c, 'canEditHistory')}
                          disabled={!!c.permissions?.canManageUsers}
                        />
                        <span className={styles.slider}></span>
                      </label>
                    </div>
                    <div className={`${styles.permissionItem} ${c.permissions?.canManageUsers ? styles.lockedByLeader : ''}`}>
                      <span>Excluir Respostas</span>
                      <label className={styles.switch}>
                        <input
                          id={`delete-toggle-${c.id}`}
                          type="checkbox"
                          checked={!!c.permissions?.canDeleteResponses}
                          onChange={() => handleTogglePermission(c, 'canDeleteResponses')}
                          disabled={!!c.permissions?.canManageUsers}
                        />
                        <span className={styles.slider}></span>
                      </label>
                    </div>
                    <div className={styles.permissionItem}>
                      <span>Líder</span>
                      <label className={styles.switch}>
                        <input
                          id={`leader-toggle-${c.id}`}
                          type="checkbox"
                          checked={!!c.permissions?.canManageUsers}
                          onChange={() => handleToggleLeader(c)}
                        />
                        <span className={styles.slider}></span>
                      </label>
                    </div>
                  </div>

                  <div className={styles.cardActions}>
                    <button
                      onClick={() => handleDeleteCollaborator(c.id)}
                      className={styles.deleteButton}
                    >
                      <Trash2 size={16} /> Excluir
                    </button>
                  </div>
                </div>
              );
              }) : (
                <p className={styles.emptyState}>Nenhum acesso criado para este setor.</p>
              )}
            </div>
          </div>
        );

      case 'departments':
        return (
          <div className={styles.frame}>
            <div className={styles.frameHeader}>
              <h3 className={styles.frameTitle}>Setores</h3>
              <button onClick={() => openModal('department')} className={styles.button}>
                <Plus size={16} /><span>Novo Setor</span>
              </button>
            </div>
            <div className={styles.list}>
              {departments.length > 0 ? departments.map(d => (
                <div
                  key={d.id}
                  className={`${styles.itemCard} ${styles.itemCardClickable}`}
                  onClick={() => handleSelectDepartment(d)}
                >
                  <h4 className={styles.itemName}>{d.name}</h4>
                  <Users size={20} />
                </div>
              )) : <p className={styles.emptyState}>Nenhum setor criado para esta empresa.</p>}
            </div>
          </div>
        );

      default:
        return (
          <>
            <div className={styles.frame}>
              <div className={styles.frameHeader}>
                <h3 className={styles.frameTitle}>Administração</h3>
                <button onClick={() => openModal('adminUser')} className={styles.button}>
                  <UserPlus size={16} /><span>Novo Admin</span>
                </button>
              </div>
              {loading ? <p className={styles.emptyState}>Carregando...</p> :
                adminUsers.length > 0 ? adminUsers.map(user => (
                  <div key={user.id} className={styles.itemCard}>
                    <div>
                      <h4 className={styles.itemName}>{user.name}</h4>
                      <p className={styles.itemInfo}>{user.email}</p>
                    </div>
                    <span className={styles.permissionTag}>Admin</span>
                  </div>
                )) : <p className={styles.emptyState}>Nenhum administrador criado.</p>}
            </div>

            <div className={styles.frame}>
              <div className={styles.frameHeader}>
                <h3 className={styles.frameTitle}>Empresas</h3>
                <button onClick={() => openModal('company')} className={styles.button}>
                  <Plus size={16} /><span>Nova Empresa</span>
                </button>
              </div>
              {loading ? <p className={styles.emptyState}>Carregando...</p> :
                companies.length > 0 ? companies.map(c => (
                  <div
                    key={c.id}
                    className={`${styles.itemCard} ${styles.itemCardClickable}`}
                    onClick={() => handleSelectCompany(c)}
                  >
                    <h4 className={styles.itemName}>{c.name}</h4>
                    <Building size={20} />
                  </div>
                )) : <p className={styles.emptyState}>Nenhuma empresa criada.</p>}
            </div>
          </>
        );
      }
    } catch (error) {
      console.error('❌ Error in renderContent:', error);
      return <div style={{padding: '20px', color: 'red'}}>Erro ao renderizar conteúdo: {String(error)}</div>;
    }
  };

  return (
    <>
      <div>
        <div className={styles.pageHeader}>
          <h2 className={styles.title}>Departamentos & Usuários</h2>
        </div>

        {view !== 'overview' && (
          <div className={styles.breadcrumb}>
            <span onClick={resetView}>Empresas</span>
            {selectedCompany && <>
              <ChevronRight size={16} />
              <span onClick={() => { setView('departments'); setSelectedDepartment(null); }}>
                {selectedCompany.name}
              </span>
            </>}
            {selectedDepartment && <>
              <ChevronRight size={16} />
              <span className={styles.active}>{selectedDepartment.name}</span>
            </>}
          </div>
        )}

        {renderContent()}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={
          modalContent === 'company' ? 'Nova Empresa' :
          modalContent === 'department' ? 'Novo Setor' :
          modalContent === 'adminUser' ? 'Novo Administrador' :
          modalContent === 'collaborator' ? 'Criar Acesso de Colaborador' :
          'Editar Nome do Colaborador'
        }
      >
        {/* company */}
        {modalContent === 'company' && (
          <form onSubmit={handleAddCompany}>
            <div className={modalStyles.panelBody}>
              <div className={modalStyles.formGroup}>
                <label className={modalStyles.label}>Nome da Empresa</label>
                <input
                  value={formState.companyName}
                  onChange={e => setFormState({ ...formState, companyName: e.target.value })}
                  className={modalStyles.input}
                  required
                />
              </div>
            </div>
            <div className={modalStyles.buttonContainer}>
              <button type="button" onClick={closeModal} className={modalStyles.button + ' ' + modalStyles.buttonSecondary}>Cancelar</button>
              <button type="submit" className={modalStyles.button + ' ' + modalStyles.buttonPrimary}>Salvar</button>
            </div>
          </form>
        )}

        {/* department */}
        {modalContent === 'department' && (
          <form onSubmit={handleAddDepartment}>
            <div className={modalStyles.panelBody}>
              <div className={modalStyles.formGroup}>
                <label className={modalStyles.label}>Nome do Setor</label>
                <input
                  value={formState.departmentName}
                  onChange={e => setFormState({ ...formState, departmentName: e.target.value })}
                  className={modalStyles.input}
                  required
                />
              </div>
            </div>
            <div className={modalStyles.buttonContainer}>
              <button type="button" onClick={closeModal} className={modalStyles.button + ' ' + modalStyles.buttonSecondary}>Cancelar</button>
              <button type="submit" className={modalStyles.button + ' ' + modalStyles.buttonPrimary}>Salvar</button>
            </div>
          </form>
        )}

        {/* admin */}
        {modalContent === 'adminUser' && (
          <form onSubmit={handleAddAdminUser}>
            <div className={modalStyles.panelBody}>
              <div className={modalStyles.form}>
                <div className={modalStyles.formGroup}>
                  <label className={modalStyles.label}>Nome</label>
                  <input
                    value={formState.adminName}
                    onChange={e => setFormState({ ...formState, adminName: e.target.value })}
                    className={modalStyles.input}
                    required
                  />
                </div>

                <div className={modalStyles.formGroup}>
                  <label className={modalStyles.label}>Email de Acesso</label>
                  <input
                    type="email"
                    value={formState.adminEmail}
                    onChange={e => setFormState({ ...formState, adminEmail: e.target.value })}
                    className={modalStyles.input}
                    required
                  />
                </div>

                <div className={modalStyles.formGroup}>
                  <label className={modalStyles.label}>Senha</label>
                  <div className={modalStyles.passwordWrapper}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formState.adminPassword}
                      onChange={e => setFormState({ ...formState, adminPassword: e.target.value })}
                      className={modalStyles.input}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={modalStyles.eyeButton}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className={modalStyles.formGroup}>
                  <label className={modalStyles.label}>Confirmar Senha</label>
                  <div className={modalStyles.passwordWrapper}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formState.adminPasswordConfirm}
                      onChange={e => setFormState({ ...formState, adminPasswordConfirm: e.target.value })}
                      className={modalStyles.input}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={modalStyles.eyeButton}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {formError && <p className={modalStyles.error}>{formError}</p>}
              </div>
            </div>

            <div className={modalStyles.buttonContainer}>
              <button type="button" onClick={closeModal} className={modalStyles.button + ' ' + modalStyles.buttonSecondary}>Cancelar</button>
              <button type="submit" className={modalStyles.button + ' ' + modalStyles.buttonPrimary}>Salvar Admin</button>
            </div>
          </form>
        )}

        {/* criar colaborador */}
        {modalContent === 'collaborator' && (
          <form onSubmit={handleAddCollaborator}>
            <div className={modalStyles.panelBody}>
              <div className={modalStyles.form}>
                <div className={modalStyles.formGroup}>
                  <label className={modalStyles.label}>Nome de Usuário</label>
                  <input
                    value={formState.collabUsername}
                    onChange={e => setFormState({ ...formState, collabUsername: e.target.value })}
                    className={modalStyles.input}
                    required
                  />
                </div>

                <div className={modalStyles.formGroup}>
                  <label className={modalStyles.label}>Email</label>
                  <input
                    type="email"
                    value={formState.collabEmail}
                    onChange={e => setFormState({ ...formState, collabEmail: e.target.value })}
                    className={modalStyles.input}
                    placeholder="email@empresa.com"
                    required
                  />
                </div>

                <div className={modalStyles.formGroup}>
                  <label className={modalStyles.label}>Senha</label>
                  <div className={modalStyles.passwordWrapper}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formState.collabPassword}
                      onChange={e => setFormState({ ...formState, collabPassword: e.target.value })}
                      className={modalStyles.input}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={modalStyles.eyeButton}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {formError && <p className={modalStyles.error}>{formError}</p>}
              </div>
            </div>

            <div className={modalStyles.buttonContainer}>
              <button type="button" onClick={closeModal} className={`${modalStyles.button} ${modalStyles.buttonSecondary}`}>Cancelar</button>
              <button type="submit" className={`${modalStyles.button} ${modalStyles.buttonPrimary}`}>Salvar Acesso</button>
            </div>
          </form>
        )}

        {/* EDITAR NOME DO COLABORADOR */}
        {modalContent === 'editCollaborator' && (
          <form onSubmit={handleSaveCollaboratorName}>
            <div className={modalStyles.panelBody}>
              <div className={modalStyles.formGroup}>
                <label className={modalStyles.label}>Novo nome de usuário</label>
                <input
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  className={modalStyles.input}
                  required
                />
              </div>
              {formError && <p className={modalStyles.error}>{formError}</p>}
            </div>
            <div className={modalStyles.buttonContainer}>
              <button type="button" onClick={closeModal} className={`${modalStyles.button} ${modalStyles.buttonSecondary}`}>Cancelar</button>
              <button type="submit" className={`${modalStyles.button} ${modalStyles.buttonPrimary}`}>Salvar</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
