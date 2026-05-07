-- =============================================================================
-- Migration 003: RLS para processos e patrimonios (chave anon do app web)
-- =============================================================================
-- Sintoma no navegador:
--   42501 new row violates row-level security policy ... "processos"
--   (e possivelmente em "patrimonios")
--
-- Causa: RLS ativada na tabela sem política que permita INSERT/UPDATE para o
-- papel "anon", usado pelo supabase-js com a chave pública (anon key).
--
-- Como aplicar:
--   Supabase Dashboard → SQL Editor → colar e executar este script.
--
-- Segurança: estas políticas liberam leitura/escrita para qualquer cliente que
-- use a anon key (igual ao app atual, sem login). Se no futuro houver Auth,
-- substitua por políticas baseadas em auth.uid().
-- =============================================================================

-- ---------------------------------------------------------------------------
-- processos
-- ---------------------------------------------------------------------------
ALTER TABLE processos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_processos" ON processos;
CREATE POLICY "anon_all_processos"
    ON processos
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- Opcional: usuários autenticados (se passar a usar login)
DROP POLICY IF EXISTS "authenticated_all_processos" ON processos;
CREATE POLICY "authenticated_all_processos"
    ON processos
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- patrimonios (itens ligados a processos)
-- ---------------------------------------------------------------------------
ALTER TABLE patrimonios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_patrimonios" ON patrimonios;
CREATE POLICY "anon_all_patrimonios"
    ON patrimonios
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_patrimonios" ON patrimonios;
CREATE POLICY "authenticated_all_patrimonios"
    ON patrimonios
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
