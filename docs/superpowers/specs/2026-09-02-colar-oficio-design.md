# Colar ofício — design

**Data:** 2026-09-02  
**Projeto:** ufu_recolhimento  
**Status:** aprovado em brainstorming

## Problema

Há dezenas de processos SEI (ofícios de recolhimento) ainda não cadastrados no sistema. Cada ofício traz, em texto livre, o número SEI, local (campus/bloco/sala) e um ou mais bens com número de patrimônio. O cadastro manual é lento e propenso a erro de digitação.

## Objetivo (v1)

Nova aba **Ofício** que permite colar o texto do ofício, extrair dados com IA e:

1. Salvar o **processo** imediatamente (após revisão rápida).
2. Enfileirar os **itens** para confirmação um a um (foto opcional, tamanho sugerido pela IA, avaliação opcional).

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Encaixe na UI | Nova aba **Ofício** (não modal na aba Processo) |
| Persistência | Híbrido: processo salva na hora; itens entram em fila de confirmação |
| Foto | Opcional na confirmação do item |
| Avaliação (Reuso/Laudo/Descarte) | Opcional; pode completar depois na Classificação prévia |
| Tamanho (P/M/G/GG) | IA sugere; usuário confirma (pode deixar em branco → `null`) |
| Campus / Bloco / Unidade | IA extrai texto; app tenta casar com tabelas do Supabase; se falhar, dropdown manual |
| IA | Netlify Function proxy — chave nunca no frontend |
| Entrada | Somente texto colado (sem PDF/OCR na v1) |
| Lote dos faltantes | Fora do escopo da v1 |
| SharePoint | Não dispara envio automático nesta aba |

## Fluxo do usuário

```
[Colar ofício] → [Extrair com IA] → [Revisar processo] → [Salvar processo]
                                                          ↓
                                              [Fila: confirmar item 1..N]
                                                          ↓
                                                       [Pronto]
```

### Passo 1 — Colar

- Textarea grande para o texto do ofício.
- Botão **Extrair com IA**.
- O texto permanece se a chamada falhar (retry).

### Passo 2 — Revisar processo

Campos:

- Número SEI (máscara existente `23117.000000/0000-00`)
- Pró-Reitoria / Unidade (match + dropdown de `unidades`)
- Campus (match + dropdown de `campus`)
- Bloco (match + dropdown de `blocos` filtrado pelo campus)
- Sala (texto livre sugerido pela IA)

Ações:

- **Salvar processo** → `API.salvarProcesso` (upsert por `sei`).
- Se o SEI já existir: carregar o processo existente e perguntar se deseja apenas enfileirar itens novos (não duplicar processo).

### Passo 3 — Fila de itens

Para cada item extraído:

| Campo | Regra |
|---|---|
| Patrimônio | Obrigatório (ou fluxo “Sem número”) |
| Descrição | Obrigatória; preferir `base.csv` se achar o nº; senão texto do ofício (editável) |
| Tamanho | Sugestão IA; usuário confirma ou deixa vazio |
| Foto | Opcional (anexar/colar) |
| Avaliação | Opcional |
| Viável / BVM | Defaults atuais (`false`); usuário pode marcar se fizer sentido |

Ações por item:

- **Confirmar e próximo** — salva via `API.salvarItem` e avança
- **Pular** — mantém na fila para voltar depois
- **Remover da fila** — descarta sem salvar

Regras:

- Não duplicar patrimônio já existente no mesmo processo.
- Cruzar patrimônio com `baseCSV` (já carregado no app).
- Itens sem patrimônio no ofício: oferecer “Sem número” com descrição do trecho.

### Passo 4 — Pronto

Resumo: processo salvo, N itens confirmados, M pulados/pendentes. Atalhos para abrir a aba Itens / Classificação prévia do processo.

## Arquitetura

