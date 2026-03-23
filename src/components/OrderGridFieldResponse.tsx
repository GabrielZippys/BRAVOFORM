// src/components/OrderGridFieldResponse.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface OrderGridFieldResponseProps {
  field: any;
  value: any[];
  onChange: (value: any[]) => void;
  theme: any;
  disabled?: boolean;
}

export default function OrderGridFieldResponse({
  field,
  value = [],
  onChange,
  theme,
  disabled = false
}: OrderGridFieldResponseProps) {
  const catalogId = field.dataSource?.catalogId;
  const required = field.required;
  
  const [products, setProducts] = useState<Array<{
    id: string;
    nome: string;
    codigo?: string;
    unidade?: string;
    quantidadeMin: number;
    quantidadeMax: number;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Carregar produtos do catálogo
  useEffect(() => {
    if (!catalogId) {
      setProducts([]);
      return;
    }

    const loadProducts = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'products'), where('catalogId', '==', catalogId));
        const snapshot = await getDocs(q);
        const productsData = snapshot.docs.map(doc => ({
          id: doc.id,
          nome: doc.data().nome || '',
          codigo: doc.data().codigo || '',
          unidade: doc.data().unidade || 'UN',
          quantidadeMin: doc.data().quantidadeMin || 1,
          quantidadeMax: doc.data().quantidadeMax || 999,
        }));
        // Ordenar alfabeticamente por nome
        productsData.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        setProducts(productsData);
      } catch (error) {
        console.error('Erro ao carregar produtos:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [catalogId]);

  // Atualizar quantidade quando produto é selecionado
  useEffect(() => {
    if (selectedProductId) {
      const product = products.find(p => p.id === selectedProductId);
      if (product) {
        setQuantity(product.quantidadeMin);
      }
    }
  }, [selectedProductId, products]);

  const handleAddItem = () => {
    if (!selectedProductId) {
      alert('Selecione um produto');
      return;
    }

    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    if (quantity < product.quantidadeMin) {
      alert(`Quantidade mínima para ${product.nome}: ${product.quantidadeMin} ${product.unidade}`);
      return;
    }

    if (quantity > product.quantidadeMax) {
      alert(`Quantidade máxima para ${product.nome}: ${product.quantidadeMax} ${product.unidade}`);
      return;
    }

    const newItem = {
      id: `${Date.now()}`,
      productId: product.id,
      nome: product.nome,
      codigo: product.codigo,
      unidade: product.unidade,
      quantidade: quantity
    };

    onChange([...value, newItem]);
    setSelectedProductId('');
    setQuantity(1);
  };

  const handleRemoveItem = (itemId: string) => {
    onChange(value.filter(item => item.id !== itemId));
  };

  const handleQuantityChange = (newValue: number) => {
    const product = products.find(p => p.id === selectedProductId);
    const min = product?.quantidadeMin || 1;
    const max = product?.quantidadeMax || 999;
    
    if (newValue >= min && newValue <= max) {
      setQuantity(newValue);
    }
  };

  const handleEditItem = (itemId: string) => {
    const item = value.find(i => i.id === itemId);
    if (!item) return;
    setSelectedProductId(item.productId);
    setQuantity(item.quantidade);
    setEditingItemId(itemId);
  };

  const handleUpdateItem = () => {
    if (!editingItemId) return;
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    if (quantity < product.quantidadeMin) {
      alert(`Quantidade mínima para ${product.nome}: ${product.quantidadeMin} ${product.unidade}`);
      return;
    }

    if (quantity > product.quantidadeMax) {
      alert(`Quantidade máxima para ${product.nome}: ${product.quantidadeMax} ${product.unidade}`);
      return;
    }

    onChange(value.map(item =>
      item.id === editingItemId ? { ...item, quantidade: quantity } : item
    ));
    setEditingItemId(null);
    setSelectedProductId('');
    setQuantity(1);
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setSelectedProductId('');
    setQuantity(1);
    setSearchTerm('');
  };

  // Filtrar produtos baseado no termo de busca
  const filteredProducts = products.filter(product => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const nome = product.nome.toLowerCase();
    const codigo = (product.codigo || '').toLowerCase();
    return nome.includes(search) || codigo.includes(search);
  });

  if (!catalogId) {
    return <div style={{ color: '#ef4444', fontSize: 14 }}>Catálogo não configurado</div>;
  }

  return (
    <div style={{
      padding: '20px',
      background: '#fff',
      border: `1px solid ${theme.tableBorderColor}`,
      borderRadius: theme.borderRadius
    }}>
      <h4 style={{ 
        margin: '0 0 16px 0', 
        fontSize: '14px', 
        fontWeight: 600,
        color: '#374151'
      }}>
        Preview: Formulário de inclusão de produto
      </h4>

      {/* Campo de Busca e Seleção de Produtos */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '6px', 
          fontSize: '13px',
          fontWeight: 500,
          color: '#374151'
        }}>
          Referência ou Nome do Produto {required && <span style={{ color: '#ef4444' }}>*</span>}
        </label>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            const value = e.target.value;
            setSearchTerm(value);
            
            // Tentar encontrar produto correspondente
            const matchedProduct = products.find(p => {
              const productDisplay = p.codigo ? `${p.nome} - ${p.codigo}` : p.nome;
              return productDisplay === value;
            });
            
            if (matchedProduct) {
              setSelectedProductId(matchedProduct.id);
            } else {
              setSelectedProductId('');
            }
          }}
          placeholder={loading ? 'Carregando produtos...' : 'Digite para buscar...'}
          disabled={disabled || loading}
          list={`products-datalist-${catalogId}`}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: theme.borderRadius,
            fontSize: '16px',
            background: '#fff',
            color: '#374151',
          }}
        />
        <datalist id={`products-datalist-${catalogId}`}>
          {filteredProducts.map(product => (
            <option key={product.id} value={product.codigo ? `${product.nome} - ${product.codigo}` : product.nome} />
          ))}
        </datalist>
      </div>

      {/* Campo de Quantidade */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '6px', 
          fontSize: '13px',
          fontWeight: 500,
          color: '#374151'
        }}>
          Quantidade
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => handleQuantityChange(quantity - 1)}
            disabled={disabled}
            style={{
              width: '36px',
              height: '36px',
              border: '1px solid #d1d5db',
              borderRadius: theme.borderRadius,
              background: '#fff',
              color: '#374151',
              fontSize: '18px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            −
          </button>
          <input
            type="number"
            value={quantity}
            onChange={(e) => handleQuantityChange(parseFloat(e.target.value) || 1)}
            disabled={disabled}
            min={products.find(p => p.id === selectedProductId)?.quantidadeMin || 1}
            max={products.find(p => p.id === selectedProductId)?.quantidadeMax || 999}
            step="0.01"
            style={{
              flex: 1,
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: theme.borderRadius,
              fontSize: '14px',
              background: '#fff',
              color: '#374151',
              textAlign: 'center',
            }}
          />
          <button
            type="button"
            onClick={() => handleQuantityChange(quantity + 1)}
            disabled={disabled}
            style={{
              width: '36px',
              height: '36px',
              border: '1px solid #d1d5db',
              borderRadius: theme.borderRadius,
              background: '#fff',
              color: '#374151',
              fontSize: '18px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Botões Adicionar/Atualizar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={editingItemId ? handleUpdateItem : handleAddItem}
          disabled={disabled}
          style={{
            flex: 1,
            padding: '12px',
            background: editingItemId ? '#10b981' : theme.accentColor,
            border: 'none',
            borderRadius: theme.borderRadius,
            color: '#fff',
            fontSize: '14px',
            fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => !disabled && (e.currentTarget.style.opacity = '0.9')}
          onMouseOut={(e) => !disabled && (e.currentTarget.style.opacity = '1')}
        >
          {editingItemId ? '✓ Atualizar Item' : 'Adicionar ao Pedido +'}
        </button>
        {editingItemId && (
          <button
            type="button"
            onClick={handleCancelEdit}
            disabled={disabled}
            style={{
              padding: '12px 20px',
              background: '#6b7280',
              border: 'none',
              borderRadius: theme.borderRadius,
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => !disabled && (e.currentTarget.style.opacity = '0.9')}
            onMouseOut={(e) => !disabled && (e.currentTarget.style.opacity = '1')}
          >
            Cancelar
          </button>
        )}
      </div>

      {/* Tabela de Itens */}
      <div style={{
        borderRadius: theme.borderRadius,
        border: `1px solid ${theme.tableBorderColor}`,
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: theme.tableHeaderBg }}>
              <th style={{ 
                padding: '10px 12px', 
                textAlign: 'left',
                color: theme.tableHeaderFont,
                fontSize: '13px',
                fontWeight: 600,
                borderBottom: `1px solid ${theme.tableBorderColor}`
              }}>
                Produto
              </th>
              <th style={{ 
                padding: '10px 12px', 
                textAlign: 'center',
                color: theme.tableHeaderFont,
                fontSize: '13px',
                fontWeight: 600,
                borderBottom: `1px solid ${theme.tableBorderColor}`,
                width: '120px'
              }}>
                Qtd
              </th>
              <th style={{ 
                padding: '10px 12px', 
                textAlign: 'center',
                color: theme.tableHeaderFont,
                fontSize: '13px',
                fontWeight: 600,
                borderBottom: `1px solid ${theme.tableBorderColor}`,
                width: '80px'
              }}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {value.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ 
                  padding: '24px',
                  textAlign: 'center',
                  color: '#94a3b8',
                  fontSize: '13px',
                  fontStyle: 'italic',
                  background: theme.tableOddRowBg
                }}>
                  Os itens adicionados aparecerão aqui
                </td>
              </tr>
            ) : (
              value.map((item, index) => (
                <tr key={item.id} style={{ 
                  background: index % 2 === 0 ? theme.tableEvenRowBg : theme.tableOddRowBg 
                }}>
                  <td style={{ 
                    padding: '10px 12px',
                    fontSize: '13px',
                    color: '#374151',
                    borderBottom: `1px solid ${theme.tableBorderColor}`
                  }}>
                    {item.codigo ? `${item.codigo} - ${item.nome}` : item.nome}
                  </td>
                  <td style={{ 
                    padding: '10px 12px',
                    fontSize: '13px',
                    color: '#374151',
                    textAlign: 'center',
                    borderBottom: `1px solid ${theme.tableBorderColor}`
                  }}>
                    {item.quantidade} {item.unidade}
                  </td>
                  <td style={{ 
                    padding: '10px 12px',
                    textAlign: 'center',
                    borderBottom: `1px solid ${theme.tableBorderColor}`
                  }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleEditItem(item.id)}
                        disabled={disabled}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#3b82f6',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          padding: '4px',
                          fontSize: '18px'
                        }}
                        title="Editar item"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        disabled={disabled}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          padding: '4px',
                          fontSize: '18px'
                        }}
                        title="Remover item"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {value.length > 0 && (
            <tfoot>
              <tr style={{ background: theme.tableHeaderBg }}>
                <td style={{ 
                  padding: '10px 12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: theme.tableHeaderFont,
                  borderTop: `2px solid ${theme.tableBorderColor}`
                }}>
                  Total de Produtos: {value.length}
                </td>
                <td style={{ 
                  padding: '10px 12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: theme.tableHeaderFont,
                  textAlign: 'center',
                  borderTop: `2px solid ${theme.tableBorderColor}`
                }}>
                  Total: {value.reduce((sum, item) => sum + (parseFloat(item.quantidade) || 0), 0)}
                </td>
                <td style={{ 
                  padding: '10px 12px',
                  borderTop: `2px solid ${theme.tableBorderColor}`
                }}>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
