
'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, FileText, Users, LogOut } from 'lucide-react';
import { auth } from '../../firebase/config';
import { signOut } from 'firebase/auth';
// CORREÇÃO: Importando do novo local centralizado em src/styles
import styles from '../../app/Login.module.css';

const navLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/forms', label: 'Formulários', icon: FileText },
  { href: '/dashboard/users', label: 'Deptos & Usuários', icon: Users },
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
                <h1 className={styles.sidebarTitle}>FORMBRAVO</h1>
            </div>
            <nav className={styles.nav}>
                {navLinks.map((link) => {
                    const isActive = pathname === link.href;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => onNavigate(link.label)}
                            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                        >
                            <link.icon />
                            <span>{link.label}</span>
                        </Link>
                    );
                })}
            </nav>
            <div className={styles.sidebarFooter}>
                <button onClick={handleLogout} className={styles.navLink} style={{width: '100%', justifyContent: 'flex-start'}}>
                    <LogOut />
                    <span>Desconectar</span>
                </button>
            </div>
        </aside>
    );
}
