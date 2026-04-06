'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { OrderGridField, VariationConfig, QuantityConfig } from '@/types';
import ProductCatalogManager from './ProductCatalogManager';

interface OrderGridBuilderProps {
  field: Partial<OrderGridField>;
  updateField: (updates: Partial<OrderGridField>) => void;
  companyId?: string;
}

interface ProductCatalog {
  id: string;
  name: string;
  collection: string;
  fields: {
    displayField: string;
    valueField: string;
    searchFields: string[];
  };
}

const OrderGridBuilder: React.FC<OrderGridBuilderProps> = ({ field, updateField, companyId = '' }) => {
  const [activeTab, setActiveTab] = useState<'datasource' | 'advanced'>('datasource');
  const [showCatalogManager, setShowCatalogManager] = useState(false);
  const [catalogs, setCatalogs] = useState<ProductCatalog[]>([]);

  useEffect(() => {
    if (companyId) {
      loadCatalogs();
    }
  }, [companyId]);

  const loadCatalogs = async () => {
    try {
      const res = await fetch(`/api/dataconnect/save-catalog?companyId=${encodeURIComponent(companyId)}`);
      const result = await res.json();
      if (result.success) {
        setCatalogs(result.data.map((c: any) => ({
          id: c.id,
          name: c.name,
          collection: 'products',
          fields: {
            displayField: c.displayField || 'nome',
            valueField: c.valueField || 'id',
            searchFields: Array.isArray(c.searchFields)
              ? c.searchFields
              : (c.searchFields ? JSON.parse(c.searchFields) : ['nome']),
          },
        })));
      }
    } catch (error) {
      console.error('Erro ao carregar catálogos:', error);
    }
  };

  const handleSelectCatalog = (catalog: any) => {
    updateField({
      dataSource: {
        type: 'firestore',
        collection: catalog.collection,
        displayField: catalog.fields.displayField,
        valueField: catalog.fields.valueField,
        searchFields: catalog.fields.searchFields,
      } as any,
    });
    setShowCatalogManager(false);
  };

  const handleDataSourceChange = (key: string, value: any) => {
    updateField({
      dataSource: {
        ...field.dataSource,
        type: 'firestore',
        [key]: value,
      } as any,
    });
  };

  const addVariation = () => {
    const newVariation: VariationConfig = {
      id: `var_${Date.now()}`,
      label: `Variação ${(field.variations?.length || 0) + 1}`,
      dependsOn: '',
      required: false,
      fieldType: 'select',
    };
    updateField({
      variations: [...(field.variations || []), newVariation],
    });
  };

  const updateVariation = (index: number, updates: Partial<VariationConfig>) => {
    const variations = [...(field.variations || [])];
    variations[index] = { ...variations[index], ...updates };
    updateField({ variations });
  };

  const removeVariation = (index: number) => {
    const variations = field.variations?.filter((_, i) => i !== index) || [];
    updateField({ variations });
  };

  const handleQuantityChange = (key: keyof QuantityConfig, value: any) => {
    updateField({
      quantityConfig: {
        ...field.quantityConfig,
        [key]: value,
      } as QuantityConfig,
    });
  };

  const handleAdvancedFeatureToggle = (feature: string, value: boolean) => {
    updateField({
      advancedFeatures: {
        ...field.advancedFeatures,
        [feature]: value,
      } as any,
    });
  };

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    background: isActive ? '#3b82f6' : 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: isActive ? 600 : 400,
    transition: 'all 0.2s',
  });

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: '#1a2332',
    border: '1px solid #2d3748',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '12px',
    color: '#94a3b8',
    fontWeight: 500,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #2d3748', paddingBottom: '8px' }}>
        <button onClick={() => setActiveTab('datasource')} style={tabStyle(activeTab === 'datasource')}>
          📦 Fonte de Dados
        </button>
        <button onClick={() => setActiveTab('advanced')} style={tabStyle(activeTab === 'advanced')}>
          ⚡ Avançado
        </button>
      </div>

      {/* Aba: Fonte de Dados */}
      {activeTab === 'datasource' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Catálogo de Produtos</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                value={field.dataSource?.collection || ''}
                onChange={(e) => {
                  const selectedCatalog = catalogs.find(c => c.collection === e.target.value);
                  if (selectedCatalog) {
                    handleSelectCatalog(selectedCatalog);
                  } else {
                    handleDataSourceChange('collection', e.target.value);
                  }
                }}
                style={{ ...inputStyle, flex: 1 }}
              >
                <option value="">Selecione um catálogo...</option>
                {catalogs.map(catalog => (
                  <option key={catalog.id} value={catalog.collection}>
                    {catalog.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowCatalogManager(true)}
                type="button"
                style={{
                  padding: '8px 12px',
                  background: '#10b981',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '12px',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Gerenciar Catálogos de Produtos"
              >
                📁 Gerenciar
              </button>
            </div>
            <small style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
              {catalogs.length === 0 
                ? 'Nenhum catálogo encontrado. Clique em "Gerenciar" para criar um.'
                : 'Selecione um catálogo existente ou crie um novo'}
            </small>
          </div>

          {/* Seção: Variações */}
          <div style={{
            marginTop: '24px',
            padding: '16px',
            background: '#0f172a',
            borderRadius: '8px',
            border: '1px solid #334155'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', color: '#fff' }}>
                🎨 Variações do Produto
              </h4>
              <button
                onClick={addVariation}
                style={{
                  padding: '6px 12px',
                  background: '#10b981',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Plus size={14} /> Adicionar Variação
              </button>
            </div>
            <small style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '12px' }}>
              {field.variations?.length || 0} variação(ões) configurada(s) - Ex: Cor, Tamanho, Sabor
            </small>

            {field.variations?.map((variation, index) => (
              <div
                key={variation.id}
                style={{
                  padding: '12px',
                  background: '#1a2332',
                  borderRadius: '8px',
                  border: '1px solid #2d3748',
                  marginBottom: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#60a5fa' }}>
                    Variação {index + 1}
                  </span>
                  <button
                    onClick={() => removeVariation(index)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      padding: '4px',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Nome da Variação</label>
                    <input
                      type="text"
                      value={variation.label}
                      onChange={(e) => updateVariation(index, { label: e.target.value })}
                      placeholder="Ex: Cor, Tamanho"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Campo no Produto</label>
                    <input
                      type="text"
                      value={variation.dependsOn}
                      onChange={(e) => updateVariation(index, { dependsOn: e.target.value })}
                      placeholder="Ex: cores, tamanhos"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Tipo de Campo</label>
                    <select
                      value={variation.fieldType}
                      onChange={(e) => updateVariation(index, { fieldType: e.target.value as any })}
                      style={inputStyle}
                    >
                      <option value="select">Dropdown</option>
                      <option value="radio">Radio Buttons</option>
                      <option value="text">Texto Livre</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={variation.required}
                        onChange={(e) => updateVariation(index, { required: e.target.checked })}
                      />
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>Obrigatório</span>
                    </label>
                  </div>
                </div>
              </div>
            ))}

            {(!field.variations || field.variations.length === 0) && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '13px' }}>
                Nenhuma variação configurada. Clique em "Adicionar Variação" para começar.
              </div>
            )}
          </div>

          {/* Seção: Quantidade */}
          <div style={{
            marginTop: '16px',
            padding: '16px',
            background: '#0f172a',
            borderRadius: '8px',
            border: '1px solid #334155'
          }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#fff' }}>
              🔢 Configuração de Quantidade
            </h4>

            <div>
              <label style={labelStyle}>Label do Campo</label>
              <input
                type="text"
                value={field.quantityConfig?.label || 'Quantidade'}
                onChange={(e) => handleQuantityChange('label', e.target.value)}
                placeholder="Quantidade"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <div>
                <label style={labelStyle}>Mínimo</label>
                <input
                  type="number"
                  value={field.quantityConfig?.min || 1}
                  onChange={(e) => handleQuantityChange('min', parseInt(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Máximo (opcional)</label>
                <input
                  type="number"
                  value={field.quantityConfig?.max || ''}
                  onChange={(e) => handleQuantityChange('max', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="Sem limite"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <div>
                <label style={labelStyle}>Incremento (Step)</label>
                <input
                  type="number"
                  value={field.quantityConfig?.step || 1}
                  onChange={(e) => handleQuantityChange('step', parseFloat(e.target.value))}
                  step="0.1"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Unidade de Medida</label>
                <input
                  type="text"
                  value={field.quantityConfig?.unitOfMeasure || ''}
                  onChange={(e) => handleQuantityChange('unitOfMeasure', e.target.value)}
                  placeholder="Ex: un, kg, L"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={field.quantityConfig?.decimals || false}
                  onChange={(e) => handleQuantityChange('decimals', e.target.checked)}
                />
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Permitir valores decimais</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Aba: Avançado */}
      {activeTab === 'advanced' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ 
            padding: '12px', 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
            borderRadius: '8px',
            marginBottom: '8px'
          }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#fff', fontWeight: 600 }}>
              🚀 Features Inovadoras
            </h4>
            <p style={{ margin: 0, fontSize: '11px', color: '#e0e7ff' }}>
              Ative recursos avançados para melhorar a experiência do usuário
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              padding: '10px',
              background: '#1a2332',
              borderRadius: '6px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={field.advancedFeatures?.allowBarcodeScanner || false}
                onChange={(e) => handleAdvancedFeatureToggle('allowBarcodeScanner', e.target.checked)}
              />
              <div>
                <div style={{ fontSize: '12px', color: '#fff', fontWeight: 500 }}>📷 Leitor de Código de Barras</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Permite escanear produtos com a câmera</div>
              </div>
            </label>

            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              padding: '10px',
              background: '#1a2332',
              borderRadius: '6px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={field.advancedFeatures?.allowSmartPaste || false}
                onChange={(e) => handleAdvancedFeatureToggle('allowSmartPaste', e.target.checked)}
              />
              <div>
                <div style={{ fontSize: '12px', color: '#fff', fontWeight: 500 }}>📋 Smart Paste</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Cola texto e extrai produtos automaticamente</div>
              </div>
            </label>

            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              padding: '10px',
              background: '#1a2332',
              borderRadius: '6px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={field.advancedFeatures?.enableKeyboardShortcuts || false}
                onChange={(e) => handleAdvancedFeatureToggle('enableKeyboardShortcuts', e.target.checked)}
              />
              <div>
                <div style={{ fontSize: '12px', color: '#fff', fontWeight: 500 }}>⌨️ Atalhos de Teclado</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Modo PDV com navegação rápida (Alt+N, Insert)</div>
              </div>
            </label>

            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              padding: '10px',
              background: '#1a2332',
              borderRadius: '6px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={field.advancedFeatures?.enableOfflineMode || false}
                onChange={(e) => handleAdvancedFeatureToggle('enableOfflineMode', e.target.checked)}
              />
              <div>
                <div style={{ fontSize: '12px', color: '#fff', fontWeight: 500 }}>📡 Modo Offline</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Funciona sem internet e sincroniza depois</div>
              </div>
            </label>

            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              padding: '10px',
              background: '#1a2332',
              borderRadius: '6px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={field.advancedFeatures?.enableDragAndDrop || false}
                onChange={(e) => handleAdvancedFeatureToggle('enableDragAndDrop', e.target.checked)}
              />
              <div>
                <div style={{ fontSize: '12px', color: '#fff', fontWeight: 500 }}>🎯 Drag & Drop</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Reordenar itens arrastando</div>
              </div>
            </label>

            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              padding: '10px',
              background: '#1a2332',
              borderRadius: '6px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={field.advancedFeatures?.realtimeStockCheck || false}
                onChange={(e) => handleAdvancedFeatureToggle('realtimeStockCheck', e.target.checked)}
              />
              <div>
                <div style={{ fontSize: '12px', color: '#fff', fontWeight: 500 }}>📊 Verificação de Estoque</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Consulta disponibilidade em tempo real</div>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Modal de Gerenciamento de Catálogos */}
      {showCatalogManager && (
        <ProductCatalogManager
          companyId={companyId}
          onClose={() => {
            setShowCatalogManager(false);
            loadCatalogs();
          }}
          onSelectCatalog={handleSelectCatalog}
        />
      )}
    </div>
  );
};

export default OrderGridBuilder;
