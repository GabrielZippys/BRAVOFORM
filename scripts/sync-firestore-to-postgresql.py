"""
ETL: Firestore → PostgreSQL (Cloud SQL)
Adaptado do script SQL Server para PostgreSQL
Sincroniza respostas dos formulários do Firestore para PostgreSQL
"""

import os
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Dict, List
import logging
from logging.handlers import RotatingFileHandler
import time

from google.cloud import firestore
from google.oauth2 import service_account
import psycopg2
from psycopg2.extras import execute_batch

# -----------------------------------------------------------------------------
# Configuração de Logging
# -----------------------------------------------------------------------------
APP_NAME = "etl_firestore_to_postgresql"
LOG_DIR = Path("logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / f"{APP_NAME}.log"

def _setup_logger() -> logging.Logger:
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    fmt = "%(asctime)s | %(levelname)-7s | %(message)s"
    logger = logging.getLogger(APP_NAME)
    logger.setLevel(level)
    if not logger.handlers:
        sh = logging.StreamHandler()
        sh.setFormatter(logging.Formatter(fmt))
        fh = RotatingFileHandler(LOG_FILE, maxBytes=5*1024*1024, backupCount=3, encoding="utf-8")
        fh.setFormatter(logging.Formatter(fmt))
        logger.addHandler(sh)
        logger.addHandler(fh)
    return logger

log = _setup_logger()

# -----------------------------------------------------------------------------
# Configurações
# -----------------------------------------------------------------------------
DAYS_TO_SYNC = int(os.getenv("DAYS_TO_SYNC", "30"))

# Firestore
cred_path = Path("firebase_cred.json")
if not cred_path.exists():
    cred_path = Path(__file__).parent.parent / "firebase_cred.json"
if not cred_path.exists():
    raise RuntimeError(f"Credenciais do Firebase não encontradas: {cred_path}")

credentials = service_account.Credentials.from_service_account_file(str(cred_path))

# Usar project_id do arquivo de credenciais
import json
with open(cred_path) as f:
    cred_data = json.load(f)
    project_id = cred_data.get("project_id", "formbravo-8854e")

try:
    db = firestore.Client(project=project_id, credentials=credentials)
    log.info(f"Firestore conectado | project_id={project_id}")
except Exception as e:
    log.exception(f"Falha ao conectar no Firestore: {e}")
    raise

# PostgreSQL
PG_HOST = os.getenv("PG_HOST", "34.39.165.146")
PG_PORT = int(os.getenv("PG_PORT", "5432"))
PG_DATABASE = os.getenv("PG_DATABASE", "formbravo-8854e-database")
PG_USER = os.getenv("PG_USER", "ipanema")
PG_PASSWORD = os.getenv("PG_PASSWORD", "Br@v0x00")

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def ts_to_iso(v):
    """Converte Timestamp do Firestore para ISO string"""
    try:
        if hasattr(v, "isoformat"):
            return v.replace(tzinfo=None).isoformat()
        if isinstance(v, dict) and "seconds" in v:
            return datetime.fromtimestamp(v["seconds"]).isoformat()
    except Exception:
        pass
    return None

def clean_answer_value(raw):
    """Limpa e normaliza valores de resposta"""
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw
    if isinstance(raw, (int, float, bool)):
        return str(raw)
    if isinstance(raw, list):
        return "; ".join(clean_answer_value(x) for x in raw if x is not None)
    if isinstance(raw, dict):
        if "answers" in raw and isinstance(raw["answers"], list):
            return "; ".join(clean_answer_value(x) for x in raw["answers"])
        return "; ".join(clean_answer_value(v) for _, v in raw.items() if v)
    return str(raw)

# -----------------------------------------------------------------------------
# PostgreSQL Connection
# -----------------------------------------------------------------------------
def pg_connect():
    """Conecta ao PostgreSQL Cloud SQL"""
    return psycopg2.connect(
        host=PG_HOST,
        port=PG_PORT,
        database=PG_DATABASE,
        user=PG_USER,
        password=PG_PASSWORD,
        sslmode='prefer'
    )

# -----------------------------------------------------------------------------
# Export Firestore → PostgreSQL
# -----------------------------------------------------------------------------
def export_and_sync_products_and_catalogs():
    """
    Exporta produtos e catálogos do Firestore para PostgreSQL
    Tabelas: products, product_catalogs
    """
    log.info("Exportando produtos e catálogos...")
    
    products_data = []
    catalogs_data = []
    
    # Buscar catálogos
    for catalog_doc in db.collection("product_catalogs").stream():
        catalog_id = catalog_doc.id
        cdata = catalog_doc.to_dict() or {}
        
        catalogs_data.append({
            'id': catalog_id,
            'name': cdata.get("name", ""),
            'description': cdata.get("description", ""),
            'company_id': cdata.get("companyId", ""),
            'display_field': cdata.get("displayField", "name"),
            'search_fields': str(cdata.get("searchFields", [])),
            'value_field': cdata.get("valueField", "id"),
            'fields': str(cdata.get("fields", [])),
            'additional_fields': str(cdata.get("additionalFields", [])),
            'created_at': ts_to_iso(cdata.get("createdAt")),
            'updated_at': ts_to_iso(cdata.get("updatedAt")),
        })
    
    # Buscar produtos da coleção raiz /products
    for prod_doc in db.collection("products").stream():
        pdata = prod_doc.to_dict() or {}
        # Firestore usa 'nome' (pt-BR), não 'name'
        product_name = pdata.get("nome", "") or pdata.get("name", "")
        products_data.append({
            'id': prod_doc.id,
            'catalog_id': pdata.get("catalogId", ""),
            'name': product_name,
            'codigo': pdata.get("codigo", ""),
            'ean': pdata.get("ean", ""),
            'unidade': pdata.get("unidade", ""),
            'quantidade_max': pdata.get("quantidadeMax"),
            'quantidade_min': pdata.get("quantidadeMin"),
            'preco': pdata.get("preco"),
            'estoque': pdata.get("estoque"),
            'collection': pdata.get("collection", "products"),
            'company_id': pdata.get("companyId", ""),
            'created_at': ts_to_iso(pdata.get("createdAt")),
            'updated_at': ts_to_iso(pdata.get("updatedAt")),
        })
    
    log.info(f"Catálogos coletados: {len(catalogs_data)} | Produtos: {len(products_data)}")
    
    if catalogs_data or products_data:
        sync_products_catalogs_to_postgresql(catalogs_data, products_data)
    
    return catalogs_data, products_data

def sync_products_catalogs_to_postgresql(catalogs_data, products_data):
    """Sincroniza tabelas product_catalogs e products no PostgreSQL"""
    conn = pg_connect()
    cur = conn.cursor()
    
    try:
        # Criar tabela product_catalogs
        cur.execute("""
            CREATE TABLE IF NOT EXISTS product_catalogs (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(500) NOT NULL,
                description TEXT,
                company_id VARCHAR(255),
                display_field VARCHAR(255),
                search_fields TEXT,
                value_field VARCHAR(255),
                fields TEXT,
                additional_fields TEXT,
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
        """)
        
        # Criar tabela products (com colunas extras preco, estoque)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id VARCHAR(255) PRIMARY KEY,
                catalog_id VARCHAR(255) REFERENCES product_catalogs(id),
                name VARCHAR(500) NOT NULL,
                codigo VARCHAR(255),
                ean VARCHAR(255),
                unidade VARCHAR(50),
                quantidade_max INTEGER,
                quantidade_min INTEGER,
                preco DECIMAL(12,2),
                estoque INTEGER,
                collection VARCHAR(255),
                company_id VARCHAR(255),
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
        """)
        # Adicionar colunas se não existem (para tabelas já criadas)
        for col, col_type in [('preco', 'DECIMAL(12,2)'), ('estoque', 'INTEGER')]:
            try:
                cur.execute(f"ALTER TABLE products ADD COLUMN IF NOT EXISTS {col} {col_type}")
            except Exception:
                pass
        
        # Limpar
        cur.execute("DELETE FROM products")
        cur.execute("DELETE FROM product_catalogs")
        
        # Inserir catálogos
        if catalogs_data:
            execute_batch(cur, """
                INSERT INTO product_catalogs (
                    id, name, description, company_id, display_field, search_fields,
                    value_field, fields, additional_fields, created_at, updated_at
                ) VALUES (
                    %(id)s, %(name)s, %(description)s, %(company_id)s, %(display_field)s,
                    %(search_fields)s, %(value_field)s, %(fields)s, %(additional_fields)s,
                    %(created_at)s, %(updated_at)s
                )
            """, catalogs_data, page_size=100)
        
        # Inserir produtos
        if products_data:
            execute_batch(cur, """
                INSERT INTO products (
                    id, catalog_id, name, codigo, ean, unidade, quantidade_max,
                    quantidade_min, preco, estoque, collection, company_id, created_at, updated_at
                ) VALUES (
                    %(id)s, %(catalog_id)s, %(name)s, %(codigo)s, %(ean)s, %(unidade)s,
                    %(quantidade_max)s, %(quantidade_min)s, %(preco)s, %(estoque)s, %(collection)s, %(company_id)s,
                    %(created_at)s, %(updated_at)s
                )
            """, products_data, page_size=100)
        
        conn.commit()
        log.info(f"Inseridos {len(catalogs_data)} catálogos e {len(products_data)} produtos")
        
    except Exception as e:
        conn.rollback()
        log.exception(f"Erro ao sincronizar products/catalogs: {e}")
        raise
    finally:
        cur.close()
        conn.close()

def export_and_sync_companies_and_departments():
    """
    Exporta empresas e departamentos do Firestore para PostgreSQL
    Tabelas: companies, departments
    """
    log.info("Exportando empresas e departamentos...")
    
    companies_data = []
    departments_data = []
    
    for comp_doc in db.collection("companies").stream():
        comp_id = comp_doc.id
        cdata = comp_doc.to_dict() or {}
        
        companies_data.append({
            'id': comp_id,
            'name': cdata.get("name", ""),
            'created_at': ts_to_iso(cdata.get("createdAt")),
        })
        
        # Buscar departamentos dessa empresa
        for dept_doc in db.collection("companies").document(comp_id).collection("departments").stream():
            ddata = dept_doc.to_dict() or {}
            departments_data.append({
                'id': dept_doc.id,
                'name': ddata.get("name", ""),
                'company_id': comp_id,
                'created_at': ts_to_iso(ddata.get("createdAt")),
            })
    
    log.info(f"Empresas coletadas: {len(companies_data)} | Departamentos: {len(departments_data)}")
    
    if companies_data or departments_data:
        sync_companies_departments_to_postgresql(companies_data, departments_data)
    
    return companies_data, departments_data

def sync_companies_departments_to_postgresql(companies_data, departments_data):
    """Sincroniza tabelas companies e departments no PostgreSQL"""
    conn = pg_connect()
    cur = conn.cursor()
    
    try:
        # Criar tabelas
        cur.execute("""
            CREATE TABLE IF NOT EXISTS companies (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(500) NOT NULL,
                created_at TIMESTAMP
            )
        """)
        
        cur.execute("""
            CREATE TABLE IF NOT EXISTS departments (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(500) NOT NULL,
                company_id VARCHAR(255) REFERENCES companies(id),
                created_at TIMESTAMP
            )
        """)
        
        # Limpar
        cur.execute("DELETE FROM departments")
        cur.execute("DELETE FROM companies")
        
        # Inserir companies
        if companies_data:
            execute_batch(cur, """
                INSERT INTO companies (id, name, created_at)
                VALUES (%(id)s, %(name)s, %(created_at)s)
            """, companies_data, page_size=100)
        
        # Inserir departments
        if departments_data:
            execute_batch(cur, """
                INSERT INTO departments (id, name, company_id, created_at)
                VALUES (%(id)s, %(name)s, %(company_id)s, %(created_at)s)
            """, departments_data, page_size=100)
        
        conn.commit()
        log.info(f"Inseridas {len(companies_data)} empresas e {len(departments_data)} departamentos")
        
    except Exception as e:
        conn.rollback()
        log.exception(f"Erro ao sincronizar companies/departments: {e}")
        raise
    finally:
        cur.close()
        conn.close()

def export_and_sync_users():
    """
    Exporta usuários do Firestore para PostgreSQL
    Tabela: users
    """
    log.info("Exportando usuários...")
    
    users_data = []
    
    for user_doc in db.collection("users").stream():
        user_id = user_doc.id
        udata = user_doc.to_dict() or {}
        
        users_data.append({
            'id': user_id,
            'name': udata.get("name", ""),
            'email': udata.get("email", ""),
            'role': udata.get("role", "Admin"),
            'company_id': udata.get("companyId"),
            'department_id': udata.get("departmentId"),
            'created_at': ts_to_iso(udata.get("createdAt")),
        })
    
    log.info(f"Total de usuários coletados: {len(users_data)}")
    
    if users_data:
        sync_users_to_postgresql(users_data)
    
    return users_data

def sync_users_to_postgresql(users_data):
    """Sincroniza tabela users no PostgreSQL"""
    conn = pg_connect()
    cur = conn.cursor()
    
    try:
        # Criar tabela se não existir
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(500) NOT NULL,
                email VARCHAR(500),
                role VARCHAR(100),
                company_id VARCHAR(255),
                department_id VARCHAR(255),
                created_at TIMESTAMP
            )
        """)
        
        # Limpar tabela
        cur.execute("DELETE FROM users")
        log.info("Tabela users limpa")
        
        # Inserir usuários
        execute_batch(cur, """
            INSERT INTO users (id, name, email, role, company_id, department_id, created_at)
            VALUES (%(id)s, %(name)s, %(email)s, %(role)s, %(company_id)s, %(department_id)s, %(created_at)s)
        """, users_data, page_size=100)
        
        conn.commit()
        log.info(f"Inseridos {len(users_data)} usuários na tabela users")
        
    except Exception as e:
        conn.rollback()
        log.exception(f"Erro ao sincronizar users: {e}")
        raise
    finally:
        cur.close()
        conn.close()

