'use client';

import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { useState } from 'react';

// Este é o layout que será aplicado a todas as páginas dentro de /dashboard
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pageTitle, setPageTitle] = useState('Dashboard');

  return (
    <div className="flex h-screen bg-deco-dark text-deco-ivory">
      <Sidebar setPageTitle={setPageTitle} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header pageTitle={pageTitle} />
        <div className="flex-1 overflow-x-hidden overflow-y-auto p-6 relative">
          {children}
        </div>
      </main>
    </div>
  );
}
