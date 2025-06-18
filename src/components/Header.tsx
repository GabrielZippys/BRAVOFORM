import { Bell } from 'lucide-react';

interface HeaderProps {
  pageTitle: string;
}

export default function Header({ pageTitle }: HeaderProps) {
  return (
    <header className="h-16 bg-deco-teal border-b border-deco-brass flex items-center justify-between px-6">
      <div>
        <h2 className="font-display text-xl text-deco-gold">{pageTitle}</h2>
      </div>
      <div className="flex items-center space-x-4">
        <button className="p-2 rounded-full text-deco-gold/80 hover:text-deco-gold">
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
