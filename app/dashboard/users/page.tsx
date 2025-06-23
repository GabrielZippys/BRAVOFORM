'use client';

import React, { useState } from 'react';
import { PlusCircle, UserPlus, Building, Truck, Award } from 'lucide-react';
import Modal from '@/components/Modal'; // Importando nosso novo componente Modal
import styles from '../../styles/Users.module.css';
import modalStyles from '../../styles/Modal.module.css'; // Importando estilos do modal

const companiesData = [
    { name: 'D&D Frigorífico', depts: [{name: 'Administrativo', icon: Building}, {name: 'Logística', icon: Truck}] },
    { name: 'IPANEMA FOODS', depts: [{name: 'Qualidade', icon: Award}] },
    { name: 'APETITO', depts: [] }
];

const usersData = [
    { name: 'Douglas Di Giglio', email: 'douglas.digiglio@bravo-ti.com', role: 'Admin', color: 'var(--deco-gold)' },
    { name: 'Marjah Di Giglio', email: 'marjah.digiglio@bravo-ti.com', role: 'Editor', color: 'var(--deco-ivory)' },
    { name: 'Wellington Ramos', email: 'wellington.ramos@bravo-ti.com', role: 'Visualizador', color: 'var(--deco-brass)' },
];

export default function UsersPage() {
    const [isCompanyModalOpen, setCompanyModalOpen] = useState(false);
    const [isUserModalOpen, setUserModalOpen] = useState(false);

    return (
        <>
            <div>
                <div className={styles.pageHeader}>
                    <h2 className={styles.pageTitle}>Departamentos & Usuários</h2>
                </div>

                <div className={styles.grid}>
                    {/* Coluna de Empresas e Departamentos */}
                    <div className={styles.frame}>
                        <div className={styles.frameHeader}>
                            <h3 className={styles.frameTitle}>Empresas e Setores</h3>
                            <button onClick={() => setCompanyModalOpen(true)} className={styles.button}><PlusCircle size={16} /><span>Nova Empresa</span></button>
                        </div>
                        {companiesData.map(company => (
                            <div key={company.name} className={styles.companyCard}>
                                <div className={styles.companyHeader}>
                                    <h4 className={styles.companyName}>{company.name}</h4>
                                    <span className={styles.addDeptButton}>Adicionar Setor</span>
                                </div>
                                {company.depts.length > 0 && (
                                    <div className={styles.deptList}>
                                        {company.depts.map(dept => {
                                            const Icon = dept.icon;
                                            return <p key={dept.name} className={styles.deptItem}><Icon size={14} style={{color: 'var(--deco-brass)'}}/> {dept.name}</p>
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Coluna de Usuários e Permissões */}
                    <div className={styles.frame}>
                        <div className={styles.frameHeader}>
                            <h3 className={styles.frameTitle}>Usuários e Permissões</h3>
                            <button onClick={() => setUserModalOpen(true)} className={styles.button}><UserPlus size={16} /><span>Novo Usuário</span></button>
                        </div>
                        <div className={styles.userList}>
                            {usersData.map(user => (
                                <div key={user.name} className={styles.userCard}>
                                    <div className={styles.userInfo}>
                                        <h4>{user.name}</h4>
                                        <p>{user.email}</p>
                                    </div>
                                    <span className={styles.permissionTag} style={{borderColor: user.color, color: user.color}}>
                                        {user.role}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal para adicionar Empresa */}
            <Modal isOpen={isCompanyModalOpen} onClose={() => setCompanyModalOpen(false)} title="Adicionar Nova Empresa">
                <div className={modalStyles.panelBody}>
                    <form className={modalStyles.form}>
                        <div className={modalStyles.formGroup}>
                           <label htmlFor="company-name" className={modalStyles.label}>Nome da Empresa</label>
                           <input id="company-name" type="text" className={modalStyles.input}/>
                        </div>
                    </form>
                </div>
                <div className={modalStyles.buttonContainer}>
                    <button onClick={() => setCompanyModalOpen(false)} className={modalStyles.button + ' ' + modalStyles.buttonSecondary}>Cancelar</button>
                    <button className={modalStyles.button + ' ' + modalStyles.buttonPrimary}>Salvar</button>
                </div>
            </Modal>

            {/* Modal para adicionar Usuário */}
            <Modal isOpen={isUserModalOpen} onClose={() => setUserModalOpen(false)} title="Adicionar Novo Usuário">
                 <div className={modalStyles.panelBody}>
                    <form className={modalStyles.form}>
                        <div className={modalStyles.formGroup}>
                           <label htmlFor="user-name" className={modalStyles.label}>Nome do Usuário</label>
                           <input id="user-name" type="text" className={modalStyles.input}/>
                        </div>
                         <div className={modalStyles.formGroup}>
                           <label htmlFor="user-email" className={modalStyles.label}>Email</label>
                           <input id="user-email" type="email" className={modalStyles.input}/>
                        </div>
                         <div className={modalStyles.formGroup}>
                           <label htmlFor="user-role" className={modalStyles.label}>Permissão</label>
                           <select id="user-role" className={modalStyles.input}>
                                <option>Admin</option>
                                <option>Editor</option>
                                <option>Visualizador</option>
                           </select>
                        </div>
                    </form>
                </div>
                <div className={modalStyles.buttonContainer}>
                    <button onClick={() => setUserModalOpen(false)} className={modalStyles.button + ' ' + modalStyles.buttonSecondary}>Cancelar</button>
                    <button className={modalStyles.button + ' ' + modalStyles.buttonPrimary}>Salvar</button>
                </div>
            </Modal>
        </>
    );
}
