'use client';

import { useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../styles/CollaboratorView.module.css';
import { db } from '../../firebase/config';
import { collection, query, where, onSnapshot, getDoc, doc, collectionGroup } from 'firebase/firestore';
import { type Form, type Collaborator as CollaboratorType, type FormResponse as FormResponseType } from '@/types';

import FormResponse from '@/components/FormResponse';
import { FileText, LogOut, History, Edit } from 'lucide-react';

interface Collaborator {
    id: string;
    username: string;
    email: string;
    companyId: string;
    departmentId: string;
    canViewHistory?: boolean;
    canEditHistory?: boolean;
}

type FormResponseWithTimestamp = FormResponseType & {
    createdAt?: { seconds: number; nanoseconds: number; };
};


export default function CollaboratorView() {
    const [collaborator, setCollaborator] = useState<Collaborator | null>(null);
    const [view, setView] = useState<'forms' | 'history'>('forms');
    
    const [formsToFill, setFormsToFill] = useState<Form[]>([]);
    const [submittedResponses, setSubmittedResponses] = useState<FormResponseType[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    const [selectedForm, setSelectedForm] = useState<Form | null>(null);
    const [selectedResponse, setSelectedResponse] = useState<FormResponseType | null>(null);

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
        if (collaborator?.id && collaborator.departmentId) {
            const collaboratorRef = doc(db, `departments/${collaborator.departmentId}/collaborators`, collaborator.id);
            
            const unsubscribe = onSnapshot(collaboratorRef, (docSnap) => {
                if (docSnap.exists()) {
                    setCollaborator(prev => ({ ...prev, ...docSnap.data() } as Collaborator));
                }
            });

            return () => unsubscribe();
        }
    }, [collaborator?.id, collaborator?.departmentId]);


    useEffect(() => {
        if (!collaborator?.id) return;

        setLoading(true);
        const q = query(
            collection(db, "forms"),
            where("authorizedUsers", "array-contains", collaborator.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const formsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Form));
            setFormsToFill(formsData);
            setLoading(false);
        }, (err) => {
            console.error("Erro ao buscar formulários: ", err);
            setError("Não foi possível carregar os formulários.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [collaborator?.id]);

    useEffect(() => {
        if (view === 'history' && collaborator?.id) {
            setLoading(true);
            const responsesQuery = query(
                collectionGroup(db, "responses"), 
                where("collaboratorId", "==", collaborator.id)
            );
            const unsubscribe = onSnapshot(responsesQuery, (snapshot) => {
                const responsesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FormResponseType));
                setSubmittedResponses(responsesData);
                setLoading(false);
            }, (err) => {
                console.error("Erro ao buscar histórico: ", err);
                setError("Não foi possível carregar o histórico.");
                setLoading(false);
            });
            return () => unsubscribe();
        }
    }, [view, collaborator?.id]);

    const handleLogout = () => {
        sessionStorage.removeItem('collaborator_data');
        router.push('/');
    };

    const handleOpenResponseModal = (form: Form) => {
        setSelectedResponse(null);
        setSelectedForm(form);
    };

    // CORREÇÃO: Adicionada uma verificação de permissão antes de abrir o modal.
    const handleOpenHistoryModal = async (response: FormResponseType) => {
        // Se não tiver permissão para editar, não faz nada.
        if (!collaborator?.canEditHistory) {
            return;
        }

        const formRef = doc(db, 'forms', response.formId);
        const formSnap = await getDoc(formRef);
        if (formSnap.exists()) {
            const formData = formSnap.data();
            const validForm = { 
                id: formSnap.id, 
                ...formData,
                fields: formData.fields || [] 
            } as Form;
            
            setSelectedResponse(response);
            setSelectedForm(validForm);
        } else {
            setError("Não foi possível encontrar a estrutura do formulário original.");
        }
    };
    
    const handleCloseResponseModal = () => {
        setSelectedForm(null);
        setSelectedResponse(null);
    }

    const renderContent = () => {
        if (loading) return <p className={styles.loadingText}>A procurar diretivas...</p>;
        if (error) return <p className={styles.errorText}>{error}</p>;

        if (view === 'history') {
            return submittedResponses.length === 0 ? (
                <div className={styles.emptyState}><History size={48} /><p>Nenhum histórico encontrado.</p></div>
            ) : (
                <div className={styles.grid}>
                    {(submittedResponses as FormResponseWithTimestamp[]).map(response => (
                        // CORREÇÃO: Adicionada uma classe condicional para desativar o card
                        <div 
                            key={response.id} 
                            className={`${styles.historyCard} ${!collaborator?.canEditHistory ? styles.disabled : ''}`} 
                            onClick={() => handleOpenHistoryModal(response)}
                        >
                            <div className={styles.historyInfo}>
                                <h4>{response.formTitle}</h4>
                                <p>Enviado em: {response.createdAt ? new Date(response.createdAt.seconds * 1000).toLocaleDateString() : 'Data desconhecida'}</p>
                            </div>
                            <div className={styles.historyStatus}>
                                {collaborator?.canEditHistory ? <Edit size={18} /> : <FileText size={18} />}
                                <span>{collaborator?.canEditHistory ? 'Editar' : 'Ver'}</span>
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        return formsToFill.length === 0 ? (
            <div className={styles.emptyState}><FileText size={48} /><p>Nenhuma diretiva encontrada para si.</p></div>
        ) : (
           <div className={styles.grid}>
  {formsToFill.map(form => {
    const isNovo =
      form.createdAt &&
      Date.now() - form.createdAt.seconds * 1000 < 7 * 24 * 60 * 60 * 1000;

    return (
      <div key={form.id} className={styles.card}>
        <div className={styles.cardIcon}>
          <FileText size={32} />
        </div>
        <div className={styles.cardBody}>
          <h2 className={styles.cardTitle}>
            {form.title}
            {isNovo && <span className={styles.newBadge}>Novo</span>}
          </h2>

          {/* ✅ Se tiver descrição, mostra */}
          {form.description && (
            <p className={styles.cardSubtitle}>{form.description}</p>
          )}

          {/* ✅ Se tiver data de criação, mostra */}
          {form.createdAt && (
            <p className={styles.cardSubtitle}>
              Criado em{" "}
              {new Date(form.createdAt.seconds * 1000).toLocaleDateString()}
            </p>
          )}
        </div>
        <button
          onClick={() => handleOpenResponseModal(form)}
          className={styles.cardButton}
        >
          Responder
        </button>
      </div>
    );
  })}
</div>

        );
    };

    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <div className={styles.headerContent}>
                    <h1 className={styles.title}>Portal do Colaborador</h1>
                    {collaborator && (
                        <div className={styles.userInfo}>
                            <span>Bem-vindo, {collaborator.username}</span>
                            <button onClick={handleLogout} className={styles.logoutButton} title="Sair"><LogOut size={20} /></button>
                        </div>
                    )}
                </div>
            </header>

            <div className={styles.content}>
                <div className={styles.viewToggle}>
                    <button className={`${styles.toggleButton} ${view === 'forms' ? styles.active : ''}`} onClick={() => setView('forms')}>Formulários</button>
                    {collaborator?.canViewHistory && (
                        <button className={`${styles.toggleButton} ${view === 'history' ? styles.active : ''}`} onClick={() => setView('history')}>Histórico</button>
                    )}
                </div>
                {renderContent()}
            </div>

            {selectedForm && collaborator && (
                <FormResponse 
                    form={selectedForm}
                    collaborator={collaborator}
                    onClose={handleCloseResponseModal}
                    existingResponse={selectedResponse}
                    canEdit={!!collaborator.canEditHistory}
                />
            )}
        </main>
    );
}
