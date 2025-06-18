'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, FileText, Users, PieChart, PlugZap, DatabaseBackup, LogOut, Bell } from 'lucide-react';
import { auth } from '../app/firebase/config';
import { signOut } from 'firebase/auth';

// --- Componente do Header ---
function Header({ pageTitle }: { pageTitle: string }) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/'); // Redireciona para a página de login
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }
  };

  return (
    <header className="h-16 bg-deco-teal border-b border-deco-brass flex items-center justify-between px-6 shrink-0">
      <div>
        <h2 className="font-display text-xl text-deco-gold">{pageTitle}</h2>
      </div>
      <div className="flex items-center space-x-4">
        <button className="p-2 rounded-full text-deco-gold/80 hover:text-deco-gold transition-colors">
          <Bell />
        </button>
        <div className="flex items-center">
          <img src="https://placehold.co/40x40/C5A05C/0A2E36?text=B" alt="Avatar" className="w-10 h-10 rounded-full border-2 border-deco-gold" />
          <div className="ml-3">
            <p className="font-semibold text-sm text-deco-ivory">Usuário Bravo</p>
            <p className="text-xs text-deco-brass">Administrador</p>
          </div>
        </div>
      </div>
    </header>
  );
}

// --- Componente da Sidebar ---
const navLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/forms', label: 'Formulários', icon: FileText },
  { href: '/dashboard/users', label: 'Deptos & Usuários', icon: Users },
  // ... outras rotas se necessário
];

function Sidebar({ onNavigate }: { onNavigate: (label: string) => void }) {
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
                            onClick={() => onNavigate(link.label)}
                            className={`flex items-center px-4 py-2.5 rounded-sm transition-colors ${isActive ? 'bg-deco-gold text-deco-dark' : 'text-deco-ivory/80 hover:bg-deco-gold hover:text-deco-dark'}`}
                        >
                            <link.icon className={`mr-3 h-5 w-5 ${isActive ? 'stroke-deco-dark' : 'stroke-deco-gold'}`} />
                            <span>{link.label}</span>
                        </Link>
                    );
                })}
            </nav>
            <div className="px-4 py-4 border-t border-deco-brass">
                <button onClick={handleLogout} className="w-full flex items-center px-4 py-2.5 rounded-sm text-deco-ivory/60 hover:bg-red-800/50 hover:text-white transition-colors">
                    <LogOut className="mr-3 h-5 w-5" />
                    <span>Desconectar</span>
                </button>
            </div>
        </aside>
    );
}

// --- Layout Principal do Dashboard ---
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pageTitle, setPageTitle] = useState('Dashboard');

  return (
    <div className="flex h-screen">
      <Sidebar onNavigate={setPageTitle} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header pageTitle={pageTitle} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
