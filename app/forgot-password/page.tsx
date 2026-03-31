'use client';

import React, { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../firebase/config';
import styles from '../styles/entrada.module.css';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail, CheckCircle } from 'lucide-react';
import Image from 'next/image';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const router = useRouter();

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
            <div className={styles.backgroundShapes} />
            <div className={`${styles.frame} ${styles.floatUp}`}>
                <div className={styles.cardTopGlow} />
                
                <button 
                    onClick={() => router.push('/')} 
                    style={{
                        position: 'absolute',
                        top: '20px',
                        left: '20px',
                        background: 'transparent',
                        border: 'none',
                        color: '#9ca3af',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '14px',
                        fontWeight: '600',
                        transition: 'color 0.2s',
                        zIndex: 10
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#60a5fa'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
                >
                    <ArrowLeft size={18} />
                    Voltar
                </button>

                <div className={styles.logoContainer}>
                    <Image
                        src="/formbravo-logo.png"
                        alt="Logo FORMBRAVO"
                        width={120}
                        height={120}
                        priority
                        className={styles.logo}
                    />
                </div>

                {success ? (
                    <div style={{ textAlign: 'center', padding: '30px 20px' }}>
                        <div style={{ 
                            width: '80px', 
                            height: '80px', 
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 30px',
                            boxShadow: '0 8px 24px rgba(16, 185, 129, 0.3)'
                        }}>
                            <CheckCircle size={48} style={{ color: 'white' }} />
                        </div>
                        
                        <h3 style={{ 
                            marginBottom: '16px', 
                            fontSize: '28px', 
                            fontWeight: '700', 
                            color: '#f9fafb',
                            letterSpacing: '-0.5px'
                        }}>
                            Email Enviado!
                        </h3>
                        
                        <p style={{ 
                            marginBottom: '12px', 
                            color: '#d1d5db', 
                            fontSize: '16px',
                            lineHeight: '1.6'
                        }}>
                            {message}
                        </p>
                        
                        <p style={{ 
                            color: '#9ca3af', 
                            fontSize: '14px', 
                            marginBottom: '32px',
                            lineHeight: '1.5'
                        }}>
                            Verifique sua caixa de entrada e spam.
                        </p>
                        
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <button 
                                onClick={() => router.push('/')} 
                                className={`${styles.button} ${styles.sweep}`}
                                style={{ minWidth: '200px' }}
                            >
                                Voltar ao Login
                            </button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleEmailSubmit} className={styles.form}>
                        <h3 style={{ 
                            marginBottom: '8px', 
                            fontSize: '24px', 
                            fontWeight: '700', 
                            textAlign: 'center',
                            color: '#f9fafb'
                        }}>
                            Recuperar Senha
                        </h3>
                        <p style={{ 
                            marginBottom: '24px', 
                            color: '#9ca3af', 
                            fontSize: '14px', 
                            textAlign: 'center',
                            lineHeight: '1.5'
                        }}>
                            Digite seu e-mail para receber um link de recuperação.
                        </p>
                        
                        <div className={styles.inputGroup}>
                            <Mail className={styles.inputIcon} size={20} />
                            <input 
                                type="email" 
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)} 
                                required 
                                className={styles.input}
                                placeholder="@email.com"
                                disabled={isLoading}
                            />
                        </div>
                        
                        {error && (
                            <div className={`${styles.errorContainer} ${styles.popIn}`} style={{ marginTop: '16px' }}>
                                <p className={styles.error}>{error}</p>
                            </div>
                        )}
                        
                        <button 
                            type="submit" 
                            disabled={isLoading} 
                            className={`${styles.button} ${styles.sweep}`}
                            style={{ marginTop: '20px' }}
                        >
                            {isLoading ? <div className={styles.spinner} /> : 'ENVIAR EMAIL'}
                        </button>
                    </form>
                )}
            </div>
        </main>
    );
}
