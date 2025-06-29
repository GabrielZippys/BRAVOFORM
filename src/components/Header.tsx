'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, LogOut, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation'; // CORREÇÃO 1: Importando o router

import styles from '../../app/styles/Header.module.css';
import { auth } from '../../firebase/config'; 
import { useAuth } from '../hooks/useAuth';

// --- Tipos ---
type UserDropdownProps = {
  onLogout: () => void;
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

export default function Header({ pageTitle }: HeaderProps) {
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter(); // CORREÇÃO 2: Inicializando o router
  
  const { user } = useAuth();

  // Efeito para fechar o dropdown ao clicar fora dele
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

  // CORREÇÃO 3: Função de logout agora redireciona para a página de login
  async function handleLogout() {
    await signOut(auth);
    setDropdownOpen(false);
    router.push('/'); // Redireciona o usuário para a página inicial/login
  }

  return (
    <header className={styles.header}>
      <h2 className={styles.headerTitle}>{pageTitle}</h2>
      <div className={styles.headerActions}>
        <button className={styles.headerButton}>
          <Bell />
          <span className={styles.notificationBadge}>3</span>
        </button>
        
        {user && ( // Garante que o perfil só será exibido se houver um usuário logado
          <div className={styles.userProfileWrapper} ref={dropdownRef}>
            <div 
              className={styles.userProfile} 
              onClick={() => setDropdownOpen(!isDropdownOpen)}
              role="button"
              aria-haspopup="true"
              aria-expanded={isDropdownOpen}
            >
              <Image 
                src={user.photoURL || `https://placehold.co/40x40/C5A05C/041A21?text=${user.displayName?.charAt(0)}`}
                alt="Avatar" 
                width={40} height={40} 
                className={styles.userAvatar} 
              />
              <div className={styles.userInfo}>
                <h3>{user.displayName}</h3> 
                <p>Usuário</p>
              </div>
              <ChevronDown 
                size={20} 
                className={`${styles.chevronIcon} ${isDropdownOpen ? styles.chevronOpen : ''}`} 
              />
            </div>
            {isDropdownOpen && <UserDropdown onLogout={handleLogout} />}
          </div>
        )}
      </div>
    </header>
  );
}
