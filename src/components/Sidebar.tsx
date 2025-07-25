'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
// CORREÇÃO: Importando todos os ícones necessários para o menu
import { LayoutDashboard, FileText, Users, PieChart, PlugZap, DatabaseBackup, LogOut } from 'lucide-react'; 
// CORREÇÃO: Usando o alias '@/' para encontrar a configuração do Firebase de forma segura
import { auth } from '../../firebase/config';
import { signOut } from 'firebase/auth';
// CORREÇÃO: Importando o arquivo de estilo correto (Dashboard.module.css) a partir da sua pasta de estilos
import styles from '../../app/styles/Sidebar.module.css';

// CORREÇÃO: Os caminhos dos links agora incluem o prefixo /dashboard para manter o layout
const navLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/forms', label: 'Formulários', icon: FileText },
  { href: '/dashboard/users', label: 'Deptos & Usuários', icon: Users },
  { href: '/dashboard/integrations', label: 'Integrações', icon: PlugZap },
  { href: '/dashboard/backups', label: 'Backups', icon: DatabaseBackup },
];

interface SidebarProps {
  onNavigate: (label: string) => void;
}

export default function Sidebar({ onNavigate }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();

    const handleLogout = async () => {
      try {
        await signOut(auth);
        router.push('/');
      } catch (error) {
        console.error("Erro ao fazer logout:", error);
      }
    };
    
    return (
        <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
                    <Image 
                        src="/formbravo-logo-escuro.png"
                        alt="Logo FORMBRAVO"
                        width={80}
                        height={55}
                        priority 
                    />
                    <h1 className={styles.sidebarTitle} style={{fontSize: '1.50rem'}}>BRAVOFORM</h1>
                </div>
            </div>
            <nav className={styles.nav}>
                {/* CORREÇÃO: Renomeando a variável 'link' para 'navItem' para evitar conflito com a tag <link> */}
                {navLinks.map((navItem) => {
                    const IconComponent = navItem.icon;
                    if (!IconComponent) return null; // Verificação de segurança
                    
                    const isActive = pathname === navItem.href;
                    return (
                        <Link
                            key={navItem.href}
                            href={navItem.href}
                            onClick={() => onNavigate(navItem.label)}
                            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                        >
                            <IconComponent size={20} />
                            <span>{navItem.label}</span>
                        </Link>
                    );
                })}
            </nav>
            <div className={styles.sidebarFooter}>
               <p>MDW Bravo © Todos os Direitos Reservados</p>
            </div>
        </aside>
    );
}
