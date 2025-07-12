'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../styles/Login.module.css'; // Reutilizando os estilos de login
import { KeyRound, LogIn } from 'lucide-react';
import Toast from '@/components/Toast'; // Verifique se o caminho para o seu Toast está correto

export default function SetNewPasswordPage() {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState(''); // Usaremos este para o Toast de erro
    const [isLoading, setIsLoading] = useState(false);
    const [username, setUsername] = useState<string | null>(null);
    const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
    
    const router = useRouter();

    useEffect(() => {
        const sessionDataString = sessionStorage.getItem('collaborator_data');
        if (sessionDataString) {
            const sessionData = JSON.parse(sessionDataString);
            setUsername(sessionData.username);
        } else {
            router.push('/');
        }
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validação no frontend antes de enviar
        if (newPassword !== confirmPassword) {
            setToast({ message: 'As senhas não coincidem.', type: 'error'});
            return;
        }
        if (newPassword.length < 6) {
            setToast({ message: 'A nova senha deve ter pelo menos 6 caracteres.', type: 'error'});
            return;
        }
        
        setIsLoading(true);

        try {
            const response = await fetch('https://us-central1-formbravo-8854e.cloudfunctions.net/updateCollaboratorPassword', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, newPassword }),
            });

            if(response.ok) {
                setToast({ message: 'Senha atualizada com sucesso! Redirecionando...', type: 'success' });
                sessionStorage.removeItem('collaborator_data');
                setTimeout(() => {
                    router.push('/'); 
                }, 3000);
            } else {
                const result = await response.json();
                setToast({ message: result.error || 'Não foi possível atualizar a senha.', type: 'error' });
            }
        } catch (err) {
            setToast({ message: 'Erro de comunicação com o servidor.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    if (!username) {
        return <div className={styles.main}><div className={styles.spinner}></div></div>;
    }

    return (
        <>
            <main className={styles.main}>
                <div className={styles.backgroundShapes}></div>
                <div className={styles.frame}>
                    <h2 style={{textAlign: 'center', marginBottom: '1rem', color: '#fff'}}>Crie sua Nova Senha</h2>
                    <p style={{textAlign: 'center', color: '#a0aec0', marginTop: 0, marginBottom: '2rem'}}>
                        Olá, <strong style={{color: '#fff'}}>{username}</strong>! Por segurança, defina uma senha pessoal e definitiva.
                    </p>
                    <form onSubmit={handleSubmit} className={styles.form}>
                        
                        {/* --- CAMPOS DE SENHA ADICIONADOS --- */}
                        <div className={styles.inputGroup}>
                            <KeyRound className={styles.inputIcon} size={20} />
                            <input 
                                type="password" 
                                value={newPassword} 
                                onChange={(e) => setNewPassword(e.target.value)} 
                                className={styles.input} 
                                placeholder="Nova Senha" 
                                required 
                            />
                        </div>
                        <div className={styles.inputGroup}>
                            <KeyRound className={styles.inputIcon} size={20} />
                            <input 
                                type="password" 
                                value={confirmPassword} 
                                onChange={(e) => setConfirmPassword(e.target.value)} 
                                className={styles.input} 
                                placeholder="Confirme a Nova Senha" 
                                required 
                            />
                        </div>
                        {/* --- FIM DA ADIÇÃO --- */}
                        
                        {/* O campo de erro foi removido daqui e será tratado pelo Toast */}

                        <button type="submit" className={styles.button} disabled={isLoading}>
                            {isLoading ? <div className={styles.spinner}></div> : <><LogIn size={20} /><span>Salvar Nova Senha</span></>}
                        </button>
                    </form>
                </div>
            </main>
            
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </>
    );
}