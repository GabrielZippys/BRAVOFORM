'use client';

import React, { useState, useEffect } from 'react';
// CORREÇÃO: Removido o import não utilizado de 'Building'
import { PlusCircle, UserPlus, Award, Truck } from 'lucide-react'; 
import Modal from '@/components/Modal'; 
import styles from '../../styles/Users.module.css';
import modalStyles from '../../styles/Modal.module.css';
import { db } from '../../../firebase/config';
// CORREÇÃO: Removido o import não utilizado de 'DocumentData'
import { collection, addDoc, onSnapshot, query } from 'firebase/firestore'; 

// Definindo os tipos para os nossos dados
interface Company {
    id: string;
    name: string;
}

interface User {
    id: string;
    name: string;
    email: string;
    role: 'Admin' | 'Editor' | 'Visualizador';
}

export default function UsersPage() {
    // Estados para os dados do Firestore
    const [companies, setCompanies] = useState<Company[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    // Estados para os modais e formulários
    const [isCompanyModalOpen, setCompanyModalOpen] = useState(false);
    const [isUserModalOpen, setUserModalOpen] = useState(false);
    const [newCompanyName, setNewCompanyName] = useState('');
    const [newUserName, setNewUserName] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserRole, setNewUserRole] = useState<'Admin' | 'Editor' | 'Visualizador'>('Visualizador');
    
    useEffect(() => {
        setLoading(true);
        const qCompanies = query(collection(db, "companies"));
        const unsubscribeCompanies = onSnapshot(qCompanies, (querySnapshot) => {
            const fetchedCompanies: Company[] = [];
            querySnapshot.forEach((doc) => {
                fetchedCompanies.push({ id: doc.id, ...doc.data() } as Company);
            });
            setCompanies(fetchedCompanies);
            setLoading(false);
        });

        const qUsers = query(collection(db, "users"));
        const unsubscribeUsers = onSnapshot(qUsers, (querySnapshot) => {
            const usersData: User[] = [];
            querySnapshot.forEach((doc) => {
                usersData.push({ id: doc.id, ...doc.data() } as User);
            });
            setUsers(usersData);
        });

        return () => {
            unsubscribeCompanies();
            unsubscribeUsers();
        };
    }, []);

    const handleAddCompany = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCompanyName.trim()) return;
        
        try {
            await addDoc(collection(db, "companies"), { name: newCompanyName });
            setNewCompanyName('');
            setCompanyModalOpen(false);
        } catch (error) {
            console.error("Erro ao adicionar empresa: ", error);
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUserName.trim() || !newUserEmail.trim()) return;

        try {
            await addDoc(collection(db, "users"), {
                name: newUserName,
                email: newUserEmail,
                role: newUserRole
            });
            setNewUserName('');
            setNewUserEmail('');
            setUserModalOpen(false);
        } catch (error) {
            console.error("Erro ao adicionar usuário: ", error);
        }
    };
    
    const getRoleColor = (role: string) => {
        switch(role) {
            case 'Admin': return 'var(--deco-gold)';
            case 'Editor': return 'var(--deco-ivory)';
            case 'Visualizador': return 'var(--deco-brass)';
            default: return 'var(--deco-gray)';
        }
    };

    return (
        <>
            <div>
                <div className={styles.pageHeader}>
                    <h2 className={styles.pageTitle}>Departamentos & Usuários</h2>
                </div>
                <div className={styles.grid}>
                    <div className={styles.frame}>
                        <div className={styles.frameHeader}>
                            <h3 className={styles.frameTitle}>Empresas</h3>
                            <button onClick={() => setCompanyModalOpen(true)} className={styles.button}><PlusCircle size={16} /><span>Nova Empresa</span></button>
                        </div>
                        {loading ? <p className={styles.emptyState}>Carregando...</p> : companies.length > 0 ? (
                            companies.map(company => (
                                <div key={company.id} className={styles.companyCard}>
                                    <h4 className={styles.companyName}>{company.name}</h4>
                                </div>
                            ))
                        ) : <p className={styles.emptyState}>Nenhuma empresa criada.</p>}
                    </div>
                    <div className={styles.frame}>
                        <div className={styles.frameHeader}>
                            <h3 className={styles.frameTitle}>Usuários</h3>
                            <button onClick={() => setUserModalOpen(true)} className={styles.button}><UserPlus size={16} /><span>Novo Usuário</span></button>
                        </div>
                        <div className={styles.userList}>
                            {users.length > 0 ? (
                                users.map(user => (
                                <div key={user.id} className={styles.userCard}>
                                    <div className={styles.userInfo}>
                                        <h4>{user.name}</h4>
                                        <p>{user.email}</p>
                                    </div>
                                    <span className={styles.permissionTag} style={{borderColor: getRoleColor(user.role), color: getRoleColor(user.role)}}>
                                        {user.role}
                                    </span>
                                </div>
                            ))
                        ) : <p className={styles.emptyState}>Nenhum usuário criado.</p>}
                        </div>
                    </div>
                </div>
            </div>
            <Modal isOpen={isCompanyModalOpen} onClose={() => setCompanyModalOpen(false)} title="Adicionar Nova Empresa">
                <form onSubmit={handleAddCompany}>
                    <div className={modalStyles.panelBody}>
                        <div className={modalStyles.formGroup}>
                           <label htmlFor="company-name" className={modalStyles.label}>Nome da Empresa</label>
                           <input id="company-name" type="text" value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} className={modalStyles.input} required/>
                        </div>
                    </div>
                    <div className={modalStyles.buttonContainer}>
                        <button type="button" onClick={() => setCompanyModalOpen(false)} className={modalStyles.button + ' ' + modalStyles.buttonSecondary}>Cancelar</button>
                        <button type="submit" className={modalStyles.button + ' ' + modalStyles.buttonPrimary}>Salvar</button>
                    </div>
                </form>
            </Modal>
            <Modal isOpen={isUserModalOpen} onClose={() => setUserModalOpen(false)} title="Adicionar Novo Usuário">
                 <form onSubmit={handleAddUser}>
                    <div className={modalStyles.panelBody}>
                        <div className={modalStyles.form}>
                            <div className={modalStyles.formGroup}>
                               <label htmlFor="user-name" className={modalStyles.label}>Nome do Usuário</label>
                               <input id="user-name" type="text" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} className={modalStyles.input} required/>
                            </div>
                             <div className={modalStyles.formGroup}>
                               <label htmlFor="user-email" className={modalStyles.label}>Email</label>
                               <input id="user-email" type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} className={modalStyles.input} required/>
                            </div>
                             <div className={modalStyles.formGroup}>
                               <label htmlFor="user-role" className={modalStyles.label}>Permissão</label>
                               <select id="user-role" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as 'Admin' | 'Editor' | 'Visualizador')} className={modalStyles.input}>
                                    <option value="Visualizador">Visualizador</option>
                                    <option value="Editor">Editor</option>
                                    <option value="Admin">Admin</option>
                               </select>
                            </div>
                        </div>
                    </div>
                    <div className={modalStyles.buttonContainer}>
                        <button type="button" onClick={() => setUserModalOpen(false)} className={modalStyles.button + ' ' + modalStyles.buttonSecondary}>Cancelar</button>
                        <button type="submit" className={modalStyles.button + ' ' + modalStyles.buttonPrimary}>Salvar</button>
                    </div>
                 </form>
            </Modal>
        </>
    );
}

