'use client';

import React, { useState } from 'react';
import styles from '../app/styles/Login.module.css'; // Reutilizando estilos

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [answers, setAnswers] = useState(['', '']); // Exemplo para 2 perguntas
    const [step, setStep] = useState(1); // 1 para email, 2 para perguntas
    const [securityQuestions, setSecurityQuestions] = useState<string[]>([]);
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        // Lógica para buscar as perguntas de segurança do usuário (usando uma Cloud Function)
        // Por simplicidade, vamos usar perguntas fixas aqui:
        setSecurityQuestions(["Qual o nome do seu primeiro animal de estimação?", "Qual a sua cidade natal?"]);
        setStep(2);
        setIsLoading(false);
    };

    const handleAnswersSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage('');

        // Esta é a chamada para a nossa nova Cloud Function
        try {
            const response = await fetch('URL_DA_SUA_NOVA_FUNCAO_requestPasswordReset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, answers }),
            });
            
            const result = await response.json();

            if (response.ok) {
                setMessage('Solicitação enviada! Um administrador irá rever seu pedido.');
                setStep(3); // Etapa de sucesso
            } else {
                setMessage(result.error || 'Falha ao verificar as respostas.');
            }
        } catch (error) {
            setMessage('Erro de comunicação. Tente novamente.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className={styles.main}>
            <div className={styles.frame}>
                {step === 1 && (
                    <form onSubmit={handleEmailSubmit}>
                        <h3>Recuperar Senha</h3>
                        <p>Digite seu e-mail para começar.</p>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={styles.input} />
                        <button type="submit" disabled={isLoading} className={styles.button}>{isLoading ? 'Buscando...' : 'Continuar'}</button>
                    </form>
                )}
                {step === 2 && (
                    <form onSubmit={handleAnswersSubmit}>
                        <h3>Perguntas de Segurança</h3>
                        {securityQuestions.map((q, index) => (
                            <div key={index}>
                                <label className={styles.label}>{q}</label>
                                <input type="text" onChange={(e) => {
                                    const newAnswers = [...answers];
                                    newAnswers[index] = e.target.value;
                                    setAnswers(newAnswers);
                                }} required className={styles.input} />
                            </div>
                        ))}
                        <button type="submit" disabled={isLoading} className={styles.button}>{isLoading ? 'Verificando...' : 'Enviar Respostas'}</button>
                    </form>
                )}
                {step === 3 && (
                    <div>
                        <h3>Solicitação Enviada</h3>
                        <p>{message}</p>
                    </div>
                )}
                {message && step !== 3 && <p className={styles.error}>{message}</p>}
            </div>
        </main>
    );
}