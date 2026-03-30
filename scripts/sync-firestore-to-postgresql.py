# -*- coding: utf-8 -*-
"""
ETL: Firestore → PostgreSQL (Cloud SQL) — BravoForm v2.0
Schema: Star Schema com dim_* e fact_* (surrogate keys SERIAL)
"""

import os
import sys
import json
import time
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone
from logging.handlers import RotatingFileHandler

from google.cloud import firestore
from google.oauth2 import service_account
import psycopg2
from psycopg2.extras import execute_batch

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────
APP_NAME = "etl_firestore_to_postgresql"
LOG_DIR = Path("logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

def _setup_logger():
    fmt = "%(asctime)s | %(levelname)-7s | %(message)s"
    logger = logging.getLogger(APP_NAME)
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        sh = logging.StreamHandler()
        sh.setFormatter(logging.Formatter(fmt))
        fh = RotatingFileHandler(LOG_DIR / f"{APP_NAME}.log", maxBytes=5*1024*1024, backupCount=3, encoding="utf-8")
        fh.setFormatter(logging.Formatter(fmt))
        logger.addHandler(sh)
        logger.addHandler(fh)
    return logger

log = _setup_logger()

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────
DAYS_TO_SYNC = int(os.getenv("DAYS_TO_SYNC", "30"))
SYNC_ALL     = os.getenv("SYNC_ALL", "false").lower() == "true"

# Firebase
cred_path = Path("firebase_cred.json")
if not cred_path.exists():
    cred_path = Path(__file__).parent.parent / "firebase_cred.json"
if not cred_path.exists():
    raise RuntimeError(f"Credenciais Firebase não encontradas: {cred_path}")

with open(cred_path) as f:
    cred_data = json.load(f)
    project_id = cred_data.get("project_id", "formbravo-8854e")

credentials = service_account.Credentials.from_service_account_file(str(cred_path))
db = firestore.Client(project=project_id, credentials=credentials)
log.info(f"Firestore conectado | project_id={project_id}")

# PostgreSQL
PG_HOST     = os.getenv("PG_HOST",     "34.39.165.146")
PG_PORT     = int(os.getenv("PG_PORT", "5432"))
PG_DATABASE = os.getenv("PG_DATABASE", "formbravo-8854e-database")
PG_USER     = os.getenv("PG_USER",     "ipanema")
PG_PASSWORD = os.getenv("PG_PASSWORD", "Br@v0x00")

def pg_connect():
    return psycopg2.connect(
        host=PG_HOST, port=PG_PORT, database=PG_DATABASE,
        user=PG_USER, password=PG_PASSWORD, sslmode='prefer'
    )

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def ts_to_iso(v):
    """Converte Timestamp Firestore → string ISO sem timezone"""
    try:
        if hasattr(v, "isoformat"):
            return v.replace(tzinfo=None).isoformat()
        if isinstance(v, dict) and "seconds" in v:
            return datetime.fromtimestamp(v["seconds"]).isoformat()
    except Exception:
        pass
    return None

def to_json(v):
    """Serializa valor Python → JSON string válida (não str())"""
    if v is None:
        return None
    if isinstance(v, str):
        try:
            json.loads(v)  # já é JSON válido
            return v
        except Exception:
            return None
    try:
        return json.dumps(v, ensure_ascii=False, default=str)
    except Exception:
        return None

def normalize_answer(value):
    """
    Classifica e normaliza um valor de resposta.
    Retorna: (answer_text, answer_number, answer_date, answer_boolean, field_type, input_type, json_data)
    json_data = None para campos simples; dict/list para Tabela/Grade/Checkbox
    """
    answer_text    = None
    answer_number  = None
    answer_date    = None
    answer_boolean = None
    field_type     = 'Texto'
    input_type     = 'text'
    json_data      = None  # usado para Tabela, Grade de Pedidos, Checkbox

    if value is None or value == '' or value == []:
        return answer_text, answer_number, answer_date, answer_boolean, field_type, input_type, json_data

    # Lista → Checkbox ou Grade de Pedidos
    if isinstance(value, list):
        json_data = value
        # Se itens são dicts com productId → Grade de Pedidos
        if value and isinstance(value[0], dict) and any(k in value[0] for k in ('productId','product_id','productName','name')):
            field_type = 'Grade de Pedidos'
            input_type = 'order'
        else:
            field_type = 'Caixa de Seleção'
            input_type = 'checkbox'
        answer_text = json.dumps(value, ensure_ascii=False, default=str)
        return answer_text, answer_number, answer_date, answer_boolean, field_type, input_type, json_data

    # Dict → Tabela
    if isinstance(value, dict):
        json_data   = value
        field_type  = 'Tabela'
        input_type  = 'table'
        answer_text = json.dumps(value, ensure_ascii=False, default=str)
        return answer_text, answer_number, answer_date, answer_boolean, field_type, input_type, json_data

    # Boolean
    if isinstance(value, bool):
        answer_boolean = value
        answer_text    = 'Sim' if value else 'Não'
        field_type     = 'Múltipla Escolha'
        input_type     = 'boolean'
        return answer_text, answer_number, answer_date, answer_boolean, field_type, input_type, json_data

    # Número
    if isinstance(value, (int, float)):
        answer_number = float(value)
        answer_text   = str(value)
        input_type    = 'number' if isinstance(value, int) else 'decimal'
        return answer_text, answer_number, answer_date, answer_boolean, field_type, input_type, json_data

    # String — tenta detectar tipo
    s = str(value).strip()

    # String JSON (lista ou objeto)
    if s.startswith('['):
        try:
            parsed = json.loads(s)
            return normalize_answer(parsed)
        except Exception:
            pass
    if s.startswith('{'):
        try:
            parsed = json.loads(s)
            return normalize_answer(parsed)
        except Exception:
            pass

    # Base64 de assinatura
    if s.startswith('data:image/'):
        answer_text = s
        field_type  = 'Assinatura'
        input_type  = 'signature'
        return answer_text, answer_number, answer_date, answer_boolean, field_type, input_type, json_data

    # URL de arquivo
    if s.startswith('http://') or s.startswith('https://'):
        answer_text = s
        input_type  = 'attachment'
        return answer_text, answer_number, answer_date, answer_boolean, field_type, input_type, json_data

    # Data — tenta vários formatos com truncamento adequado
    date_formats = [
        ('%Y-%m-%dT%H:%M:%S', 19),  # 2025-10-02T15:03:00
        ('%Y-%m-%dT%H:%M',    16),  # 2025-10-02T15:03
        ('%Y-%m-%d',           10),  # 2025-10-02
        ('%d/%m/%Y',           10),  # 02/10/2025
    ]
    for fmt, trim in date_formats:
        try:
            parsed_date = datetime.strptime(s[:trim], fmt)
            answer_date = parsed_date
            answer_text = s
            field_type  = 'Data'
            input_type  = 'date'
            return answer_text, answer_number, answer_date, answer_boolean, field_type, input_type, json_data
        except Exception:
            pass

    # Número como string
    try:
        num = float(s.replace(',', '.'))
        answer_number = num
        answer_text   = s
        input_type    = 'number' if '.' not in s and ',' not in s else 'decimal'
        return answer_text, answer_number, answer_date, answer_boolean, field_type, input_type, json_data
    except (ValueError, AttributeError):
        pass

    # Texto puro
    answer_text = s if s else None
    return answer_text, answer_number, answer_date, answer_boolean, field_type, input_type, json_data

# ─────────────────────────────────────────────────────────────────────────────
# Lookup: firebase_id → surrogate_key (cache em memória durante a execução)
# ─────────────────────────────────────────────────────────────────────────────
_key_cache = {}

def get_key(conn, table, id_col, key_col, firebase_id):
    """Retorna o surrogate key inteiro para um firebase_id, com cache."""
    if not firebase_id:
        return None
    cache_key = f"{table}:{firebase_id}"
    if cache_key in _key_cache:
        return _key_cache[cache_key]
    cur = conn.cursor()
    cur.execute(f"SELECT {key_col} FROM {table} WHERE {id_col} = %s", (firebase_id,))
    row = cur.fetchone()
    cur.close()
    result = row[0] if row else None
    _key_cache[cache_key] = result
    return result

# ─────────────────────────────────────────────────────────────────────────────
# ETAPA 1 — Empresas e Departamentos → dim_companies + dim_departments
# ─────────────────────────────────────────────────────────────────────────────
def sync_companies_and_departments():
    log.info("Exportando empresas e departamentos...")
    companies   = []
    departments = []

    for comp_doc in db.collection("companies").stream():
        c = comp_doc.to_dict() or {}
        companies.append({
            'firebase_id': comp_doc.id,
            'name':        c.get('name', ''),
            'created_at':  ts_to_iso(c.get('createdAt')),
        })
        for dept_doc in db.collection("companies").document(comp_doc.id).collection("departments").stream():
            d = dept_doc.to_dict() or {}
            departments.append({
                'firebase_id':   dept_doc.id,
                'company_fb_id': comp_doc.id,
                'name':          d.get('name', ''),
                'created_at':    ts_to_iso(d.get('createdAt')),
            })

    log.info(f"Coletados: {len(companies)} empresas, {len(departments)} departamentos")

    conn = pg_connect(); cur = conn.cursor()
    try:
        # Upsert companies
        execute_batch(cur, """
            INSERT INTO dim_companies (firebase_id, name, created_at)
            VALUES (%(firebase_id)s, %(name)s, %(created_at)s)
            ON CONFLICT (firebase_id) DO UPDATE
                SET name = EXCLUDED.name
        """, companies, page_size=200)
        conn.commit()

        # Upsert departments (precisa do company_key)
        for d in departments:
            company_key = get_key(conn, 'dim_companies', 'firebase_id', 'company_key', d['company_fb_id'])
            cur.execute("""
                INSERT INTO dim_departments (firebase_id, company_key, name, created_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (firebase_id) DO UPDATE
                    SET name = EXCLUDED.name, company_key = EXCLUDED.company_key
            """, (d['firebase_id'], company_key, d['name'], d['created_at']))
        conn.commit()
        log.info(f"Sincronizados: {len(companies)} empresas, {len(departments)} departamentos")
    except Exception as e:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

# ─────────────────────────────────────────────────────────────────────────────
# ETAPA 2 — Usuários → dim_users
# ─────────────────────────────────────────────────────────────────────────────
def sync_users():
    log.info("Exportando usuários...")
    rows = []
    for doc in db.collection("users").stream():
        u = doc.to_dict() or {}
        rows.append({
            'firebase_id':   doc.id,
            'name':          u.get('name', ''),
            'email':         u.get('email', ''),
            'role':          u.get('role', 'Admin'),
            'company_fb_id': u.get('companyId'),
            'dept_fb_id':    u.get('departmentId'),
            'created_at':    ts_to_iso(u.get('createdAt')),
        })
    log.info(f"Usuários coletados: {len(rows)}")

    conn = pg_connect(); cur = conn.cursor()
    try:
        for r in rows:
            company_key = get_key(conn, 'dim_companies', 'firebase_id', 'company_key', r['company_fb_id'])
            dept_key    = get_key(conn, 'dim_departments', 'firebase_id', 'department_key', r['dept_fb_id'])
            cur.execute("""
                INSERT INTO dim_users (firebase_id, name, email, role, company_key, department_key, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (firebase_id) DO UPDATE
                    SET name = EXCLUDED.name, email = EXCLUDED.email
            """, (r['firebase_id'], r['name'], r['email'], r['role'], company_key, dept_key, r['created_at']))
        conn.commit()
        log.info(f"Sincronizados {len(rows)} usuários")
    except Exception as e:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

# ─────────────────────────────────────────────────────────────────────────────
# ETAPA 3 — Colaboradores → dim_collaborators
# ─────────────────────────────────────────────────────────────────────────────
def sync_collaborators():
    log.info("Exportando colaboradores...")
    rows = []

    def _extract(doc_id, c, fallback_company_fb=''):
        perms = c.get('permissions', {}) or {}
        return {
            'firebase_id':   doc_id,
            'uid':           c.get('uid', ''),
            'username':      c.get('username', ''),
            'name':          c.get('name', '') or c.get('username', ''),
            'email':         c.get('email'),
            'role':          c.get('role', 'collaborator'),
            'active':        c.get('active', True),
            'company_fb_id': c.get('companyId', '') or fallback_company_fb,
            'dept_fb_id':    c.get('departmentId', ''),
            'dept_name':     c.get('department', ''),
            'can_view':      perms.get('canViewHistory', False) or c.get('canViewHistory', False),
            'can_edit':      perms.get('canEditHistory', False) or c.get('canEditHistory', False),
            'created_at':    ts_to_iso(c.get('createdAt')),
        }

    seen = set()
    for doc in db.collection("collaborators").stream():
        seen.add(doc.id)
        rows.append(_extract(doc.id, doc.to_dict() or {}))

    for comp_doc in db.collection("companies").stream():
        for doc in db.collection("companies").document(comp_doc.id).collection("collaborators").stream():
            if doc.id not in seen:
                seen.add(doc.id)
                rows.append(_extract(doc.id, doc.to_dict() or {}, comp_doc.id))

    log.info(f"Colaboradores coletados: {len(rows)}")

    conn = pg_connect(); cur = conn.cursor()
    try:
        for r in rows:
            company_key = get_key(conn, 'dim_companies', 'firebase_id', 'company_key', r['company_fb_id'])
            dept_key    = get_key(conn, 'dim_departments', 'firebase_id', 'department_key', r['dept_fb_id'])
            cur.execute("""
                INSERT INTO dim_collaborators (
                    firebase_id, uid, username, name, email, role, active,
                    company_key, department_key, department_name,
                    can_view_history, can_edit_history, created_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (firebase_id) DO UPDATE
                    SET username = EXCLUDED.username, active = EXCLUDED.active,
                        company_key = EXCLUDED.company_key, department_key = EXCLUDED.department_key
            """, (r['firebase_id'], r['uid'], r['username'], r['name'], r['email'],
                  r['role'], r['active'], company_key, dept_key, r['dept_name'],
                  r['can_view'], r['can_edit'], r['created_at']))
        conn.commit()
        log.info(f"Sincronizados {len(rows)} colaboradores")
    except Exception as e:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

# ─────────────────────────────────────────────────────────────────────────────
# ETAPA 4 — Catálogos e Produtos → dim_product_catalogs + dim_products
# ─────────────────────────────────────────────────────────────────────────────
def sync_catalogs_and_products():
    log.info("Exportando catálogos e produtos...")
    catalogs = []
    products = []

    # Catálogos na collection raiz "product_catalogs"
    catalog_company_map = {}  # firebase_id → companyId (para herdar nos produtos)
    for doc in db.collection("product_catalogs").stream():
        c = doc.to_dict() or {}
        company_fb = c.get('companyId', '')
        catalog_company_map[doc.id] = company_fb
        fields = c.get('fields', {}) or {}
        catalogs.append({
            'firebase_id':  doc.id,
            'name':         c.get('name', ''),
            'description':  c.get('description', ''),
            'company_fb':   company_fb,
            'display_field':fields.get('displayField') or c.get('displayField', ''),
            'search_fields':to_json(fields.get('searchFields') or c.get('searchFields')),
            'value_field':  fields.get('valueField') or c.get('valueField', ''),
            'created_at':   ts_to_iso(c.get('createdAt')),
            'updated_at':   ts_to_iso(c.get('updatedAt')),
        })

    # Produtos na collection raiz "products" (referencia catalogId)
    for pdoc in db.collection("products").stream():
        p = pdoc.to_dict() or {}
        catalog_fb = p.get('catalogId') or p.get('catalog_id', '')
        company_fb = p.get('companyId') or catalog_company_map.get(catalog_fb, '')
        products.append({
            'firebase_id':   pdoc.id,
            'catalog_fb':    catalog_fb,
            'company_fb':    company_fb,
            'name':          p.get('name') or p.get('nome', ''),
            'codigo':        p.get('codigo', ''),
            'ean':           p.get('ean', ''),
            'unidade':       p.get('unidade', ''),
            'quantidade_max':p.get('quantidadeMax'),
            'quantidade_min':p.get('quantidadeMin'),
            'preco':         p.get('preco'),
            'estoque':       p.get('estoque'),
            'created_at':    ts_to_iso(p.get('createdAt')),
            'updated_at':    ts_to_iso(p.get('updatedAt')),
        })

    log.info(f"Coletados: {len(catalogs)} catálogos, {len(products)} produtos")

    conn = pg_connect(); cur = conn.cursor()
    try:
        for c in catalogs:
            company_key = get_key(conn, 'dim_companies', 'firebase_id', 'company_key', c['company_fb'])
            cur.execute("""
                INSERT INTO dim_product_catalogs (
                    firebase_id, name, description, company_key,
                    display_field, search_fields, value_field, created_at, updated_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (firebase_id) DO UPDATE
                    SET name = EXCLUDED.name
            """, (c['firebase_id'], c['name'], c['description'], company_key,
                  c['display_field'], c['search_fields'], c['value_field'],
                  c['created_at'], c['updated_at']))
        conn.commit()

        for p in products:
            catalog_key = get_key(conn, 'dim_product_catalogs', 'firebase_id', 'catalog_key', p['catalog_fb'])
            company_key = get_key(conn, 'dim_companies', 'firebase_id', 'company_key', p['company_fb'])
            cur.execute("""
                INSERT INTO dim_products (
                    firebase_id, catalog_key, company_key, name, codigo, ean,
                    unidade, quantidade_max, quantidade_min, preco_atual,
                    estoque, created_at, updated_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (firebase_id) DO UPDATE
                    SET name = EXCLUDED.name, preco_atual = EXCLUDED.preco_atual,
                        estoque = EXCLUDED.estoque
            """, (p['firebase_id'], catalog_key, company_key, p['name'],
                  p['codigo'], p['ean'], p['unidade'], p['quantidade_max'],
                  p['quantidade_min'], p['preco'], p['estoque'],
                  p['created_at'], p['updated_at']))
        conn.commit()
        log.info(f"Sincronizados {len(catalogs)} catálogos, {len(products)} produtos")
    except Exception as e:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

# ─────────────────────────────────────────────────────────────────────────────
# ETAPA 5 — Formulários → dim_forms (fields_json como JSONB válido)
# ─────────────────────────────────────────────────────────────────────────────
def sync_forms():
    log.info("Exportando formulários...")
    rows = []
    for doc in db.collection("forms").stream():
        f = doc.to_dict() or {}
        rows.append({
            'firebase_id':  doc.id,
            'title':        f.get('title') or f.get('name', ''),
            'description':  f.get('description', ''),
            'company_fb':   f.get('companyId', ''),
            'dept_fb':      f.get('departmentId', ''),
            'dept_name':    f.get('department', '') or f.get('departmentId', ''),
            'is_active':    bool(f.get('active', True)),
            'fields_json':  to_json(f.get('fields', [])),  # JSONB válido
            'created_at':   ts_to_iso(f.get('createdAt')),
            'updated_at':   ts_to_iso(f.get('updatedAt') or f.get('createdAt')),
        })

    log.info(f"Formulários coletados: {len(rows)}")
    conn = pg_connect(); cur = conn.cursor()
    try:
        for r in rows:
            company_key = get_key(conn, 'dim_companies', 'firebase_id', 'company_key', r['company_fb'])
            dept_key    = get_key(conn, 'dim_departments', 'firebase_id', 'department_key', r['dept_fb'])
            cur.execute("""
                INSERT INTO dim_forms (
                    firebase_id, title, description, company_key, department_key,
                    department_name, is_active, fields_json, created_at, updated_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s)
                ON CONFLICT (firebase_id) DO UPDATE
                    SET title       = EXCLUDED.title,
                        is_active   = EXCLUDED.is_active,
                        fields_json = EXCLUDED.fields_json,
                        updated_at  = EXCLUDED.updated_at
            """, (r['firebase_id'], r['title'], r['description'], company_key, dept_key,
                  r['dept_name'], r['is_active'], r['fields_json'],
                  r['created_at'], r['updated_at']))
        conn.commit()
        log.info(f"Sincronizados {len(rows)} formulários")
    except Exception as e:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

# ─────────────────────────────────────────────────────────────────────────────
# ETAPA 5b — Campos de formulário → dim_form_fields
# Explode fields_json de dim_forms em uma linha por campo.
# Roda sempre após sync_forms() — opera só sobre o PostgreSQL (sem Firestore).
# ─────────────────────────────────────────────────────────────────────────────
def sync_form_fields():
    """Popula/atualiza dim_form_fields a partir de dim_forms.fields_json."""
    log.info("Exportando campos de formulários para dim_form_fields...")

    TYPE_TO_INPUT = {
        'Tabela':           'table',
        'Grade de Pedidos': 'order',
        'Caixa de Seleção': 'checkbox',
        'Data':             'date',
        'Assinatura':       'signature',
        'Anexo':            'attachment',
        'Cabeçalho':        'header',
        'Múltipla Escolha': 'radio',
    }
    SKIP_TYPES = {'Cabeçalho'}  # campos visuais sem resposta

    conn = pg_connect(); cur = conn.cursor()
    try:
        cur.execute("SELECT form_key, firebase_id, fields_json FROM dim_forms WHERE fields_json IS NOT NULL")
        forms = cur.fetchall()

        total_fields = 0
        for form_key, form_fb_id, fields_json in forms:
            if not isinstance(fields_json, list):
                continue

            for order_idx, field in enumerate(fields_json):
                if not isinstance(field, dict):
                    continue
                field_id = field.get('id')
                if not field_id:
                    continue
                field_type = field.get('type', '')
                if field_type in SKIP_TYPES:
                    continue

                input_type = field.get('inputType') or TYPE_TO_INPUT.get(field_type, 'text')
                is_required = bool(field.get('required', False))

                rows_list = field.get('rows')
                table_rows = json.dumps(rows_list, ensure_ascii=False) if isinstance(rows_list, list) else None

                cols_list = field.get('columns')
                table_cols = json.dumps(cols_list, ensure_ascii=False) if isinstance(cols_list, list) else None

                opts_list = field.get('options')
                options = json.dumps(opts_list, ensure_ascii=False) if isinstance(opts_list, list) else None

                cur.execute("""
                    INSERT INTO dim_form_fields (
                        form_key, form_fb_id,
                        field_id, field_label, field_type, input_type,
                        field_order, is_required,
                        table_rows_json, table_columns_json, options_json
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s::jsonb)
                    ON CONFLICT (form_key, field_id) DO UPDATE
                        SET field_label        = EXCLUDED.field_label,
                            field_type         = EXCLUDED.field_type,
                            input_type         = EXCLUDED.input_type,
                            field_order        = EXCLUDED.field_order,
                            is_required        = EXCLUDED.is_required,
                            table_rows_json    = EXCLUDED.table_rows_json,
                            table_columns_json = EXCLUDED.table_columns_json,
                            options_json       = EXCLUDED.options_json
                """, (
                    form_key, form_fb_id,
                    str(field_id), field.get('label', ''), field_type, input_type,
                    order_idx, is_required,
                    table_rows, table_cols, options
                ))
                total_fields += 1

        conn.commit()
        log.info(f"dim_form_fields: {total_fields} campos sincronizados de {len(forms)} formulários")
    except Exception as e:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

# ─────────────────────────────────────────────────────────────────────────────
# ETAPA 6 — Respostas → fact_form_response + fact_answers + especializadas
# ─────────────────────────────────────────────────────────────────────────────
def _build_field_label_cache():
    """Constrói cache field_id → {label, type, inputType} a partir de dim_forms.fields_json"""
    cache = {}  # form_firebase_id → { field_id → {label, type} }
    conn = pg_connect(); cur = conn.cursor()
    try:
        cur.execute("SELECT firebase_id, fields_json FROM dim_forms WHERE fields_json IS NOT NULL")
        for row in cur.fetchall():
            form_fb_id = row[0]
            fj = row[1]
            if not isinstance(fj, list):
                continue
            form_map = {}
            for f in fj:
                if isinstance(f, dict) and f.get('id'):
                    fid = str(f['id'])
                    form_map[fid] = {
                        'label': f.get('label', ''),
                        'type':  f.get('type', ''),
                        'inputType': f.get('inputType', ''),
                    }
            cache[form_fb_id] = form_map
    finally:
        cur.close(); conn.close()
    return cache

def sync_responses():
    log.info("Exportando respostas de formulários...")
    if SYNC_ALL:
        cutoff = None
        log.info("Modo SYNC_ALL: todas as respostas")
    else:
        cutoff = datetime.now(timezone.utc) - timedelta(days=DAYS_TO_SYNC)
        log.info(f"Modo incremental: desde {cutoff.isoformat()}")

    # Cache de labels dos campos a partir de dim_forms.fields_json
    field_label_cache = _build_field_label_cache()
    log.info(f"Field label cache: {len(field_label_cache)} formulários")

    responses = []
    answers_simple  = []  # campos simples APENAS
    order_items     = []  # grade de pedidos
    checkbox_opts   = []  # caixa de seleção
    table_data_rows = []  # tabela
    attachment_rows = []  # assinaturas e anexos

    for form_doc in db.collection("forms").stream():
        form_id    = form_doc.id
        fdata      = form_doc.to_dict() or {}
        form_title = fdata.get('title') or fdata.get('name', '')
        form_fields = field_label_cache.get(form_id, {})

        ref = db.collection("forms").document(form_id).collection("responses")
        query = ref if cutoff is None else ref.where("submittedAt", ">=", cutoff)

        for rdoc in query.stream():
            r          = rdoc.to_dict() or {}
            resp_id    = rdoc.id
            field_meta = r.get('fieldMetadata', {}) or {}
            submitted  = ts_to_iso(r.get('submittedAt') or r.get('createdAt'))
            if not submitted:
                continue

            responses.append({
                'firebase_id':         resp_id,
                'form_fb_id':          form_id,
                'company_fb_id':       r.get('companyId', ''),
                'dept_fb_id':          r.get('departmentId', ''),
                'collab_fb_id':        r.get('collaboratorId', ''),
                'form_title':          form_title,
                'dept_name':           r.get('department', ''),
                'collab_username':     r.get('collaboratorUsername', r.get('collaboratorName', '')),
                'status':              r.get('status', 'submitted'),
                'current_stage_fb_id': r.get('currentStageId'),
                'submitted_at':        submitted,
                'created_at':          ts_to_iso(r.get('createdAt')) or submitted,
                'deleted_at':          ts_to_iso(r.get('deletedAt')),
            })

            answers = r.get('answers', {})
            if not isinstance(answers, dict):
                continue

            for field_id, value in answers.items():
                fid_str = str(field_id)
                # Resolver label: 1) fieldMetadata da resposta, 2) fields_json do formulário
                meta    = field_meta.get(fid_str, {}) or {}
                ff      = form_fields.get(fid_str, {})
                label   = meta.get('label') or ff.get('label') or fid_str
                declared_type = meta.get('type') or ff.get('type', '')
                input_type_meta = meta.get('inputType') or ff.get('inputType', '')

                text, num, date, boolean, inferred_type, inferred_input, json_val = normalize_answer(value)

                # Prioriza tipo declarado pelo frontend
                field_type = declared_type if declared_type else inferred_type
                input_type = input_type_meta if input_type_meta else inferred_input

                base = {
                    'resp_fb_id': resp_id,
                    'form_fb_id': form_id,
                    'field_id':   str(field_id),
                    'label':      label,
                    'field_type': field_type,
                    'input_type': input_type,
                }

                # ── Grade de Pedidos ──
                if input_type == 'order' or field_type in ('Grade de Pedidos',):
                    items = json_val if isinstance(json_val, list) else []
                    for idx, item in enumerate(items):
                        if not isinstance(item, dict):
                            continue
                        price = None
                        qty   = None
                        try: price = float(item.get('price') or item.get('preco') or 0)
                        except: pass
                        try: qty = float(item.get('quantity') or item.get('quantidade') or 0)
                        except: pass
                        subtotal = round(price * qty, 2) if price and qty else None
                        order_items.append({**base,
                            'item_index':        idx,
                            'product_fb_id':     item.get('productId') or item.get('id', ''),
                            'product_name_snap': item.get('productName') or item.get('name') or item.get('nome', 'Produto'),
                            'product_code_snap': item.get('productCode') or item.get('codigo', ''),
                            'price_snap':        price,
                            'quantity':          qty or 0,
                            'unit':              item.get('unit') or item.get('unidade', ''),
                            'subtotal':          subtotal,
                            'extra_data':        to_json(item),
                        })
                    # NÃO duplica no fact_answers — dados estão em fact_order_items

                # ── Caixa de Seleção ──
                elif input_type == 'checkbox' or field_type in ('Caixa de Seleção',):
                    opts = json_val if isinstance(json_val, list) else []
                    for idx, opt in enumerate(opts):
                        checkbox_opts.append({**base,
                            'option_value': str(opt),
                            'option_index': idx,
                        })
                    # NÃO duplica no fact_answers — dados estão em fact_checkbox_answers

                # ── Tabela ──
                elif input_type == 'table' or field_type in ('Tabela',):
                    tdata = json_val if isinstance(json_val, dict) else {}
                    if tdata:
                        row_count = len(tdata)
                        table_data_rows.append({**base,
                            'table_data': to_json(tdata),
                            'row_count':  row_count,
                        })
                    # NÃO duplica no fact_answers — dados estão em fact_table_answers

                # ── Assinatura ──
                elif input_type == 'signature' or field_type in ('Assinatura',):
                    str_val = str(text or '')
                    is_base64 = str_val.startswith('data:image/')
                    is_url = str_val.startswith('http')
                    if is_url:
                        attachment_rows.append({**base,
                            'file_url':  str_val,
                            'file_type': 'image/png',
                            'file_name': f'assinatura_{field_id}',
                        })
                    elif is_base64:
                        # Base64 sem URL — registra placeholder em fact_attachments
                        attachment_rows.append({**base,
                            'file_url':  f'base64://assinatura/{resp_id}/{field_id}',
                            'file_type': 'image/png',
                            'file_name': f'assinatura_{field_id}',
                        })
                    answers_simple.append({**base,
                        'text': str_val if is_url else '[assinatura-base64]',
                        'num': None, 'date': None, 'bool': None,
                    })

                # ── Anexo ──
                elif input_type == 'attachment':
                    str_val = str(text or '')
                    if str_val.startswith('http'):
                        attachment_rows.append({**base,
                            'file_url':  str_val,
                            'file_type': None,
                            'file_name': None,
                        })
                    answers_simple.append({**base,
                        'text': str_val if str_val.startswith('http') else None,
                        'num': None, 'date': None, 'bool': None,
                    })

                # ── Campo simples ──
                else:
                    # Pular campos Cabeçalho (headers de seção, sem valor)
                    if field_type in ('Cabeçalho',):
                        continue
                    # Pular campos completamente vazios
                    if text is None and num is None and date is None and boolean is None:
                        continue
                    answers_simple.append({**base,
                        'text': text, 'num': num, 'date': date, 'bool': boolean,
                    })

    total_responses = len(responses)
    log.info(f"Coletados: {total_responses} respostas | {len(answers_simple)} simples | "
             f"{len(order_items)} itens pedido | {len(checkbox_opts)} checkboxes | "
             f"{len(table_data_rows)} tabelas | {len(attachment_rows)} anexos")

    conn = pg_connect(); cur = conn.cursor()
    try:
        # ── Limpar ou incremental ──
        if SYNC_ALL:
            log.info("SYNC_ALL: limpando tabelas fato antes de reinserir...")
            cur.execute("DELETE FROM fact_workflow_history")
            cur.execute("DELETE FROM fact_attachments")
            cur.execute("DELETE FROM fact_order_items")
            cur.execute("DELETE FROM fact_checkbox_answers")
            cur.execute("DELETE FROM fact_table_answers")
            cur.execute("DELETE FROM fact_answers")
            cur.execute("DELETE FROM fact_form_response")
            conn.commit()
        else:
            cutoff_iso = cutoff.isoformat() if cutoff else None
            if cutoff_iso:
                cur.execute("""
                    DELETE FROM fact_form_response
                    WHERE submitted_at >= %s
                """, (cutoff_iso,))
                conn.commit()

        # ── Upsert fact_form_response ──
        log.info(f"Inserindo {total_responses} respostas em fact_form_response...")
        for r in responses:
            form_key   = get_key(conn, 'dim_forms', 'firebase_id', 'form_key', r['form_fb_id'])
            company_key= get_key(conn, 'dim_companies', 'firebase_id', 'company_key', r['company_fb_id'])
            dept_key   = get_key(conn, 'dim_departments', 'firebase_id', 'department_key', r['dept_fb_id'])
            collab_key = get_key(conn, 'dim_collaborators', 'firebase_id', 'collaborator_key', r['collab_fb_id'])
            cur.execute("""
                INSERT INTO fact_form_response (
                    firebase_id, form_key, company_key, department_key, collaborator_key,
                    form_title, department_name, collaborator_username,
                    status, current_stage_fb_id,
                    submitted_at, created_at, deleted_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (firebase_id) DO UPDATE
                    SET status        = EXCLUDED.status,
                        submitted_at  = EXCLUDED.submitted_at,
                        deleted_at    = EXCLUDED.deleted_at,
                        form_key      = EXCLUDED.form_key,
                        company_key   = EXCLUDED.company_key,
                        department_key= EXCLUDED.department_key,
                        collaborator_key = EXCLUDED.collaborator_key
            """, (r['firebase_id'], form_key, company_key, dept_key, collab_key,
                  r['form_title'], r['dept_name'], r['collab_username'],
                  r['status'], r['current_stage_fb_id'],
                  r['submitted_at'], r['created_at'], r['deleted_at']))
        conn.commit()

        # ── fact_answers ──
        log.info(f"Inserindo {len(answers_simple)} campos simples em fact_answers...")
        for a in answers_simple:
            resp_key = get_key(conn, 'fact_form_response', 'firebase_id', 'response_key', a['resp_fb_id'])
            form_key = get_key(conn, 'dim_forms', 'firebase_id', 'form_key', a['form_fb_id'])
            if not resp_key:
                continue
            cur.execute("""
                INSERT INTO fact_answers (
                    response_key, form_key, field_id, field_label,
                    field_type, input_type,
                    answer_text, answer_number, answer_date, answer_boolean
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (resp_key, form_key, a['field_id'], a['label'],
                  a['field_type'], a['input_type'],
                  a['text'], a['num'], a['date'], a['bool']))
        conn.commit()

        # ── fact_order_items ──
        if order_items:
            log.info(f"Inserindo {len(order_items)} itens em fact_order_items...")
            for oi in order_items:
                resp_key    = get_key(conn, 'fact_form_response', 'firebase_id', 'response_key', oi['resp_fb_id'])
                form_key    = get_key(conn, 'dim_forms', 'firebase_id', 'form_key', oi['form_fb_id'])
                product_key = get_key(conn, 'dim_products', 'firebase_id', 'product_key', oi['product_fb_id'])
                if not resp_key:
                    continue
                cur.execute("""
                    INSERT INTO fact_order_items (
                        response_key, form_key, field_id, field_label, item_index,
                        product_fb_id, product_key, product_name_snap, product_code_snap,
                        price_snap, quantity, unit, subtotal, extra_data
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
                """, (resp_key, form_key, oi['field_id'], oi['label'], oi['item_index'],
                      oi['product_fb_id'], product_key, oi['product_name_snap'],
                      oi['product_code_snap'], oi['price_snap'], oi['quantity'],
                      oi['unit'], oi['subtotal'], oi['extra_data']))
            conn.commit()

        # ── fact_checkbox_answers ──
        if checkbox_opts:
            log.info(f"Inserindo {len(checkbox_opts)} opções em fact_checkbox_answers...")
            for cb in checkbox_opts:
                resp_key = get_key(conn, 'fact_form_response', 'firebase_id', 'response_key', cb['resp_fb_id'])
                form_key = get_key(conn, 'dim_forms', 'firebase_id', 'form_key', cb['form_fb_id'])
                if not resp_key:
                    continue
                cur.execute("""
                    INSERT INTO fact_checkbox_answers (
                        response_key, form_key, field_id, field_label, option_value, option_index
                    ) VALUES (%s,%s,%s,%s,%s,%s)
                """, (resp_key, form_key, cb['field_id'], cb['label'], cb['option_value'], cb['option_index']))
            conn.commit()

        # ── fact_table_answers ──
        if table_data_rows:
            log.info(f"Inserindo {len(table_data_rows)} tabelas em fact_table_answers...")
            for td in table_data_rows:
                resp_key = get_key(conn, 'fact_form_response', 'firebase_id', 'response_key', td['resp_fb_id'])
                form_key = get_key(conn, 'dim_forms', 'firebase_id', 'form_key', td['form_fb_id'])
                if not resp_key or not td['table_data']:
                    continue
                cur.execute("""
                    INSERT INTO fact_table_answers (
                        response_key, form_key, field_id, field_label, table_data, row_count
                    ) VALUES (%s,%s,%s,%s,%s::jsonb,%s)
                """, (resp_key, form_key, td['field_id'], td['label'], td['table_data'], td['row_count']))
            conn.commit()

        # ── fact_attachments ──
        if attachment_rows:
            log.info(f"Inserindo {len(attachment_rows)} anexos em fact_attachments...")
            for at in attachment_rows:
                resp_key = get_key(conn, 'fact_form_response', 'firebase_id', 'response_key', at['resp_fb_id'])
                form_key = get_key(conn, 'dim_forms', 'firebase_id', 'form_key', at['form_fb_id'])
                if not resp_key:
                    continue
                cur.execute("""
                    INSERT INTO fact_attachments (
                        response_key, form_key, field_id, field_label, field_type,
                        file_url, file_name, file_type
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                """, (resp_key, form_key, at['field_id'], at['label'], at['field_type'],
                      at['file_url'], at.get('file_name'), at.get('file_type')))
            conn.commit()

        log.info("✅ Respostas sincronizadas com sucesso")

    except Exception as e:
        conn.rollback()
        log.exception(f"Erro ao sincronizar respostas: {e}")
        raise
    finally:
        cur.close(); conn.close()

# ─────────────────────────────────────────────────────────────────────────────
# ETAPA 7 — Workflows → dim_workflow_stages
# ─────────────────────────────────────────────────────────────────────────────
def sync_workflows():
    log.info("Exportando workflows...")
    stages = []

    for doc in db.collection("workflows").stream():
        w = doc.to_dict() or {}
        workflow_name = w.get('name', '')
        workflow_stages = w.get('stages', [])
        if not isinstance(workflow_stages, list):
            continue
        for s in workflow_stages:
            if not isinstance(s, dict):
                continue
            stage_id = s.get('id', '')
            if not stage_id:
                continue
            stages.append({
                'firebase_id':    stage_id,
                'workflow_fb_id': doc.id,
                'workflow_name':  workflow_name,
                'stage_name':     s.get('name', ''),
                'stage_type':     s.get('stageType', ''),
                'stage_order':    s.get('order'),
                'is_initial':     s.get('order') == 0,
                'is_final':       bool(s.get('isFinalStage', False)),
                'require_comment':bool(s.get('requireComment', False)),
            })

    log.info(f"Workflow stages coletados: {len(stages)}")

    if not stages:
        return

    conn = pg_connect(); cur = conn.cursor()
    try:
        for s in stages:
            cur.execute("""
                INSERT INTO dim_workflow_stages (
                    firebase_id, workflow_fb_id, workflow_name, stage_name,
                    stage_type, stage_order, is_initial, is_final, require_comment
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (firebase_id) DO UPDATE
                    SET stage_name = EXCLUDED.stage_name,
                        stage_type = EXCLUDED.stage_type,
                        stage_order = EXCLUDED.stage_order,
                        is_final = EXCLUDED.is_final
            """, (s['firebase_id'], s['workflow_fb_id'], s['workflow_name'],
                  s['stage_name'], s['stage_type'], s['stage_order'],
                  s['is_initial'], s['is_final'], s['require_comment']))
        conn.commit()
        log.info(f"Sincronizados {len(stages)} workflow stages")
    except Exception as e:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
def main():
    t0 = time.time()
    log.info("=== INÍCIO DA SINCRONIZAÇÃO FIRESTORE → POSTGRESQL (v2.0 Star Schema) ===")
    try:
        log.info("Etapa 1/8: Empresas e departamentos...")
        sync_companies_and_departments()

        log.info("Etapa 2/8: Usuários...")
        sync_users()

        log.info("Etapa 3/8: Colaboradores...")
        sync_collaborators()

        log.info("Etapa 4/8: Catálogos e produtos...")
        sync_catalogs_and_products()

        log.info("Etapa 5/8: Formulários...")
        sync_forms()

        log.info("Etapa 6/8: Campos de formulários (dim_form_fields)...")
        sync_form_fields()

        log.info("Etapa 7/8: Workflows...")
        sync_workflows()

        log.info("Etapa 8/8: Respostas (fact_*)...")
        sync_responses()

        elapsed = time.time() - t0
        log.info(f"=== SINCRONIZAÇÃO CONCLUÍDA | tempo={elapsed:.2f}s ===")

    except Exception as e:
        log.exception(f"Falha na execução: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
