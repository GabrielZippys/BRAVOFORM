-- ============================================================================
-- BravoForm: Remover tabelas legado (dados já migrados para dim_*/fact_*)
-- Executado em: 30/03/2026
-- ============================================================================

BEGIN;

-- Tabelas fato legado (dependem das dimensões)
DROP TABLE IF EXISTS answer CASCADE;
DROP TABLE IF EXISTS form_response CASCADE;

-- Tabelas dimensão legado
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS product_catalogs CASCADE;
DROP TABLE IF EXISTS collaborators CASCADE;
DROP TABLE IF EXISTS forms CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

COMMIT;
