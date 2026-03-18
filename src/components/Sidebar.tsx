'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { LayoutDashboard, FileText, Users, PlugZap, DatabaseBackup, LogOut, Workflow, History } from 'lucide-react'; 
import { auth } from '../../firebase/config';
import { signOut } from 'firebase/auth';
import styles from '../../app/styles/Sidebar.module.css';

const mainLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/historico', label: 'Histórico', icon: History },
  { href: '/dashboard/forms', label: 'Formulários', icon: FileText },
  { href: '/dashboard/bravoflow', label: 'BravoFlow', icon: Workflow },
];

const settingsLinks = [
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

    const renderLink = (navItem: typeof mainLinks[0]) => {
      const IconComponent = navItem.icon;
      if (!IconComponent) return null;
      const isActive = pathname === navItem.href;
      return (
        <Link
          key={navItem.href}
          href={navItem.href}
          onClick={() => onNavigate(navItem.label)}
          className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
        >
          <IconComponent size={18} />
          <span>{navItem.label}</span>
        </Link>
      );
    };
    
    return (
        <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Image 
                        src="/formbravo-logo-escuro.png"
                        alt="Logo FORMBRAVO"
                        width={48}
                        height={48}
                        priority
                        style={{ borderRadius: '6px', objectFit: 'contain' }}
                    />
                    <h1 className={styles.sidebarTitle}>BRAVOFORM</h1>
                </div>
            </div>
            <nav className={styles.nav}>
                <span className={styles.navSection}>Menu</span>
                {mainLinks.map(renderLink)}

                <div className={styles.navDivider} />
                
                <span className={styles.navSection}>Configurações</span>
                {settingsLinks.map(renderLink)}
            </nav>
            <div className={styles.sidebarFooter}>
               <p>© {new Date().getFullYear()} MDW Bravo</p>
            </div>
        </aside>
    );
}
