-- =============================================================================
-- Migration 002: Adiciona campo de Avaliação na tabela patrimonios
-- =============================================================================
-- Data: 2026-05-07
-- Descrição: Adiciona colunas para suporte ao Relatório de Classificação Prévia.
--
-- Como aplicar:
--   1. Acesse https://supabase.com/dashboard
--   2. Selecione o projeto oyvvvxpgqhyowvfaepgu
--   3. Vá em "SQL Editor" e cole este script
--   4. Execute (Run)
--
-- Itens legados ficam com avaliacao = NULL e devem ser regularizados via
-- a aba "Classif. Prévia" antes da emissão do relatório.
-- =============================================================================

ALTER TABLE patrimonios
    ADD COLUMN IF NOT EXISTS avaliacao TEXT
        CHECK (avaliacao IN ('REUSO', 'LAUDO_TECNICO', 'DESCARTE')),
    ADD COLUMN IF NOT EXISTS avaliado_em TIMESTAMPTZ;

COMMENT ON COLUMN patrimonios.avaliacao IS
    'Classificação prévia do bem: REUSO, LAUDO_TECNICO ou DESCARTE.';

COMMENT ON COLUMN patrimonios.avaliado_em IS
    'Data/hora em que a avaliação foi registrada ou alterada.';
