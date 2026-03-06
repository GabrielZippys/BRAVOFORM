'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, Trash2, GripVertical, Save, ChevronLeft, Type, CheckSquare,
  List, Calendar, PenTool, Paperclip, Table, Heading, Eye, Settings, MoreVertical,
  Download, Sun, Moon, RefreshCcw, Mail, MessageCircle, ShoppingCart
} from 'lucide-react';
import { db } from '../../../../firebase/config';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp, query, onSnapshot, where, getDocs } from 'firebase/firestore';
import styles from '../../../../app/styles/FormBuilder.module.css';
import type { Form, Collaborator } from "@/types";
import ProductCatalogManager from '../../../../src/components/ProductCatalogManager';

// ---- COMPONENTE DE TOOLTIP DE AJUDA ----
const HelpTooltip = ({ text }: { text: string }) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (show && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top + window.scrollY - 8,
        left: rect.left + window.scrollX
      });
    }
  }, [show]);
  
  return (
    <>
      <span
        ref={iconRef}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{ 
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: 'rgba(100, 255, 218, 0.15)',
          color: '#64ffda',
          fontSize: '11px',
          fontWeight: 'bold',
          cursor: 'help',
          border: '1px solid rgba(100, 255, 218, 0.3)',
          marginLeft: '6px',
          verticalAlign: 'middle'
        }}
      >
        ?
      </span>
      {show && typeof document !== 'undefined' && createPortal(
        <div 
          style={{
            position: 'fixed',
            top: `${position.top}px`,
            left: `${position.left}px`,
            transform: 'translateY(-100%)',
            padding: '6px 10px',
            background: '#1a2238',
            color: '#e0e6f7',
            fontSize: '11px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            border: '1px solid #334155',
            zIndex: 999999,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            maxWidth: '300px'
          }}
          onMouseEnter={() => setShow(false)}
        >
          {text}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '8px',
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '5px solid #1a2238'
          }} />
        </div>,
        document.body
      )}
    </>
  );
};

// ---- ESTILO DO MENU SUSPENSO ----
const menuBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#fff',
  padding: '8px 14px',
  width: '100%',
  textAlign: 'left',
  fontSize: 15,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  borderRadius: 6,
  margin: 0,
  transition: 'background 0.2s',
};

// ---- TIPOS
type FieldType = 'Texto' | 'Caixa de Seleção' | 'Múltipla Escolha' | 'Data' | 'Assinatura' | 'Anexo' | 'Tabela' | 'Cabeçalho' | 'Grade de Pedidos';
type TableCellValues = Record<string, Record<string, string>>; // fieldId -> rowId -> colId -> value
type PreviewValues = Record<string, string | string[] | TableCellValues | undefined>;
// ---- Tipos locais para suportar o limite diário ----
type FormSettings = NonNullable<Form['settings']> & {
  dailyLimitEnabled?: boolean;   // liga/desliga
  dailyLimitCount?: number;      // quantidade por dia
};

type BuilderForm = Omit<Form, 'settings'> & { settings: FormSettings };

interface TableColumn {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  numberType?: 'integer' | 'decimal';
  options?: string[];
}
interface TableRow { id: string; label: string; }

interface EnhancedFormField {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  displayAs?: 'radio' | 'dropdown';
  placeholder?: string;
  description?: string;
  options?: string[];
  columns?: TableColumn[];
  rows?: TableRow[];
  style?: { width?: 'full' | 'half' | 'third'; alignment?: 'left' | 'center' | 'right'; };
}

// --- TEMA DO FORMULÁRIO (FormTheme) ---
export interface FormTheme {
  bgColor: string;
  titleColor?: string;        
  descriptionColor?: string; 
  bgImage?: string;
  accentColor: string;
  fontColor: string;
  inputBgColor?: string;
  inputFontColor?: string;
  sectionHeaderBg?: string;
  sectionHeaderFont?: string;
  buttonBg?: string;
  buttonFont?: string;
  footerBg?: string;
  footerFont?: string;
  borderRadius: number;
  spacing: 'compact' | 'normal' | 'spacious';
  // Novos campos para tabelas:
  tableHeaderBg?: string;
  tableHeaderFont?: string;
  tableBorderColor?: string;
  tableOddRowBg?: string;
  tableEvenRowBg?: string;
  tableCellFont?: string;
}



// ---- THEME DEFAULT
const defaultTheme: FormTheme = {
  bgColor: '#ffffff',
  accentColor: '#3b82f6',
  titleColor: '#ffffff',         
  descriptionColor: '#b8c5d6',    
  fontColor: '#1f2937',
  inputBgColor: '#171e2c',
  inputFontColor: '#e8f2ff',
  sectionHeaderBg: '#19263b',
  sectionHeaderFont: '#49cfff',
  buttonBg: '#000',
  buttonFont: '#fff',
  footerBg: '#182138',
  footerFont: '#fff',
  borderRadius: 8,
  spacing: 'normal',

  // NOVOS:
  tableHeaderBg: '#1a2238',
  tableHeaderFont: '#49cfff',
  tableBorderColor: '#19263b',
  tableOddRowBg: '#222c42',
  tableEvenRowBg: '#171e2c',
  tableCellFont: '#e0e6f7'
};

// ---- COMPONENTE: CatalogSelector
function CatalogSelector({ value, onChange, companyId }: { value?: string; onChange: (catalogId: string) => void; companyId?: string }) {
  const [catalogs, setCatalogs] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;

    const loadCatalogs = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'product_catalogs'), where('companyId', '==', companyId));
        const snapshot = await getDocs(q);
        const catalogsData = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || 'Sem nome'
        }));
        setCatalogs(catalogsData);
      } catch (error) {
        console.error('Erro ao carregar catálogos:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCatalogs();
  }, [companyId]);

  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '8px 12px',
        background: '#171e2c',
        border: '1px solid #2d3748',
        borderRadius: '6px',
        color: '#e8f2ff',
        fontSize: '14px',
        cursor: 'pointer'
      }}
    >
      <option value="">{loading ? 'Carregando catálogos...' : 'Selecione um catálogo'}</option>
      {catalogs.map(catalog => (
        <option key={catalog.id} value={catalog.id}>
          {catalog.name}
        </option>
      ))}
    </select>
  );
}

