# Fila de faltantes na aba Ofício — design

**Data:** 2026-09-02  
**Projeto:** ufu_recolhimento  
**Status:** aprovado em brainstorming  
**Depende de:** `2026-09-02-colar-oficio-design.md` (aba Ofício já existente)

## Problema

Existem **267** protocolos SEI na planilha consolidada que ainda não estão no sistema (`Processos_faltando_no_sistema.csv`). Cadastrá-los um a um exige lembrar onde parou, o que já foi feito e abrir o link permanente do SEI — trabalho manual e fácil de perder o fio.

## Objetivo (v1)

Estender a aba **Ofício** com uma **fila de faltantes** na mesma tela: progresso híbrido (Supabase + localStorage), abertura do link SEI, e marcação automática de **Feito** ao concluir o cadastro daquele SEI no fluxo Ofício.

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Persistência do progresso | Híbrido: Supabase + espelho localStorage |
| UX | Tudo numa tela só (fila + colar ofício + itens) |
| Marcar Feito | Automático ao concluir o cadastro do SEI na mesma tela |
| Encaixe | Estender a aba **Ofício** (não criar aba nova) |
| Fonte da lista | CSV estático `Processos_faltando_no_sistema.csv` (267 linhas; atualizar CSV = nova lista) |
| Ordem | Ordem do CSV; ao abrir a aba, retoma no primeiro `pendente` |
| Pular (fila) | Só muda o foco; **não** marca Feito |
| SEI já em `processos` | Não marca Feito automaticamente só por existir; Feito só ao concluir o fluxo Ofício |

## Fora de escopo (v1)

- Nova aba dedicada “Fila”
- PDF/OCR / importação em lote sem ofício
- Reabrir automaticamente itens já cadastrados no Supabase como “feitos”
- Edição da lista de faltantes pela UI (só via novo CSV)
- Status intermediário `pulado` persistido (Pular não grava status)

## Fluxo do usuário

```
[Abrir aba Ofício]
    → carrega CSV + merge progresso (Supabase ↔ localStorage)
    → foca no 1º pendente
    → barra da fila + card atual + fluxo Ofício

[Abrir no SEI] → Link_Permanente em nova aba

[Colar ofício → Extrair → Revisar (SEI da fila) → Salvar processo → Confirmar itens]
    → ao concluir cadastro → marca Feito → avança ao próximo pendente
```

### Layout (cima → baixo, mesma tela)

1. **Barra da fila** — “Faltante X de 267 · feitos Y · restantes Z”; botões **Anterior / Próximo / Pular**; **Abrir no SEI**.
2. **Card do atual** — SEI, especificação/etiqueta (só leitura), status (`pendente` | `feito` | em andamento na UI).
3. **Fluxo Ofício existente** — colar → IA → revisar processo (SEI pré-preenchido pela fila) → salvar → fila de itens.

### Após Feito

1. Persistir progresso (Supabase + localStorage).
2. Avançar para o próximo SEI `pendente`.
3. Limpar texto/extração/itens do ofício.
4. Preencher SEI (e link) do novo card.

## Dados

### Catálogo (CSV)

Arquivo estático no app (servido junto ao site), colunas usadas:

- `Processo SEI`
- `ID`
- `Especificacao`
- `Etiqueta`
- `Link_Permanente`

Demais colunas do CSV podem ser ignoradas na v1.

### Progresso — Supabase `fila_faltantes`

| Coluna | Tipo | Notas |
|---|---|---|
| `sei` | text PK | Formato SEI normalizado |
| `status` | text | `pendente` \| `feito` |
| `atualizado_em` | timestamptz | Para merge “mais recente vence” |
| `processo_id` | uuid nullable | Opcional; preenchido se conhecido ao marcar Feito |

RLS: alinhado ao padrão atual do projeto (acesso via anon key já usada pelo app), sem expor segredos.

Linhas só existem para SEIs com progresso explícito (ou seed opcional); SEIs do CSV sem linha = `pendente` implícito.

### Progresso — localStorage `ufu_fila_faltantes`

```json
{
  "atualizado_em": "ISO-8601",
  "indice_atual": 0,
  "itens": [
    { "sei": "23117.000116/2026-84", "status": "feito", "atualizado_em": "ISO-8601" }
  ]
}
```

### Sync

1. **Ao abrir a aba:** CSV → merge com Supabase por `sei` (vence o `atualizado_em` mais recente) → grava espelho no localStorage.
2. **Offline / falha Supabase:** usa localStorage; no próximo sucesso, upsert do que estiver mais novo.
3. **Marcar Feito:** escreve nas duas camadas imediatamente.

## Regras de “concluir cadastro”

Marca **Feito** automaticamente quando:

- Todos os itens da fila de confirmação do ofício foram confirmados (fila de itens vazia após o último confirm), **ou**
- O processo foi salvo e não há itens pendentes na fila de confirmação (extração sem itens / fila já vazia).

**Não** marca Feito apenas ao “Salvar processo” se ainda houver itens na fila de confirmação.

**Guardrail:** se o SEI do card da fila ≠ SEI do formulário Ofício no momento da conclusão → **não** marca Feito; exibe aviso.

## Pular / navegação

| Ação | Efeito |
|---|---|
| Anterior / Próximo | Mudam o card focado; não alteram status |
| Pular | Foca o próximo `pendente`; não grava Feito |
| Abrir no SEI | `window.open(Link_Permanente)`; se link vazio → botão desabilitado + aviso |

## Erros

| Situação | Comportamento |
|---|---|
| Falha ao gravar Feito no Supabase | Mantém localStorage + toast; retenta no próximo sync |
| CSV não carrega | Barra/fila indisponível; fluxo Ofício “solto” continua |
| SEI fila ≠ SEI formulário na conclusão | Bloqueia Feito automático + aviso |

## Arquitetura (unidades)

| Unidade | Responsabilidade |
|---|---|
| `fila-faltantes.js` (helpers puros) | Parse CSV → lista; merge progresso; próximo pendente; serializar localStorage |
| API / Supabase | `listarFilaFaltantes`, `upsertFilaFaltante` |
| Alpine (aba Ofício) | Estado da barra/card; preencher SEI; chamar Feito ao concluir; navegação |
| `index.html` | UI da barra + card acima do fluxo Ofício |

Testes unitários nos helpers de merge/ordem/próximo pendente (sem rede).

## Critérios de aceite

1. Abrir Ofício mostra progresso e o primeiro pendente com SEI + link.
2. **Abrir no SEI** abre o `Link_Permanente` correto.
3. Concluir cadastro do SEI atual marca Feito (Supabase + localStorage) e avança.
4. Recarregar a página / outro browser com sync restaura feitos via Supabase.
5. Sem CSV, Ofício isolado ainda funciona.
6. SEI divergente na conclusão não marca Feito no card errado.