def export_and_sync_collaborators():
    """
    Exporta colaboradores do Firestore para PostgreSQL
    Tabela: collaborators
    """
    log.info("Exportando colaboradores...")
    
    collaborators_data = []
    
    def _extract_collaborator(collab_id, cdata, fallback_company_id=""):
        """Extrai dados do colaborador do Firestore com mapeamento correto"""
        # permissions pode ser um objeto aninhado
        perms = cdata.get("permissions", {})
        if not isinstance(perms, dict):
            perms = {}
        
        return {
            'id': collab_id,
            'uid': cdata.get("uid", ""),
            'username': cdata.get("username", ""),
            'name': cdata.get("name", "") or cdata.get("username", ""),
            'email': cdata.get("email"),
            'role': cdata.get("role", "collaborator"),
            'active': cdata.get("active", True),
            'company_id': cdata.get("companyId", "") or fallback_company_id,
            'department_id': cdata.get("departmentId", ""),
            'department_name': cdata.get("department", ""),
            'is_temporary_password': cdata.get("isTemporaryPassword", False),
            'can_view_history': perms.get("canViewHistory", False) or cdata.get("canViewHistory", False),
            'can_edit_history': perms.get("canEditHistory", False) or cdata.get("canEditHistory", False),
            'created_at': ts_to_iso(cdata.get("createdAt")),
        }
    
    # Buscar colaboradores na coleção raiz /collaborators
    for collab_doc in db.collection("collaborators").stream():
        collab_id = collab_doc.id
        cdata = collab_doc.to_dict() or {}
        collaborators_data.append(_extract_collaborator(collab_id, cdata))
    
    # Também buscar em companies/{companyId}/collaborators (estrutura antiga)
    for comp_doc in db.collection("companies").stream():
        comp_id = comp_doc.id
        
        for collab_doc in db.collection("companies").document(comp_id).collection("collaborators").stream():
            collab_id = collab_doc.id
            cdata = collab_doc.to_dict() or {}
            
            # Evitar duplicatas
            if not any(c['id'] == collab_id for c in collaborators_data):
                collaborators_data.append(_extract_collaborator(collab_id, cdata, comp_id))
    
    log.info(f"Total de colaboradores coletados: {len(collaborators_data)}")
    
    if collaborators_data:
        sync_collaborators_to_postgresql(collaborators_data)
    
    return collaborators_data

