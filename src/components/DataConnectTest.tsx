'use client';

import { useState } from 'react';
import styles from '../../app/styles/DataConnectTest.module.css';

export default function DataConnectTest() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [products, setProducts] = useState<any[]>([]);

  const testConnection = async () => {
    setStatus('loading');
    setMessage('Testando conexão com Data Connect...');

    try {
      // Fazer requisição para API route que vai testar o Data Connect
      const response = await fetch('/api/dataconnect/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setMessage('✅ Conexão com Data Connect estabelecida!');
        if (data.products) {
          setProducts(data.products);
        }
      } else {
        setStatus('error');
        setMessage(`❌ Erro: ${data.error}`);
      }
    } catch (error: any) {
      setStatus('error');
      setMessage(`❌ Erro ao conectar: ${error.message}`);
    }
  };

  const createTestProduct = async () => {
    setStatus('loading');
    setMessage('Criando produto de teste...');

    try {
      const response = await fetch('/api/dataconnect/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createProduct',
          data: {
            name: 'Produto Teste',
            price: 99.90,
            description: 'Produto criado via Data Connect',
            stock: 10
          }
        })
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setMessage('✅ Produto criado com sucesso!');
        testConnection(); // Recarregar lista
      } else {
        setStatus('error');
        setMessage(`❌ Erro: ${data.error}`);
      }
    } catch (error: any) {
      setStatus('error');
      setMessage(`❌ Erro ao criar produto: ${error.message}`);
    }
  };

  return (
    <div className={styles.container}>
      <h2>🧪 Teste Firebase Data Connect</h2>
      
      <div className={styles.actions}>
        <button onClick={testConnection} disabled={status === 'loading'}>
          {status === 'loading' ? 'Testando...' : 'Testar Conexão'}
        </button>
        
        <button onClick={createTestProduct} disabled={status === 'loading'}>
          Criar Produto Teste
        </button>
      </div>

      {message && (
        <div className={`${styles.message} ${styles[status]}`}>
          {message}
        </div>
      )}

      {products.length > 0 && (
        <div className={styles.products}>
          <h3>Produtos encontrados:</h3>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Preço</th>
                <th>Estoque</th>
                <th>Descrição</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, index) => (
                <tr key={index}>
                  <td>{product.name}</td>
                  <td>R$ {product.price?.toFixed(2)}</td>
                  <td>{product.stock}</td>
                  <td>{product.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.info}>
        <h3>ℹ️ Informações:</h3>
        <ul>
          <li><strong>Serviço:</strong> formbravo-8854e-service</li>
          <li><strong>Região:</strong> southamerica-east1</li>
          <li><strong>Banco:</strong> PostgreSQL (Cloud SQL)</li>
          <li><strong>Status Firestore:</strong> ✅ Não afetado (independente)</li>
        </ul>
      </div>
    </div>
  );
}
