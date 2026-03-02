'use client';

import React, { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase/config';
import styles from '../app/styles/Login.module.css';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage('');
        setError('');

        try {
            await sendPasswordResetEmail(auth, email);
            setSuccess(true);
            setMessage('Email de recuperação enviado! Verifique sua caixa de entrada.');
        } catch (err: any) {
            console.error('Erro ao enviar email de recuperação:', err);
            
            switch (err.code) {
                case 'auth/user-not-found':
                    setError('Email não encontrado.');
                    break;
                case 'auth/invalid-email':
                    setError('Email inválido.');
                    break;
                case 'auth/too-many-requests':
                    setError('Muitas tentativas. Tente novamente mais tarde.');
                    break;
                default:
                    setError('Erro ao enviar email de recuperação. Tente novamente.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className={styles.main}>
            <div className={styles.frame}>
                {success ? (
                    <div>
                        <h3>Email Enviado!</h3>
                        <p className={styles.success}>{message}</p>
                        <p>Verifique sua caixa de entrada e spam.</p>
                    </div>
                ) : (
                    <form onSubmit={handleEmailSubmit}>
                        <h3>Recuperar Senha</h3>
                        <p>Digite seu e-mail para receber um link de recuperação.</p>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            required 
                            className={styles.input}
                            placeholder="seu@email.com"
                        />
                        {error && <p className={styles.error}>{error}</p>}
                        <button type="submit" disabled={isLoading} className={styles.button}>
                            {isLoading ? 'Enviando...' : 'Enviar Email'}
                        </button>
                    </form>
                )}
            </div>
        </main>
    );
}