def sync_collaborators_to_postgresql(collaborators_data):
    """Sincroniza tabela collaborators no PostgreSQL"""
    conn = pg_connect()
    cur = conn.cursor()
    
    try:
        # Criar tabela se não existir
        cur.execute("""
            CREATE TABLE IF NOT EXISTS collaborators (
                id VARCHAR(255) PRIMARY KEY,
                uid VARCHAR(255),
                username VARCHAR(500) NOT NULL,
                name VARCHAR(500),
                email VARCHAR(500),
                role VARCHAR(100) DEFAULT 'collaborator',
                active BOOLEAN DEFAULT TRUE,
                company_id VARCHAR(255),
                department_id VARCHAR(255),
                department_name VARCHAR(255),
                is_temporary_password BOOLEAN DEFAULT FALSE,
                can_view_history BOOLEAN DEFAULT FALSE,
                can_edit_history BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP
            )
        """)
        # Adicionar colunas se não existem (para tabelas já criadas)
        for col, col_type in [('uid', 'VARCHAR(255)'), ('name', 'VARCHAR(500)'), ('role', 'VARCHAR(100)'), ('active', 'BOOLEAN DEFAULT TRUE')]:
            try:
                cur.execute(f"ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS {col} {col_type}")
            except Exception:
                pass
        
        # Limpar tabela
        cur.execute("DELETE FROM collaborators")
        log.info("Tabela collaborators limpa")
        
        # Inserir colaboradores
        execute_batch(cur, """
            INSERT INTO collaborators (
                id, uid, username, name, email, role, active, company_id, department_id, department_name,
                is_temporary_password, can_view_history, can_edit_history, created_at
            ) VALUES (
                %(id)s, %(uid)s, %(username)s, %(name)s, %(email)s, %(role)s, %(active)s, %(company_id)s, %(department_id)s, %(department_name)s,
                %(is_temporary_password)s, %(can_view_history)s, %(can_edit_history)s, %(created_at)s
            )
        """, collaborators_data, page_size=100)
        
        conn.commit()
        log.info(f"Inseridos {len(collaborators_data)} colaboradores na tabela collaborators")
        
    except Exception as e:
        conn.rollback()
        log.exception(f"Erro ao sincronizar collaborators: {e}")
        raise
    finally:
        cur.close()
        conn.close()

