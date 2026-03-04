'use client';

import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Plus, Trash2, X } from 'lucide-react';

interface Product {
  id: string;
  catalogId: string;
  nome: string;
  codigo?: string;
  ean?: string;
  preco?: number;
  estoque?: number;
  [key: string]: any; // Campos adicionais
}

interface ProductManagerProps {
  catalogId: string;
  catalogName: string;
  displayField: string;
  searchFields: string[];
  onClose: () => void;
}

const ProductManager: React.FC<ProductManagerProps> = ({
  catalogId,
  catalogName,
  displayField,
  searchFields,
  onClose,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<any>({
    nome: '',
    codigo: '',
    ean: '',
    preco: '',
    estoque: '',
  });

  useEffect(() => {
    loadProducts();
  }, [catalogId]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'products'),
        where('catalogId', '==', catalogId)
      );
      const snapshot = await getDocs(q);
      const productsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Product[];
      setProducts(productsData);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
      alert('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProduct = async () => {
    if (!formData.nome) {
      alert('Preencha o nome do produto');
      return;
    }

    try {
      const productData = {
        catalogId,
        nome: formData.nome,
        codigo: formData.codigo || '',
        ean: formData.ean || '',
        preco: formData.preco ? parseFloat(formData.preco) : 0,
        estoque: formData.estoque ? parseInt(formData.estoque) : 0,
        updatedAt: serverTimestamp(),
      };

      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), productData);
        alert('Produto atualizado com sucesso!');
      } else {
        await addDoc(collection(db, 'products'), {
          ...productData,
          createdAt: serverTimestamp(),
        });
        alert('Produto criado com sucesso!');
      }

      setShowForm(false);
      setEditingProduct(null);
      resetForm();
      loadProducts();
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      alert('Erro ao salvar produto');
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      nome: product.nome,
      codigo: product.codigo || '',
      ean: product.ean || '',
      preco: product.preco || '',
      estoque: product.estoque || '',
    });
    setShowForm(true);
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;

    try {
      await deleteDoc(doc(db, 'products', productId));
      alert('Produto excluído com sucesso!');
      loadProducts();
    } catch (error) {
      console.error('Erro ao excluir produto:', error);
      alert('Erro ao excluir produto');
    }
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      codigo: '',
      ean: '',
      preco: '',
      estoque: '',
    });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: '#1a2332',
    border: '1px solid #2d3748',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
  };

  const buttonStyle = (variant: 'primary' | 'secondary' | 'danger' = 'primary'): React.CSSProperties => {
    const colors = {
      primary: { bg: '#3b82f6', border: '#3b82f6' },
      secondary: { bg: '#64748b', border: '#64748b' },
      danger: { bg: '#ef4444', border: '#ef4444' },
    };
    return {
      padding: '8px 16px',
      background: colors[variant].bg,
      border: `1px solid ${colors[variant].border}`,
      borderRadius: '6px',
      color: '#fff',
      fontSize: '13px',
      cursor: 'pointer',
      fontWeight: 500,
    };
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px',
    }}>
      <div style={{
        background: '#0f172a',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '900px',
        maxHeight: '90vh',
        overflow: 'auto',
        border: '1px solid #334155',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: '#0f172a',
          zIndex: 1,
        }}>
          <div>
            <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', color: '#fff' }}>
              📦 Produtos - {catalogName}
            </h2>
            <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
              {products.length} produto(s) cadastrado(s)
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '8px',
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          {!showForm ? (
            <>
              <button
                onClick={() => {
                  setEditingProduct(null);
                  resetForm();
                  setShowForm(true);
                }}
                style={{
                  ...buttonStyle('primary'),
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Plus size={16} /> Novo Produto
              </button>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  Carregando produtos...
                </div>
              ) : products.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  Nenhum produto cadastrado. Clique em "Novo Produto" para adicionar.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {products.map(product => (
                    <div
                      key={product.id}
                      style={{
                        padding: '16px',
                        background: '#1a2332',
                        borderRadius: '8px',
                        border: '1px solid #2d3748',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#fff' }}>
                            {product[displayField] || product.nome}
                          </h3>
                          <div style={{ fontSize: '13px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {product.codigo && <div>Código: {product.codigo}</div>}
                            {product.ean && <div>EAN: {product.ean}</div>}
                            {product.preco && <div>Preço: R$ {product.preco.toFixed(2)}</div>}
                            {product.estoque !== undefined && <div>Estoque: {product.estoque}</div>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleEditProduct(product)}
                            style={{
                              ...buttonStyle('secondary'),
                              fontSize: '12px',
                              padding: '6px 12px',
                            }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product.id)}
                            style={{
                              ...buttonStyle('danger'),
                              fontSize: '12px',
                              padding: '6px 12px',
                            }}
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>
                {editingProduct ? 'Editar Produto' : 'Novo Produto'}
              </h3>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#94a3b8' }}>
                  Nome do Produto *
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Coca-Cola 1L"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#94a3b8' }}>
                    Código
                  </label>
                  <input
                    type="text"
                    value={formData.codigo}
                    onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                    placeholder="Ex: 001"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#94a3b8' }}>
                    EAN/Código de Barras
                  </label>
                  <input
                    type="text"
                    value={formData.ean}
                    onChange={(e) => setFormData({ ...formData, ean: e.target.value })}
                    placeholder="Ex: 7894900011517"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#94a3b8' }}>
                    Preço (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.preco}
                    onChange={(e) => setFormData({ ...formData, preco: e.target.value })}
                    placeholder="Ex: 5.50"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#94a3b8' }}>
                    Estoque
                  </label>
                  <input
                    type="number"
                    value={formData.estoque}
                    onChange={(e) => setFormData({ ...formData, estoque: e.target.value })}
                    placeholder="Ex: 100"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditingProduct(null);
                    resetForm();
                  }}
                  style={buttonStyle('secondary')}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveProduct}
                  style={buttonStyle('primary')}
                >
                  {editingProduct ? 'Atualizar Produto' : 'Criar Produto'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductManager;
