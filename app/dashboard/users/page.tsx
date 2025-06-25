'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Building, Users, ChevronRight, Eye, EyeOff, UserPlus, Edit, Trash2 } from 'lucide-react';
import Modal from '@/components/Modal'; 
import styles from '../../styles/Users.module.css';
import modalStyles from '../../styles/Modal.module.css';
import { db, auth } from '../../../firebase/config';
import { collection, addDoc, onSnapshot, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore'; 
import { createUserWithEmailAndPassword, AuthError } from 'firebase/auth'; 

// --- Tipos de Dados ---
interface Company { id: string; name: string; }
interface Department { id: string; name: string; }
interface AppUser { id: string; name: string; email: string; role: string; }
type UserRole = 'Admin' | 'Editor' | 'Visualizador';
type ModalType = 'company' | 'department' | 'user' | 'adminUser';

export default function UsersPage() {
    // --- Estados de Navegação e Dados ---
    const [view, setView] = useState<'overview' | 'departments' | 'users'>('overview');
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
    
    const [companies, setCompanies] = useState<Company[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [adminUsers, setAdminUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState({ companies: true, admins: true, departments: false, users: false });

    // --- Estados dos Modais ---
    const [isModalOpen, setModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState<ModalType | null>(null);
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
    const [editingUser, setEditingUser] = useState<AppUser | null>(null);
    
    // --- Estados dos Formulários ---
    const [formState, setFormState] = useState({
        companyName: '',
        departmentName: '',
        userName: '',
        userEmail: '',
        userPassword: '',
        userPasswordConfirm: '',
        userRole: 'Visualizador' as UserRole,
    });
    const [showPassword, setShowPassword] = useState(false);
    const [formError, setFormError] = useState('');

    // --- Efeitos para buscar dados do Firestore ---
    useEffect(() => {
        const qCompanies = onSnapshot(query(collection(db, "companies")), (snapshot) => {
            setCompanies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company)));
            setLoading(prev => ({ ...prev, companies: false }));
        });
        const qAdminUsers = onSnapshot(query(collection(db, "users"), where("role", "==", "Admin")), (snapshot) => {
            setAdminUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser)));
            setLoading(prev => ({ ...prev, admins: false }));
        });
        return () => { qCompanies(); qAdminUsers(); };
    }, []);

    useEffect(() => {
        if (!selectedCompany) { setDepartments([]); return; }
        const q = onSnapshot(query(collection(db, `companies/${selectedCompany.id}/departments`)), (snapshot) => {
            setDepartments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department)));
        });
        return () => q();
    }, [selectedCompany]);

    useEffect(() => {
        if (!selectedDepartment) { setUsers([]); return; }
        const q = onSnapshot(query(collection(db, "users"), where("departmentId", "==", selectedDepartment.id)), (snapshot) => {
            setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser)));
        });
        return () => q();
    }, [selectedDepartment]);


    // --- Funções da UI ---
    const handleSelectCompany = (company: Company) => { setSelectedCompany(company); setView('departments'); };
    const handleSelectDepartment = (department: Department) => { setSelectedDepartment(department); setView('users'); };
    const resetView = () => { setView('overview'); setSelectedCompany(null); setSelectedDepartment(null); };
    
    const openModal = (type: ModalType, mode: 'create' | 'edit' = 'create', userToEdit?: AppUser) => {
        setModalContent(type);
        setModalMode(mode);
        setFormError('');
        if (mode === 'edit' && userToEdit) {
            setEditingUser(userToEdit);
            setFormState({
                ...formState,
                userName: userToEdit.name,
                userEmail: userToEdit.email,
                userRole: userToEdit.role as UserRole,
            });
        }
        setModalOpen(true);
    };
    
    const closeModal = () => {
        setModalOpen(false);
        setEditingUser(null);
        setFormState({ companyName: '', departmentName: '', userName: '', userEmail: '', userPassword: '', userPasswordConfirm: '', userRole: 'Visualizador' });
    };

    // --- Funções CRUD ---
    //const handleAddCompany = async (e: React.FormEvent) => { e.preventDefault(); if (!formState.companyName.trim()) return; await addDoc(collection(db, "companies"), { name: formState.companyName }); closeModal(); };
    //const handleAddDepartment = async (e: React.FormEvent) => { e.preventDefault(); if (!formState.departmentName.trim() || !selectedCompany) return; await addDoc(collection(db, `companies/${selectedCompany.id}/departments`), { name: formState.departmentName }); closeModal(); };
    
    const handleUserSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (modalMode === 'create' && (formState.userPassword !== formState.userPasswordConfirm)) return setFormError('As senhas não coincidem.');

        try {
            if (modalMode === 'create') {
                const userCredential = await createUserWithEmailAndPassword(auth, formState.userEmail, formState.userPassword);
                await addDoc(collection(db, "users"), {
                    uid: userCredential.user.uid, name: formState.userName, email: formState.userEmail, 
                    role: modalContent === 'adminUser' ? 'Admin' : formState.userRole,
                    companyId: modalContent === 'adminUser' ? null : selectedCompany?.id,
                    departmentId: modalContent === 'adminUser' ? null : selectedDepartment?.id,
                });
            } else if (modalMode === 'edit' && editingUser) {
                const userRef = doc(db, "users", editingUser.id);
                await updateDoc(userRef, { name: formState.userName, role: formState.userRole });
            }
            closeModal();
        } catch (error) {
            const authError = error as AuthError;
            if (authError.code === 'auth/weak-password') setFormError('A senha deve ter pelo menos 6 caracteres.');
            else if (authError.code === 'auth/email-already-in-use') setFormError('Este e-mail já está em uso.');
            else setFormError('Erro ao salvar usuário.');
        }
    };
    
    const handleDeleteUser = async (userId: string) => {
        if (window.confirm("Tem certeza que deseja apagar este usuário? Esta ação não pode ser desfeita.")) {
            await deleteDoc(doc(db, "users", userId));
        }
    };
    
    const renderContent = () => {
        switch(view) {
            case 'departments':
                return (
                    <div className={styles.frame}>
                        <div className={styles.frameHeader}><h3 className={styles.frameTitle}>Setores</h3><button onClick={() => openModal('department')} className={styles.button}><Plus size={16}/><span>Novo Setor</span></button></div>
                        {loading.departments ? <p className={styles.emptyState}>Carregando...</p> : departments.length > 0 ? departments.map(d => (
                            <div key={d.id} className={`${styles.itemCard} ${styles.itemCardClickable}`} onClick={() => handleSelectDepartment(d)}><h4 className={styles.itemName}>{d.name}</h4><Users size={20}/></div>
                        )) : <p className={styles.emptyState}>Nenhum setor criado.</p>}
                    </div>
                );
            case 'users':
                return (
                    <div className={styles.frame}>
                        <div className={styles.frameHeader}><h3 className={styles.frameTitle}>Acesso de Colaboradores</h3><button onClick={() => openModal('user', 'create')} className={styles.button}><UserPlus size={16}/><span>Criar Acesso</span></button></div>
                        {loading.users ? <p className={styles.emptyState}>Carregando...</p> : users.length > 0 ? users.map(u => (
                            <div key={u.id} className={styles.itemCard}>
                                <div><h4 className={styles.itemName}>{u.name}</h4><p className={styles.itemInfo}>{u.email}</p></div>
                                <div className={styles.userActions}>
                                    <span className={styles.permissionTag}>{u.role}</span>
                                    <button onClick={() => openModal('user', 'edit', u)} className={styles.actionButton} title="Editar"><Edit size={16}/></button>
                                    <button onClick={() => handleDeleteUser(u.id)} className={`${styles.actionButton} ${styles.deleteButton}`} title="Apagar"><Trash2 size={16}/></button>
                                </div>
                            </div>
                        )) : <p className={styles.emptyState}>Nenhum acesso criado.</p>}
                    </div>
                );
            case 'overview':
            default:
                return (
                    <>
                        <div className={styles.frame}>
                            <div className={styles.frameHeader}><h3 className={styles.frameTitle}>Administração</h3><button onClick={() => openModal('adminUser', 'create')} className={styles.button}><UserPlus size={16}/><span>Novo Admin</span></button></div>
                            {loading.admins ? <p className={styles.emptyState}>Carregando...</p> : adminUsers.length > 0 ? adminUsers.map(user => (
                                <div key={user.id} className={styles.itemCard}>
                                    <div><h4 className={styles.itemName}>{user.name}</h4><p className={styles.itemInfo}>{user.email}</p></div>
                                    <div className={styles.userActions}>
                                        <span className={styles.permissionTag}>Admin</span>
                                        <button onClick={() => openModal('adminUser', 'edit', user)} className={styles.actionButton} title="Editar"><Edit size={16}/></button>
                                        <button onClick={() => handleDeleteUser(user.id)} className={`${styles.actionButton} ${styles.deleteButton}`} title="Apagar"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                            )) : <p className={styles.emptyState}>Nenhum administrador criado.</p>}
                        </div>
                        <div className={styles.frame}>
                             <div className={styles.frameHeader}><h3 className={styles.frameTitle}>Empresas</h3><button onClick={() => openModal('company')} className={styles.button}><Plus size={16}/><span>Nova Empresa</span></button></div>
                            {loading.companies ? <p className={styles.emptyState}>Carregando...</p> : companies.length > 0 ? companies.map(c => (
                                <div key={c.id} className={`${styles.itemCard} ${styles.itemCardClickable}`} onClick={() => handleSelectCompany(c)}><h4 className={styles.itemName}>{c.name}</h4><Building size={20} /></div>
                            )) : <p className={styles.emptyState}>Nenhuma empresa criada.</p>}
                        </div>
                    </>
                );
        }
    };

    return (
        <>
            <div>
                <div className={styles.pageHeader}><h2 className={styles.title}>Departamentos & Usuários</h2></div>
                {view !== 'overview' && (
                    <div className={styles.breadcrumb}>
                        <span onClick={resetView}>Empresas</span>
                        {selectedCompany && <><ChevronRight size={16}/> <span onClick={() => { setView('departments'); setSelectedDepartment(null); }}>{selectedCompany.name}</span></>}
                        {selectedDepartment && <><ChevronRight size={16}/> <span className={styles.active}>{selectedDepartment.name}</span></>}
                    </div>
                )}
                {renderContent()}
            </div>

            <Modal isOpen={isModalOpen} onClose={closeModal} title={
                modalMode === 'edit' ? `Editar ${modalContent === 'adminUser' ? 'Admin' : 'Usuário'}` :
                'Novo ' + (modalContent === 'company' ? 'Empresa' : 'Usuário')
            }>
                 <form onSubmit={handleUserSubmit}>
                        <div className={modalStyles.panelBody}>
                            <div className={modalStyles.form}>
                                <div className={modalStyles.formGroup}><label className={modalStyles.label}>Nome Completo</label><input value={formState.userName} onChange={e => setFormState({...formState, userName: e.target.value})} className={modalStyles.input} required/></div>
                                <div className={modalStyles.formGroup}><label className={modalStyles.label}>Email de Acesso</label><input type="email" value={formState.userEmail} onChange={e => setFormState({...formState, userEmail: e.target.value})} className={modalStyles.input} disabled={modalMode === 'edit'} required/></div>
                                {modalMode === 'create' && (
                                    <>
                                        <div className={modalStyles.formGroup}><label className={modalStyles.label}>Senha</label><div className={modalStyles.passwordWrapper}><input type={showPassword ? 'text' : 'password'} value={formState.userPassword} onChange={e => setFormState({...formState, userPassword: e.target.value})} className={modalStyles.input} required/><button type="button" onClick={() => setShowPassword(!showPassword)} className={modalStyles.eyeButton}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div>
                                        <div className={modalStyles.formGroup}><label className={modalStyles.label}>Confirmar Senha</label><div className={modalStyles.passwordWrapper}><input type={showPassword ? 'text' : 'password'} value={formState.userPasswordConfirm} onChange={e => setFormState({...formState, userPasswordConfirm: e.target.value})} className={modalStyles.input} required/><button type="button" onClick={() => setShowPassword(!showPassword)} className={modalStyles.eyeButton}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div>
                                    </>
                                )}
                                {modalContent === 'user' && (
                                    <div className={modalStyles.formGroup}><label className={modalStyles.label}>Permissão</label><select value={formState.userRole} onChange={e => setFormState({...formState, userRole: e.target.value as UserRole})} className={modalStyles.input}><option value="Visualizador">Visualizador</option><option value="Editor">Editor</option></select></div>
                                )}
                                {formError && <p className={modalStyles.error}>{formError}</p>}
                            </div>
                        </div>
                        <div className={modalStyles.buttonContainer}><button type="button" onClick={closeModal} className={modalStyles.button + ' ' + modalStyles.buttonSecondary}>Cancelar</button><button type="submit" className={modalStyles.button + ' ' + modalStyles.buttonPrimary}>Salvar</button></div>
                    </form>
            </Modal>
        </>
    );
}