def export_and_sync_forms():
    """
    Exporta metadados dos formulários do Firestore para PostgreSQL
    Tabela: forms (id, title, description, company_id, department_id, fields_json)
    """
    log.info("Exportando metadados dos formulários...")
    
    forms_data = []
    
    for form_doc in db.collection("forms").stream():
        form_id = form_doc.id
        fdata = form_doc.to_dict() or {}
        
        forms_data.append({
            'id': form_id,
            'title': fdata.get("title") or fdata.get("name") or "",
            'description': fdata.get("description", ""),
            'company_id': fdata.get("companyId", ""),
            'department_id': fdata.get("departmentId", ""),
            'department_name': fdata.get("department", "") or fdata.get("departmentId", ""),
            'is_active': 1 if fdata.get("active", True) else 0,
            'created_at': ts_to_iso(fdata.get("createdAt")),
            'updated_at': ts_to_iso(fdata.get("updatedAt") or fdata.get("createdAt")),
            'fields_json': str(fdata.get("fields", []))  # JSON dos campos para referência
        })
    
    log.info(f"Total de formulários coletados: {len(forms_data)}")
    
    # Sincronizar com PostgreSQL
    if forms_data:
        sync_forms_to_postgresql(forms_data)
    
    return forms_data

def sync_forms_to_postgresql(forms_data):
    """Sincroniza tabela forms no PostgreSQL"""
    conn = pg_connect()
    cur = conn.cursor()
    
    try:
        # Criar tabela se não existir
        cur.execute("""
            CREATE TABLE IF NOT EXISTS forms (
                id VARCHAR(255) PRIMARY KEY,
                title VARCHAR(500) NOT NULL,
                description TEXT,
                company_id VARCHAR(255),
                department_id VARCHAR(255),
                department_name VARCHAR(255),
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP,
                updated_at TIMESTAMP,
                fields_json TEXT
            )
        """)
        
        # Limpar tabela (modo truncate)
        cur.execute("DELETE FROM forms")
        log.info(f"Tabela forms limpa")
        
        # Inserir formulários
        insert_sql = """
            INSERT INTO forms (
                id, title, description, company_id, department_id, department_name,
                is_active, created_at, updated_at, fields_json
            ) VALUES (
                %(id)s, %(title)s, %(description)s, %(company_id)s, %(department_id)s, %(department_name)s,
                %(is_active)s, %(created_at)s, %(updated_at)s, %(fields_json)s
            )
        """
        
        from psycopg2.extras import execute_batch
        execute_batch(cur, insert_sql, forms_data, page_size=100)
        
        conn.commit()
        log.info(f"Inseridos {len(forms_data)} formulários na tabela forms")
        
    except Exception as e:
        conn.rollback()
        log.exception(f"Erro ao sincronizar forms: {e}")
        raise
    finally:
        cur.close()
        conn.close()

