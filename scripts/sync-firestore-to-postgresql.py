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

project_id = os.getenv("FIREBASE_PROJECT_ID", "formbravo-8854e")
credentials = service_account.Credentials.from_service_account_file(str(cred_path))

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
PG_PASSWORD = os.getenv("PG_PASSWORD", "Brav0x00")

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
                'created_at': ts_to_iso(r.get('createdAt')),
                'submitted_at': ts_to_iso(r.get('submittedAt') or r.get('createdAt')),
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
                    
                    cleaned = clean_answer_value(value)
                    
                    # Tentar converter para número
                    try:
                        answer_number = float(cleaned.replace(',', '.'))
                    except (ValueError, AttributeError):
                        answer_text = cleaned
                    
                    # Tentar converter para boolean
                    if cleaned.lower() in ('true', 'false', 'sim', 'não', 'yes', 'no'):
                        answer_boolean = cleaned.lower() in ('true', 'sim', 'yes')
                    
                    answers_data.append({
                        'response_id': response_id,
                        'field_id': str(field_id),
                        'field_label': str(field_id),  # Pode ser melhorado com metadata do form
                        'field_type': 'text',
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

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
def main():
    try:
        t0 = time.time()
        log.info("=== INÍCIO DA SINCRONIZAÇÃO FIRESTORE → POSTGRESQL ===")
        
        export_and_sync_responses()
        
        elapsed = time.time() - t0
        log.info(f"=== SINCRONIZAÇÃO CONCLUÍDA | tempo={elapsed:.2f}s ===")
        
    except Exception as e:
        log.exception(f"Falha na execução: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
