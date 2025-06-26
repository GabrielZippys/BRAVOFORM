'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../styles/CollaboratorView.module.css';
import { db } from '../../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { type Form, type Collaborator } from '@/types';
import FormResponse from '@/components/FormResponse'; // Criaremos este componente a seguir
import { FileText, LogOut } from 'lucide-react';

export default function CollaboratorView() {
  const [collaborator, setCollaborator] = useState<Collaborator | null>(null);
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedForm, setSelectedForm] = useState<Form | null>(null);
  const router = useRouter();

  useEffect(() => {
    try {
      const storedData = sessionStorage.getItem('collaborator_data');
      if (!storedData) {
        router.push('/');
        return;
      }
      const parsedData: Collaborator = JSON.parse(storedData);
      setCollaborator(parsedData);
    } catch (e) {
      console.error("Erro ao ler dados da sessão:", e);
      router.push('/');
    }
  }, [router]);

  useEffect(() => {
    if (!collaborator?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "forms"),
      where("authorizedUsers", "array-contains", collaborator.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const formsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Form));
      setForms(formsData);
      setLoading(false);
    }, (err) => {
      console.error("Erro ao buscar formulários do colaborador: ", err);
      setError("Não foi possível carregar os formulários.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [collaborator]);

  const handleLogout = () => {
    sessionStorage.removeItem('collaborator_data');
    router.push('/');
  };

  const handleOpenResponseModal = (form: Form) => {
    setSelectedForm(form);
  };
  
  const handleCloseResponseModal = () => {
    setSelectedForm(null);
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}> Seus Formulários</h1>
          {collaborator && (
            <div className={styles.userInfo}>
              <span>Bem-vindo, {collaborator.username}</span>
              <button onClick={handleLogout} className={styles.logoutButton} title="Sair">
                <LogOut size={20} />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className={styles.content}>
        {loading ? (
          <p className={styles.loadingText}>A procurar diretivas...</p>
        ) : error ? (
          <p className={styles.errorText}>{error}</p>
        ) : forms.length === 0 ? (
          <div className={styles.emptyState}>
            <FileText size={48} />
            <p>Nenhuma diretiva encontrada para si.</p>
            <span>Quando um administrador lhe atribuir um formulário, ele aparecerá aqui.</span>
          </div>
        ) : (
          <div className={styles.grid}>
            {forms.map(form => (
              <div key={form.id} className={styles.card}>
                <div className={styles.cardIcon}>
                  <FileText size={32} />
                </div>
                <div className={styles.cardBody}>
                  <h2 className={styles.cardTitle}>{form.title}</h2>
                  <p className={styles.cardSubtitle}>Diretiva de {form.departmentId}</p>
                </div>
                <button 
                  onClick={() => handleOpenResponseModal(form)}
                  className={styles.cardButton}
                >
                  Responder
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedForm && collaborator && (
        <FormResponse 
          form={selectedForm}
          collaborator={collaborator}
          onClose={handleCloseResponseModal}
        />
      )}
    </main>
  );
}
