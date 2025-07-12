'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, collection, getDocs, query, where, collectionGroup } from 'firebase/firestore';
import { db } from '../../../../firebase/config';
import styles from '../../../../app/styles/AdminPages.module.css';

// --- ADIÇÃO: Importar o componente Toast ---
import Toast from '@/components/Toast'; // Ajuste o caminho se necessário

// Tipos locais
type Collaborator = {
    id: string;
    ref: any;
    username: string;
    email?: string;
    companyId: string;
    departmentId: string;
};
type ResetRequest = {
    id: string;
    collaboratorId: string;
    collaboratorUsername: string;
    createdAt: any;
    status: string;
};

export default function ResetRequestDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const requestId = params.requestId as string;

    const [request, setRequest] = useState<ResetRequest | null>(null);
    const [collaborator, setCollaborator] = useState<Collaborator | null>(null);
    const [collaboratorRef, setCollaboratorRef] = useState<any>(null);
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(true);
    
    // --- MUDANÇA: O estado 'error' agora é controlado pelo Toast ---
    const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

    useEffect(() => {
        if (!requestId) return;

        const fetchRequestDetails = async () => {
            setLoading(true);
            setToast(null); // Limpa toasts antigos
            
            const requestDocRef = doc(db, 'password_resets', requestId);
            const requestDocSnap = await getDoc(requestDocRef);

            if (!requestDocSnap.exists()) {
                setToast({ message: 'Solicitação de reset não encontrada.', type: 'error'});
                setLoading(false);
                return;
            }
            
            const requestData = { id: requestDocSnap.id, ...requestDocSnap.data() } as ResetRequest;
            setRequest(requestData);

            const collaboratorsQuery = query(
                collectionGroup(db, 'collaborators'),
                where('username', '==', requestData.collaboratorUsername)
            );
            const collaboratorSnapshot = await getDocs(collaboratorsQuery);

            if (!collaboratorSnapshot.empty) {
                const collaboratorDoc = collaboratorSnapshot.docs[0];
                setCollaborator({ id: collaboratorDoc.id, ref: collaboratorDoc.ref, ...collaboratorDoc.data() } as Collaborator);
                setCollaboratorRef(collaboratorDoc.ref);
            } else {
                setToast({ message: 'Colaborador associado não foi encontrado.', type: 'error'});
            }
            
            setLoading(false);
        };

        fetchRequestDetails();
    }, [requestId]);

    const handleResetPassword = async () => {
        if (!newPassword || newPassword.length < 6) {
            setToast({ message: 'A nova senha deve ter pelo menos 6 caracteres.', type: 'error'});
            return;
        }
        if (!collaboratorRef || !request?.id) {
            setToast({ message: 'Faltam referências para completar a operação.', type: 'error'});
            return;
        }

        setLoading(true);
        try {
            await updateDoc(collaboratorRef, {
                password: newPassword,
                isTemporaryPassword: true // Define como temporária
            });
            
            const requestDocRef = doc(db, 'password_resets', request.id);
            await updateDoc(requestDocRef, {
                status: 'completed'
            });

            // --- SUBSTITUIÇÃO DO ALERT ---
            setToast({ message: 'Senha do colaborador atualizada com sucesso!', type: 'success'});
            
            setTimeout(() => {
                router.push('/dashboard');
            }, 3000);

        } catch (err) {
            console.error(err);
            setToast({ message: 'Falha ao atualizar a senha.', type: 'error'});
            setLoading(false);
        }
    };

    if (loading && !toast) return <p className={styles.loading}>Carregando detalhes...</p>;
    
    return (
        <>
            <div className={styles.container}>
                {/* O conteúdo da página continua o mesmo */}
                <h2 className={styles.title}>Detalhes da Solicitação de Reset</h2>
                
                {(!request || !collaborator) && !loading ? (
                    <p className={styles.error}>Não foi possível carregar os dados completos.</p>
                ) : (
                    <>
                        <div className={styles.card}>
                            <h3>Informações do Colaborador</h3>
                            <p><strong>Nome de Usuário:</strong> {collaborator?.username}</p>
                            <p><strong>E-mail:</strong> {collaborator?.email || 'Não informado'}</p>
                            <p><strong>Status do Pedido:</strong> <span className={`${styles.status} ${styles[request?.status || '']}`}>{request?.status}</span></p>
                        </div>

                        {request?.status === 'pending' && (
                            <div className={`${styles.card} ${styles.actionCard}`}>
                                <h3>Ação do Administrador</h3>
                                <p>Digite uma nova senha temporária para o colaborador.</p>
                                <div className={styles.inputGroup}>
                                    <label htmlFor="new-password">Nova Senha Temporária</label>
                                    <input id="new-password" type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={styles.input}/>
                                </div>
                                <button onClick={handleResetPassword} disabled={loading} className={styles.button}>
                                    {loading ? 'Atualizando...' : 'Redefinir Senha e Concluir Pedido'}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
            
            {/* O componente Toast é renderizado aqui quando houver uma mensagem */}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </>
    );
}