```
index.html / app.js
    │  POST { texto }
    ▼
netlify/functions/extrair-oficio.js
    │  chama provedor LLM (env KEY)
    ▼
JSON estruturado → app casa IDs → Supabase (processos / patrimonios)
                              ↘ base.csv (descrição)
```

### Function `extrair-oficio`

- **Método:** `POST`
- **Path:** `/.netlify/functions/extrair-oficio`
- **Auth da chave:** variável de ambiente no Netlify (`OPENAI_API_KEY` ou `GEMINI_API_KEY` — um provedor na implementação)
- **CORS:** origin `https://cpetrag.github.io` (padrão já usado nas outras functions)
- **Timeout:** tratar falha com mensagem amigável no UI

### Contrato de resposta

```json
{
  "sei": "23117.000442/2025-19",
  "unidade_texto": "CTIC / REITO-UFU",
  "campus_texto": "Santa Mônica",
  "bloco_texto": "1J",
  "sala_texto": "CTIC Sta. Mônica, bloco 1J",
  "itens": [
    {
      "patrimonio": "707657",
      "descricao": "NOTEBOOK INTEL CORE i5 …",
      "tamanho_sugerido": "M",
      "confianca": 0.86
    }
  ],
  "avisos": ["Unidade não casou com lista do banco"]
}
```

Campos de texto de local são **sempre strings**; o frontend faz o match com `campus`, `blocos`, `unidades`. A function não precisa conhecer UUIDs do banco.

### Match no frontend

1. Normalizar acentos/caixa.
2. Buscar igualdade parcial / contains nos nomes cadastrados.
3. Se confiança baixa ou ambíguo → deixar dropdown vazio e listar em `avisos`.
4. Bloco só é considerado após campus resolvido (filtra `blocos` por `campus_id`).

## Validação e erros

| Caso | Comportamento |
|---|---|
| SEI não extraído / inválido | Campo editável; bloqueia salvar processo |
| SEI já cadastrado | Carrega processo; oferece enfileirar só itens novos |
| IA timeout / 5xx | Mantém texto; botão tentar de novo |
| Zero patrimônios | Permite item “Sem número” a partir da descrição |
| Match local falhou | Dropdowns manuais obrigatórios para campus (regra atual de `salvarProcesso`) |
| Patrimônio duplicado no processo | Alerta; não insere de novo |
| `tamanho` vazio | Enviar `null` (nunca `""` — constraint CHECK) |
| `avaliacao` vazia | Enviar `null` |

## Integração com código existente

- Reutilizar: `API.salvarProcesso`, `API.salvarItem`, `API.buscarProcessoPorSEI`, `mascaraSEI`, `carregarCampus` / `Blocos` / `Unidades`, `buscarPatrimonio` / `baseCSV`, helpers de foto (`processarFoto`, colar).
- Relaxe validação só no fluxo da aba Ofício: não exigir foto/avaliação/tamanho na confirmação via ofício.
- Cadastro manual nas abas Processo/Itens permanece inalterado.
- `config.public.js`: expor URL da function (ex.: `EXTRAIR_OFICIO_URL`) sem chave.

## Escopo fora da v1

- Upload/OCR de PDF ou imagem do ofício
- Importação em lote a partir da lista de faltantes
- Disparo automático ao SharePoint
- Criação automática de campus/bloco/unidade novos no banco

## Critérios de sucesso

1. Colar o ofício de exemplo (CTIC / patrimônio 707657) cria/atualiza o processo e permite confirmar o item com descrição coerente.
2. Chave de API não aparece no frontend nem em `config.public.js`.
3. Processo com SEI já existente não é duplicado.
4. Item pode ser salvo sem foto e sem avaliação.
5. Tamanho sugerido aparece pré-selecionado e é editável.

## Riscos

- Ofícios com formato muito diferente → extração incompleta; mitigação: revisão obrigatória antes de salvar processo.
- Custo/latência da LLM; mitigação: um request por ofício, JSON curto, timeout explícito.
- Match de campus/bloco ambíguo; mitigação: nunca adivinhar UUID com baixa confiança.
