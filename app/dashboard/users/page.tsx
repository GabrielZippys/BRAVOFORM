'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Building, Users, ChevronRight, Eye, EyeOff, UserPlus, Edit, Trash2 } from 'lucide-react';
import Modal from '@/components/Modal';
// import styles from '../../styles/Users.module.css'; ← não está em uso
import modalStyles from '../../styles/Modal.module.css';
import { db, auth } from '../../../firebase/config';
import { collection, addDoc, onSnapshot, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, AuthError } from 'firebase/auth';

interface Company { id: string; name: string; }
interface Department { id: string; name: string; }
interface AppUser { id: string; name: string; email: string; role: string; }
type UserRole = 'Admin' | 'Editor' | 'Visualizador';
type ModalType = 'company' | 'department' | 'user' | 'adminUser';

export default function UsersPage() {
    const [view, setView] = useState<'overview' | 'departments' | 'users'>('overview');
    const [, setSelectedCompany] = useState<Company | null>(null);
    const [, setSelectedDepartment] = useState<Department | null>(null);

    const [companies, setCompanies] = useState<Company[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [adminUsers, setAdminUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState({ companies: true, admins: true, departments: false, users: false });

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
    const [showPassword, setShowPassword] = useState(false);
    const [formError, setFormError] = useState('');

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
        // Exemplo de listener comentado (setSelectedCompany não está em uso visível)
    }, []);

    useEffect(() => {
        // Exemplo de listener comentado (setSelectedDepartment não está em uso visível)
    }, []);

    const resetView = () => {
        setView('overview');
        setSelectedCompany(null);
        setSelectedDepartment(null);
    };

    /*
    const openModal = (type: ModalType, mode: 'create' | 'edit' = 'create', userToEdit?: AppUser) => {
        // Definição futura
    };
    */

    const closeModal = () => {
        setModalOpen(false);
        setEditingUser(null);
        setFormState({
            companyName: '', departmentName: '', userName: '', userEmail: '',
            userPassword: '', userPasswordConfirm: '', userRole: 'Visualizador'
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
                case 'department':
                    // Se necessário, adicione selectedCompany de volta
                    break;
                case 'user':
                case 'adminUser':
                    if (modalMode === 'create' && (formState.userPassword !== formState.userPasswordConfirm))
                        return setFormError('As senhas não coincidem.');

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
                            role: formState.userRole
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

    const handleDeleteUser = async (userId: string) => {
        if (window.confirm("Tem certeza que deseja apagar este usuário?")) {
            await deleteDoc(doc(db, "users", userId));
        }
    };

    return (
        <>
            <div>
                {/* Interface da página, botões e listas devem ser inseridos aqui */}
            </div>

            <Modal isOpen={isModalOpen} onClose={closeModal} title={
                modalMode === 'edit' ? `Editar ${modalContent === 'adminUser' ? 'Admin' : 'Usuário'}` :
                    'Novo ' + (modalContent === 'company' ? 'Empresa' :
                        modalContent === 'department' ? 'Setor' :
                            modalContent === 'adminUser' ? 'Admin' : 'Acesso')
            }>
                <form onSubmit={handleFormSubmit}>
                    {/* Conteúdo do modal de acordo com tipo */}
                </form>
            </Modal>
        </>
    );
}