def export_and_sync_responses():
    """
    Exporta respostas do Firestore e sincroniza com PostgreSQL
    Mantém compatibilidade com estrutura existente
    """
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=DAYS_TO_SYNC)
    log.info(f"Sincronizando respostas dos últimos {DAYS_TO_SYNC} dias (desde {cutoff_date.isoformat()})")
    
    responses_data = []
    answers_data = []
    
    for form_doc in db.collection("forms").stream():
        form_id = form_doc.id
        fdata = form_doc.to_dict() or {}
        form_title = fdata.get("title") or fdata.get("name") or ""
        company_id = fdata.get("companyId", "")
        department_id = fdata.get("departmentId", "")
        department_name = fdata.get("department", "") or department_id
        
        # Buscar respostas recentes
        responses_ref = db.collection("forms").document(form_id).collection("responses")
        query = responses_ref.where("submittedAt", ">=", cutoff_date)
        
        resp_count = 0
        for resp_doc in query.stream():
            resp_count += 1
            r = resp_doc.to_dict() or {}
            response_id = resp_doc.id
            
            # Dados da resposta principal
            submitted_at = ts_to_iso(r.get('submittedAt') or r.get('createdAt'))
            created_at = ts_to_iso(r.get('createdAt')) or submitted_at  # Fallback para submitted_at
            
            responses_data.append({
                'id': response_id,
                'form_id': form_id,
                'form_title': form_title,
                'company_id': company_id,
                'department_id': department_id,
                'department_name': department_name,
                'collaborator_id': r.get('collaboratorId', ''),
                'collaborator_username': r.get('collaboratorUsername', ''),
                'status': r.get('status', 'submitted'),
                'current_stage_id': r.get('currentStageId'),
                'assigned_to': r.get('assignedTo'),
                'created_at': created_at,
                'submitted_at': submitted_at,
                'deleted_at': ts_to_iso(r.get('deletedAt')),
                'deleted_by': r.get('deletedBy'),
                'deleted_by_username': r.get('deletedByUsername')
            })
            
            # Processar respostas individuais
            answers = r.get('answers', {})
            if isinstance(answers, dict):
                for field_id, value in answers.items():
                    # Determinar tipo de resposta
                    answer_text = None
                    answer_number = None
                    answer_date = None
                    answer_boolean = None
                    field_type = 'text'
                    
                    cleaned = clean_answer_value(value)
                    
                    # Tentar converter para data (formato ISO, timestamp, ou padrões comuns)
                    if isinstance(value, str) and len(value) >= 8:
                        # Padrões de data: YYYY-MM-DD, DD/MM/YYYY, YYYY-MM-DDTHH:MM, etc
                        if any(sep in value for sep in ['-', '/', 'T']) and any(c.isdigit() for c in value):
                            try:
                                # Tentar ISO format primeiro
                                parsed_date = datetime.fromisoformat(value.replace('Z', '+00:00'))
                                answer_date = parsed_date.replace(tzinfo=None)
                                field_type = 'date'
                            except:
                                try:
                                    # Tentar DD/MM/YYYY
                                    parsed_date = datetime.strptime(value.split()[0], '%d/%m/%Y')
                                    answer_date = parsed_date
                                    field_type = 'date'
                                except:
                                    try:
                                        # Tentar YYYY-MM-DD
                                        parsed_date = datetime.strptime(value.split('T')[0], '%Y-%m-%d')
                                        answer_date = parsed_date
                                        field_type = 'date'
                                    except:
                                        pass
                    
                    # Se não é data, tentar número
                    if answer_date is None:
                        try:
                            # Tentar converter para número (aceita vírgula como decimal)
                            num_str = cleaned.replace(',', '.')
                            if num_str and num_str.replace('.', '').replace('-', '').isdigit():
                                answer_number = float(num_str)
                                field_type = 'number'
                        except (ValueError, AttributeError):
                            pass
                    
                    # Se não é data nem número, tentar boolean
                    if answer_date is None and answer_number is None:
                        if cleaned.lower() in ('true', 'false', 'sim', 'não', 'yes', 'no'):
                            answer_boolean = cleaned.lower() in ('true', 'sim', 'yes')
                            field_type = 'boolean'
                        else:
                            # É texto
                            answer_text = cleaned
                            field_type = 'text'
                    
                    answers_data.append({
                        'response_id': response_id,
                        'field_id': str(field_id),
                        'field_label': str(field_id),
                        'field_type': field_type,
                        'answer_text': answer_text,
                        'answer_number': answer_number,
                        'answer_date': answer_date,
                        'answer_boolean': answer_boolean
                    })
        
        if resp_count > 0:
            log.info(f"Form {form_id}: {resp_count} respostas coletadas")
    
    log.info(f"Total: {len(responses_data)} respostas, {len(answers_data)} answers")
    
    # Sincronizar com PostgreSQL
    sync_to_postgresql(responses_data, answers_data, cutoff_date)

