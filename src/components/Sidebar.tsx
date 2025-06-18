'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileText, Users, PieChart, PlugZap, DatabaseBackup, LogOut } from 'lucide-react';
import React from 'react';

const navLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/forms', label: 'Formulários', icon: FileText },
  { href: '/dashboard/users', label: 'Deptos & Usuários', icon: Users },
  { href: '/dashboard/reports', label: 'Relatórios', icon: PieChart },
  { href: '/dashboard/integrations', label: 'Integrações', icon: PlugZap },
  { href: '/dashboard/backups', label: 'Backups', icon: DatabaseBackup },
];

const styles = {
    link: "text-deco-ivory/80 hover:bg-deco-gold hover:text-deco-dark flex items-center px-4 py-2.5 rounded-sm transition-colors",
    activeLink: "bg-deco-gold text-deco-dark",
    icon: "mr-3 h-5 w-5",
};

interface SidebarProps {
  setPageTitle: (title: string) => void;
}

export default function Sidebar({ setPageTitle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-deco-teal text-deco-ivory flex-col border-r border-deco-brass hidden md:flex">
      <div className="h-16 flex items-center justify-center border-b border-deco-brass">
        <h1 className="font-display text-2xl text-deco-gold">FORMBRAVO</h1>
      </div>
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setPageTitle(link.label)}
              className={`${styles.link} ${isActive ? styles.activeLink : ''}`}
            >
              <link.icon className={styles.icon} />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-deco-brass">
        <a href="#" className="flex items-center px-4 py-2.5 rounded-sm text-deco-ivory/60 hover:bg-red-800/50 hover:text-white transition-colors">
          <LogOut className="mr-3 h-5 w-5" />
          <span>Desconectar</span>
        </a>
      </div>
    </aside>
  );
}
