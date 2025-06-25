'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Building, Users, ChevronRight, Eye, EyeOff, UserPlus, Edit, Trash2, KeyRound } from 'lucide-react';
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
// Novo tipo para o colaborador com usuário simples
interface Collaborator { id: string; username: string; }
type ModalType = 'company' | 'department' | 'collaborator' | 'adminUser';

export default function UsersPage() {
    // --- Estados de Navegação e Dados ---
    const [view, setView] = useState<'overview' | 'departments' | 'collaborators'>('overview');
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
    
    const [companies, setCompanies] = useState<Company[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
    const [adminUsers, setAdminUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);

    // --- Estados dos Modais e Formulários ---
    const [isModalOpen, setModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState<ModalType | null>(null);
    
    // Unificando o estado do formulário para simplificar
    const [formState, setFormState] = useState({
        companyName: '',
        departmentName: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        adminPasswordConfirm: '',
        collabUsername: '',
        collabPassword: '',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [formError, setFormError] = useState('');

    // --- Efeitos para buscar dados do Firestore ---
    useEffect(() => {
        setLoading(true);
        const qCompanies = onSnapshot(query(collection(db, "companies")), (snapshot) => {
            setCompanies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company)));
            setLoading(false);
        });

        const qAdminUsers = onSnapshot(query(collection(db, "users"), where("role", "==", "Admin")), (snapshot) => {
            setAdminUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser)));
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
        if (!selectedDepartment) { setCollaborators([]); return; }
        const q = onSnapshot(query(collection(db, `departments/${selectedDepartment.id}/collaborators`)), (snapshot) => {
            setCollaborators(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Collaborator)));
        });
        return () => q();
    }, [selectedDepartment]);


    // --- Funções da UI ---
    const handleSelectCompany = (company: Company) => { setSelectedCompany(company); setView('departments'); };
    const handleSelectDepartment = (department: Department) => { setSelectedDepartment(department); setView('collaborators'); };
    const resetView = () => { setView('overview'); setSelectedCompany(null); setSelectedDepartment(null); };

    const openModal = (type: ModalType) => { setModalContent(type); setModalOpen(true); setFormError(''); };
    const closeModal = () => { setModalOpen(false); setFormState({ companyName: '', departmentName: '', adminName: '', adminEmail: '', adminPassword: '', adminPasswordConfirm: '', collabUsername: '', collabPassword: '' }); };

    // --- Funções CRUD ---
    const handleAddCompany = async (e: React.FormEvent) => { e.preventDefault(); if(!formState.companyName) return; await addDoc(collection(db, "companies"), { name: formState.companyName }); closeModal(); };
    const handleAddDepartment = async (e: React.FormEvent) => { e.preventDefault(); if (!formState.departmentName || !selectedCompany) return; await addDoc(collection(db, `companies/${selectedCompany.id}/departments`), { name: formState.departmentName }); closeModal(); };
    
    const handleAddAdminUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (formState.adminPassword !== formState.adminPasswordConfirm) return setFormError('As senhas não coincidem.');
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, formState.adminEmail, formState.adminPassword);
            await addDoc(collection(db, "users"), { uid: userCredential.user.uid, name: formState.adminName, email: formState.adminEmail, role: 'Admin' });
            closeModal();
        } catch (error: any) {
            if (error.code === 'auth/weak-password') setFormError('A senha deve ter pelo menos 6 caracteres.');
            else if (error.code === 'auth/email-already-in-use') setFormError('Este e-mail já está em uso.');
            else setFormError('Erro ao criar usuário.');
        }
    };
    
    const handleAddCollaborator = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (!formState.collabUsername.trim() || !formState.collabPassword.trim() || !selectedDepartment) return;
        
        try {
            await addDoc(collection(db, `departments/${selectedDepartment.id}/collaborators`), {
                username: formState.collabUsername,
                password: formState.collabPassword, // ATENÇÃO: Em produção, esta senha deve ser criptografada (hashed)
            });
            closeModal();
        } catch (error) {
            setFormError("Não foi possível criar o acesso.");
            console.error("Erro ao criar acesso de colaborador:", error);
        }
    };

    const renderContent = () => {
        switch(view) {
            case 'departments':
                return (
                    <div className={styles.frame}>
                        <div className={styles.frameHeader}><h3 className={styles.frameTitle}>Setores</h3><button onClick={() => openModal('department')} className={styles.button}><Plus size={16}/><span>Novo Setor</span></button></div>
                        <div className={styles.list}>
                            {departments.length > 0 ? departments.map(d => (
                                <div key={d.id} className={`${styles.itemCard} ${styles.itemCardClickable}`} onClick={() => handleSelectDepartment(d)}><h4 className={styles.itemName}>{d.name}</h4><Users size={20}/></div>
                            )) : <p className={styles.emptyState}>Nenhum setor criado para esta empresa.</p>}
                        </div>
                    </div>
                );
            case 'collaborators':
                return (
                    <div className={styles.frame}>
                        <div className={styles.frameHeader}><h3 className={styles.frameTitle}>Acesso dos Colaboradores</h3><button onClick={() => openModal('collaborator')} className={styles.button}><KeyRound size={16}/><span>Criar Acesso</span></button></div>
                        <div className={styles.list}>
                           {collaborators.length > 0 ? collaborators.map(c => (
                                <div key={c.id} className={styles.itemCard}><h4 className={styles.itemName}>{c.username}</h4></div>
                            )) : <p className={styles.emptyState}>Nenhum acesso criado para este setor.</p>}
                        </div>
                    </div>
                );
            case 'overview':
            default:
                return (
                    <>
                        <div className={styles.frame}>
                            <div className={styles.frameHeader}><h3 className={styles.frameTitle}>Administração</h3><button onClick={() => openModal('adminUser')} className={styles.button}><UserPlus size={16}/><span>Novo Admin</span></button></div>
                            {loading ? <p className={styles.emptyState}>Carregando...</p> : adminUsers.length > 0 ? adminUsers.map(user => (
                                <div key={user.id} className={styles.itemCard}>
                                    <div><h4 className={styles.itemName}>{user.name}</h4><p className={styles.itemInfo}>{user.email}</p></div>
                                    <span className={styles.permissionTag}>Admin</span>
                                </div>
                            )) : <p className={styles.emptyState}>Nenhum administrador criado.</p>}
                        </div>
                        <div className={styles.frame}>
                             <div className={styles.frameHeader}><h3 className={styles.frameTitle}>Empresas</h3><button onClick={() => openModal('company')} className={styles.button}><Plus size={16}/><span>Nova Empresa</span></button></div>
                            {loading ? <p className={styles.emptyState}>Carregando...</p> : companies.length > 0 ? companies.map(c => (
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
                modalContent === 'company' ? 'Nova Empresa' :
                modalContent === 'department' ? 'Novo Setor' :
                modalContent === 'adminUser' ? 'Novo Administrador' : 'Criar Acesso de Colaborador'
            }>
                {modalContent === 'company' && ( <form onSubmit={handleAddCompany}><div className={modalStyles.panelBody}><div className={modalStyles.formGroup}><label className={modalStyles.label}>Nome da Empresa</label><input value={formState.companyName} onChange={e => setFormState({...formState, companyName: e.target.value})} className={modalStyles.input} required/></div></div><div className={modalStyles.buttonContainer}><button type="button" onClick={closeModal} className={modalStyles.button + ' ' + modalStyles.buttonSecondary}>Cancelar</button><button type="submit" className={modalStyles.button + ' ' + modalStyles.buttonPrimary}>Salvar</button></div></form> )}
                {modalContent === 'department' && ( <form onSubmit={handleAddDepartment}><div className={modalStyles.panelBody}><div className={modalStyles.formGroup}><label className={modalStyles.label}>Nome do Setor</label><input value={formState.departmentName} onChange={e => setFormState({...formState, departmentName: e.target.value})} className={modalStyles.input} required/></div></div><div className={modalStyles.buttonContainer}><button type="button" onClick={closeModal} className={modalStyles.button + ' ' + modalStyles.buttonSecondary}>Cancelar</button><button type="submit" className={modalStyles.button + ' ' + modalStyles.buttonPrimary}>Salvar</button></div></form> )}
                {modalContent === 'adminUser' && ( <form onSubmit={handleAddAdminUser}><div className={modalStyles.panelBody}><div className={modalStyles.form}><div className={modalStyles.formGroup}><label className={modalStyles.label}>Nome</label><input value={formState.adminName} onChange={e => setFormState({...formState, adminName: e.target.value})} className={modalStyles.input} required/></div><div className={modalStyles.formGroup}><label className={modalStyles.label}>Email de Acesso</label><input type="email" value={formState.adminEmail} onChange={e => setFormState({...formState, adminEmail: e.target.value})} className={modalStyles.input} required/></div><div className={modalStyles.formGroup}><label className={modalStyles.label}>Senha</label><div className={modalStyles.passwordWrapper}><input type={showPassword ? 'text' : 'password'} value={formState.adminPassword} onChange={e => setFormState({...formState, adminPassword: e.target.value})} className={modalStyles.input} required/><button type="button" onClick={() => setShowPassword(!showPassword)} className={modalStyles.eyeButton}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div><div className={modalStyles.formGroup}><label className={modalStyles.label}>Confirmar Senha</label><div className={modalStyles.passwordWrapper}><input type={showPassword ? 'text' : 'password'} value={formState.adminPasswordConfirm} onChange={e => setFormState({...formState, adminPasswordConfirm: e.target.value})} className={modalStyles.input} required/><button type="button" onClick={() => setShowPassword(!showPassword)} className={modalStyles.eyeButton}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div>{formError && <p className={modalStyles.error}>{formError}</p>}</div></div><div className={modalStyles.buttonContainer}><button type="button" onClick={closeModal} className={modalStyles.button + ' ' + modalStyles.buttonSecondary}>Cancelar</button><button type="submit" className={modalStyles.button + ' ' + modalStyles.buttonPrimary}>Salvar Admin</button></div></form> )}
                {modalContent === 'collaborator' && (
                    <form onSubmit={handleAddCollaborator}>
                        <div className={modalStyles.panelBody}>
                            <div className={modalStyles.form}>
                                <div className={modalStyles.formGroup}><label className={modalStyles.label}>Nome de Usuário</label><input value={formState.collabUsername} onChange={e => setFormState({...formState, collabUsername: e.target.value})} className={modalStyles.input} required/></div>
                                <div className={modalStyles.formGroup}><label className={modalStyles.label}>Senha</label><div className={modalStyles.passwordWrapper}><input type={showPassword ? 'text' : 'password'} value={formState.collabPassword} onChange={e => setFormState({...formState, collabPassword: e.target.value})} className={modalStyles.input} required/><button type="button" onClick={() => setShowPassword(!showPassword)} className={modalStyles.eyeButton}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div>
                                {formError && <p className={modalStyles.error}>{formError}</p>}
                            </div>
                        </div>
                        <div className={modalStyles.buttonContainer}><button type="button" onClick={closeModal} className={`${modalStyles.button} ${modalStyles.buttonSecondary}`}>Cancelar</button><button type="submit" className={`${modalStyles.button} ${modalStyles.buttonPrimary}`}>Salvar Acesso</button></div>
                    </form>
                )}
            </Modal>
        </>
    );
}
