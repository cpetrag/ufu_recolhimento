# Marcar processo como Recolhido — design

**Data:** 2026-09-04  
**Projeto:** ufu_recolhimento  
**Status:** aprovado em brainstorming

## Objetivo

Permitir marcar um item da fila de faltantes como **Recolhido** (pular cadastro completo) e sinalizar no sistema para que relatórios possam ignorar esses processos. Processos existentes ficam com `recolhido = false` por padrão.

## Decisões

| Tema | Decisão |
|---|---|
| Processo inexistente | Cria processo mínimo (`sei` + `recolhido: true` + placeholders de unidade/sala se NOT NULL) |
| Flag no sistema | `processos.recolhido boolean not null default false` |
| Fila | `status: feito` + `motivo: "recolhido"` |
| Relatórios | Por padrão **excluem** `recolhido = true`; opção de incluir |

## Fluxo (fila)

Botão **Recolhido** no card:
1. Confirmação do usuário.
2. Upsert/update processo com `recolhido: true`.
3. Marca fila `feito` + `motivo: recolhido` (local + Supabase).
4. Avança ao próximo pendente.

## Fora de escopo

- Workflow de “desfazer recolhido” na v1 (pode editar no banco / futuro toggle).
- Alterar status da fila para um terceiro valor além de pendente/feito.