// ---- COMPONENTE: OrderGridPreview
function OrderGridPreview({ catalogId, theme, required }: { catalogId?: string; theme: any; required?: boolean }) {
  const [products, setProducts] = useState<Array<{ 
    id: string; 
    nome: string; 
    codigo?: string; 
    unidade?: string;
    quantidadeMin: number;
    quantidadeMax: number;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [addedItems, setAddedItems] = useState<Array<{ 
    id: string; 
    productId: string;
    nome: string; 
    codigo?: string;
    unidade?: string;
    quantidade: number;
  }>>([]);

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

    // Validar quantidade
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

    setAddedItems([...addedItems, newItem]);
    setSelectedProductId('');
    setQuantity(1);
  };

  const handleRemoveItem = (itemId: string) => {
    setAddedItems(addedItems.filter(item => item.id !== itemId));
  };

  const handleQuantityChange = (value: number) => {
    const product = products.find(p => p.id === selectedProductId);
    const min = product?.quantidadeMin || 1;
    const max = product?.quantidadeMax || 999;
    
    if (value >= min && value <= max) {
      setQuantity(value);
    }
  };

  const handleEditItem = (itemId: string) => {
    const item = addedItems.find(i => i.id === itemId);
    if (!item) return;

    setSelectedProductId(item.productId);
    setQuantity(item.quantidade);
    setEditingItemId(itemId);
  };

  const handleUpdateItem = () => {
    if (!editingItemId) return;

    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    // Validar quantidade
    if (quantity < product.quantidadeMin) {
      alert(`Quantidade mínima para ${product.nome}: ${product.quantidadeMin} ${product.unidade}`);
      return;
    }

    if (quantity > product.quantidadeMax) {
      alert(`Quantidade máxima para ${product.nome}: ${product.quantidadeMax} ${product.unidade}`);
      return;
    }

    setAddedItems(addedItems.map(item => 
      item.id === editingItemId 
        ? { ...item, quantidade: quantity }
        : item
    ));

    setEditingItemId(null);
    setSelectedProductId('');
    setQuantity(1);
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setSelectedProductId('');
    setQuantity(1);
  };

  return (
    <>
      {/* Dropdown de Produtos */}
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
        <select
          value={selectedProductId}
          onChange={(e) => setSelectedProductId(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: theme.borderRadius,
            fontSize: '14px',
            background: '#fff',
            color: '#374151',
            cursor: 'pointer',
          }}
        >
          <option value="">
            {loading ? 'Carregando produtos...' : 'Selecione um produto'}
          </option>
          {products.map(product => (
            <option key={product.id} value={product.id}>
              {product.codigo ? `${product.codigo} - ${product.nome}` : product.nome}
            </option>
          ))}
        </select>
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
            style={{
              width: '36px',
              height: '36px',
              border: '1px solid #d1d5db',
              borderRadius: theme.borderRadius,
              background: '#fff',
              color: '#374151',
              fontSize: '18px',
              cursor: 'pointer',
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
            style={{
              width: '36px',
              height: '36px',
              border: '1px solid #d1d5db',
              borderRadius: theme.borderRadius,
              background: '#fff',
              color: '#374151',
              fontSize: '18px',
              cursor: 'pointer',
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
          style={{
            flex: 1,
            padding: '12px',
            background: editingItemId ? '#10b981' : theme.accentColor,
            border: 'none',
            borderRadius: theme.borderRadius,
            color: '#fff',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
          onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
        >
          {editingItemId ? '✓ Atualizar Item' : 'Adicionar ao Pedido +'}
        </button>
        {editingItemId && (
          <button
            type="button"
            onClick={handleCancelEdit}
            style={{
              padding: '12px 20px',
              background: '#6b7280',
              border: 'none',
              borderRadius: theme.borderRadius,
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
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
            {addedItems.length === 0 ? (
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
              addedItems.map((item, index) => (
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
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#3b82f6',
                          cursor: 'pointer',
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
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
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
        </table>
      </div>
    </>
  );
}

// ---- FIELD TYPES
const FIELD_TYPES: Array<{
  type: FieldType;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  description: string;
}> = [
  { type: 'Texto', label: 'Campo de Texto', icon: Type, description: 'Entrada de texto simples' },
  { type: 'Caixa de Seleção', label: 'Caixa de Seleção', icon: CheckSquare, description: 'Opções com checkboxes' },
  { type: 'Múltipla Escolha', label: 'Múltipla Escolha', icon: List, description: 'Lista suspensa ou radio buttons' },
  { type: 'Data', label: 'Data', icon: Calendar, description: 'Seletor de data' },
  { type: 'Assinatura', label: 'Assinatura', icon: PenTool, description: 'Campo para assinatura digital' },
  { type: 'Anexo', label: 'Anexo', icon: Paperclip, description: 'Upload de arquivos' },
  { type: 'Tabela', label: 'Tabela', icon: Table, description: 'Tabela editável' },
  { type: 'Cabeçalho', label: 'Cabeçalho', icon: Heading, description: 'Título ou seção' },
  { type: 'Grade de Pedidos', label: 'Grade de Pedidos', icon: ShoppingCart, description: 'Grade de itens com busca de produtos' }
];

// ---- UTILS
const FORM_KEY = (companyId: string, deptId: string, formId: string) =>
  `enhanced_formbuilder_draft_${companyId}_${deptId}_${formId || 'novo'}`;

// Retorna preto (#111827) para fundos claros e branco (#ffffff) para fundos escuros
function pickTextColor(bg?: string, light = '#ffffff', dark = '#111827') {
  if (!bg) return dark;                       // fallback
  // aceita #rgb, #rrggbb ou rgb(a)
  let r = 255, g = 255, b = 255;

  if (bg.startsWith('#')) {
    const hex = bg.replace('#', '');
    const full = hex.length === 3
      ? hex.split('').map(c => c + c).join('')
      : hex;
    r = parseInt(full.substring(0, 2), 16);
    g = parseInt(full.substring(2, 4), 16);
    b = parseInt(full.substring(4, 6), 16);
  } else if (bg.startsWith('rgb')) {
    const nums = bg.match(/\d+(\.\d+)?/g)?.map(Number) || [255, 255, 255];
    [r, g, b] = nums as [number, number, number];
  }

  // luminância relativa (WCAG)
  const srgb = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];

  return L > 0.179 ? dark : light;
}

function parseRGB(c?: string) {
  if (!c) return { r: 0, g: 0, b: 0 };
  if (c.startsWith('#')) {
    const h = c.slice(1);
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }
  if (c.startsWith('rgb')) {
    const [r, g, b] = (c.match(/\d+(\.\d+)?/g) || ['0','0','0']).map(Number);
    return { r, g, b };
  }
  return { r: 0, g: 0, b: 0 };
}

function relLum({ r, g, b }: { r: number; g: number; b: number }) {
  const toLin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const R = toLin(r), G = toLin(g), B = toLin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(fg: string, bg: string) {
  const L1 = relLum(parseRGB(fg));
  const L2 = relLum(parseRGB(bg));
  const [a, b] = L1 >= L2 ? [L1, L2] : [L2, L1];
  return (a + 0.05) / (b + 0.05);
}



// Usa a cor do tema se tiver CONTRASTE; caso contrário, escolhe automaticamente
function ensureReadableText(bg?: string, preferred?: string) {
  const auto = pickTextColor(bg);
  if (!preferred) return auto;
  return contrastRatio(preferred, bg || '#ffffff') >= 4.5 ? preferred : auto;
}

const generateFieldId = () =>
  `field_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
const generateTableId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

// ---- NORMALIZE FORM
function normalizeForm(data: any) {
  const withIds = (arr: any[] | undefined, maker: (i: number) => string) =>
    (arr ?? []).map((item, i) => ({
      ...item,
      id:
        item?.id && String(item.id).trim() !== ''
          ? String(item.id)
          : maker(i),
    }));

  const fields = (data?.fields ?? []).map((f: any, i: number) => {
    const id =
      f?.id && String(f.id).trim() !== '' ? String(f.id) : generateFieldId();

    const columns = withIds(f?.columns, () => generateTableId('col')).map(
      (c: any) => ({
        ...c,
        // defaults seguros
        type: c?.type ?? 'text',
        options: Array.isArray(c?.options) ? c.options : [],
      })
    );
    const rows = withIds(f?.rows, () => generateTableId('row'));

    return {
      ...f,
      id,
      columns,
      rows,
      options: Array.isArray(f?.options) ? f.options : [],
    };
  });

  return {
    ...data,
    fields,
    theme: { ...defaultTheme, ...(data?.theme || {}) },
    settings: {
  allowSave: true,
  showProgress: true,
  confirmBeforeSubmit: false,
  ...(data?.settings || {}),

  // defaults do limite diário
  dailyLimitEnabled: !!data?.settings?.dailyLimitEnabled,
  dailyLimitCount: Number(data?.settings?.dailyLimitCount ?? 0),
},
    collaborators: data?.collaborators || [],
    authorizedUsers: data?.authorizedUsers || [],
  };
}

// ---- COMPONENTES AUXILIARES
function SortableField({ field, onSelect, selected, onRemove, onDuplicate }: {
  field: EnhancedFormField;
  onSelect: (id: string) => void;
  selected: boolean;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const fieldIcon = FIELD_TYPES.find(ft => ft.type === field.type)?.icon || Type;
  const IconComponent = fieldIcon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.sortableField} ${selected ? styles.selected : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(field.id);
      }}
    >
      <span {...attributes} {...listeners} className={styles.dragHandle}>
        <GripVertical size={16} />
      </span>
      <div className={styles.fieldIcon}>
        <IconComponent size={18} />
      </div>
      <div className={styles.fieldContent}>
        <div className={styles.fieldLabel}>{field.label}</div>
        <div className={styles.fieldType}>{field.type}</div>
        {field.required && <span className={styles.requiredBadge}>Obrigatório</span>}
      </div>
      <div className={styles.fieldActions}>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(field.id); }}
          className={styles.actionBtn}
          title="Duplicar campo"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(field.id); }}
          className={styles.deleteBtn}
          title="Remover campo"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function DraggableFieldType({ fieldType }: { fieldType: typeof FIELD_TYPES[0] }) {
  const IconComponent = fieldType.icon;
  return (
    <div className={styles.draggableFieldType} title={fieldType.description}>
      <IconComponent size={16} />
      <span>{fieldType.label}</span>
    </div>
  );
}

// Sidebar de propriedades do campo selecionado
function FieldProperties({ field, updateField, companyId }: {
  field: EnhancedFormField;
  updateField: (updates: Partial<EnhancedFormField>) => void;
  companyId?: string;
}) {

  // Opções para campos de opções (checkbox, múltipla escolha)
  const handleOptionChange = (index: number, value: string) => {
    if (!field.options) return;
    const newOptions = [...field.options];
    newOptions[index] = value;
    updateField({ options: newOptions });
  };

  const addOption = () => {
    updateField({ options: [...(field.options || []), `Opção ${field.options ? field.options.length + 1 : 1}`] });
  };

  const removeOption = (index: number) => {
    if (!field.options) return;
    const newOptions = field.options.filter((_, i) => i !== index);
    updateField({ options: newOptions });
  };

  // Propriedades para tabela (adicionar/remover linhas/colunas, editar label, tipo)
  const handleColumnChange = (colIndex: number, updates: Partial<TableColumn>) => {
    if (!field.columns) return;
    const columns = field.columns.map((col, i) => i === colIndex ? { ...col, ...updates } : col);
    updateField({ columns });
  };

  const addColumn = () => {
    const newCol: TableColumn = {
      id: generateTableId('col'),
      label: `Coluna ${field.columns ? field.columns.length + 1 : 1}`,
      type: 'text',
      numberType: 'integer', // Define o tipo de número como inteiro por padrão
      options: [],
    };
    updateField({ columns: [...(field.columns || []), newCol] });
  };

  const removeColumn = (colIndex: number) => {
    if (!field.columns) return;
    const columns = field.columns.filter((_, i) => i !== colIndex);
    updateField({ columns });
  };

  const handleRowChange = (rowIndex: number, label: string) => {
    if (!field.rows) return;
    const rows = field.rows.map((row, i) => i === rowIndex ? { ...row, label } : row);
    updateField({ rows });
  };

  const addRow = () => {
    const newRow: TableRow = {
      id: generateTableId('row'),
      label: `Linha ${field.rows ? field.rows.length + 1 : 1}`,
    };
    updateField({ rows: [...(field.rows || []), newRow] });
  };

  const removeRow = (rowIndex: number) => {
    if (!field.rows) return;
    const rows = field.rows.filter((_, i) => i !== rowIndex);
    updateField({ rows });
  };

  // Para editar opções de colunas do tipo select (tabela)
  const handleColumnOptionChange = (colIndex: number, optIndex: number, value: string) => {
    if (!field.columns) return;
    const columns = field.columns.map((col, i) => {
      if (i === colIndex) {
        const opts = col.options ? [...col.options] : [];
        opts[optIndex] = value;
        return { ...col, options: opts };
      }
      return col;
    });
    updateField({ columns });
  };

  const addColumnOption = (colIndex: number) => {
    if (!field.columns) return;
    const columns = field.columns.map((col, i) => {
      if (i === colIndex) {
        const opts = col.options ? [...col.options, `Opção ${col.options.length + 1}`] : ['Opção 1'];
        return { ...col, options: opts };
      }
      return col;
    });
    updateField({ columns });
  };

  const removeColumnOption = (colIndex: number, optIndex: number) => {
    if (!field.columns) return;
    const columns = field.columns.map((col, i) => {
      if (i === colIndex) {
        const opts = col.options ? col.options.filter((_, j) => j !== optIndex) : [];
        return { ...col, options: opts };
      }
      return col;
    });
    updateField({ columns });
  };

  // Renderização por tipo
  return (
    <div className={styles.fieldProperties}>
      <div className={styles.propertyGroup}>
        <label>Título do Campo</label>
        <input
          type="text"
          value={field.label}
          onChange={e => updateField({ label: e.target.value })}
          className={styles.propertyInput}
        />
      </div>

      {field.type === 'Múltipla Escolha' && (
        <div className={styles.propertyGroup}>
          <label style={{ display: 'flex', alignItems: 'center' }}>
            Exibir como
            <HelpTooltip text="Escolha entre botões de rádio ou menu dropdown" />
          </label>
          <select
            value={field.displayAs || 'radio'}
            onChange={e => updateField({ displayAs: e.target.value as 'radio' | 'dropdown' })}
            className={styles.propertyInput}
          >
            <option value="radio">Um por linha</option>
            <option value="dropdown">Menu suspenso</option>
          </select>
        </div>
      )}

      {field.type !== 'Cabeçalho' && (
        <div className={styles.propertyGroup}>
          <label>
            <input
              type="checkbox"
              checked={field.required || false}
              onChange={e => updateField({ required: e.target.checked })}
            />
            Campo obrigatório
          </label>
        </div>
      )}

      {(field.type === 'Texto' || field.type === 'Data') && (
        <div className={styles.propertyGroup}>
          <label style={{ display: 'flex', alignItems: 'center' }}>
            Placeholder
            <HelpTooltip text="Texto de exemplo que aparece no campo vazio" />
          </label>
          <input
            type="text"
            value={field.placeholder || ''}
            onChange={e => updateField({ placeholder: e.target.value })}
            className={styles.propertyInput}
          />
        </div>
      )}

      {(field.type === 'Caixa de Seleção' || field.type === 'Múltipla Escolha') && (
        <div className={styles.propertyGroup}>
          <label style={{ display: 'flex', alignItems: 'center' }}>
            Opções
            <HelpTooltip text="Lista de opções que o usuário pode escolher" />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {field.options?.map((opt, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="text"
                  value={opt}
                  onChange={e => handleOptionChange(i, e.target.value)}
                  className={styles.propertyInput}
                  style={{ flex: 1 }}
                />
                <button className={styles.deleteBtn} onClick={() => removeOption(i)} title="Remover opção" type="button">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button className={styles.actionBtn} onClick={addOption} type="button">
              <Plus size={14} /> Nova opção
            </button>
            <textarea
              className={styles.propertyTextarea}
              style={{ marginTop: 8 }}
              rows={4}
              placeholder="Cole opções, uma por linha"
              value={(field.options || []).join('\n')}
              onChange={e => {
                const options = e.target.value.split('\n').filter(opt => opt.trim() !== '');
                updateField({ options });
              }}
            />
            <small style={{ color: '#6fd3fa', fontSize: 11 }}>
              (Cole ou digite várias opções de uma vez, cada linha vira uma opção)
            </small>
          </div>
        </div>
      )}

      {field.type === 'Tabela' && (
        <>
          {/* COLUNAS */}
          <div className={styles.propertyGroup}>
            <label style={{ display: 'flex', alignItems: 'center' }}>
              Colunas
              <HelpTooltip text="Define as colunas da tabela (vertical)" />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {field.columns?.map((col, colIndex) => (
                <div key={col.id} style={{ background: '#101524', borderRadius: 8, padding: 8, marginBottom: 4 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      value={col.label}
                      onChange={e => handleColumnChange(colIndex, { label: e.target.value })}
                      className={styles.propertyInput}
                      style={{ flex: 1 }}
                    />
                    <select
                      value={col.type}
                      onChange={e => handleColumnChange(colIndex, { type: e.target.value as any })}
                      className={styles.propertyInput}
                      style={{ width: 100 }}
                    >
                      <option value="text">Texto</option>
                      <option value="number">Número</option>
                      <option value="date">Data</option>
                      <option value="select">Seleção</option>
                    </select>
                    <button className={styles.deleteBtn} onClick={() => removeColumn(colIndex)} type="button">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {col.type === 'select' && (
                    <div style={{ marginLeft: 12, marginTop: 5 }}>
                      <label style={{ color: '#6fd3fa', fontSize: 13 }}>Opções da coluna</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {col.options?.map((opt, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="text"
                              value={opt}
                              onChange={e => handleColumnOptionChange(colIndex, i, e.target.value)}
                              className={styles.propertyInput}
                            />
                            <button className={styles.deleteBtn} onClick={() => removeColumnOption(colIndex, i)} type="button">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                        <button className={styles.actionBtn} onClick={() => addColumnOption(colIndex)} type="button">
                          <Plus size={13} /> Nova opção
                        </button>
                        <textarea
                          className={styles.propertyTextarea}
                          style={{ marginTop: 8 }}
                          rows={4}
                          placeholder="Cole opções, uma por linha"
                          value={(col.options || []).join('\n')}
                          onChange={e => {
                            const options = e.target.value.split('\n').filter(opt => opt.trim() !== '');
                            handleColumnChange(colIndex, { options });
                          }}
                        />
                        <small style={{ color: '#6fd3fa', fontSize: 11 }}>
                          (Cole várias opções de uma vez — cada linha vira uma opção da coluna)
                        </small>
                      </div>
                    </div>
                  )}
                  {col.type === 'number' && (
                    <div style={{ marginLeft: 12, marginTop: 5 }}>
                      <label style={{ color: '#6fd3fa', fontSize: 13 }}>Tipo de número</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 5 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name={`numberType-${col.id}`}
                            checked={col.numberType === 'integer'}
                            onChange={() => handleColumnChange(colIndex, { numberType: 'integer' })}
                          />
                          Número inteiro (ex: 1, 2, 3)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name={`numberType-${col.id}`}
                            checked={col.numberType === 'decimal'}
                            onChange={() => handleColumnChange(colIndex, { numberType: 'decimal' })}
                          />
                          Número decimal (ex: 1.5, 2.3, 3.14)
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <button className={styles.actionBtn} onClick={addColumn} type="button">
                <Plus size={14} /> Nova coluna
              </button>
              <textarea
                className={styles.propertyTextarea}
                style={{ marginTop: 10 }}
                rows={3}
                placeholder="Cole várias colunas, uma por linha"
                value={field.columns?.map(col => col.label).join('\n') || ''}
                onChange={e => {
                  const labels = e.target.value.split('\n').filter(l => l.trim() !== '');
                  const newColumns = labels.map((label, idx) => ({
                    id: field.columns?.[idx]?.id || generateTableId('col'),
                    label,
                    type: field.columns?.[idx]?.type || 'text',
                    numberType: field.columns?.[idx]?.numberType || 'integer',
                    options: field.columns?.[idx]?.options || [],
                  }));
                  updateField({ columns: newColumns });
                }}
              />
              <small style={{ color: '#6fd3fa', fontSize: 11 }}>
                (Cole várias colunas de uma vez — cada linha vira uma coluna)
              </small>
            </div>
          </div>

          {/* LINHAS */}
          <div className={styles.propertyGroup}>
            <label style={{ display: 'flex', alignItems: 'center' }}>
              Linhas
              <HelpTooltip text="Define as linhas da tabela (horizontal)" />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {field.rows?.map((row, rowIndex) => (
                <div key={row.id} style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={row.label}
                    onChange={e => handleRowChange(rowIndex, e.target.value)}
                    placeholder="Nome da linha"
                    className={styles.propertyInput}
                  />
                  <button className={styles.deleteBtn} onClick={() => removeRow(rowIndex)} type="button">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button className={styles.actionBtn} onClick={addRow} type="button">
                <Plus size={14} /> Nova linha
              </button>
              <textarea
                className={styles.propertyTextarea}
                style={{ marginTop: 10 }}
                rows={3}
                placeholder="Cole várias linhas, uma por linha"
                value={field.rows?.map(row => row.label).join('\n') || ''}
                onChange={e => {
                  const labels = e.target.value.split('\n').filter(l => l.trim() !== '');
                  const newRows = labels.map((label, idx) => ({
                    id: field.rows?.[idx]?.id || generateTableId('row'),
                    label,
                  }));
                  updateField({ rows: newRows });
                }}
              />
              <small style={{ color: '#6fd3fa', fontSize: 11 }}>
                (Cole várias linhas de uma vez — cada linha vira uma linha da tabela)
              </small>
            </div>
          </div>
        </>
      )}

      {field.type === 'Grade de Pedidos' && (
        <div className={styles.propertyGroup}>
          <label style={{ display: 'flex', alignItems: 'center' }}>
            Catálogo de Produtos
            <HelpTooltip text="Selecione o catálogo de produtos para este campo" />
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <CatalogSelector
                value={(field as any).dataSource?.catalogId}
                companyId={companyId}
                onChange={(catalogId) => {
                  updateField({
                    dataSource: {
                      ...(field as any).dataSource,
                      catalogId,
                      collection: 'products',
                      displayField: 'nome',
                      valueField: 'id',
                      searchFields: ['nome', 'codigo']
                    }
                  } as any);
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                // Abrirá o modal de gerenciamento de catálogos
                const event = new CustomEvent('openCatalogManager');
                window.dispatchEvent(event);
              }}
              style={{
                padding: '8px 16px',
                background: '#3b82f6',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = '#2563eb'}
              onMouseOut={(e) => e.currentTarget.style.background = '#3b82f6'}
            >
              📁 Gerenciar
            </button>
          </div>
          <small style={{ color: '#6fd3fa', fontSize: 11, marginTop: 4, display: 'block' }}>
            Selecione o catálogo de produtos que será usado neste campo
          </small>
        </div>
      )}

      <div className={styles.propertyGroup}>
        <label style={{ display: 'flex', alignItems: 'center' }}>
          Descrição/Ajuda
          <HelpTooltip text="Texto explicativo que aparece abaixo do campo" />
        </label>
        <textarea
          value={field.description || ''}
          onChange={e => updateField({ description: e.target.value })}
          className={styles.propertyTextarea}
          placeholder="Texto de ajuda opcional..."
        />
      </div>
    </div>
  );
}


// Componente de preview dos campos

function SignaturePad({
  value,
  onChange,
  theme,
  height = 140,
}: {
  value?: string;
  onChange: (dataUrl: string) => void;
  theme: FormTheme;
  height?: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const drawingRef = React.useRef(false);
  const lastPt = React.useRef<{ x: number; y: number } | null>(null);

  // Apenas redimensiona e preserva o conteúdo atual do canvas
  const resize = React.useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const cssWidth = wrap.clientWidth;
    const cssHeight = height;

    // salva conteúdo atual
    const prev = canvas.toDataURL();

    canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
    canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);     // reseta transform antes de escalar
    ctx.scale(dpr, dpr);

    // restaura o conteúdo que já estava desenhado (se houver)
    if (prev) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, cssWidth, cssHeight);
      img.src = prev;
    }
  }, [height]);

  React.useEffect(() => {
    resize();
    const obs = new ResizeObserver(resize);
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, [resize]);

  // Desenha a imagem quando "value" externo muda
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = wrap.clientWidth;
    const cssHeight = height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => {
        // desenha em coordenadas CSS
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.drawImage(img, 0, 0, cssWidth, cssHeight);
        ctx.restore();
      };
      img.src = value;
    }
  }, [value, height]);

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPt.current = pointerPos(e);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !drawingRef.current || !lastPt.current) return;
    const now = pointerPos(e);

    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = theme.fontColor || "#111827";
    ctx.lineWidth = 2.4;

    ctx.beginPath();
    ctx.moveTo(lastPt.current.x, lastPt.current.y);
    ctx.lineTo(now.x, now.y);
    ctx.stroke();

    lastPt.current = now;
  };

  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPt.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");              // deixa o efeito [value] cuidar de não redesenhar
  };

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <div
        style={{
          width: "100%",
          border: `2px dashed ${theme.tableBorderColor || "#26314a"}`,
          borderRadius: 8,
          background: theme.inputBgColor || "transparent",
          position: "relative",
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          style={{ display: "block", touchAction: "none", borderRadius: 8 }}
        />
        {!value && (
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              color: "#9ca3af",
              fontSize: 14,
            }}
          >
            Assine aqui
          </span>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button
          type="button"
          onClick={clear}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${theme.tableBorderColor || "#26314a"}`,
            background: "transparent",
            color: theme.fontColor,
            fontSize: 13,
            cursor: "pointer",
          }}
          title="Limpar assinatura"
        >
          Limpar assinatura
        </button>
      </div>
    </div>
  );
}


// Preview controlado: campos clicáveis e editáveis no preview
function PreviewFields({
  fields,
  theme,
  values,
  onChange,
  onToggle,
  onTableChange,
}: {
  fields: EnhancedFormField[];
  theme: FormTheme;
  values: PreviewValues;
  onChange: (fieldId: string, value: any) => void;
  onToggle: (fieldId: string, option: string) => void; // checkboxes
  onTableChange: (fieldId: string, rowId: string, colId: string, value: string) => void;
}) {
const baseInputBg = theme.inputBgColor || '#ffffff';
const autoInputColor = ensureReadableText(baseInputBg, theme.inputFontColor);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {fields.map((field) => {
        const v = values[field.id];
        
        return (
          <div key={field.id} style={{ marginBottom: 16 }}>
            {field.type === 'Cabeçalho' ? (
              <h2
                style={{
                  marginBottom: '1rem',
                  background: theme.sectionHeaderBg ?? 'transparent',
                  color: theme.sectionHeaderFont ?? theme.fontColor,
                  fontSize: '1.5rem',
                  padding: 8,
                  borderRadius: theme.borderRadius,
                }}
              >
                {field.label || 'Cabeçalho do Formulário'}
              </h2>
            ) : (
              <>
                <label
                  style={{
                    display: 'block',
                    marginBottom: 8,
                    fontWeight: 500,
                    color: theme.fontColor,
                  }}
                >
                  {field.label}
                  {field.required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
                </label>

                {field.description && (
                  <p
                    style={{
                      margin: '0 0 2rem 0',
                      color: theme.descriptionColor || theme.fontColor,
                    }}
                  >
                    {field.description}
                  </p>
                )}

                {/* TEXTO */}
                {field.type === 'Texto' && (
                  <input
                    type="text"
                    placeholder={field.placeholder}
                    value={(v as string) ?? ''}
                    onChange={(e) => onChange(field.id, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: `1px solid ${theme.tableBorderColor}`,
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: theme.inputBgColor,
                      color: autoInputColor,
caretColor: autoInputColor,   // (opcional) garante o cursor visível

                    }}
                  />
                )}

                {/* DATA */}
                {field.type === 'Data' && (
                  <input
                    type="date"
                    value={(v as string) ?? ''}
                    onChange={(e) => onChange(field.id, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: `1px solid ${theme.tableBorderColor}`,
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: theme.inputBgColor,
                      color: autoInputColor,
caretColor: autoInputColor,   // (opcional) garante o cursor visível

                    }}
                  />
                )}

                {/* CHECKBOXES (Caixa de Seleção) */}
                {field.type === 'Caixa de Seleção' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(field.options || []).map((option, i) => {
                      const list = Array.isArray(v) ? (v as string[]) : [];
                      const checked = list.includes(option);
                      return (
                        <label
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            color: theme.fontColor,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggle(field.id, option)}
                          />
                          <span>{option}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* MÚLTIPLA ESCOLHA */}
                {field.type === 'Múltipla Escolha' &&
                  (field.displayAs === 'dropdown' ? (
                    <select
                      value={(v as string) ?? ''}
                      onChange={(e) => onChange(field.id, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: `1px solid ${theme.tableBorderColor}`,
                        borderRadius: '6px',
                        fontSize: '14px',
                        background: theme.inputBgColor,
                        color: autoInputColor,
caretColor: autoInputColor,   // (opcional) garante o cursor visível

                      }}
                    >
                      <option value="">Selecione uma opção</option>
                      {field.options?.map((option, i) => (
                        <option key={i} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {field.options?.map((option, i) => (
                        <label
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            color: theme.fontColor,
                          }}
                        >
                          <input
                            type="radio"
                            name={field.id}
                            value={option}
                            checked={(v as string) === option}
                            onChange={() => onChange(field.id, option)}
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  ))}

                {/* ANEXO (simulado no preview) */}
                {field.type === 'Anexo' && (
                  <input
                    type="file"
                    onChange={(e) => onChange(field.id, e.target.files?.[0]?.name || '')}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: `1px solid ${theme.tableBorderColor}`,
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: theme.inputBgColor,
                      color: autoInputColor,
caretColor: autoInputColor,   // (opcional) garante o cursor visível

                    }}
                  />
                )}

                {/* ASSINATURA (mock simples no preview) */}
               {field.type === 'Assinatura' && (
  <SignaturePad
    value={(v as string) ?? ""}
    onChange={(dataUrl) => onChange(field.id, dataUrl)}
    theme={theme}
  />
)}


                {/* TABELA */}
                {field.type === 'Tabela' && (
                  <div style={{ overflowX: 'auto' }}>
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        border: `1px solid ${theme.tableBorderColor}`,
                      }}
                    >
                      <thead>
                        <tr>
                          <th
                            style={{
                              border: `1px solid ${theme.tableBorderColor}`,
                              padding: '8px',
                              background: theme.tableHeaderBg,
                              color: theme.tableHeaderFont,
                            }}
                          ></th>
                          {field.columns?.map((col) => (
                            <th
                              key={col.id}
                              style={{
                                border: `1px solid ${theme.tableBorderColor}`,
                                padding: '8px',
                                background: theme.tableHeaderBg,
                                color: theme.tableHeaderFont,
                              }}
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {field.rows?.map((row, idx) => {
                          const table = (values[field.id] as TableCellValues) || {};
                          const rowVals = table[row.id] || {};
                          return (
                            <tr
                              key={row.id}
                              style={{
                                background: idx % 2 === 0 ? theme.tableOddRowBg : theme.tableEvenRowBg,
                              }}
                            >
                              <td
                                style={{
                                  border: `1px solid ${theme.tableBorderColor}`,
                                  padding: '8px',
                                  fontWeight: 500,
                                  color: theme.tableCellFont || theme.fontColor,
                                  background: theme.tableHeaderBg,
                                }}
                              >
                                {row.label}
                              </td>

                              {field.columns?.map((col) => {
                                const cellValue = rowVals[col.id] ?? '';
                                return (
                                  <td
                                    key={col.id}
                                    style={{
                                      border: `1px solid ${theme.tableBorderColor}`,
                                      padding: '4px',
                                      color: theme.tableCellFont || theme.fontColor,
                                    }}
                                  >
                                    {col.type === 'select' ? (
                                      <select
                                        value={cellValue}
                                        onChange={(e) =>
                                          onTableChange(field.id, row.id, col.id, e.target.value)
                                        }
                                        style={{
                                          width: '100%',
                                          padding: '4px',
                                          border: 'none',
                                          background: theme.inputBgColor,
                                          color: autoInputColor,
caretColor: autoInputColor,   // (opcional) garante o cursor visível

                                        }}
                                      >
                                        <option value="">Selecionar</option>
                                        {col.options?.map((opt, i) => (
                                          <option key={i} value={opt}>
                                            {opt}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        type={
                                          col.type === 'number'
                                            ? 'number'
                                            : col.type === 'date'
                                            ? 'date'
                                            : 'text'
                                        }
                                        step={col.type === 'number' && col.numberType === 'integer' ? '1' : 'any'}
                                        value={cellValue}
                                        onChange={(e) =>
                                          onTableChange(field.id, row.id, col.id, e.target.value)
                                        }
                                        style={{
                                          width: '100%',
                                          padding: '4px',
                                          border: 'none',
                                          background: theme.inputBgColor,
                                          color: autoInputColor,
caretColor: autoInputColor,   // (opcional) garante o cursor visível

                                        }}
                                      />
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* GRADE DE PEDIDOS */}
                {field.type === 'Grade de Pedidos' && (
                  <div>
                    {/* Verificar se catálogo está selecionado */}
                    {!(field as any).dataSource?.catalogId ? (
                      <div style={{
                        padding: '24px',
                        background: '#fef3c7',
                        border: '1px solid #fbbf24',
                        borderRadius: theme.borderRadius,
                        textAlign: 'center'
                      }}>
                        <p style={{ margin: 0, color: '#92400e', fontSize: '14px' }}>
                          ⚠️ Selecione um catálogo nas configurações acima para visualizar o preview
                        </p>
                      </div>
                    ) : (
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

                        {/* Componente completo de Grade de Pedidos */}
                        <OrderGridPreview 
                          key={`ordergrid-${(field as any).dataSource?.catalogId}`}
                          catalogId={(field as any).dataSource?.catalogId}
                          theme={theme}
                          required={field.required}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}



// Componente principal
interface EnhancedFormBuilderPageProps {
  companyId?: string;
  departmentId?: string;
  existingForm?: Form | null;
  onSaveSuccess?: () => void;
  onCancel?: () => void;
}

interface MenuAction {
  clear: string;
  export: string;
  dark: string;
  light: string;
  'reset-theme': string;
  dashboard: string;
}

function EnhancedFormBuilderPage(props: EnhancedFormBuilderPageProps) {
const router = useRouter();
const params = useParams();
const closeEditor = React.useCallback((savedId?: string) => {
  // 1) Se veio embutido, deixe o pai fechar
  if (props.onSaveSuccess) {
    props.onSaveSuccess();
    return;
  }

  // 2) Se foi aberto por window.open, feche a janela e avise o opener
  if (typeof window !== 'undefined') {
    try {
      window.opener?.postMessage({ type: 'FORM_SAVED', id: savedId }, '*');
    } catch {}
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }

    // 3) Se tem histórico, volte
    if (window.history.length > 1) {
      router.back();
      return;
    }
  }

  // 4) Fallback: vai para o dashboard
  router.replace('/dashboard');
}, [router, props.onSaveSuccess]);

const searchParams = useSearchParams(); // Hook para ler a URL
const formId = props.existingForm?.id || (params?.id as string) || 'novo';
const [previewValues, setPreviewValues] = useState<PreviewValues>({});
const [autoFill, setAutoFill] = useState<boolean>(false);

  // Estados principais
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'design' | 'preview'>('design');
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [catalogManagerOpen, setCatalogManagerOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Estados dos dados
  const [companyId, setCompanyId] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [assignedCollaborators, setAssignedCollaborators] = useState<string[]>([]);

// Função para carregar colaboradores do Firebase
const loadCollaborators = useCallback(
  async (companyId: string, departmentId: string): Promise<void> => {
    if (!companyId || !departmentId) return;

    try {
      const collaboratorsQuery = query(
        collection(db, 'collaborators'),
        where('companyId', '==', companyId),
        where('departmentId', '==', departmentId)
      );

      const querySnapshot = await getDocs(collaboratorsQuery);
      const collaboratorsList: Collaborator[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        collaboratorsList.push({
          id: doc.id,
          username: data.username,
          email: data.email,
          companyId: data.companyId,
          departmentId: data.departmentId,
          canViewHistory: data.canViewHistory,
          canEditHistory: data.canEditHistory,
          ref: doc.ref
        } as Collaborator);
      });

      setCollaborators(collaboratorsList);
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
      // Fallback para dados mock em caso de erro
      setCollaborators([
        { id: 'user1', username: 'João Silva', companyId, departmentId } as Collaborator,
        { id: 'user2', username: 'Maria Santos', companyId, departmentId } as Collaborator,
        { id: 'user3', username: 'Pedro Costa', companyId, departmentId } as Collaborator
      ]);
    }
  },
  []
);

 useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      const resolvedCompanyId = props.companyId || searchParams.get('companyId');
      const resolvedDepartmentId = props.departmentId || searchParams.get('departmentId');

      if (!resolvedCompanyId || !resolvedDepartmentId) {
          setLoading(false);
          return;
      }

      setCompanyId(resolvedCompanyId);
      setDepartmentId(resolvedDepartmentId);

      // --- Lógica de Colaboradores (onSnapshot) ---
      // Buscar o nome do departamento a partir do departmentId na subcoleção da empresa
      console.log('Buscando departamento com ID:', resolvedDepartmentId, 'na empresa:', resolvedCompanyId);
      
      const departmentDoc = await getDoc(doc(db, 'companies', resolvedCompanyId, 'departments', resolvedDepartmentId));
      console.log('Departamento existe?', departmentDoc.exists());
      console.log('Dados do departamento:', departmentDoc.data());
      
      const departmentName = departmentDoc.exists() ? departmentDoc.data()?.name : '';
      
      console.log('Nome do departamento encontrado:', departmentName);
      console.log('Buscando colaboradores para departamento:', departmentName);
      
      const collaboratorsQuery = query(
          collection(db, 'collaborators'),
          where('department', '==', departmentName)
      );

      const unsubscribe = onSnapshot(collaboratorsQuery, (querySnapshot) => {
          const collaboratorsList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Collaborator));
          console.log('Colaboradores encontrados:', collaboratorsList.length);
          console.log('Lista de colaboradores:', collaboratorsList);
          setCollaborators(collaboratorsList);
      }, (error) => {
          console.error("Erro ao carregar colaboradores: ", error);
          setCollaborators([]);
      });

    // --- Lógica de Carregamento do Formulário (Draft) ---
    // Se o formulário já veio via props (modo de edição), use-o diretamente.
    if (formId !== 'novo' && props.existingForm) {
    const normalized = normalizeForm(props.existingForm);
    setDraft(normalized);
    setAssignedCollaborators(normalized.collaborators || []);
    setLoading(false);
    // Logo preview para upload temporário


}

    // Se não, tente carregar do localStorage ou do Firebase (cenário de refresh da página)
    else {
        const localStorageKey = FORM_KEY(resolvedCompanyId, resolvedDepartmentId, formId);
        const savedDraft = localStorage.getItem(localStorageKey);
        console.log('🔍 Verificando localStorage para:', localStorageKey);
        console.log('Dados no localStorage:', savedDraft ? 'Encontrado' : 'Não encontrado');
        
        // SEMPRE tentar carregar do Firestore primeiro para formulários existentes
        if (formId !== 'novo') {
            console.log('⚠️ Limpando localStorage para forçar carregamento do Firestore');
            localStorage.removeItem(localStorageKey);
            
            getDoc(doc(db, 'forms', formId)).then(docSnap => {
                if (docSnap.exists()) {
                    const data = docSnap.data() as Form;
                    console.log('📄 Formulário carregado do Firestore:', data);
                    console.log('Colaboradores no formulário:', data.collaborators);
                    console.log('Authorized users no formulário:', data.authorizedUsers);
                    
                    const normalized = normalizeForm(data);
                    console.log('Formulário normalizado:', normalized);
                    console.log('Colaboradores após normalização:', normalized.collaborators);
                    
                    setDraft(normalized);
                    setAssignedCollaborators(normalized.collaborators || []);
                    console.log('✅ Colaboradores atribuídos ao estado:', normalized.collaborators || []);
                }
                setLoading(false);
            });
        } else {
            // Para formulários novos, pode usar localStorage
            if (savedDraft) {
                const parsed = JSON.parse(savedDraft);
                console.log('📦 Formulário NOVO carregado do localStorage:', parsed);
                
                const normalized = normalizeForm(parsed);
                setDraft(normalized);
                setAssignedCollaborators(normalized.collaborators || []);
                setLoading(false);
            } else {
                setLoading(false);
            }
        }
    }

    return () => unsubscribe(); // Limpeza do listener de colaboradores
  };
  
  loadData();
}, [formId, props.companyId, props.departmentId, props.existingForm, searchParams]);

  // Estado do formulário
  const [draft, setDraft] = useState<BuilderForm>({
    id: '',
    title: 'Novo Formulário',
    description: '',
    fields: [],
    companyId: '',
    departmentId: '',
    collaborators: [],
    authorizedUsers: [],
    createdAt: null,
    theme: { ...defaultTheme },
    settings: {
  allowSave: true,
  showProgress: true,
  confirmBeforeSubmit: false,
  dailyLimitEnabled: false, // desligado por padrão
  dailyLimitCount: 0,       // 0 = sem limite
}
  });

const [logoPreview, setLogoPreview] = useState<string | null>(draft.logo?.url || null);
const [logoFileName, setLogoFileName] = useState<string>(draft.logo?.name || '');

  // Drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );  

  // Salvar no localStorage automaticamente
  useEffect(() => {
    if (!loading && companyId && departmentId) {
      localStorage.setItem(FORM_KEY(companyId, departmentId, formId), JSON.stringify(draft));
    }
  }, [draft, loading, companyId, departmentId, formId]);

// NEW – cria chaves faltantes em previewValues quando campos mudam
useEffect(() => {
  setPreviewValues(prev => {
    const next: PreviewValues = { ...prev };
    draft.fields.forEach(f => {
      if (next[f.id] === undefined) {
        if (f.type === 'Caixa de Seleção') next[f.id] = [];           // checkboxes
        else if (f.type === 'Tabela') next[f.id] = {};                 // table
        else next[f.id] = '';                                          // texto/data/radio/dropdown
      }
    });
    // remove chaves de campos deletados
    Object.keys(next).forEach(k => {
      if (!draft.fields.some(f => f.id === k)) delete next[k];
    });
    return next;
  });
}, [draft.fields]);

  // Escutar evento para abrir modal de catálogos
  useEffect(() => {
    const handleOpenCatalogManager = () => {
      setCatalogManagerOpen(true);
    };

    window.addEventListener('openCatalogManager', handleOpenCatalogManager);
    return () => {
      window.removeEventListener('openCatalogManager', handleOpenCatalogManager);
    };
  }, []);

  // Fechar menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Funções de manipulação de campos
  const addField = useCallback(
    (type: FieldType): void => {
      const newField: EnhancedFormField = {
        id: generateFieldId(),
        type,
        label: `${type} ${draft.fields.length + 1}`,
        required: false,
        ...(type === 'Múltipla Escolha' && { displayAs: 'radio' as const }),
        ...(type === 'Texto' && { placeholder: 'Digite aqui...' }),
        ...((type === 'Caixa de Seleção' || type === 'Múltipla Escolha') && {
          options: ['Opção 1', 'Opção 2', 'Opção 3']
        }),
        ...(type === 'Tabela' && {
          columns: [
            { id: generateTableId('col'), label: 'Coluna 1', type: 'text' as const },
            { id: generateTableId('col'), label: 'Coluna 2', type: 'text' as const }
          ],
          rows: [
            { id: generateTableId('row'), label: 'Linha 1' },
            { id: generateTableId('row'), label: 'Linha 2' }
          ]
        })
      };

      setDraft(prev => ({
        ...prev,
        fields: [...prev.fields, newField]
      }));
      setSelectedFieldId(newField.id);
    },
    [draft.fields.length]
  );

  const removeField = useCallback(
    (fieldId: string): void => {
      setDraft(prev => ({
        ...prev,
        fields: prev.fields.filter(f => f.id !== fieldId)
      }));
      if (selectedFieldId === fieldId) {
        setSelectedFieldId(null);
      }
    },
    [selectedFieldId]
  );

  const duplicateField = useCallback(
    (fieldId: string): void => {
      const field = draft.fields.find(f => f.id === fieldId);
      if (!field) return;

      const newField: EnhancedFormField = {
        ...field,
        id: generateFieldId(),
        label: `${field.label} (Cópia)`
      };

      setDraft(prev => ({
        ...prev,
        fields: [...prev.fields, newField]
      }));
    },
    [draft.fields]
  );

  const updateField = useCallback(
    (updates: Partial<EnhancedFormField>): void => {
      if (!selectedFieldId) return;

      setDraft(prev => ({
        ...prev,
        fields: prev.fields.map(field =>
          field.id === selectedFieldId ? { ...field, ...updates } : field
        )
      }));
    },
    [selectedFieldId]
  );

  const updateTheme = useCallback(
    (updates: Partial<FormTheme>): void => {
      setDraft(prev => ({
        ...prev,
        theme: { ...prev.theme, ...updates }
      }));
    },
    []
  );

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent): void => {
    // Implementar se necessário
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setDraft(prev => {
        const oldIndex = prev.fields.findIndex(f => f.id === active.id);
        const newIndex = prev.fields.findIndex(f => f.id === over.id);

        return {
          ...prev,
          fields: arrayMove(prev.fields, oldIndex, newIndex)
        };
      });
    }
  };

  // ---- Limite diário de respostas (UI do builder) ----
const toggleDailyLimitEnabled = () => {
  setDraft(prev => ({
    ...prev,
    settings: {
      ...(prev.settings || {}),
      dailyLimitEnabled: !prev.settings?.dailyLimitEnabled,
    },
  }));
};

const setDailyLimitCount = (n: number) => {
  const val = Math.max(1, Math.floor(Number(n) || 1));
  setDraft(prev => ({
    ...prev,
    settings: {
      ...(prev.settings || {}),
      dailyLimitCount: val,
    },
  }));
};

// NEW – mudar um valor simples (texto, data, radio, dropdown)
const handlePreviewChange = useCallback((fieldId: string, value: any) => {
  setPreviewValues(prev => ({ ...prev, [fieldId]: value }));
}, []);

// NEW – toggle para checkbox (Caixa de Seleção)
const toggleCheckboxOption = useCallback((fieldId: string, option: string) => {
  setPreviewValues(prev => {
    const cur = Array.isArray(prev[fieldId]) ? (prev[fieldId] as string[]) : [];
    const exists = cur.includes(option);
    const next = exists ? cur.filter(o => o !== option) : [...cur, option];
    return { ...prev, [fieldId]: next };
  });
}, []);

// NEW – mudar célula da tabela
const handleTableCellChange = useCallback((
  fieldId: string, rowId: string, colId: string, value: string
) => {
  setPreviewValues(prev => {
    const table = (prev[fieldId] as TableCellValues) || {};
    const row = table[rowId] || {};
    const next = { ...prev, [fieldId]: { ...table, [rowId]: { ...row, [colId]: value } } };
    return next;
  });
}, []);

// NEW – limpar respostas
const clearPreview = useCallback(() => {
  setPreviewValues({});
  setAutoFill(false);
}, []);

// ------- AUTOFILL ALEATÓRIO -------

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pickOne<T>(arr: T[]) { return arr[randInt(0, Math.max(arr.length - 1, 0))]; }

function randomWord() {
  const words = ['alpha','bravo','charlie','delta','echo','fox','golf','hotel','india','juliet','kilo','lima','mike','november','oscar','papa','quebec','romeo','sierra','tango','uniform','victor','whiskey','xray','yankee','zulu'];
  return pickOne(words);
}
function randomText() {
  const n = randInt(2, 5);
  return Array.from({length:n}).map(randomWord).join(' ');
}
function randomDateISO() {
  const now = new Date();
  const past = new Date(now);
  past.setDate(now.getDate() - randInt(0, 365));
  const y = past.getFullYear();
  const m = String(past.getMonth()+1).padStart(2,'0');
  const d = String(past.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

const fillRandomValues = useCallback(() => {
  const next: PreviewValues = {};
  draft.fields.forEach(f => {
    switch (f.type) {
      case 'Texto':
        next[f.id] = randomText();
        break;
      case 'Data':
        next[f.id] = randomDateISO();
        break;
      case 'Múltipla Escolha': {
        const opts = f.options || [];
        next[f.id] = opts.length ? pickOne(opts) : '';
        break;
      }
      case 'Caixa de Seleção': {
        const opts = f.options || [];
        const pickCount = randInt(0, Math.max(0, Math.min(opts.length, 3)));
        const shuffled = [...opts].sort(() => Math.random() - 0.5);
        next[f.id] = shuffled.slice(0, pickCount);
        break;
      }
      case 'Tabela': {
        const t: TableCellValues = {};
        (f.rows || []).forEach(r => {
          t[r.id] = {};
          (f.columns || []).forEach(c => {
            let v = '';
            if (c.type === 'number') v = String(randInt(1, 999));
            else if (c.type === 'date') v = randomDateISO();
            else if (c.type === 'select') v = c.options && c.options.length ? pickOne(c.options) : '';
            else v = randomText();
            t[r.id][c.id] = v;
          });
        });
        next[f.id] = t;
        break;
      }
      default:
        next[f.id] = '';
    }
  });
  setPreviewValues(next);
}, [draft.fields]);

// NEW – ligar/desligar o autofill
const toggleAutofill = useCallback((checked: boolean) => {
  setAutoFill(checked);
  if (checked) fillRandomValues();
}, [fillRandomValues]);


  // Handler de colaboradores
  const handleCollaboratorToggle = (collaboratorId: string): void => {
    console.log('🔄 Toggle colaborador:', collaboratorId);
    setAssignedCollaborators(prev => {
      const isCurrentlyAssigned = prev.includes(collaboratorId);
      const newAssigned = isCurrentlyAssigned
        ? prev.filter(id => id !== collaboratorId)
        : [...prev, collaboratorId];
      
      console.log('Antes:', prev);
      console.log('Depois:', newAssigned);
      console.log('Ação:', isCurrentlyAssigned ? 'REMOVIDO' : 'ADICIONADO');
      
      return newAssigned;
    });
  };

  // Handlers do menu
  const handleMenuAction = (action: keyof MenuAction): void => {
    setMenuOpen(false);

    switch (action) {
      case 'clear':
        if (confirm('Tem certeza que deseja limpar todos os campos?')) {
          setDraft(prev => ({ ...prev, fields: [] }));
          setSelectedFieldId(null);
        }
        break;
      case 'export':
        const dataStr = JSON.stringify(draft, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${draft.title.replace(/\s+/g, '_')}.json`;
        link.click();
        URL.revokeObjectURL(url);
        break;
      case 'dark':
        updateTheme({ bgColor: '#1f2937', fontColor: '#f9fafb' });
        break;
      case 'light':
        updateTheme({ bgColor: '#ffffff', fontColor: '#1f2937' });
        break;
      case 'reset-theme':
        updateTheme({
          bgColor: '#ffffff',
          accentColor: '#3b82f6',
          fontColor: '#1f2937',
          borderRadius: 8,
          spacing: 'normal'
        });
        break;
      case 'dashboard':
        router.push('/dashboard');
        break;
    }
  };

  // Handler de clique no canvas - CORRIGIDO
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    // Verificar se o clique foi diretamente no canvas, não em um elemento filho
    if (e.target === e.currentTarget) {
      setSelectedFieldId(null);
    }
  };

  // Handler de salvar
  const handleSave = async (): Promise<void> => {
    setSaving(true);
    console.log('💾 Salvando formulário...');
    console.log('Colaboradores atribuídos:', assignedCollaborators);
    
    try {
      let resultId = formId;
      const formData: Form = {
        ...draft,
        companyId,
        departmentId,
        collaborators: assignedCollaborators,
        authorizedUsers: assignedCollaborators,
        updatedAt: serverTimestamp()
      };

      console.log('Dados do formulário a serem salvos:', formData);

      if (formId === 'novo') {
        const docRef = await addDoc(collection(db, 'forms'), {
          ...formData,
          createdAt: serverTimestamp()
        });
        resultId = docRef.id;
        console.log('✅ Formulário criado com ID:', resultId);
      } else {
        await setDoc(doc(db, 'forms', formId), formData);
        console.log('✅ Formulário atualizado:', formId);
      }
      
      // Limpar localStorage para garantir que próximo load venha do Firestore
      localStorage.removeItem(FORM_KEY(companyId, departmentId, formId));
      console.log('🗑️ localStorage limpo para garantir carregamento do Firestore');
      
      closeEditor(resultId);
    } catch (error) {
      console.error('❌ Erro ao salvar formulário:', error);
      alert('Erro ao salvar formulário. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const selectedField: EnhancedFormField | undefined = draft.fields.find(f => f.id === selectedFieldId);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingSpinner}></div>
        <p>Carregando editor de formulários...</p>
      </div>
    );
  }

  return (
    <div className={styles.pageWrapper}>
      {/* Header */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <button className={styles.backBtn} onClick={() => router.back()}>
            <ChevronLeft size={18} />
            Voltar
          </button>
          <input
            className={styles.titleInput}
            value={draft.title}
            onChange={e => setDraft(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Nome do Formulário"
          />
        </div>
        <div className={styles.topBarCenter}>
          <div className={styles.tabSwitcher}>
            <button
              className={`${styles.tab} ${activeTab === 'design' ? styles.active : ''}`}
              onClick={() => setActiveTab('design')}
            >
              <Settings size={16} />
              Design
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'preview' ? styles.active : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              <Eye size={16} />
              Preview
            </button>
          </div>
        </div>
        <div className={styles.topBarRight}>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <div className={styles.spinner}></div>
                Salvando...
              </>
            ) : (
              <>
                <Save size={16} />
                Salvar
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className={styles.builderGrid}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={() => {}}
          onDragEnd={handleDragEnd}
        >
          {/* Sidebar Esquerda */}
          <aside className={styles.sidebarLeft}>
            {activeTab === 'preview' ? (
              // Mostrar Aparência no modo Preview
              <>
                <div className={styles.sidebarHeader}>
                  <h3>Aparência</h3>
                  <p>Personalize as cores</p>
                </div>
                <div style={{ padding: '16px', overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
                  {/* Estilo consistente para todos os inputs de cor */}
                  {[
                    { label: '📄 Fundo Geral', key: 'bgColor', value: draft.theme.bgColor },
                    { label: '📝 Texto Geral', key: 'fontColor', value: draft.theme.fontColor },
                    { label: '🏷️ Texto Título', key: 'titleColor', value: draft.theme.titleColor || '#ffffff' },
                    { label: '📋 Texto Descrição', key: 'descriptionColor', value: draft.theme.descriptionColor || '#b8c5d6' },
                    { label: '🔖 Fundo Seção', key: 'sectionHeaderBg', value: draft.theme.sectionHeaderBg || '' },
                    { label: '🔖 Texto Seção', key: 'sectionHeaderFont', value: draft.theme.sectionHeaderFont || '#ffffff' },
                    { label: '⬜ Fundo Campos', key: 'inputBgColor', value: draft.theme.inputBgColor },
                    { label: '🔵 Fundo Botões', key: 'accentColor', value: draft.theme.accentColor },
                    { label: '📊 Tab: Fundo Header', key: 'tableHeaderBg', value: draft.theme.tableHeaderBg || '#1a2238' },
                    { label: '📊 Tab: Texto Header', key: 'tableHeaderFont', value: draft.theme.tableHeaderFont || '#49cfff' },
                    { label: '📊 Tab: Linha Ímpar', key: 'tableOddRowBg', value: draft.theme.tableOddRowBg || '#222c42' },
                    { label: '📊 Tab: Linha Par', key: 'tableEvenRowBg', value: draft.theme.tableEvenRowBg || '#171e2c' },
                    { label: '📊 Tab: Texto Linhas', key: 'tableCellFont', value: draft.theme.tableCellFont || '#e0e6f7' },
                    { label: '📊 Tab: Bordas', key: 'tableBorderColor', value: draft.theme.tableBorderColor || '#19263b' }
                  ].map((item, idx) => (
                    <div key={item.key} style={{ marginBottom: '16px' }}>
                      <label style={{ 
                        display: 'block',
                        fontSize: '12px', 
                        fontWeight: 500, 
                        color: '#cbd5e1',
                        marginBottom: '8px'
                      }}>
                        {item.label}
                      </label>
                      <input
                        type="color"
                        value={item.value}
                        onChange={e => updateTheme({ [item.key]: e.target.value })}
                        style={{ 
                          height: '42px', 
                          width: '100%',
                          borderRadius: '8px',
                          border: '2px solid #334155',
                          cursor: 'pointer',
                          backgroundColor: 'transparent'
                        }}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              // Mostrar Adicionar Campos no modo Design
              <>
                <div className={styles.sidebarHeader}>
                  <h3>Adicionar Campos</h3>
                  <p>Arraste para o formulário</p>
                </div>
                <div className={styles.fieldTypesList}>
                  {FIELD_TYPES.map((fieldType) => (
                    <div
                      key={fieldType.type}
                      className={styles.fieldTypeItem}
                      onClick={() => addField(fieldType.type)}
                    >
                      <DraggableFieldType fieldType={fieldType} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>

          {/* Canvas Central */}
          <main
            className={styles.canvas}
            tabIndex={-1}
            style={{ minHeight: 600 }}
          >
            {activeTab === 'design' ? (
              <div className={styles.designCanvas}
      onClick={handleCanvasClick}>
                <div className={styles.canvasHeader}>
                  <h4>Estrutura do Formulário</h4>
                  <span className={styles.fieldCount}>
                    {draft.fields.length} campo{draft.fields.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {draft.fields.length === 0 ? (
                  <div className={styles.emptyCanvas}>
                    <div className={styles.emptyIcon}>
                      <Plus size={48} />
                    </div>
                    <h3>Comece adicionando campos</h3>
                    <p>Arraste campos da barra lateral ou clique nos botões para adicionar</p>
                  </div>
                ) : (
                  <SortableContext items={draft.fields.map((f, i) => f.id || `field-fallback-${i}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className={styles.fieldsList}>
                      {draft.fields.map((field) => (
                        <SortableField
                          key={field.id}
                          field={field}
                          onSelect={id => { setSelectedFieldId(id); }}
                          selected={field.id === selectedFieldId}
                          onRemove={removeField}
                          onDuplicate={duplicateField}
                        />
                      ))}
                    </div>
                  </SortableContext>
                )}
              </div>
            ) : (
              <div className={styles.previewCanvas} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                <div className={styles.previewHeader} style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Preview do Formulário</h4>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.7 }}>Como o colaborador verá</p>
                    </div>
                    {/* Controles do preview */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: `1px solid ${draft.theme.tableBorderColor || '#26314a'}`, borderRadius: 6, cursor: 'pointer', userSelect: 'none', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={autoFill} onChange={(e) => toggleAutofill(e.target.checked)} />
                        Autopreencher
                      </label>
                      <button type="button" onClick={fillRandomValues} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid transparent', background: draft.theme.accentColor, color: '#fff', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }} title="Gerar novos valores aleatórios">
                        Regerar
                      </button>
                      <button type="button" onClick={clearPreview} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${draft.theme.tableBorderColor || '#26314a'}`, background: 'transparent', color: draft.theme.fontColor, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }} title="Limpar respostas">
                        Limpar
                      </button>
                    </div>
                  </div>
                </div>
                <div className={styles.formPreview} style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                  <div
                    className={styles.previewForm}
                    style={{
                     backgroundColor: draft.theme.bgColor,
    color: draft.theme.fontColor,
    borderRadius: `${draft.theme.borderRadius}px`,
    border: `2px solid ${draft.theme.accentColor}`,
                    }}
                  >
                    {draft.logo?.url && (
  <div
    style={{
      width: '100%',
      display: 'flex',
      justifyContent:
        draft.logo.align === 'left'
          ? 'flex-start'
          : draft.logo.align === 'right'
          ? 'flex-end'
          : 'center',
      marginBottom: 10,
    }}
  >
    <img
      src={draft.logo.url}
      alt={draft.logo.name || 'Logo'}
      style={{
        width: draft.logo.size ? `${draft.logo.size}%` : '40%',
        maxWidth: 240,
        objectFit: 'contain'
      }}
    />
  </div>
)}
                   
<h2 style={{ color: draft.theme.titleColor ?? draft.theme.fontColor }}>
  {draft.title || 'Título do Formulário'}
</h2>

{/* ✅ DESCRIÇÃO USA draft.theme.descriptionColor (cai para #b8c5d6) */}
{draft.description && (
  <p style={{ color: draft.theme.descriptionColor ?? '#b8c5d6' }}>
    {draft.description}
  </p>
)}

<PreviewFields
  fields={draft.fields}
  theme={draft.theme}
  values={previewValues}
  onChange={handlePreviewChange}
  onToggle={toggleCheckboxOption}
  onTableChange={handleTableCellChange}
/>

                  </div>
                </div>
              </div>
            )}
          </main>

          {/* Sidebar Direita - Propriedades */}
          <aside className={styles.sidebarRight}>
            <div className={styles.sidebarHeader} style={{ position: 'relative' }}>
              <h3>
                {selectedField ? 'Propriedades do Campo' : 'Configurações do Formulário'}
              </h3>
              {/* Botão de menu suspenso */}
              <div style={{ position: 'absolute', right: 12, top: 10 }} ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 4,
                    cursor: 'pointer',
                    borderRadius: 5
                  }}
                  title="Mais opções"
                  tabIndex={0}
                >
                  <MoreVertical size={20} />
                </button>
                {menuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 32,
                      background: '#171d32',
                      color: '#fff',
                      border: '1px solid #283047',
                      borderRadius: 8,
                      minWidth: 180,
                      boxShadow: '0 4px 18px #12172888',
                      zIndex: 10
                    }}
                  >
                    <button
                      style={menuBtnStyle}
                      onClick={() => handleMenuAction('clear')}
                    >
                      <Trash2 size={15} style={{ marginRight: 8 }} /> Limpar todos campos
                    </button>
                    <button
                      style={menuBtnStyle}
                      onClick={() => handleMenuAction('export')}
                    >
                      <Download size={15} style={{ marginRight: 8 }} /> Exportar JSON
                    </button>
                    <button
                      style={menuBtnStyle}
                      onClick={() => handleMenuAction('dark')}
                    >
                      <Moon size={15} style={{ marginRight: 8 }} /> Tema escuro
                    </button>
                    <button
                      style={menuBtnStyle}
                      onClick={() => handleMenuAction('light')}
                    >
                      <Sun size={15} style={{ marginRight: 8 }} /> Tema claro
                    </button>
                    <button
                      style={menuBtnStyle}
                      onClick={() => handleMenuAction('reset-theme')}
                    >
                      <RefreshCcw size={15} style={{ marginRight: 8 }} /> Resetar tema
                    </button>
                    <button
                      style={menuBtnStyle}
                      onClick={() => handleMenuAction('dashboard')}
                    >
                      <ChevronLeft size={15} style={{ marginRight: 8 }} /> Voltar ao Dashboard
                    </button>
                  </div>
                )}
              </div>
            </div>
            {selectedField ? (
              <FieldProperties
                field={selectedField}
                updateField={updateField}
                companyId={companyId}
              />
            ) : (
              <>
                <div className={styles.formSettings}>
                  <div className={styles.propertyGroup} style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '13px', marginBottom: '4px' }}>Descrição do Formulário</label>
                    <textarea
                      value={draft.description}
                      onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
                      className={styles.propertyTextarea}
                      placeholder="Descrição opcional..."
                      style={{ minHeight: '60px', fontSize: '13px' }}
                    />
                  </div>
                </div>
                  
                  <div className={styles.propertyGroup} style={{ marginBottom: '12px' }}>
  <label style={{ fontSize: '13px', marginBottom: '8px', display: 'block' }}>Logo do Formulário</label>
  <div style={{ position: 'relative' }}>
    <input
      type="file"
      accept="image/*"
      id="logo-upload-input"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            setLogoPreview(ev.target?.result as string);
            setLogoFileName(file.name);
            setDraft((prev) => ({
              ...prev,
              logo: {
                ...prev.logo,
                url: ev.target?.result as string,
                size: prev.logo?.size ?? 40,
                align: prev.logo?.align ?? 'center',
                name: file.name
              }
            }));
          };
          reader.readAsDataURL(file);
        }
      }}
      style={{
        position: 'absolute',
        opacity: 0,
        width: '100%',
        height: '100%',
        cursor: 'pointer',
        zIndex: 2
      }}
    />
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '10px 14px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      borderRadius: '6px',
      border: '2px solid #667eea',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      minHeight: '42px',
      position: 'relative',
      zIndex: 1
    }}>
      <div style={{
        fontSize: '13px',
        fontWeight: 500,
        color: 'white',
        textAlign: 'center',
        marginBottom: logoFileName ? '3px' : '0'
      }}>
        📁 Escolher Arquivo
      </div>
      {logoFileName && (
        <div style={{
          fontSize: '10px',
          color: 'rgba(255, 255, 255, 0.8)',
          textAlign: 'center',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          padding: '0 6px'
        }}>
          {logoFileName}
        </div>
      )}
    </div>
  </div>
  {logoPreview && (
    <div style={{ margin: '6px 0', textAlign: draft.logo?.align || 'center' }}>
      <img
        src={logoPreview}
        alt="Logo Preview"
        style={{
          width: draft.logo?.size ? `${draft.logo.size}%` : '40%',
          maxWidth: 160,
          display: 'block',
          margin: draft.logo?.align === 'left'
            ? '0 auto 0 0'
            : draft.logo?.align === 'right'
            ? '0 0 0 auto'
            : '0 auto'
        }}
      />
    </div>
  )}
  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
    <label style={{ fontSize: 12 }}>Tamanho:</label>
    <input
      type="range"
      min={10}
      max={100}
      value={draft.logo?.size || 40}
      onChange={e =>
        setDraft(prev => ({
          ...prev,
          logo: {
            ...prev.logo,
            size: Number(e.target.value),
            url: prev.logo?.url || '',
            align: prev.logo?.align || 'center',
            name: prev.logo?.name
          }
        }))
      }
      style={{ flex: 1 }}
    />
    <span style={{ fontSize: 11, minWidth: '35px' }}>{draft.logo?.size || 40}%</span>
  </div>
  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
    <label style={{ fontSize: 12 }}>Alinhamento:</label>
    <select
      value={draft.logo?.align || 'center'}
      onChange={e =>
        setDraft(prev => ({
          ...prev,
          logo: {
            ...prev.logo,
            align: e.target.value as 'left' | 'center' | 'right',
            url: prev.logo?.url || '',
            size: prev.logo?.size || 40,
            name: prev.logo?.name
          }
        }))
      }
      style={{ fontSize: 12, padding: '3px 6px', flex: 1 }}
    >
      <option value="left">Esquerda</option>
      <option value="center">Centro</option>
      <option value="right">Direita</option>
    </select>
    {draft.logo?.url && (
      <button
        type="button"
        className={styles.deleteBtn}
        style={{ fontSize: 11, padding: '3px 8px', marginLeft: 4 }}
        onClick={() => {
          setLogoPreview(null);
          setLogoFileName('');
          setDraft(prev => ({
            ...prev,
            logo: undefined
          }));
        }}
      >
        Remover
      </button>
    )}
  </div>
</div>



{/* Limite diário de respostas */}
<div style={{ 
  marginBottom: '16px',
  padding: '16px',
  background: 'rgba(255, 255, 255, 0.03)',
  borderRadius: '10px',
  border: '1px solid rgba(255, 255, 255, 0.08)'
}}>
  <div style={{ 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    marginBottom: '12px'
  }}>
    <h4 style={{ 
      fontSize: '13px', 
      fontWeight: 600,
      color: '#cbd5e1',
      margin: 0,
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }}>
      <span style={{ fontSize: '16px' }}>📊</span>
      Limite diário de respostas
    </h4>
    
    <button
      type="button"
      onClick={toggleDailyLimitEnabled}
      style={{
        padding: '6px 14px',
        fontSize: '12px',
        fontWeight: 500,
        borderRadius: '6px',
        border: 'none',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        background: draft.settings?.dailyLimitEnabled 
          ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
          : 'rgba(255, 255, 255, 0.08)',
        color: draft.settings?.dailyLimitEnabled ? 'white' : '#94a3b8',
        boxShadow: draft.settings?.dailyLimitEnabled 
          ? '0 2px 8px rgba(102, 126, 234, 0.3)'
          : 'none'
      }}
    >
      {draft.settings?.dailyLimitEnabled ? '✓ Ativado' : 'Desativado'}
    </button>
  </div>

  {draft.settings?.dailyLimitEnabled && (
    <div style={{
      marginTop: '12px',
      padding: '12px',
      background: 'rgba(102, 126, 234, 0.1)',
      borderRadius: '8px',
      border: '1px solid rgba(102, 126, 234, 0.2)'
    }}>
      <label style={{ 
        fontSize: '12px', 
        fontWeight: 500,
        color: '#cbd5e1',
        display: 'block',
        marginBottom: '8px'
      }}>
        Quantidade máxima por dia
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="number"
          min={1}
          value={draft.settings?.dailyLimitCount ?? 1}
          onChange={(e) => setDailyLimitCount(e.target.value as unknown as number)}
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: '14px',
            fontWeight: 500,
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '6px',
            color: 'white',
            outline: 'none'
          }}
        />
        <span style={{ 
          fontSize: '12px', 
          color: '#94a3b8',
          whiteSpace: 'nowrap'
        }}>
          respostas/dia
        </span>
      </div>
      <small style={{ 
        color: '#94a3b8', 
        display: 'block', 
        marginTop: '8px', 
        fontSize: '11px',
        lineHeight: '1.4'
      }}>
        💡 O limite é por formulário e reinicia automaticamente a cada dia.
      </small>
    </div>
  )}
</div>


                {/* Colaboradores */}
                <div className={styles.collaboratorsSection} style={{ marginBottom: '12px' }}>
                  <h4 className={styles.subTitle} style={{ fontSize: '13px', marginBottom: '8px' }}>Colaboradores Autorizados</h4>
                  <div className={styles.collaboratorsList}>
                    {collaborators.length > 0 ? (
                      collaborators.map(collaborator => (
                        <label key={collaborator.id} className={styles.collaboratorItem}>
                          <input
                            type="checkbox"
                            checked={assignedCollaborators.includes(collaborator.id)}
                            onChange={() => handleCollaboratorToggle(collaborator.id)}
                          />
                          <span>{collaborator.username}</span>
                        </label>
                      ))
                    ) : (
                      <p style={{ color: '#6b7280', fontSize: '12px', fontStyle: 'italic' }}>
                        Nenhum colaborador encontrado
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </aside>
        </DndContext>
      </div>

      {/* Modal de Gerenciamento de Catálogos */}
      {catalogManagerOpen && companyId && (
        <ProductCatalogManager
          companyId={companyId}
          onClose={() => setCatalogManagerOpen(false)}
          onSelectCatalog={(catalogId) => {
            // Atualizar o campo selecionado com o catálogo escolhido
            if (selectedFieldId) {
              updateField({
                dataSource: {
                  catalogId,
                  collection: 'products',
                  displayField: 'nome',
                  valueField: 'id',
                  searchFields: ['nome', 'codigo']
                }
              } as any);
            }
            setCatalogManagerOpen(false);
          }}
        />
      )}
    </div>
  );
}

export default EnhancedFormBuilderPage;