def sync_to_postgresql(responses_data, answers_data, cutoff_date):
    """Sincroniza dados com PostgreSQL"""
    conn = pg_connect()
    cur = conn.cursor()
    
    try:
        # Deletar dados antigos (modo incremental)
        cutoff_iso = cutoff_date.isoformat()
        cur.execute("DELETE FROM answer WHERE response_id IN (SELECT id FROM form_response WHERE submitted_at >= %s)", (cutoff_iso,))
        deleted_answers = cur.rowcount
        
        cur.execute("DELETE FROM form_response WHERE submitted_at >= %s", (cutoff_iso,))
        deleted_responses = cur.rowcount
        
        log.info(f"Deletados: {deleted_responses} respostas, {deleted_answers} answers (modo incremental)")
        
        # Inserir respostas
        if responses_data:
            insert_sql = """
                INSERT INTO form_response (
                    id, form_id, form_title, company_id, department_id, department_name,
                    collaborator_id, collaborator_username, status, current_stage_id,
                    assigned_to, created_at, submitted_at, deleted_at, deleted_by, deleted_by_username
                ) VALUES (
                    %(id)s, %(form_id)s, %(form_title)s, %(company_id)s, %(department_id)s, %(department_name)s,
                    %(collaborator_id)s, %(collaborator_username)s, %(status)s, %(current_stage_id)s,
                    %(assigned_to)s, %(created_at)s, %(submitted_at)s, %(deleted_at)s, %(deleted_by)s, %(deleted_by_username)s
                )
            """
            execute_batch(cur, insert_sql, responses_data, page_size=100)
            log.info(f"Inseridas {len(responses_data)} respostas")
        
        # Inserir answers
        if answers_data:
            insert_sql = """
                INSERT INTO answer (
                    response_id, field_id, field_label, field_type,
                    answer_text, answer_number, answer_date, answer_boolean
                ) VALUES (
                    %(response_id)s, %(field_id)s, %(field_label)s, %(field_type)s,
                    %(answer_text)s, %(answer_number)s, %(answer_date)s, %(answer_boolean)s
                )
            """
            execute_batch(cur, insert_sql, answers_data, page_size=100)
            log.info(f"Inseridas {len(answers_data)} answers")
        
        conn.commit()
        log.info("Sincronização concluída com sucesso!")
        
    except Exception as e:
        conn.rollback()
        log.exception(f"Erro na sincronização: {e}")
        raise
    finally:
        cur.close()
        conn.close()

