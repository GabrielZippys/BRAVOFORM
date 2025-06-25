'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Building, Users, ChevronRight, Eye, EyeOff, UserPlus, Edit, Trash2 } from 'lucide-react';
import Modal from '@/components/Modal'; 
import styles from '../../styles/Users.module.css';
import modalStyles from '../../styles/Modal.module.css';
import { db, auth } from '../../../firebase/config';
import { collection, addDoc, onSnapshot, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore'; 
// Importando o tipo AuthError para o tratamento de erros
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
    const handleAddCompany = async (e: React.FormEvent) => { e.preventDefault(); if (!formState.companyName.trim()) return; await addDoc(collection(db, "companies"), { name: formState.companyName }); closeModal(); };
    const handleAddDepartment = async (e: React.FormEvent) => { e.preventDefault(); if (!formState.departmentName.trim() || !selectedCompany) return; await addDoc(collection(db, `companies/${selectedCompany.id}/departments`), { name: formState.departmentName }); closeModal(); };
    
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
    
    const renderContent = () => { /* ... (código de renderização permanece o mesmo) ... */ };

    return (
        <>
            <div>
                 {/* ... (JSX principal da página permanece o mesmo) ... */}
            </div>

            <Modal isOpen={isModalOpen} onClose={closeModal} title={
                modalMode === 'edit' ? `Editar ${modalContent === 'adminUser' ? 'Admin' : 'Usuário'}` :
                'Novo ' + (modalContent === 'company' ? 'Empresa' : modalContent === 'department' ? 'Setor' : 'Usuário')
            }>
                {/* CORREÇÃO: Restaurando os forms para chamar as funções corretas */}
                {modalContent === 'company' && (
                    <form onSubmit={handleAddCompany}><div className={modalStyles.panelBody}><div className={modalStyles.formGroup}><label className={modalStyles.label}>Nome da Empresa</label><input value={formState.companyName} onChange={e => setFormState({...formState, companyName: e.target.value})} className={modalStyles.input} required/></div></div><div className={modalStyles.buttonContainer}><button type="button" onClick={closeModal} className={modalStyles.button + ' ' + modalStyles.buttonSecondary}>Cancelar</button><button type="submit" className={modalStyles.button + ' ' + modalStyles.buttonPrimary}>Salvar</button></div></form>
                 )}
                 {modalContent === 'department' && (
                    <form onSubmit={handleAddDepartment}><div className={modalStyles.panelBody}><div className={modalStyles.formGroup}><label className={modalStyles.label}>Nome do Setor</label><input value={formState.departmentName} onChange={e => setFormState({...formState, departmentName: e.target.value})} className={modalStyles.input} required/></div></div><div className={modalStyles.buttonContainer}><button type="button" onClick={closeModal} className={modalStyles.button + ' ' + modalStyles.buttonSecondary}>Cancelar</button><button type="submit" className={modalStyles.button + ' ' + modalStyles.buttonPrimary}>Salvar</button></div></form>
                 )}
                 {(modalContent === 'user' || modalContent === 'adminUser') && (
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
                 )}
            </Modal>
        </>
    );
}
