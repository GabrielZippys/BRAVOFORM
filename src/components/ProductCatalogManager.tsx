'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, X, Save, FolderOpen } from 'lucide-react';

interface ProductCatalog {
  id: string;
  name: string;
  description: string;
  collection: string;
  companyId: string;
  fields: {
    displayField: string;
    valueField: string;
    searchFields: string[];
    additionalFields: string[];
  };
  createdAt: any;
  updatedAt: any;
}

interface ProductCatalogManagerProps {
  companyId: string;
  onClose: () => void;
  onSelectCatalog: (catalog: ProductCatalog) => void;
}

const ProductCatalogManager: React.FC<ProductCatalogManagerProps> = ({ companyId, onClose, onSelectCatalog }) => {
  const [catalogs, setCatalogs] = useState<ProductCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCatalog, setEditingCatalog] = useState<ProductCatalog | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    collection: '',
    displayField: 'nome',
    valueField: 'id',
    searchFields: 'nome, codigo, ean',
    additionalFields: [] as string[],
  });

  // Products state for inline management
  const [products, setProducts] = useState<Array<{
    id?: string;
    nome: string;
    codigo?: string;
    unidade: 'UNI' | 'KG' | 'G' | 'FD' | 'DP';
    quantidadeMin: number;
    quantidadeMax: number;
  }>>([]);

  const [newProduct, setNewProduct] = useState({
    nome: '',
    codigo: '',
    unidade: 'UNI' as 'UNI' | 'KG' | 'G' | 'FD' | 'DP',
    quantidadeMin: 1,
    quantidadeMax: 999,
  });

  const [editingProductIndex, setEditingProductIndex] = useState<number | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImportText, setBulkImportText] = useState('');
  const [aiGeneratedProducts, setAiGeneratedProducts] = useState<typeof products>([]);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [showAIPreview, setShowAIPreview] = useState(false);

  useEffect(() => {
    loadCatalogs();
  }, [companyId]);

  const loadCatalogs = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/dataconnect/save-catalog?companyId=${encodeURIComponent(companyId)}`);
      const result = await res.json();
      if (result.success) {
        // Normaliza: SQL retorna campos no nível raiz, interface espera sub-objeto fields
        const normalized: ProductCatalog[] = result.data.map((c: any) => ({
          id: c.id,
          name: c.name,
          description: c.description || '',
          collection: 'products',
          companyId: c.companyId || companyId,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          fields: {
            displayField:    c.displayField    || c.fields?.displayField    || 'nome',
            valueField:      c.valueField      || c.fields?.valueField      || 'id',
            searchFields:    Array.isArray(c.searchFields)
              ? c.searchFields
              : (typeof c.searchFields === 'string' ? JSON.parse(c.searchFields || '[]') : []),
            additionalFields: c.additionalFields || c.fields?.additionalFields || [],
          },
        }));
        setCatalogs(normalized);
      } else {
        console.error('Erro ao carregar catálogos:', result.error);
        alert('Erro ao carregar catálogos');
      }
    } catch (error) {
      console.error('Erro ao carregar catálogos:', error);
      alert('Erro ao carregar catálogos');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCatalog = async () => {
    if (!formData.name) {
      alert('Preencha o nome do catálogo');
      return;
    }
    if (products.length === 0) {
      alert('Adicione pelo menos um produto ao catálogo');
      return;
    }

    try {
      // Gerar ou reutilizar ID do catálogo
      const catalogId = editingCatalog?.id || `cat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      // Salvar catálogo no SQL
      const catRes = await fetch('/api/dataconnect/save-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogId,
          name: formData.name,
          description: formData.description,
          companyId,
          displayField: 'nome',
          valueField: 'id',
          searchFields: ['nome', 'codigo', 'ean'],
          additionalFields: formData.additionalFields,
        }),
      });
      if (!(await catRes.json()).success) throw new Error('Falha ao salvar catálogo');

      if (editingCatalog) {
        // Deletar TODOS os produtos existentes do catálogo antes de reinserir
        // (evita acúmulo de duplicatas causado por importações repetidas ou IDs perdidos)
        const prevRes = await fetch(`/api/dataconnect/save-catalog?catalogId=${encodeURIComponent(catalogId)}`);
        const prevResult = await prevRes.json();
        const prevProducts: any[] = prevResult.success ? prevResult.data : [];
        for (const prev of prevProducts) {
          await fetch(`/api/dataconnect/save-product?id=${encodeURIComponent(prev.id)}`, { method: 'DELETE' });
        }
      }

      // Deduplicar lista atual por nome+código antes de salvar
      const seen = new Set<string>();
      const uniqueProducts = products.filter(p => {
        const key = `${p.nome.trim().toLowerCase()}|${(p.codigo || '').trim().toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Inserir todos os produtos únicos
      for (let i = 0; i < uniqueProducts.length; i++) {
        const product = uniqueProducts[i];
        const productId = product.id || `prod_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 9)}`;
        await fetch('/api/dataconnect/save-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId,
            catalogId,
            nome: product.nome,
            codigo: product.codigo || '',
            unidade: product.unidade,
            quantidadeMin: product.quantidadeMin,
            quantidadeMax: product.quantidadeMax,
            companyId,
          }),
        });
      }

      setSuccessMessage(
        editingCatalog
          ? `Catálogo atualizado com sucesso!\n${uniqueProducts.length} produto(s) no catálogo ✨`
          : `Catálogo criado com sucesso!\n${uniqueProducts.length} produto(s) adicionado(s) ✨`
      );
      setShowForm(false);
      setEditingCatalog(null);
      resetForm();
      setProducts([]);
      setShowSuccessModal(true);
      loadCatalogs();
    } catch (error) {
      console.error('Erro ao salvar catálogo:', error);
      alert('Erro ao salvar catálogo');
    }
  };

  const handleDeleteCatalog = async (catalogId: string) => {
    if (!confirm('Tem certeza que deseja excluir este catálogo?')) return;

    try {
      await fetch(`/api/dataconnect/save-catalog?id=${encodeURIComponent(catalogId)}`, { method: 'DELETE' });
      alert('Catálogo excluído com sucesso!');
      loadCatalogs();
    } catch (error) {
      console.error('Erro ao excluir catálogo:', error);
      alert('Erro ao excluir catálogo');
    }
  };

  const handleEditCatalog = async (catalog: ProductCatalog) => {
    setEditingCatalog(catalog);
    setFormData({
      name: catalog.name,
      description: catalog.description,
      collection: catalog.collection,
      displayField: catalog.fields.displayField,
      valueField: catalog.fields.valueField,
      searchFields: catalog.fields.searchFields.join(', '),
      additionalFields: catalog.fields.additionalFields || [],
    });

    // Carregar produtos do catálogo via SQL
    try {
      const res = await fetch(`/api/dataconnect/save-catalog?catalogId=${encodeURIComponent(catalog.id)}`);
      const result = await res.json();
      const productsData = result.success ? result.data.map((p: any) => ({
        id: p.id,
        nome: p.nome,
        codigo: p.codigo || '',
        unidade: p.unidade || 'UN',
        quantidadeMin: p.quantidadeMin || 1,
        quantidadeMax: p.quantidadeMax || 999,
      })) : [];
      // Ordenar alfabeticamente por nome
      productsData.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      setProducts(productsData);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    }

    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      collection: '',
      displayField: 'nome',
      valueField: 'id',
      searchFields: 'nome, codigo, ean',
      additionalFields: [],
    });
  };

  const handleAddProduct = () => {
    if (!newProduct.nome) {
      alert('Preencha o nome do produto');
      return;
    }

    if (editingProductIndex !== null) {
      // Atualizar produto existente — preservar o id original para não gerar duplicata no banco
      const updatedProducts = [...products];
      updatedProducts[editingProductIndex] = {
        ...newProduct,
        id: products[editingProductIndex].id,
      };
      setProducts(updatedProducts);
      setEditingProductIndex(null);
    } else {
      // Adicionar novo produto
      setProducts([...products, { ...newProduct }]);
    }

    setNewProduct({ 
      nome: '', 
      codigo: '',
      unidade: 'UNI',
      quantidadeMin: 1,
      quantidadeMax: 999,
    });
  };

  const handleEditProduct = (index: number) => {
    const product = products[index];
    setNewProduct({
      nome: product.nome,
      codigo: product.codigo || '',
      unidade: product.unidade,
      quantidadeMin: product.quantidadeMin,
      quantidadeMax: product.quantidadeMax,
    });
    setEditingProductIndex(index);
  };

  const handleCancelEdit = () => {
    setNewProduct({ 
      nome: '', 
      codigo: '',
      unidade: 'UNI',
      quantidadeMin: 1,
      quantidadeMax: 999,
    });
    setEditingProductIndex(null);
  };

  const handleRemoveProduct = (index: number) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  const handleProcessWithAI = async () => {
    if (!bulkImportText.trim()) {
      alert('Cole o texto com os produtos para processar');
      return;
    }

    setIsProcessingAI(true);

    try {
      const response = await fetch('/api/process-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: bulkImportText
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(errorData.error || 'Erro ao processar com IA');
      }

      const data = await response.json();
      const parsedProducts = data.products || [];

      const formattedProducts = parsedProducts.map((p: any) => ({
        nome: p.nome || '',
        codigo: p.codigo || '',
        unidade: ['UN', 'KG', 'L', 'CX', 'PC'].includes(p.unidade) ? p.unidade : 'UN',
        quantidadeMin: 1,
        quantidadeMax: 999,
      }));

      setAiGeneratedProducts(formattedProducts);
      setShowAIPreview(true);
    } catch (error) {
      console.error('Erro ao processar com IA:', error);
      alert(error instanceof Error ? error.message : 'Erro ao processar texto com IA. Tente novamente.');
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleApproveAIProducts = () => {
    setProducts([...products, ...aiGeneratedProducts]);
    setShowBulkImport(false);
    setShowAIPreview(false);
    setBulkImportText('');
    setAiGeneratedProducts([]);
    alert(`✅ ${aiGeneratedProducts.length} produto(s) adicionado(s) com sucesso!`);
  };

  const handleBulkImport = () => {
    if (!bulkImportText.trim()) {
      alert('Cole o texto com os produtos para importar');
      return;
    }

    const lines = bulkImportText.split('\n').filter(line => line.trim() !== '');
    const importedProducts: typeof products = [];

    for (const line of lines) {
      // Detectar diferentes formatos:
      // 1. "Nome | Código | Preço" ou "Nome, Código, Preço"
      // 2. "Nome - Código - Preço"
      // 3. "Nome (Código) Preço"
      // 4. Apenas "Nome"
      
      let nome = '';
      let codigo = '';
      let valorUnitario = 0;

      // Tentar detectar separadores
      if (line.includes('|')) {
        const parts = line.split('|').map(p => p.trim());
        nome = parts[0] || '';
        codigo = parts[1] || '';
        valorUnitario = parseFloat(parts[2]?.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
      } else if (line.includes('\t')) {
        // Tab-separated (Excel paste)
        const parts = line.split('\t').map(p => p.trim());
        nome = parts[0] || '';
        codigo = parts[1] || '';
        valorUnitario = parseFloat(parts[2]?.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
      } else if (line.match(/^(.+?)\s*-\s*(.+?)\s*-\s*(.+)$/)) {
        // Formato: Nome - Código - Preço
        const match = line.match(/^(.+?)\s*-\s*(.+?)\s*-\s*(.+)$/);
        if (match) {
          nome = match[1].trim();
          codigo = match[2].trim();
          valorUnitario = parseFloat(match[3].replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        }
      } else if (line.match(/^(.+?)\s*\((.+?)\)\s*(.*)$/)) {
        // Formato: Nome (Código) Preço
        const match = line.match(/^(.+?)\s*\((.+?)\)\s*(.*)$/);
        if (match) {
          nome = match[1].trim();
          codigo = match[2].trim();
          valorUnitario = parseFloat(match[3].replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        }
      } else if (line.includes(',')) {
        // CSV format
        const parts = line.split(',').map(p => p.trim());
        nome = parts[0] || '';
        codigo = parts[1] || '';
        valorUnitario = parseFloat(parts[2]?.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
      } else {
        // Apenas nome
        nome = line.trim();
      }

      if (nome) {
        importedProducts.push({
          nome,
          codigo,
          unidade: 'UNI',
          quantidadeMin: 1,
          quantidadeMax: 999,
        });
      }
    }

    if (importedProducts.length === 0) {
      alert('Nenhum produto válido encontrado no texto');
      return;
    }

    setProducts([...products, ...importedProducts]);
    setShowBulkImport(false);
    setBulkImportText('');
    alert(`✅ ${importedProducts.length} produto(s) importado(s) com sucesso!`);
  };

  const modalStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px',
  };

  const contentStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #1F2937 0%, #111827 100%)',
    borderRadius: '16px',
    padding: '28px',
    maxWidth: '700px',
    width: '90%',
    maxHeight: '85vh',
    overflowY: 'auto',
    color: '#fff',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(99, 102, 241, 0.1)',
    position: 'relative',
    margin: 'auto',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(51, 65, 85, 0.6)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    transition: 'all 0.2s',
    outline: 'none',
  };

  const buttonStyle = (variant: 'primary' | 'secondary' | 'danger' = 'primary'): React.CSSProperties => ({
    padding: '8px 16px',
    background: variant === 'primary' ? '#3b82f6' : variant === 'danger' ? '#ef4444' : '#64748b',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  });

  return (
    <div
      style={modalStyle}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div style={contentStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              boxShadow: '0 8px 16px rgba(99, 102, 241, 0.3)'
            }}>
              📁
            </div>
            <h2 style={{ margin: 0, fontSize: '24px', color: '#fff', fontWeight: 700 }}>
              Gerenciar Catálogos
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {!showForm && (
              <button
                onClick={() => {
                  setShowForm(true);
                  setEditingCatalog(null);
                  resetForm();
                  setProducts([]);
                }}
                style={{
                  background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
                  transition: 'all 0.2s',
                }}
                title="Novo catálogo"
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(99, 102, 241, 0.5)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.4)';
                }}
              >
                <Plus size={20} />
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'rgba(51, 65, 85, 0.3)',
                border: 'none',
                borderRadius: '10px',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '10px',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                e.currentTarget.style.color = '#ef4444';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(51, 65, 85, 0.3)';
                e.currentTarget.style.color = '#94a3b8';
              }}
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {!showForm ? (
          <>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                Carregando catálogos...
              </div>
            ) : catalogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
                <h3 style={{ color: '#94a3b8', fontSize: '16px', margin: 0 }}>
                  Sem listas cadastradas
                </h3>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {catalogs.map((catalog) => (
                  <div
                    key={catalog.id}
                    style={{
                      padding: '20px',
                      background: '#1a2332',
                      borderRadius: '8px',
                      border: '1px solid #2d3748',
                      marginBottom: '16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      position: 'relative',
                    }}
                    onClick={() => {
                      onSelectCatalog(catalog);
                      onClose();
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = '#667eea';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = '#2d3748';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {/* Ícones de ação no canto superior direito */}
                    <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '8px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditCatalog(catalog);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = '#334155';
                          e.currentTarget.style.color = '#fff';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'none';
                          e.currentTarget.style.color = '#94a3b8';
                        }}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCatalog(catalog.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = '#ef4444';
                          e.currentTarget.style.color = '#fff';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'none';
                          e.currentTarget.style.color = '#94a3b8';
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Nome do catálogo */}
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#fff', fontWeight: 600, paddingRight: '60px' }}>
                      {catalog.name}
                    </h3>

                    {/* Descrição */}
                    <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: '1.5' }}>
                      {catalog.description || 'Sem descrição'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#60a5fa' }}>
              {editingCatalog ? 'Editar Catálogo' : 'Novo Catálogo'}
            </h3>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#94a3b8' }}>
                Nome do Catálogo *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Produtos Coca-Cola"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#94a3b8' }}>
                Descrição
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Ex: Bebidas da linha Coca-Cola"
                style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
              />
            </div>

            {/* Lista de Produtos */}
            <div style={{ 
              padding: '16px', 
              background: '#0f172a', 
              borderRadius: '8px',
              border: '1px solid #334155'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', color: '#fff' }}>
                  📦 Produtos do Catálogo ({products.length})
                </h4>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {editingProductIndex !== null && (
                    <>
                      <span style={{ fontSize: '12px', color: '#60a5fa' }}>✏️ Editando produto</span>
                      <button
                        onClick={handleCancelEdit}
                        type="button"
                        style={{
                          padding: '4px 8px',
                          background: '#334155',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '11px',
                        }}
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setShowBulkImport(true)}
                    type="button"
                    style={{
                      padding: '6px 12px',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title="Importar vários produtos de uma vez"
                  >
                    📋 Importar em Massa
                  </button>
                </div>
              </div>

              {/* Formulário para adicionar produto */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
                {/* Linha 1: Nome e Código */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={newProduct.nome}
                    onChange={(e) => setNewProduct({ ...newProduct, nome: e.target.value })}
                    placeholder="Nome do produto *"
                    style={{ ...inputStyle, flex: 2 }}
                  />
                  <input
                    type="text"
                    value={newProduct.codigo}
                    onChange={(e) => setNewProduct({ ...newProduct, codigo: e.target.value })}
                    placeholder="Código"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>

                {/* Linha 2: Unidade, Min, Max, Step */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#94a3b8' }}>
                      Unidade
                    </label>
                    <select
                      value={newProduct.unidade}
                      onChange={(e) => setNewProduct({ ...newProduct, unidade: e.target.value as any })}
                      style={inputStyle}
                    >
                      <option value="UNI">Unidade (UNI)</option>
                      <option value="KG">Quilo (KG)</option>
                      <option value="G">Grama (G)</option>
                      <option value="FD">Fardo (FD)</option>
                      <option value="DP">Display (DP)</option>
                    </select>
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#94a3b8' }}>
                      Mín
                    </label>
                    <input
                      type="number"
                      value={newProduct.quantidadeMin}
                      onChange={(e) => setNewProduct({ ...newProduct, quantidadeMin: parseFloat(e.target.value) || 0 })}
                      placeholder="Mín"
                      step="0.01"
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#94a3b8' }}>
                      Máx
                    </label>
                    <input
                      type="number"
                      value={newProduct.quantidadeMax}
                      onChange={(e) => setNewProduct({ ...newProduct, quantidadeMax: parseFloat(e.target.value) || 999 })}
                      placeholder="Máx"
                      step="0.01"
                      style={inputStyle}
                    />
                  </div>


                  <button
                    onClick={handleAddProduct}
                    type="button"
                    style={{
                      padding: '8px 12px',
                      background: editingProductIndex !== null ? '#60a5fa' : '#10b981',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '12px',
                      whiteSpace: 'nowrap',
                      height: '38px',
                    }}
                    title={editingProductIndex !== null ? 'Salvar alterações' : 'Adicionar produto'}
                  >
                    {editingProductIndex !== null ? <Save size={16} /> : <Plus size={16} />}
                  </button>
                </div>
              </div>

              {/* Lista de produtos adicionados */}
              {products.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {products.map((product, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '8px 12px',
                        background: '#1a2332',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ fontSize: '13px', color: '#fff', flex: 1 }}>
                        <div>
                          <strong>{product.nome}</strong>
                          {product.codigo && <span style={{ color: '#94a3b8', marginLeft: '8px' }}>Cód: {product.codigo}</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          {product.unidade} • Min: {product.quantidadeMin} • Max: {product.quantidadeMax}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => handleEditProduct(index)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#60a5fa',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleRemoveProduct(index)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '13px' }}>
                  Nenhum produto adicionado. Digite o nome e clique em + para adicionar.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingCatalog(null);
                  resetForm();
                }}
                style={buttonStyle('secondary')}
              >
                Cancelar
              </button>
              <button onClick={handleSaveCatalog} style={buttonStyle('primary')}>
                <Save size={16} /> Salvar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Importação em Massa */}
      {showBulkImport && (
        <div style={modalStyle} onClick={() => {
          setShowBulkImport(false);
          setShowAIPreview(false);
          setAiGeneratedProducts([]);
        }}>
          <div style={{
            ...contentStyle,
            maxWidth: showAIPreview ? '1200px' : '600px',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>
                Importação Inteligente com IA
              </h3>
              <button
                onClick={() => {
                  setShowBulkImport(false);
                  setShowAIPreview(false);
                  setAiGeneratedProducts([]);
                }}
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

            <div style={{ display: 'flex', gap: '20px' }}>
              {/* Coluna Esquerda - Input */}
              <div style={{ flex: showAIPreview ? 1 : 1 }}>
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 12px 0', lineHeight: '1.6' }}>
                    Cole o texto contendo a lista de produtos. O sistema extrairá automaticamente as informações.
                  </p>
                  <div style={{
                    padding: '12px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    borderRadius: '6px',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    marginBottom: '16px',
                  }}>
                    <p style={{ fontSize: '12px', color: '#10b981', margin: 0, lineHeight: '1.6' }}>
                      <strong>Processamento Inteligente:</strong> Aceita texto não estruturado, planilhas, listas ou qualquer formato. O sistema identificará e organizará os dados automaticamente.
                    </p>
                  </div>
                </div>

                <textarea
                  value={bulkImportText}
                  onChange={(e) => setBulkImportText(e.target.value)}
                  placeholder="Cole aqui o texto com os produtos..."
                  style={{
                    ...inputStyle,
                    minHeight: '300px',
                    resize: 'vertical',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                  }}
                  disabled={isProcessingAI}
                />

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                  <button
                    onClick={() => {
                      setShowBulkImport(false);
                      setBulkImportText('');
                      setShowAIPreview(false);
                      setAiGeneratedProducts([]);
                    }}
                    style={buttonStyle('secondary')}
                    disabled={isProcessingAI}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleProcessWithAI}
                    style={{
                      ...buttonStyle('primary'),
                      background: isProcessingAI 
                        ? '#64748b' 
                        : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      cursor: isProcessingAI ? 'not-allowed' : 'pointer',
                    }}
                    disabled={isProcessingAI}
                  >
                    {isProcessingAI ? 'Processando...' : 'Processar'}
                  </button>
                </div>
              </div>

              {/* Coluna Direita - Prévia */}
              {showAIPreview && (
                <div style={{ flex: 1, borderLeft: '1px solid #334155', paddingLeft: '20px' }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#10b981' }}>
                    Produtos Detectados ({aiGeneratedProducts.length})
                  </h4>
                  
                  <div style={{
                    maxHeight: '400px',
                    overflowY: 'auto',
                    marginBottom: '16px',
                  }}>
                    {aiGeneratedProducts.map((product, index) => (
                      <div
                        key={index}
                        style={{
                          padding: '12px',
                          background: '#1a2332',
                          borderRadius: '6px',
                          marginBottom: '8px',
                          border: '1px solid #334155',
                        }}
                      >
                        <div style={{ fontSize: '14px', color: '#fff', fontWeight: 600, marginBottom: '4px' }}>
                          {product.nome}
                        </div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          {product.codigo && <span>Código: {product.codigo}</span>}
                          <span>Unidade: {product.unidade}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{
                    padding: '12px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    borderRadius: '6px',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    marginBottom: '16px',
                  }}>
                    <p style={{ fontSize: '12px', color: '#10b981', margin: 0 }}>
                      Revise os produtos detectados e clique em "Aprovar e Adicionar" para incluí-los no catálogo.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={() => {
                        setShowAIPreview(false);
                        setAiGeneratedProducts([]);
                      }}
                      style={buttonStyle('secondary')}
                    >
                      Rejeitar
                    </button>
                    <button
                      onClick={handleApproveAIProducts}
                      style={{
                        ...buttonStyle('primary'),
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        flex: 1,
                      }}
                    >
                      Aprovar e Adicionar ({aiGeneratedProducts.length})
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Sucesso com Animação */}
      {showSuccessModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          animation: 'fadeIn 0.3s ease-in-out',
        }}>
          <style>
            {`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes slideUp {
                from { 
                  transform: translateY(30px) scale(0.9);
                  opacity: 0;
                }
                to { 
                  transform: translateY(0) scale(1);
                  opacity: 1;
                }
              }
              @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
              }
              @keyframes confetti {
                0% { transform: translateY(0) rotate(0deg); opacity: 1; }
                100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
              }
            `}
          </style>
          
          {/* Confetes */}
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: '-10px',
                left: `${Math.random() * 100}%`,
                width: '10px',
                height: '10px',
                background: ['#667eea', '#764ba2', '#10b981', '#f59e0b', '#ef4444'][i % 5],
                animation: `confetti ${2 + Math.random() * 2}s linear ${Math.random() * 0.5}s`,
                borderRadius: '2px',
              }}
            />
          ))}

          <div style={{
            background: 'linear-gradient(135deg, #1a2332 0%, #0f172a 100%)',
            borderRadius: '16px',
            padding: '40px',
            maxWidth: '500px',
            width: '90%',
            border: '2px solid #667eea',
            boxShadow: '0 20px 60px rgba(102, 126, 234, 0.3)',
            animation: 'slideUp 0.5s ease-out',
            textAlign: 'center',
          }}>
            {/* Ícone de Sucesso Animado */}
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              margin: '0 auto 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '40px',
              animation: 'pulse 1s ease-in-out infinite',
              boxShadow: '0 10px 30px rgba(16, 185, 129, 0.4)',
            }}>
              ✓
            </div>

            {/* Mensagem */}
            <h2 style={{
              margin: '0 0 12px 0',
              fontSize: '24px',
              color: '#fff',
              fontWeight: 700,
            }}>
              Sucesso!
            </h2>
            <p style={{
              margin: '0 0 32px 0',
              fontSize: '16px',
              color: '#94a3b8',
              lineHeight: '1.6',
              whiteSpace: 'pre-line',
            }}>
              {successMessage}
            </p>

            {/* Botão OK */}
            <button
              onClick={() => setShowSuccessModal(false)}
              style={{
                padding: '14px 40px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                transition: 'all 0.3s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductCatalogManager;
