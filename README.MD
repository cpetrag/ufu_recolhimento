# Documentação Técnica — Sistema de Recolhimento UFU

**Versão:** 2.0  
**Data:** Março de 2026  
**Repositório:** GitHub Pages — `cpetrag.github.io/ufu_recolhimento`

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura e Stack](#2-arquitetura-e-stack)
3. [Estrutura de Arquivos](#3-estrutura-de-arquivos)
4. [Banco de Dados — Supabase](#4-banco-de-dados--supabase)
5. [api.js — Camada de Dados](#5-apijs--camada-de-dados)
6. [app.js — Lógica da Aplicação](#6-appjs--lógica-da-aplicação)
7. [index.html — Interface (5 abas)](#7-indexhtml--interface-5-abas)
8. [import.html — Importação de CSV](#8-importhml--importação-de-csv)
9. [styles.css](#9-stylescss)
10. [Base de Patrimônio (Netlify CSV)](#10-base-de-patrimônio-netlify-csv)
11. [Integração SharePoint via Power Automate](#11-integração-sharepoint-via-power-automate)
12. [Geração de PDF](#12-geração-de-pdf)
13. [Exportações (CSV e Excel)](#13-exportações-csv-e-excel)
14. [Fluxo de Uso Completo](#14-fluxo-de-uso-completo)
15. [Deploy e Manutenção](#15-deploy-e-manutenção)
16. [Limitações Conhecidas e Decisões Técnicas](#16-limitações-conhecidas-e-decisões-técnicas)
17. [Glossário](#17-glossário)
18. [Módulo de Backup](#18-módulo-de-backup)

---

## 1. Visão Geral

O **Sistema de Recolhimento UFU** é uma aplicação web mobile-first desenvolvida para a **DICDE (Divisão de Controle e Distribuição de Equipamentos)** da Universidade Federal de Uberlândia. Seu objetivo é registrar e controlar o recolhimento de bens patrimoniais em campo — ou seja, quando servidores percorrem salas e espaços físicos coletando equipamentos para descarte, redistribuição ou inventário.

### Problema que resolve

Antes do sistema, o registro era feito em papel ou planilhas desconexas. O processo envolvia:

- Anotar o número de patrimônio do bem
- Descrever o item manualmente
- Fotografar
- Preencher um formulário SEI separadamente
- Enviar tudo ao SharePoint manualmente

O sistema unifica todas essas etapas em uma interface mobile, gera o documento PDF para anexar ao SEI automaticamente e sincroniza os dados com o SharePoint via Power Automate.

### Público-alvo

Servidores técnicos da DICDE que realizam vistorias em campo (campus Santa Mônica, Umuarama, Glória, Hospital das Clínicas, Monte Carmelo, Patos de Minas, Pontal, Educação Física e Eseba).

---

## 2. Arquitetura e Stack

O sistema é uma **SPA (Single Page Application) sem framework de build** — não há Webpack, Vite, npm em produção, nem processo de compilação. Tudo roda diretamente no navegador via CDN.

```
┌─────────────────────────────────────────────────┐
│                   NAVEGADOR                      │
│                                                  │
│  index.html  ←→  app.js  ←→  api.js             │
│      ↕               ↕                           │
│  Alpine.js       Supabase JS                     │
│  Tailwind CDN    PapaParse                       │
│  jsPDF           SheetJS (XLSX)                  │
└──────────────────┬──────────────────────────────┘
                   │ REST / PostgREST
         ┌─────────▼──────────┐
         │   Supabase (BaaS)  │
         │   PostgreSQL        │
         │   Auth anon key     │
         └─────────┬──────────┘
                   │
         ┌─────────▼──────────┐       ┌───────────────────┐
         │  Power Automate    │──────▶│  SharePoint Lists  │
         │  (HTTP trigger)    │       │  (UFU intranet)    │
         └────────────────────┘       └───────────────────┘

         ┌────────────────────┐
         │  Netlify           │
         │  base.csv          │  ← base de todos os patrimônios UFU
         └────────────────────┘
```

### Bibliotecas utilizadas (CDN)

| Biblioteca | Versão | Uso |
|---|---|---|
| **Alpine.js** | latest | Reatividade, binding de dados, diretivas `x-model`, `x-show`, `x-for` |
| **Tailwind CSS** | CDN | Estilização utilitária inline |
| **Supabase JS** | 2.x | Client REST para PostgreSQL (Supabase) |
| **PapaParse** | 5.3.2 | Parse de CSV no navegador |
| **jsPDF** | 2.5.1 | Geração de PDF client-side |
| **jsPDF AutoTable** | 3.5.25 | Plugin para tabelas no jsPDF |
| **SheetJS (XLSX)** | 0.18.5 | Geração de arquivos Excel (.xlsx) |

---

## 3. Estrutura de Arquivos

```
/
├── index.html                          # Interface principal (6 abas)
├── app.js                              # Lógica da aplicação (Alpine.js app())
├── api.js                              # Funções de acesso ao banco (Supabase) + Backup
├── styles.css                          # CSS customizado mínimo
├── import.html                         # Ferramenta de importação de CSV em lote
├── migration.sql                       # SQL para adicionar coluna 'situacao' no banco
├── config.public.js                    # Configuração padrão (URLs públicas)
├── config.example.js                   # Template para customização local
└── netlify/
    └── functions/
        ├── enviar-sharepoint.js        # Proxy de envio ao Power Automate
        └── backup-diario.js            # Backup automático agendado (cron diário)
```

---

## 4. Banco de Dados — Supabase

### Projeto

- **URL:** `https://oyvvvxpgqhyowvfaepgu.supabase.co`
- **Autenticação:** Chave `anon` pública (sem autenticação de usuário — sistema interno, acesso controlado por URL)

### Tabelas

#### `campus`

Armazena os campi da UFU.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `nome` | text | Nome do campus (ex: "Santa Mônica") |

Valores típicos: Santa Mônica, Umuarama, Glória, Hospital das Clínicas, Monte Carmelo, Patos de Minas, Pontal, Educação Física, Eseba.

---

#### `blocos`

Blocos físicos de cada campus. Relacionado a `campus`.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `nome` | text | Nome do bloco (ex: "Bloco 1B") |
| `campus_id` | uuid (FK → campus.id) | Campus ao qual pertence |

---

#### `unidades`

Lista de pró-reitorias e unidades administrativas para autocomplete no formulário de processo.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `nome` | text | Nome da unidade |

---

#### `processos`

Cada processo SEI de recolhimento. É a entidade principal do sistema.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `sei` | text (UNIQUE) | Número SEI no formato `23117.000000/0000-00` |
| `pro_reitoria_unidade` | text | Unidade responsável |
| `campus_id` | uuid (FK → campus.id, nullable) | Campus |
| `bloco_id` | uuid (FK → blocos.id, nullable) | Bloco |
| `sala` | text | Sala ou espaço físico |
| `created_at` | timestamptz | Data/hora de criação (auto) |

O campo `sei` tem constraint `UNIQUE` — um mesmo processo não pode ser cadastrado duas vezes. A função `salvarProcesso` usa `upsert` com `onConflict: "sei"` para atualizar se já existir.

---

#### `patrimonios`

Itens individuais registrados dentro de um processo. É onde ficam os bens patrimoniais, fotos e status de envio.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `processo_id` | uuid (FK → processos.id) | Processo ao qual pertence |
| `patrimonio` | text | Número do patrimônio, "Sem número" ou "BVM" |
| `descricao` | text | Descrição do bem |
| `tamanho` | text | Tamanho físico: P, M, G ou GG. Constraint CHECK impede outros valores ou string vazia — deve ser `null` se não preenchido |
| `viavel` | boolean | Se o bem está em condições de uso |
| `bvm` | boolean | Se é um Bem de Valor Mínimo (nunca teve patrimônio) |
| `foto` | text | Imagem em base64 (JPEG, max 1024px, qualidade 70%) |
| `enviado_sharepoint` | boolean | Se já foi sincronizado com o SharePoint |
| `situacao` | text | Situação patrimonial: "Ativo", "Baixado" ou "Não encontrado" (adicionado via migration) |
| `created_at` | timestamptz | Data/hora de criação (auto) |

> **Atenção:** O campo `tamanho` possui um `CHECK constraint` no banco que só aceita os valores `'P'`, `'M'`, `'G'`, `'GG'` ou `NULL`. Nunca enviar string vazia `""`.

---

### Migration aplicada

Para adicionar o campo `situacao`, foi necessário rodar o seguinte SQL no Supabase Dashboard → SQL Editor:

```sql
ALTER TABLE patrimonios
ADD COLUMN IF NOT EXISTS situacao TEXT DEFAULT 'Ativo';
```

Registros existentes anteriores à migration ficam com `'Ativo'` por default.

---

## 5. api.js — Camada de Dados

O arquivo `api.js` centraliza todas as operações com o Supabase e expõe um objeto global `window.API`. Ele deve ser carregado **antes** de `app.js` no HTML.

### Configuração

```javascript
var SUPABASE_URL = "https://oyvvvxpgqhyowvfaepgu.supabase.co";
var SUPABASE_KEY = "eyJ..."; // chave anon pública
var POWER_AUTOMATE_URL = "https://..."; // URL do flow HTTP
var db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
```

### Funções auxiliares

#### `mascaraSEI(v)`

Formata uma string de dígitos no padrão SEI: `23117.XXXXXX/AAAA-DD`.

- Remove tudo que não é dígito
- Limita a 17 dígitos
- Aplica a máscara progressivamente via regex
- Chamada em tempo real no `x-on:input` do campo SEI

#### `processarFoto(file)`

Recebe um `File` ou `Blob` (da câmera, upload ou clipboard) e retorna uma `Promise<string>` com o base64 da imagem processada.

- Redimensiona para no máximo **1024px** na maior dimensão
- Converte para **JPEG com qualidade 70%** via Canvas
- Reduz drasticamente o tamanho de fotos tiradas com câmera de celular (de ~3MB para ~100-200KB)

---

### Funções de leitura

#### `carregarCampus()`
Retorna todos os registros de `campus` ordenados por nome.

#### `carregarUnidades()`
Retorna todos os registros de `unidades` ordenados por nome. Usado para o autocomplete da pró-reitoria.

#### `carregarBlocos(campusId)`
Retorna os blocos de um campus específico. Retorna `[]` se `campusId` for vazio/null.

#### `buscarProcessoPorSEI(sei)`
Busca um processo pelo número SEI exato. Retorna `null` se não encontrado. Só executa se `sei.length >= 20` (comprimento mínimo de um SEI formatado).

#### `carregarItensProcesso(processoId)`
Retorna todos os patrimônios de um processo, ordenados por `created_at DESC` (mais recentes primeiro). Usado na aba Itens para exibir a lista ao abrir um processo.

#### `carregarItensProcessoCompleto(processoId)`
Igual ao anterior, mas ordenado por `created_at ASC` (cronológico). Usado exclusivamente para exportações (CSV, Excel, PDF) onde a ordem de registro importa.

#### `listarProcessos()`

Função complexa que retorna todos os processos com métricas calculadas. Resolve o problema de paginação do Supabase (limite de 1000 linhas por query) com busca paginada recursiva:

```
1. Busca todos os processos (sem limite de itens)
2. Extrai todos os IDs
3. Busca patrimonios paginando de 1000 em 1000 até esgotar
4. Para cada processo, calcula:
   - total_itens: contagem dos patrimonios do processo
   - enviados_sharepoint: quantos têm enviado_sharepoint = true
   - status_envio: "vazio" | "pendente" | "parcial" | "completo"
```

O `status_envio` segue a seguinte lógica:

| Condição | Status |
|---|---|
| `total_itens === 0` | `"vazio"` |
| `enviados === total` | `"completo"` |
| `enviados > 0` | `"parcial"` |
| `enviados === 0` | `"pendente"` |

---

### Funções de escrita

#### `salvarProcesso(processo)`
Upsert na tabela `processos` com `onConflict: "sei"`. Se o SEI já existir, atualiza os dados. Retorna o registro completo incluindo o `id` gerado.

#### `salvarItem(item, processoId)`
Insert na tabela `patrimonios`. Retorna o registro completo incluindo `id` e `created_at`.

#### `editarItem(itemId, campos)`
Update parcial de um patrimônio pelo `id`. Aceita qualquer subconjunto de campos. Ao editar, o `app.js` sempre inclui `enviado_sharepoint: false` para forçar reenvio ao SharePoint.

#### `excluirItem(itemId)`
Delete de um patrimônio pelo `id`.

#### `excluirProcesso(processoId)`
Delete em **cascata manual** em dois passos:
1. Deleta todos os `patrimonios` com `processo_id = processoId`
2. Deleta o `processo`

A ordem é obrigatória para respeitar a foreign key. O Supabase anon não tem `ON DELETE CASCADE` por padrão.

---

### Funções de envio ao SharePoint

#### `enviarItemSharePoint(processo, item)`

Envia um único item ao SharePoint via Power Automate (HTTP POST). O payload enviado é:

```json
{
  "SEI": "23117.000000/0000-00",
  "Unidade": "PROGRAD",
  "Sala": "Sala 204",
  "Patrimonio": "123456",
  "Descricao": "Mesa de escritório",
  "Tamanho": "G",
  "Viavel": "Sim",
  "BVM": "Não",
  "FotoBase64": "data:image/jpeg;base64,...",
  "DataRegistro": "2026-03-19T20:00:00.000Z"
}
```

Se o Power Automate retornar `200 OK`, marca o item como `enviado_sharepoint: true` no banco.

#### `enviarParaSharePoint(processo, itens)`
Filtra apenas os itens com `enviado_sharepoint: false` e chama `enviarItemSharePoint` para cada um em paralelo. Retorna um array de resultados com `{ patrimonio, ok, erro? }`.

---

## 6. app.js — Lógica da Aplicação

O `app.js` define a função `app()` que é o componente raiz do Alpine.js (declarado no `<body>` via `x-data="app()"`). **Toda** a lógica reativa da interface vive aqui.

### Estado (propriedades reativas)

#### Estado geral

| Propriedade | Tipo | Descrição |
|---|---|---|
| `aba` | string | Aba ativa: `"processo"`, `"itens"`, `"pdf"`, `"processos"`, `"busca"` |
| `campus` | array | Lista de campus carregados do banco |
| `blocos` | array | Blocos do campus selecionado |
| `itens` | array | Itens do processo atualmente aberto |
| `processoId` | string/null | UUID do processo ativo. `null` se nenhum processo aberto |
| `processo` | object | Dados do processo ativo: `{ sei, pro_reitoria_unidade, campus_id, bloco_id, sala }` |
| `item` | object | Formulário do novo item: `{ patrimonio, descricao, tamanho, viavel, bvm, foto, semPatrimonio }` |
| `loading` | boolean | Indica operação de gravação em andamento |
| `exportando` | boolean | Indica exportação de PDF em andamento |
| `buscaSei` | string | Campo SEI na aba Documento |

#### Base CSV (Netlify)

| Propriedade | Tipo | Descrição |
|---|---|---|
| `baseCSV` | array | Dados do CSV carregado: `[{ NroPatrimonio, CodioBarra, DescricaoBem }]` |
| `csvCarregando` | boolean | True enquanto o fetch do CSV está em andamento |
| `csvCarregado` | boolean | True quando o CSV foi parseado com sucesso |
| `csvErro` | string/null | Mensagem de erro se o CSV falhar |
| `patrimonioNaoEncontrado` | boolean | True se o número digitado não existir no CSV |

#### Aba Processos

| Propriedade | Tipo | Descrição |
|---|---|---|
| `processosList` | array | Lista de processos com métricas (`total_itens`, `status_envio`, etc.) |
| `processosCarregando` | boolean | Carregamento em andamento |
| `processosErro` | string/null | Mensagem de erro |
| `processosFiltro` | string | Texto do campo de busca/filtro |
| `processosFiltroAno` | string | Ano selecionado no dropdown |
| `processosAnos` | array | Anos únicos detectados nos SEIs (ex: `["2025", "2024"]`) |

#### Seleção múltipla

| Propriedade | Tipo | Descrição |
|---|---|---|
| `selecionados` | array | Array de UUIDs dos processos selecionados via checkbox |
| `seiManual` | string | Campo de texto para inserir SEIs manualmente |
| `exportandoSelecionados` | boolean | Exportação de selecionados em andamento |

#### Busca global

| Propriedade | Tipo | Descrição |
|---|---|---|
| `buscaGlobal` | string | Termo digitado no campo de busca |
| `buscaGlobalResultados` | array | `[{ processo, itens[] }]` |
| `buscaGlobalCarregando` | boolean | Busca em andamento |
| `buscaGlobalFeita` | boolean | True após primeira busca (para exibir "sem resultados") |

#### Edição de item inline

| Propriedade | Tipo | Descrição |
|---|---|---|
| `itemEditando` | string/null | UUID do item em edição. `null` = nenhum |
| `itemEditForm` | object | Cópia dos dados do item sendo editado |
| `itemEditNovaFoto` | boolean | True se uma nova foto foi selecionada durante edição |

---

### Métodos

#### `init()`

Executado automaticamente pelo Alpine via `x-init="init()"`. Carrega campus, unidades e dispara `carregarBaseCSV()`.

#### `carregarBaseCSV()`

Faz `fetch` do CSV no Netlify e usa PapaParse para converter em array de objetos. O CSV pode ter colunas com nomes variados — a função `_mapearColunas(campos)` tenta identificar as colunas corretas por nome exato e por regex (`/patrim|numero|nro/i`, `/codigo|barra/i`, `/descri/i`). Lida com BOM (`\uFEFF`) em arquivos UTF-8 do Windows.

#### `buscarPatrimonio()`

Chamada com debounce de 300ms ao digitar no campo de patrimônio. Converte o valor digitado para inteiro e procura no `baseCSV` comparando `NroPatrimonio` e `CodioBarra` (também como inteiros, para ignorar zeros à esquerda). Se encontrado, preenche automaticamente o campo `descricao`. Se não encontrado, exibe o aviso `⚠️ Patrimônio não localizado na base` e mantém a descrição vazia — nesse caso o usuário deve marcar BVM para digitar manualmente.

#### `salvarItem()`

Valida o formulário antes de gravar:

1. `patrimonio` preenchido
2. Se não for "Sem número": verifica duplicata dentro do processo
3. `descricao` preenchida (obrigatório para `semPatrimonio` ou `bvm`)
4. Se não encontrado no CSV e não é BVM: bloqueia (exige marcar BVM)
5. `tamanho` selecionado
6. `foto` capturada

Após gravar, reseta o formulário `item` para os valores padrão e adiciona o item retornado pelo banco (com `id`) ao início do array `itens`.

#### `salvarEdicaoItem(i)`

Valida `descricao` e `tamanho`, faz update via `API.editarItem`. Inclui `enviado_sharepoint: false` nos campos para forçar reenvio ao SharePoint. Se `itemEditNovaFoto` for `true`, inclui a nova foto no update.

#### `carregarListaProcessos()`

Chama `API.listarProcessos()` e popula `processosList`. Após carregar, extrai os anos únicos dos SEIs usando regex `/\/(\d{4})-/` (ano está entre `/` e `-` no final do SEI) e preenche `processosAnos` em ordem decrescente.

#### `processosFiltrados` (getter computado)

Filtra `processosList` aplicando simultaneamente:
- Filtro de texto: verifica SEI, unidade e sala (case-insensitive, `includes`)
- Filtro de ano: extrai o ano do SEI e compara

#### `toggleSelecionado(id)` / `isSelecionado(id)`

Gerenciam o array `selecionados`. `toggle` adiciona ou remove o id; `isSelecionado` retorna boolean.

#### `selecionarTodosFiltrados()`

Toggle inteligente: se todos os processos filtrados já estão no array `selecionados`, desmarca todos. Caso contrário, adiciona os que faltam. Não desfaz seleções de processos fora do filtro atual.

#### `adicionarSeiManual()`

Divide o conteúdo de `seiManual` por vírgulas, ponto-e-vírgulas, enters ou espaços. Para cada fragmento, procura em `processosList` um processo cujo SEI contenha o texto (usa `includes` para aceitar SEIs parciais). Adiciona ao `selecionados` se encontrar e ainda não estiver selecionado. Limpa o campo após processar.

#### `processosSelecionadosLista` (getter)

Filtra `processosList` retornando apenas os processos cujos IDs estão em `selecionados`.

#### `executarBuscaGlobal()`

Faz duas queries em paralelo ao Supabase usando `Promise.all`:

1. `patrimonios` com `ilike` em `patrimonio` e `descricao`
2. `processos` com `ilike` em `sei`, `sala` e `pro_reitoria_unidade`

Une os `processo_id` das duas queries (sem duplicatas, usando `Set`), busca os processos completos por esses IDs e monta o resultado como `[{ processo, itens[] }]` onde `itens` são apenas os que bateram na busca via patrimônio/descrição.

#### `_exportarCSV(procs)` / `_exportarExcel(procs)` / `_exportarPDFConsolidado(procs, nome)`

Helpers internos chamados pelas funções de exportação públicas. Recebem um array de processos, carregam os itens de cada um via `API.carregarItensProcessoCompleto` e geram o arquivo. O PDF é gerado de forma **sequencial** (não paralela) para controlar a ordem das páginas — usa recursão com `processarProximo(idx)` em vez de `Promise.all`.

---

## 7. index.html — Interface (5 abas)

A interface é construída inteiramente em um único arquivo HTML com Alpine.js para reatividade e Tailwind para estilo. O `<body>` declara `x-data="app()" x-init="init()"` tornando todo o documento reativo ao estado do Alpine.

### Navegação

Nav bar sticky no topo com 5 botões. A aba ativa é controlada pela propriedade `aba`. A cor ativa usa a classe CSS customizada `tab-active` (borda inferior azul, texto azul, negrito).

- A aba **Itens** tem `x-bind:disabled="!processoId"` — desabilitada enquanto nenhum processo estiver ativo
- A aba **Processos** chama `carregarListaProcessos()` ao clicar (lazy load)
- A aba **Documento** pré-preenche `buscaSei` com o SEI do processo ativo se houver

---

### Aba 📁 Processo

Formulário de identificação do processo.

**Campos:**

- **Número SEI:** input com máscara aplicada em tempo real via `x-on:input="processo.sei = API.mascaraSEI(processo.sei)"`. Ao sair do campo (`x-on:blur`), dispara `buscarProcessoExistente()` — se o SEI já existir no banco, carrega automaticamente o processo e redireciona para a aba Itens.

- **Pró-Reitoria / Unidade:** input com `<datalist>` populado pelas unidades do banco. Funciona como autocomplete nativo do HTML5.

- **Campus / Bloco:** dois selects em grid. O campus popula os blocos ao mudar (`x-on:change="carregarBlocos()"`).

- **Sala:** texto livre, obrigatório.

**Botão:** "INICIAR PROCESSO" ou "ATUALIZAR DADOS" dependendo de `processoId`.

---

### Aba 🪑 Itens

Dividida em dois blocos: formulário de novo item e lista de itens registrados.

**Formulário de novo item:**

- Status da base CSV (carregando / carregado com contagem / erro com retry)
- Campo de patrimônio: `type="number"`, debounce de 300ms, dispara `buscarPatrimonio()`
- Checkbox "Sem patrimônio": ao marcar, define `item.patrimonio = 'Sem número'`, limpa descrição e foca o campo de descrição via `$nextTick`
- Campo de descrição: `readonly` exceto quando `bvm` ou `semPatrimonio` estão marcados
- Checkbox BVM: ao marcar, limpa a descrição e foca o campo
- Tamanho: select com P/M/G/GG
- Foto: dois métodos de captura:
  - Input `type="file"` com `capture="environment"` (câmera traseira em mobile)
  - Área de paste: focável, escuta `x-on:paste.prevent="colarFoto($event)"` e `x-on:click` que tenta leer o clipboard via `navigator.clipboard.read()`

**Lista de itens (abaixo do formulário):**

Renderizada via `x-for` sobre o array `itens`. Cada item tem dois estados controlados por `itemEditando`:

**Estado normal:** mostra miniatura (56×56px), número, badges de status SharePoint, descrição, tamanho/viável/BVM e botões Editar / Reenviar / Excluir.

Badges de status SharePoint:
- `☁️ Enviado` (verde): `enviado_sharepoint === true`
- `⏳ Pendente` (âmbar): `enviado_sharepoint === false` e não reenviando
- `⏫ Enviando...` (azul): `_reenviando === true` (estado temporário local)

**Estado de edição:** expande inline (não abre modal) com formulário de descrição, tamanho, viável, BVM e campo de nova foto opcional. Salvar chama `salvarEdicaoItem(i)`.

---

### Aba 📄 Documento

Campo de SEI + botão "GERAR DOCUMENTO". Ao clicar:

1. Busca o processo pelo SEI digitado
2. Carrega todos os itens
3. Gera o PDF via `criarPDF()`
4. Envia os itens pendentes ao SharePoint via `API.enviarParaSharePoint()`

---

### Aba 📋 Processos

A aba mais completa. Divide-se em três seções:

**Seção de filtros e exportações globais:**
- Campo de texto: filtra por SEI, unidade ou sala em tempo real (getter `processosFiltrados`)
- Dropdown de ano: populado automaticamente a partir dos anos detectados nos SEIs
- Contador: `N processo(s) | N selecionado(s)`
- Botões de exportação de **todos os filtrados**: CSV, Excel, PDF Consolidado

**Seção de seleção múltipla:**
- Textarea para colar SEIs manualmente (botão `+` ou Enter)
- Botões "Sel. todos" (seleciona/deseleciona todos os filtrados) e "Limpar"
- Quando `selecionados.length > 0`, aparecem botões de exportação dos selecionados: CSV, Excel, PDF Consolidado

**Lista de cards:**

Cada card exibe:
- Checkbox (laranja quando selecionado, com `ring-2 ring-orange-400`)
- SEI em fonte mono
- Badge de status SharePoint (verde/âmbar/vermelho/cinza)
- Unidade e sala
- Contadores: itens, enviados, data
- Botões: Abrir (→ aba Itens), PDF individual, Excluir

A borda esquerda do card indica o status de envio ao SharePoint:
- `border-emerald-500`: todos enviados
- `border-amber-400`: enviado parcialmente
- `border-red-400`: nenhum enviado
- `border-slate-300`: sem itens

---

### Aba 🔍 Busca

Campo único de busca global + botão (ou Enter). Resultados agrupados por processo — cada resultado mostra o processo (SEI, unidade, sala, botão Abrir) e abaixo os itens que bateram na busca com miniatura, número e badge de situação.

Se o processo foi encontrado pela busca em `processos` (SEI/sala/unidade) mas nenhum item bateu na busca de patrimônios/descrições, exibe a mensagem: *"Processo encontrado — sem itens correspondentes ao termo."*

---

## 8. import.html — Importação de CSV em Lote

Ferramenta standalone para importar processos e itens de um CSV para o banco. Deve ser colocada na mesma pasta do sistema e aberta no navegador.

### Fluxo

1. **Seleção do arquivo:** PapaParse detecta automaticamente o separador (vírgula, ponto-e-vírgula, tab)

2. **Análise:** exibe estatísticas antes de confirmar — total de linhas, processos únicos, campus, itens "SEM PATRIMONIO", distribuição de situações

3. **Importação:** processa um processo por vez (não em paralelo) para evitar sobrecarga:
   - Carrega campus existentes do banco
   - Cria automaticamente campus que não existem
   - Para cada processo SEI: upsert com `onConflict: "sei"`
   - Para cada item do processo: insert com todos os campos

4. **Resultado:** resumo de processos e itens importados com erros detalhados

### Mapeamento de campos CSV → banco

| Campo CSV | Campo no banco | Observação |
|---|---|---|
| `processo` | `processos.sei` | Usado como chave de upsert |
| `campus` | `processos.campus_id` | Cruza por nome na tabela `campus` |
| `setor` + `local` | `processos.sala` | Concatenados: `"SETOR \| local"` |
| `patrimonio` | `patrimonios.patrimonio` | `"SEM PATRIMONIO"` → `"Sem número"` |
| `descricao` | `patrimonios.descricao` | Direto |
| `situacao` | `patrimonios.situacao` | Ativo / Baixado / Não encontrado |
| — | `patrimonios.tamanho` | `null` (não presente no CSV) |
| — | `patrimonios.viavel` | `true` (default) |
| — | `patrimonios.bvm` | `false` (default) |
| — | `patrimonios.foto` | `""` (sem foto) |

> **Importante:** O `tamanho` é enviado como `null` (não como string vazia) para respeitar o `CHECK constraint` da tabela.

---

## 9. styles.css

Arquivo mínimo com apenas duas regras:

```css
[x-cloak] { display: none; }
```
Oculta elementos Alpine antes da hidratação, evitando flash de conteúdo não estilizado (FOUC).

```css
.tab-active {
    color: #2563eb;          /* blue-600 */
    border-bottom: 2px solid #2563eb;
    font-weight: bold;
}
```
Estilo da aba ativa na navbar.

---

## 10. Base de Patrimônio (Netlify CSV)

A base de patrimônio da UFU é um CSV hospedado em `https://custodioufu.netlify.app/base.csv`. Este arquivo contém **todos os bens patrimoniais da universidade** e é usado exclusivamente para o autocomplete de descrição ao digitar um número de patrimônio na aba Itens.

### Estrutura esperada

O sistema tenta mapear as colunas por nome (tolerante a variações):

| Coluna canônica | Nomes aceitos |
|---|---|
| `NroPatrimonio` | NroPatrimonio, Nro Patrimônio, Patrimônio, Numero, Número, Nro, ou qualquer coluna contendo `/patrim|numero|nro/i` |
| `CodioBarra` | CodioBarra, CodigoBarra, Código de Barras, Codigo Barras, ou `/codigo|barra/i` |
| `DescricaoBem` | DescricaoBem, Descrição do Bem, Descricao, Descrição, ou `/descri/i` |

### CORS

O Netlify deve ter o arquivo `_headers` na raiz com:

```
/base.csv
  Access-Control-Allow-Origin: *
```

Sem isso, o browser bloqueia o fetch quando o sistema roda em outro domínio (ex: GitHub Pages).

### Busca por patrimônio

A busca converte o número digitado e os valores do CSV para inteiro antes de comparar — isso garante que `"00123456"` e `"123456"` são considerados iguais. A busca verifica tanto `NroPatrimonio` quanto `CodioBarra`.

---

## 11. Integração SharePoint via Power Automate

O SharePoint da UFU fica atrás da intranet institucional com Conditional Access e restrições de API. A solução adotada é um **Flow HTTP do Power Automate** que atua como proxy:

```
Sistema (GitHub Pages)
    → POST JSON para Power Automate URL
        → Power Automate autentica internamente
            → Cria item na SharePoint List
```

### Quando o envio acontece

- **Automático:** ao clicar em "GERAR DOCUMENTO" na aba Documento — envia todos os itens pendentes do processo
- **Manual por item:** botão "☁️ Reenviar" em cada item pendente na aba Itens
- **Ao editar um item:** `enviado_sharepoint` é resetado para `false`, obrigando reenvio

### Payload

```json
{
  "SEI": "23117.038329/2024-17",
  "Unidade": "PROGRAD",
  "Sala": "Sala 204",
  "Patrimonio": "847278",
  "Descricao": "Notebook Dell Latitude",
  "Tamanho": "P",
  "Viavel": "Sim",
  "BVM": "Não",
  "FotoBase64": "data:image/jpeg;base64,/9j/4AAQ...",
  "DataRegistro": "2026-03-19T20:00:00.000Z"
}
```

---

## 12. Geração de PDF

O PDF é gerado **100% no cliente** via jsPDF + jsPDF-AutoTable, sem servidor.

### Estrutura do documento

- **Cabeçalho** (repetido em cada página):
  - "Universidade Federal de Uberlândia" (bold, 14pt, centralizado)
  - Pró-Reitoria/Unidade (10pt, centralizado)
  - Linha horizontal
  - "PROCESSO SEI: XXXXX" e "SALA / ESPAÇO: XXXXXX"

- **Tabela de itens** (5 itens por página):
  - Coluna "Foto" (45mm): imagem JPEG inserida via `doc.addImage()`
  - Coluna "Detalhes": Patrimônio, Descrição, Tamanho, Viável, BVM

### Função `criarPDF()`

Usa os dados presentes em `this.processo` e `this.itens` no momento da chamada. Para exportações da aba Processos, os dados são temporariamente substituídos (`tmp`) e restaurados após.

### Função `_exportarPDFConsolidado(procs, nome)`

Gera um único PDF com todos os processos do array recebido. Usa recursão assíncrona (`processarProximo(idx)`) em vez de `Promise.all` para garantir a ordem correta das páginas e evitar condições de corrida.

---

## 13. Exportações (CSV e Excel)

### CSV (`_exportarCSV`)

Usa PapaParse `unparse()` para gerar o CSV. Adiciona BOM (`\uFEFF`) no início para compatibilidade com Excel no Windows (garante que caracteres especiais como `ç`, `ã` sejam exibidos corretamente).

**Campos exportados:** SEI, Unidade, Sala, Data, Patrimônio, Descrição, Tamanho, Viável, BVM, Situação, Enviado SharePoint.

### Excel (`_exportarExcel`)

Usa SheetJS (`window.XLSX`). Cria um workbook com uma sheet "Recolhimento". Define larguras de coluna via `ws["!cols"]`. O arquivo é gerado e baixado diretamente no navegador via `XLSX.writeFile()`.

---

## 14. Fluxo de Uso Completo

### Fluxo normal de recolhimento em campo

```
1. Abrir o sistema no celular
2. Aba Processo → digitar o SEI do processo
   ├── Se já existir: carrega automaticamente → vai para aba Itens
   └── Se não existir: preencher unidade, campus, sala → "INICIAR PROCESSO"

3. Aba Itens → para cada bem encontrado:
   ├── Digitar o número de patrimônio
   │   ├── Encontrado: descrição preenchida automaticamente
   │   ├── Não encontrado: marcar BVM → digitar descrição
   │   └── Sem plaqueta: marcar "Sem patrimônio" → digitar descrição
   ├── Selecionar tamanho (P/M/G/GG)
   ├── Marcar "Viável" se o bem tem condições de uso
   ├── Tirar foto com a câmera ou colar imagem
   └── "GRAVAR ITEM"

4. Aba Documento → digitar o SEI → "GERAR DOCUMENTO"
   ├── Gera PDF para download e anexo no SEI
   └── Envia automaticamente todos os itens ao SharePoint
```

### Fluxo de importação em lote

```
1. Rodar migration.sql no Supabase Dashboard
2. Abrir import.html no navegador
3. Selecionar o CSV
4. Verificar a análise
5. Clicar "INICIAR IMPORTAÇÃO"
6. Aguardar log em tempo real
7. Verificar resultado
```

---

## 15. Deploy e Manutenção

### Deploy atual

O sistema está hospedado no **GitHub Pages** em `cpetrag.github.io/ufu_recolhimento`. O deploy é feito por push direto ao repositório (branch main com Pages habilitado).

### Atualizar o sistema

1. Editar os arquivos localmente
2. Commit e push para o repositório GitHub
3. GitHub Pages republica automaticamente em ~1 minuto

### Atualizar a base de patrimônio (Netlify)

1. Preparar o novo `base.csv` (mesma estrutura de colunas)
2. Acessar o painel do Netlify → projeto `custodioufu`
3. Arrastar a pasta com o `base.csv` e o arquivo `_headers` para a área de deploy
4. Aguardar deploy concluir

### Atualizar o banco de dados (schema)

Acessar `https://supabase.com/dashboard` → projeto `oyvvvxpgqhyowvfaepgu` → SQL Editor → rodar o SQL necessário.

### Trocar a URL do Power Automate

A URL está hardcoded em `api.js` na constante `POWER_AUTOMATE_URL`. Basta substituir o valor e fazer novo deploy.

---

## 16. Limitações Conhecidas e Decisões Técnicas

### Supabase — limite de 1000 linhas

O Supabase PostgREST retorna no máximo 1000 registros por query por padrão. Com mais de 2387 itens importados, a função `listarProcessos` precisou implementar paginação manual (`.range(from, from + 999)` em loop recursivo).

### Tailwind CDN em produção

O sistema usa o CDN do Tailwind (não compilado). Isso carrega ~3MB de CSS mas é aceitável para uso interno. O aviso no console é esperado e não afeta o funcionamento.

### Fotos em base64 no banco

As fotos são armazenadas como strings base64 diretamente na coluna `foto` da tabela `patrimonios`. Isso é simples e não requer storage separado, mas tem implicações:
- Cada item com foto ocupa ~100-200KB no banco
- O limite do Supabase de 5MB por resposta pode ser atingido ao carregar processos com muitos itens e fotos
- A solução ideal no futuro seria usar o Supabase Storage e salvar apenas a URL

### Autenticação

O sistema usa a chave `anon` pública sem autenticação de usuários. As Row Level Security (RLS) policies do Supabase precisam estar configuradas para permitir operações `SELECT`, `INSERT`, `UPDATE` e `DELETE` para a role `anon`. Isso é aceitável para sistema interno de uso controlado.

### Importação e duplicatas de patrimônio

O CSV importado pode ter o mesmo número de patrimônio em processos diferentes (167 casos identificados). O sistema importa todos como itens separados — não há constraint de unicidade em `patrimonios.patrimonio` pois o mesmo bem pode aparecer em múltiplos processos de recolhimento ao longo do tempo.

---

## 17. Glossário

| Termo | Significado |
|---|---|
| **SEI** | Sistema Eletrônico de Informações. Número de protocolo no formato `23117.XXXXXX/AAAA-DD` usado para identificar processos administrativos na UFU |
| **Patrimônio** | Bem móvel de propriedade da UFU, identificado por uma plaqueta com número único |
| **BVM** | Bem de Valor Mínimo. Item de baixo valor (ex: mouse, estabilizador) que nunca recebeu número de patrimônio |
| **Sem número** | Item que deveria ter patrimônio mas a plaqueta foi perdida ou está ilegível |
| **Recolhimento** | Processo de coleta física de bens de um espaço para descarte, manutenção ou redistribuição |
| **Viável** | Item em condições de uso após o recolhimento |
| **DICDE** | Divisão de Controle e Distribuição de Equipamentos — setor da UFU responsável pelo patrimônio |
| **SharePoint** | Plataforma Microsoft usada internamente pela UFU para gestão de documentos e listas |
| **Power Automate** | Ferramenta Microsoft de automação de fluxos usada como proxy entre o sistema e o SharePoint |
| **Situação** | Status patrimonial do bem: Ativo (em uso), Baixado (descartado/alienado) ou Não encontrado (não localizado na vistoria) |
| **Alpine.js** | Framework JavaScript declarativo que adiciona reatividade ao HTML via atributos `x-*` |
| **Supabase** | Backend-as-a-Service baseado em PostgreSQL com API REST automática |
| **upsert** | Operação de banco que insere um registro novo ou atualiza se a chave já existir |

---

## 18. Módulo de Backup

O módulo de backup oferece **três camadas de proteção** combinadas para minimizar risco de perda de dados. **Implementado e em produção** (deploy de 07/05/2026).

### 18.1 Camadas

| Camada | Responsabilidade | Frequência |
|---|---|---|
| **1. Banco (Supabase nativo)** | Snapshot diário do Postgres + PITR (no plano Pro) | Automático (Supabase) |
| **2. Manual (aba Backup)** | Operador baixa JSON/ZIP do banco para guardar localmente | Sob demanda |
| **3. Automático (Netlify cron)** | Snapshot diário enviado ao OneDrive via Power Automate | Diário às 03:00 UTC (00:00 BRT) |

### 18.2 Resultado da execução em produção

Primeira execução real (07/05/2026):

```json
{
  "ok": true,
  "duration_ms": 8949,
  "processos": 311,
  "patrimonios": 2474,
  "chunks_enviados": 2,
  "chunks_total": 2
}
```

- 311 processos + 2.474 patrimônios (com fotos em base64) extraídos do Supabase.
- 2 arquivos gerados no OneDrive: `2026-05-07_00_manifest.json` + `2026-05-07_lote_001.json`.
- Tempo total: ~9 segundos (bem dentro do limite de 26s do Netlify Function).

### 18.3 Aba `🛟 Backup` (cliente)

Adicionada como 6ª aba no `index.html`. Tem quatro blocos:

**Estatísticas do banco** — usa `API.obterEstatisticasBackup()` (count exato via PostgREST com `head: true`) para mostrar totais de processos, patrimônios, campus e blocos sem trazer dados.

**Exportar manual** — duas opções:

- **JSON** (com ou sem fotos): chama `API.exportarBackupCompleto({ incluirFotos })` que faz paginação de 200 em 200 nas tabelas grandes (respeitando o limite de 5MB por resposta do Supabase). Gera blob e força download. Nome: `backup_recolhimento_AAAAMMDD_HHMM_completo.json`.
- **ZIP + Fotos**: carrega JSZip dinamicamente via CDN, separa o JSON dos dados (sem fotos embutidas) das fotos extraídas como `.jpg` em `fotos/<SEI_sanitizado>/<patrimonio>_<id>.jpg`, e empacota tudo num ZIP comprimido (DEFLATE level 6). Inclui um `LEIA-ME.txt` explicando o conteúdo.

**Backup automático** — botão que faz POST para `BACKUP_TRIGGER_URL` (Netlify Function) com `{ trigger: "manual" }`. Útil para gerar backup imediato fora do horário agendado.

**Restaurar** — input de arquivo que valida o JSON, exibe resumo do conteúdo (gerado em, versão, contadores) e exige digitar `RESTAURAR` em maiúsculas + confirmação dupla via `confirm()` antes de executar. A restauração chama `API.restaurarBackupCompleto(json)` que faz upsert em lotes de 100, na ordem correta de foreign keys: `campus → unidades → blocos → processos → patrimonios`.

### 18.4 Backup automático — `netlify/functions/backup-diario.js`

Scheduled Function da Netlify, agendada via `netlify.toml`:

```toml
[functions."backup-diario"]
  schedule = "0 3 * * *"
```

#### Fluxo

1. Lê todas as tabelas via Supabase REST usando `SUPABASE_SERVICE_KEY` (lê como service role para ignorar RLS) com paginação por header `Range: 0-199`, `200-399` etc.
2. Agrupa patrimônios por `processo_id` em memória.
3. Divide em **chunks** respeitando `MAX_CHUNK_BYTES = 80MB` (limite seguro abaixo dos 100MB do Power Automate). Cada chunk pode conter:
   - Vários processos pequenos juntos.
   - Um único processo (se for grande).
   - Uma parte de um processo (se um processo único passar de 80MB com fotos).
4. Envia primeiro um **manifest** com tabelas de referência (`campus`, `blocos`, `unidades`) e contadores.
5. Envia cada chunk de dados em sequência ao Power Automate.

#### Payload enviado ao Power Automate

```json
{
  "SEI": "23117.000000/0000-00",
  "Patrimonio": "BACKUP_PROC",
  "BackupVersion": "1.0",
  "BackupDate": "2026-05-07",
  "FileType": "data",
  "FileName": "Backup/2026-05-07/23117.038329_2024-17.json",
  "ChunkIndex": 3,
  "ChunkTotal": 12,
  "ChunkContent": "{ ... JSON serializado dos dados ... }"
}
```

### 18.5 Configuração do Flow no Power Automate

Configuração real do flow em produção (nome: **"Backup Onedrive"**):

#### Trigger — "Quando uma solicitação HTTP é recebida"

| Campo | Valor |
|---|---|
| **Quem pode disparar o fluxo** | `Alguém` (Anyone) — necessário para o Netlify externo conseguir chamar |
| **Esquema JSON do Corpo** | (ver abaixo) |

Esquema JSON do Corpo (cole no campo via botão **"Usar conteúdo de exemplo para gerar o esquema"** ou diretamente):

```json
{
    "type": "object",
    "properties": {
        "SEI": { "type": "string" },
        "Patrimonio": { "type": "string" },
        "BackupVersion": { "type": "string" },
        "BackupDate": { "type": "string" },
        "FileType": { "type": "string" },
        "FileName": { "type": "string" },
        "ChunkIndex": { "type": "integer" },
        "ChunkTotal": { "type": "integer" },
        "ChunkContent": { "type": "string" }
    }
}
```

> **Atenção ao case:** os nomes dos campos são case-sensitive ao usar `triggerBody()?['CampoX']`. Se o esquema gerado pelo PA mudar `FileName` para `fileName` (já aconteceu), refaça digitando manualmente como mostrado acima.

#### Action — "OneDrive for Business → Criar arquivo"

| Campo | Tipo de input | Valor |
|---|---|---|
| **Caminho da Pasta** | Texto literal | `/recolhimento` |
| **Nome do Arquivo** | **Expressão (chip `fx`)** | `concat(triggerBody()?['BackupDate'], '_', last(split(triggerBody()?['FileName'], '/')))` |
| **Conteúdo do Arquivo** | **Conteúdo dinâmico (chip do trigger)** | `ChunkContent` |

> ⚠️ **Importante:** os campos "Nome do Arquivo" e "Conteúdo do Arquivo" precisam ser preenchidos via **chips** do PA (clicando em `fx` para expressão ou ⚡ para conteúdo dinâmico). **Não funciona** apenas digitando o texto da expressão. O sintoma do erro é o nome do arquivo aparecer literalmente como `concat(triggerBody()?['BackupDate']...` na pasta de destino.

#### Pré-requisitos no OneDrive

A pasta `/recolhimento` precisa **existir** no OneDrive da conta conectada antes do primeiro disparo, senão a action falha com `404 Not Found`. Criar manualmente em **Meus arquivos → + Criar ou carregar → Pasta → "recolhimento"**.

### 18.6 Variáveis de ambiente (Netlify)

Definir no painel Netlify → **Project configuration → Environment variables**:

| Variável | Valor | Marcar como secret? |
|---|---|---|
| `SUPABASE_URL` | `https://oyvvvxpgqhyowvfaepgu.supabase.co` | **❌ NÃO** (já é pública, aparece em `config.public.js`) |
| `SUPABASE_SERVICE_KEY` | `service_role` key do Supabase | **✅ SIM** |
| `POWER_AUTOMATE_BACKUP_URL` | URL HTTP do trigger do flow no Power Automate | Opcional |
| `POWER_AUTOMATE_URL` | URL do flow de envio de itens individuais (já existia) | Opcional |
| `ALLOWED_ORIGIN` | `https://cpetrag.github.io` (apenas origin, **sem path nem barra final**) | Não |
| `BACKUP_TRIGGER_TOKEN` | Token Bearer opcional para proteger contra disparo indevido | Opcional |

> ⚠️ **Atenção:** a `SUPABASE_SERVICE_KEY` tem permissão total no banco. **Nunca** colocar em `config.js`, no `config.public.js`, em qualquer arquivo do front-end ou em chat público.

> ⚠️ **NÃO marcar `SUPABASE_URL` como secret no Netlify.** Como ela já consta no `config.public.js` (que é client-side), o secrets scanner do Netlify falha o build com erro `Secrets scanning found secrets in build`.

### 18.7 `config.public.js` — nova chave

```javascript
window.APP_CONFIG = {
    SUPABASE_URL: "...",
    SUPABASE_KEY: "...",
    SHAREPOINT_PROXY_URL: "...",
    BACKUP_TRIGGER_URL: "https://SEU-SITE.netlify.app/.netlify/functions/backup-diario"
};
```

### 18.8 Restauração — pontos de atenção

- O upsert preserva o `id` (UUID) original do registro do backup. Isso garante que foreign keys continuam consistentes.
- Registros que existirem no banco com mesmo ID **serão sobrescritos** pelo conteúdo do backup.
- Registros novos no banco que **não** estão no backup **não** são apagados (a operação é aditiva). Isso é intencional para evitar perda acidental.
- Se você precisa de um restore "limpo" (apagar tudo e restaurar), faça-o no Supabase Dashboard via SQL (`TRUNCATE patrimonios, processos, blocos, unidades, campus CASCADE`) **antes** de restaurar pelo sistema.

### 18.9 Funções novas em `api.js`

| Função | Descrição |
|---|---|
| `obterEstatisticasBackup()` | Conta exato de cada tabela (sem trazer dados) |
| `exportarBackupCompleto({ incluirFotos })` | Retorna o objeto JSON completo do backup |
| `restaurarBackupCompleto(backup)` | Faz upsert em lotes na ordem correta de FK |

### 18.10 Troubleshooting (problemas reais encontrados na implantação)

#### Build da Netlify falha com `Secrets scanning found secrets`

**Sintoma:** logs do deploy mostram:
```
Secret env var "SUPABASE_URL"'s value detected: found value at line 124 in README.MD
```

**Causa:** a variável `SUPABASE_URL` foi marcada como secret no Netlify, mas o valor dela (URL pública) também aparece em arquivos do repositório (`config.public.js`, `index-single.html`, `README.MD`). O scanner está corretamente bloqueando o paradoxo.

**Solução:** desmarcar a opção "Contains secret values" na variável `SUPABASE_URL`. A `SUPABASE_URL` **não é segredo** — quem precisa ser secret é a `SUPABASE_SERVICE_KEY`.

#### Erro de CORS ao chamar `/.netlify/functions/backup-diario` do GitHub Pages

**Sintoma:** no console do navegador:
```
Access to fetch ... has been blocked by CORS policy: ...
'Access-Control-Allow-Origin' header has a value 'https://cpetrag.github.io/ufu_recolhimento/'
that is not equal to the supplied origin
```

**Causa:** `ALLOWED_ORIGIN` configurada como `https://cpetrag.github.io/ufu_recolhimento/` (com path e/ou barra final). O cabeçalho HTTP `Access-Control-Allow-Origin` aceita apenas **scheme + host + port**, sem path.

**Solução:** alterar `ALLOWED_ORIGIN` para `https://cpetrag.github.io` (apenas origin, sem path, sem barra final). Force redeploy depois.

#### Arquivo gerado no OneDrive com nome literal (`concat(triggerBody()...`) e tamanho minúsculo (12 bytes)

**Sintoma:** após o primeiro disparo do backup, o arquivo aparece no OneDrive mas o nome é a própria expressão e o conteúdo é a string `ChunkContent` (12 caracteres).

**Causa:** as expressões foram digitadas como **texto simples** nos campos da action SharePoint/OneDrive, em vez de inseridas via chips de **expressão** ou **conteúdo dinâmico**.

**Solução:** apagar o conteúdo dos campos e reinserir:
- "Nome do Arquivo": clicar no ícone `fx` → aba **Função** → colar a expressão → **Atualizar**.
- "Conteúdo do Arquivo": clicar no ícone ⚡ → aba **Conteúdo dinâmico** → expandir "manual" → clicar em **Ver mais (9)** → selecionar **ChunkContent**.

Confirmar que ambos viraram chips coloridos no campo (não texto editável caractere por caractere).

#### URL HTTP do Power Automate ficou exposta

**Sintoma:** a URL com `?sig=...` foi compartilhada em chat ou commit.

**Mitigação:** o flow HTTP só cria arquivos na pasta `/recolhimento` do OneDrive — quem tiver a URL pode criar arquivos lixo, mas não há vazamento de dados. Mesmo assim, **regenerar a URL** removendo e recriando o trigger HTTP no PA, depois atualizar `POWER_AUTOMATE_BACKUP_URL` no Netlify.

### 18.11 Recomendações operacionais

- Manter o backup do Supabase (Pro) ativado como **rede de segurança principal**.
- Disparar um backup manual antes de qualquer operação sensível (importação grande, mudança de schema, deletes em massa).
- Verificar periodicamente o OneDrive `/recolhimento` para confirmar que o cron está rodando (devem aparecer 2+ arquivos novos por dia, com nome iniciando pela data).
- Migrar arquivos com mais de 30 dias para uma pasta de arquivamento (ex: `/recolhimento/historico/`) para manter a pasta principal organizada.
- Considerar arquivar o ZIP mensal manual fora do OneDrive (ex: um drive da DICDE) — defesa em profundidade caso a conta `cpetrag@ufu.br` fique inacessível.