def create_indexes():
    """Cria índices para otimizar queries"""
    conn = pg_connect()
    cur = conn.cursor()
    
    try:
        # Índices para products
        cur.execute("CREATE INDEX IF NOT EXISTS idx_products_catalog_id ON products(catalog_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_products_company_id ON products(company_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_products_codigo ON products(codigo)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_products_ean ON products(ean)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)")
        
        # Índices para product_catalogs
        cur.execute("CREATE INDEX IF NOT EXISTS idx_product_catalogs_company_id ON product_catalogs(company_id)")
        
        conn.commit()
        log.info("Índices criados com sucesso")
        
    except Exception as e:
        conn.rollback()
        log.exception(f"Erro ao criar índices: {e}")
    finally:
        cur.close()
        conn.close()

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
def main():
    try:
        t0 = time.time()
        log.info("=== INÍCIO DA SINCRONIZAÇÃO FIRESTORE → POSTGRESQL ===")
        
        # 1. Exportar empresas e departamentos
        log.info("Etapa 1/7: Exportando empresas e departamentos...")
        export_and_sync_companies_and_departments()
        
        # 2. Exportar usuários
        log.info("Etapa 2/7: Exportando usuários...")
        export_and_sync_users()
        
        # 3. Exportar colaboradores
        log.info("Etapa 3/7: Exportando colaboradores...")
        export_and_sync_collaborators()
        
        # 4. Exportar produtos e catálogos
        log.info("Etapa 4/7: Exportando produtos e catálogos...")
        export_and_sync_products_and_catalogs()
        
        # 5. Exportar metadados dos formulários
        log.info("Etapa 5/7: Exportando formulários...")
        export_and_sync_forms()
        
        # 6. Exportar respostas
        log.info("Etapa 6/7: Exportando respostas...")
        export_and_sync_responses()
        
        # 7. Criar índices
        log.info("Etapa 7/7: Criando índices...")
        create_indexes()
        
        elapsed = time.time() - t0
        log.info(f"=== SINCRONIZAÇÃO CONCLUÍDA | tempo={elapsed:.2f}s ===")
        
    except Exception as e:
        log.exception(f"Falha na execução: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
