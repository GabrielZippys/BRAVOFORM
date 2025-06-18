import { BarChart2, CheckCircle, Inbox, UserCheck } from "lucide-react";

const StatCard = ({ title, value, delay }: { title: string, value: string, delay: number }) => (
    <div className="artdeco-frame p-4 animate-fade-in" style={{ animationDelay: `${delay}ms`}}>
        <h3 className="text-sm text-deco-brass">{title}</h3>
        <p className="text-4xl font-display">{value}</p>
    </div>
);


export default function DashboardPage() {
  return (
    <div className="page-content">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Envios (Hoje)" value="12" delay={100} />
        <StatCard title="Formulários Ativos" value="8" delay={200} />
        <StatCard title="Total (Mês)" value="241" delay={300} />
        <StatCard title="Usuários Ativos" value="15" delay={400} />
      </div>
      <div className="mt-8 artdeco-frame p-6 animate-fade-in" style={{ animationDelay: '500ms' }}>
        <h3 className="artdeco-title text-xl mb-4">Análise de Dados</h3>
        <p className="text-deco-ivory/80">
          Bem-vindo ao painel de controle FORMBRAVO. Utilize o menu lateral para navegar entre as seções e gerenciar seus formulários, usuários e integrações.
        </p>
      </div>
    </div>
  );
}
