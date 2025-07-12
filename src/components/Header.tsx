'use client';

import React, { useState, useEffect, useRef } from 'react';
// Ícone extra para o dropdown de notificações
import { Bell, LogOut, ChevronDown, MailQuestion } from 'lucide-react';
import Image from 'next/image';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; // Não se esqueça de importar no topo do arquivo!
import styles from '../../app/styles/Header.module.css';
// Importações necessárias do Firestore
import { auth, db } from '../../firebase/config'; 
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth'; // Assumindo que este hook existe

// --- Tipos ---
type UserDropdownProps = {
  onLogout: () => void;
};
// Novo tipo para as notificações
type Notification = {
  id: string;
  collaboratorUsername: string; // O nome correto do campo
  userEmail?: string; // Mantemos userEmail como opcional, para o futuro
  createdAt: any;
  status: string;
};
type NotificationDropdownProps = {
    notifications: Notification[];
    onClose: () => void;
};
type HeaderProps = {
  pageTitle: string;
};

// --- Componentes ---

const UserDropdown: React.FC<UserDropdownProps> = ({ onLogout }) => (
  <div className={styles.userDropdown}>
    <button onClick={onLogout} className={`${styles.dropdownItem} ${styles.logoutButton}`}>
      <LogOut size={16} />
      <span>Sair</span>
    </button>
  </div>
);

// Novo componente para o dropdown de notificações
const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ notifications, onClose }) => (
    <div className={styles.notificationDropdown}>
        <div className={styles.notificationHeader}>
            <h4>Notificações</h4>
        </div>
        <div className={styles.notificationList}>
            {notifications.length === 0 ? (
                <p className={styles.noNotifications}>Nenhuma notificação nova.</p>
            ) : (
                notifications.map(notif => (
                    // CORREÇÃO: O <Link> agora envolve corretamente todo o item.
                    // Adicionei um onClick para fechar o dropdown ao clicar em uma notificação.
                    <Link href={`/dashboard/reset-requests/${notif.id}`} key={notif.id} className={styles.notificationLink} onClick={onClose}>
                        <div className={styles.notificationItem}>
                            <MailQuestion size={20} className={styles.notificationIcon} />
                            <div className={styles.notificationContent}>
                                <p>Pedido de reset de senha</p>
                                {/* Usando a propriedade correta que definimos no tipo 'Notification' */}
                                <span>{notif.collaboratorUsername}</span>
                            </div>
                        </div>
                    </Link>
                ))
            )}
        </div>
    </div>
);


export default function Header({ pageTitle }: HeaderProps) {
  const [isUserDropdownOpen, setUserDropdownOpen] = useState(false);
  // Novos estados para o dropdown de notificação
  const [isNotificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const router = useRouter(); 
  
  const { user, appUser } = useAuth(); // Assumimos que useAuth retorna dados do Firestore sobre o usuário, incluindo a 'role'

  // Efeito para fechar os dropdowns ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // --- NOVO EFEITO PARA OUVIR NOTIFICAÇÕES ---
  useEffect(() => {
    // Apenas administradores podem ver as solicitações de reset de senha
    if (appUser && appUser.role === 'Admin') {
      const q = query(
        collection(db, 'password_resets'), 
        where('status', '==', 'pending')
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const newNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
        setNotifications(newNotifications);
      });

      // Limpa o "ouvinte" quando o componente é desmontado para evitar memory leaks
      return () => unsubscribe();
    }
  }, [appUser]); // Roda este efeito sempre que a informação do 'appUser' mudar

  async function handleLogout() {
    await signOut(auth);
    setUserDropdownOpen(false);
    router.push('/');
  }

  return (
    <header className={styles.header}>
      <h2 className={styles.headerTitle}>{pageTitle}</h2>
      <div className={styles.headerActions}>
        
        <div className={styles.notificationWrapper} ref={notificationRef}>
            <button className={styles.headerButton} onClick={() => setNotificationOpen(prev => !prev)}>
                <Bell />
                {notifications.length > 0 && (
                    <span className={styles.notificationBadge}>{notifications.length}</span>
                )}
            </button>
            {isNotificationOpen && <NotificationDropdown notifications={notifications} onClose={() => setNotificationOpen(false)} />}
        </div>
        
        {user && (
          <div className={styles.userProfileWrapper} ref={userDropdownRef}>
            <div 
              className={styles.userProfile} 
              onClick={() => setUserDropdownOpen(!isUserDropdownOpen)}
              role="button"
              aria-haspopup="true"
              aria-expanded={isUserDropdownOpen}
            >
              <Image 
                src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || user.email}&background=C5A05C&color=041A21`}
                alt="Avatar" 
                width={40} height={40} 
                className={styles.userAvatar} 
              />
              <div className={styles.userInfo}>
                <h3>{user.displayName || 'Usuário'}</h3> 
                <p>{appUser?.role || 'Visitante'}</p>
              </div>
              <ChevronDown 
                size={20} 
                className={`${styles.chevronIcon} ${isUserDropdownOpen ? styles.chevronOpen : ''}`} 
              />
            </div>
            {isUserDropdownOpen && <UserDropdown onLogout={handleLogout} />}
          </div>
        )}
      </div>
    </header>
  );
}