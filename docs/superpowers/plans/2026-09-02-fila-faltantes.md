# Fila de faltantes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estender a aba **Ofício** com fila dos 267 SEIs faltantes: progresso híbrido (Supabase + localStorage), abrir link SEI, e marcar **Feito** automaticamente ao concluir o cadastro na mesma tela.

**Architecture:** Helpers puros em `fila-faltantes.js` (parse CSV, merge progresso, próximo pendente). Catálogo estático `data/Processos_faltando_no_sistema.csv`. Progresso em tabela Supabase `fila_faltantes` + espelho `localStorage` chave `ufu_fila_faltantes`. Alpine na aba Ofício carrega a fila ao entrar, pré-preenche SEI, e chama `filaMarcarFeitoEAvancar` quando o fluxo Ofício chega ao passo 4 (concluído) com SEI alinhado ao card.

**Tech Stack:** Vanilla JS, Alpine.js, Supabase JS, PapaParse (já no app), Node `assert` para testes dos helpers.

**Spec:** `docs/superpowers/specs/2026-09-02-fila-faltantes-design.md`  
**Worktree / branch:** implementar em `.worktrees/feat-colar-oficio` na branch `feat/colar-oficio` (depende da aba Ofício). Se a worktree não existir, criar a partir de `main` e cherry-pick / merge da Ofício antes.

---

## File map

| Arquivo | Responsabilidade |
|---|---|
| `fila-faltantes.js` | Helpers puros: mapear linha CSV, merge, próximo pendente, ler/gravar localStorage |
| `tests/fila-faltantes.test.js` | Testes Node dos helpers |
| `data/Processos_faltando_no_sistema.csv` | Catálogo estático (cópia versionada do CSV gerado) |
| `docs/sql/fila_faltantes.sql` | DDL + RLS da tabela Supabase (rodar no SQL Editor) |
| `api.js` | `listarFilaFaltantes`, `upsertFilaFaltante` |
| `app.js` | Estado Alpine da fila + load/nav/Feito + ganchos no fluxo Ofício |
| `index.html` | Barra + card acima do fluxo Ofício; `<script src="fila-faltantes.js">` |

---

### Task 1: Helpers `fila-faltantes.js` + testes

**Files:**
- Create: `fila-faltantes.js`
- Create: `tests/fila-faltantes.test.js`

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/fila-faltantes.test.js
var assert = require("assert");
var path = require("path");
var Fila = require(path.join(__dirname, "..", "fila-faltantes.js"));

var csvRows = [
  {
    "Processo SEI": "23117.000116/2026-84",
    "ID": "7745379",
    "Especificacao": "Recolhimento",
    "Etiqueta": "",
    "Link_Permanente": "https://sei.ufu.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=7745379"
  },
  {
    "Processo SEI": "23117.000442/2025-19",
    "ID": "6686307",
    "Especificacao": "CTIC - COLETA",
    "Etiqueta": "COLETA DE BENS",
    "Link_Permanente": "https://sei.ufu.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=6686307"
  }
];

var catalogo = Fila.catalogoDeCsv(csvRows);
assert.strictEqual(catalogo.length, 2);
assert.strictEqual(catalogo[0].sei, "23117.000116/2026-84");
assert.strictEqual(catalogo[0].link, csvRows[0].Link_Permanente);
assert.strictEqual(catalogo[1].etiqueta, "COLETA DE BENS");

var remoto = [
  { sei: "23117.000116/2026-84", status: "feito", atualizado_em: "2026-09-01T10:00:00.000Z" }
];
var local = {
  atualizado_em: "2026-09-01T09:00:00.000Z",
  indice_atual: 0,
  itens: [
    { sei: "23117.000442/2025-19", status: "feito", atualizado_em: "2026-09-02T12:00:00.000Z" }
  ]
};

var merged = Fila.mergeProgresso(catalogo, remoto, local);
assert.strictEqual(merged[0].status, "feito"); // remoto
assert.strictEqual(merged[1].status, "feito"); // local mais novo que ausência no remoto
assert.strictEqual(Fila.contarFeitos(merged), 2);
assert.strictEqual(Fila.indicePrimeiroPendente(merged), -1);

merged[1].status = "pendente";
assert.strictEqual(Fila.indicePrimeiroPendente(merged), 1);
assert.strictEqual(Fila.indiceProximoPendente(merged, 0), 1);
assert.strictEqual(Fila.indiceProximoPendente(merged, 1), -1);

var remotoNovo = [
  { sei: "23117.000442/2025-19", status: "pendente", atualizado_em: "2026-09-03T00:00:00.000Z" }
];
var localVelho = {
  atualizado_em: "2026-09-01T00:00:00.000Z",
  indice_atual: 1,
  itens: [
    { sei: "23117.000442/2025-19", status: "feito", atualizado_em: "2026-09-01T00:00:00.000Z" }
  ]
};
var m2 = Fila.mergeProgresso(catalogo, remotoNovo, localVelho);
assert.strictEqual(m2[1].status, "pendente"); // remoto mais recente vence

assert.strictEqual(Fila.seiIguais("23117.000442/2025-19", "23117.000442/2025-19"), true);
assert.strictEqual(Fila.seiIguais("23117.000442/2025-19", "23117.000116/2026-84"), false);

var snapshot = Fila.paraLocalStorage(merged, 1);
assert.strictEqual(snapshot.indice_atual, 1);
assert.ok(snapshot.atualizado_em);
assert.strictEqual(snapshot.itens.length, 2);

console.log("fila-faltantes tests OK");
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run (no worktree):

```bash
node tests/fila-faltantes.test.js
```

Expected: `Cannot find module` (arquivo ainda não existe).

- [ ] **Step 3: Implementar `fila-faltantes.js`**

```js
// fila-faltantes.js
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FilaFaltantes = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var STORAGE_KEY = "ufu_fila_faltantes";

  function catalogoDeCsv(rows) {
    return (rows || []).map(function (r) {
      return {
        sei: String(r["Processo SEI"] || r.sei || "").trim(),
        idProcedimento: String(r.ID || r.id || "").trim(),
        especificacao: String(r.Especificacao || r.especificacao || "").trim(),
        etiqueta: String(r.Etiqueta || r.etiqueta || "").trim(),
        link: String(r.Link_Permanente || r.link || "").trim(),
        status: "pendente",
        atualizado_em: null,
        processo_id: null
      };
    }).filter(function (item) { return !!item.sei; });
  }

  function ts(value) {
    if (!value) return 0;
    var n = Date.parse(value);
    return isNaN(n) ? 0 : n;
  }

  function pickMaisRecente(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return ts(a.atualizado_em) >= ts(b.atualizado_em) ? a : b;
  }

  function indexBySei(list) {
    var map = {};
    (list || []).forEach(function (item) {
      if (item && item.sei) map[item.sei] = item;
    });
    return map;
  }

  function mergeProgresso(catalogo, remotoRows, localSnapshot) {
    var remoto = indexBySei(remotoRows || []);
    var localItens = indexBySei(localSnapshot && localSnapshot.itens ? localSnapshot.itens : []);
    return (catalogo || []).map(function (base) {
      var chosen = pickMaisRecente(remoto[base.sei], localItens[base.sei]);
      return {
        sei: base.sei,
        idProcedimento: base.idProcedimento,
        especificacao: base.especificacao,
        etiqueta: base.etiqueta,
        link: base.link,
        status: chosen && chosen.status === "feito" ? "feito" : "pendente",
        atualizado_em: chosen ? chosen.atualizado_em : null,
        processo_id: chosen && chosen.processo_id ? chosen.processo_id : null
      };
    });
  }

  function contarFeitos(lista) {
    return (lista || []).filter(function (i) { return i.status === "feito"; }).length;
  }

  function indicePrimeiroPendente(lista) {
    for (var i = 0; i < (lista || []).length; i++) {
      if (lista[i].status !== "feito") return i;
    }
    return -1;
  }

  function indiceProximoPendente(lista, fromIndex) {
    var start = (fromIndex == null ? -1 : fromIndex) + 1;
    for (var i = start; i < (lista || []).length; i++) {
      if (lista[i].status !== "feito") return i;
    }
    return -1;
  }

  function seiIguais(a, b) {
    return String(a || "").trim() === String(b || "").trim();
  }

  function paraLocalStorage(lista, indiceAtual) {
    return {
      atualizado_em: new Date().toISOString(),
      indice_atual: indiceAtual || 0,
      itens: (lista || []).map(function (i) {
        return {
          sei: i.sei,
          status: i.status,
          atualizado_em: i.atualizado_em,
          processo_id: i.processo_id || null
        };
      })
    };
  }

  function lerLocalStorage(storage) {
    try {
      var raw = (storage || localStorage).getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function gravarLocalStorage(snapshot, storage) {
    (storage || localStorage).setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    catalogoDeCsv: catalogoDeCsv,
    mergeProgresso: mergeProgresso,
    contarFeitos: contarFeitos,
    indicePrimeiroPendente: indicePrimeiroPendente,
    indiceProximoPendente: indiceProximoPendente,
    seiIguais: seiIguais,
    paraLocalStorage: paraLocalStorage,
    lerLocalStorage: lerLocalStorage,
    gravarLocalStorage: gravarLocalStorage
  };
});
```

- [ ] **Step 4: Rodar testes e confirmar PASS**

```bash
node tests/fila-faltantes.test.js
```

Expected: `fila-faltantes tests OK`

- [ ] **Step 5: Commit**

```bash
git add fila-faltantes.js tests/fila-faltantes.test.js
git commit -m "feat: helpers e testes da fila de faltantes"
```

---

### Task 2: CSV estático + SQL Supabase

**Files:**
- Create: `data/Processos_faltando_no_sistema.csv` (copiar do gerado na raiz do repo principal)
- Create: `docs/sql/fila_faltantes.sql`

- [ ] **Step 1: Copiar o CSV para `data/`**

No worktree (ajuste o path de origem se o CSV só existir na pasta pai):

```bash
mkdir -p data
cp ../../Processos_faltando_no_sistema.csv data/Processos_faltando_no_sistema.csv
# Windows PowerShell:
# New-Item -ItemType Directory -Force data | Out-Null
# Copy-Item "..\..\Processos_faltando_no_sistema.csv" "data\Processos_faltando_no_sistema.csv"
```

Conferir cabeçalho:

```bash
head -n 1 data/Processos_faltando_no_sistema.csv
```

Expected: começa com `Processo SEI,ID,Especificacao,...`

- [ ] **Step 2: Criar `docs/sql/fila_faltantes.sql`**

```sql
-- Rodar no SQL Editor do Supabase do projeto ufu_recolhimento
create table if not exists public.fila_faltantes (
  sei text primary key,
  status text not null check (status in ('pendente', 'feito')),
  atualizado_em timestamptz not null default now(),
  processo_id uuid null references public.processos(id) on delete set null
);

create index if not exists fila_faltantes_status_idx on public.fila_faltantes (status);

alter table public.fila_faltantes enable row level security;

-- Alinha ao padrão atual do app (anon key no front). Ajuste policies se o projeto endurecer RLS depois.
drop policy if exists "fila_faltantes_select_anon" on public.fila_faltantes;
drop policy if exists "fila_faltantes_upsert_anon" on public.fila_faltantes;

create policy "fila_faltantes_select_anon"
  on public.fila_faltantes for select
  to anon, authenticated
  using (true);

create policy "fila_faltantes_insert_anon"
  on public.fila_faltantes for insert
  to anon, authenticated
  with check (true);

create policy "fila_faltantes_update_anon"
  on public.fila_faltantes for update
  to anon, authenticated
  using (true)
  with check (true);
```

- [ ] **Step 3: Aplicar SQL no Supabase (manual / checklist)**

Abrir o SQL Editor do projeto `oyvvvxpgqhyowvfaepgu` e executar o conteúdo de `docs/sql/fila_faltantes.sql`.  
Expected: tabela `fila_faltantes` criada sem erro.

- [ ] **Step 4: Commit**

```bash
git add data/Processos_faltando_no_sistema.csv docs/sql/fila_faltantes.sql
git commit -m "chore: CSV da fila faltantes e DDL Supabase"
```

---

### Task 3: API Supabase (`listarFilaFaltantes` / `upsertFilaFaltante`)

**Files:**
- Modify: `api.js` (junto ao bloco de processos / antes do `window.API`)

- [ ] **Step 1: Adicionar funções**

Inserir antes de `// EXPORTAR` / `window.API`:

```js
function listarFilaFaltantes() {
    return db.from("fila_faltantes").select("sei,status,atualizado_em,processo_id").then(function (r) {
        if (r.error) throw r.error;
        return r.data || [];
    });
}

function upsertFilaFaltante(row) {
    var payload = {
        sei: String(row.sei || "").trim(),
        status: row.status === "feito" ? "feito" : "pendente",
        atualizado_em: row.atualizado_em || new Date().toISOString(),
        processo_id: row.processo_id || null
    };
    return db.from("fila_faltantes").upsert([payload], { onConflict: "sei" }).select().single().then(function (r) {
        if (r.error) throw r.error;
        return r.data;
    });
}
```

- [ ] **Step 2: Exportar em `window.API`**

Adicionar ao objeto:

```js
listarFilaFaltantes: listarFilaFaltantes,
upsertFilaFaltante: upsertFilaFaltante,
```

- [ ] **Step 3: Smoke rápido no browser console (com `netlify dev`)**

```js
await API.listarFilaFaltantes()
await API.upsertFilaFaltante({ sei: "23117.000000/0000-00", status: "pendente" })
```

Expected: array (possivelmente vazio) e upsert sem erro. Remover a linha de teste depois se quiser (`status` pode ficar pendente harmlessly, ou delete no SQL Editor).

- [ ] **Step 4: Commit**

```bash
git add api.js
git commit -m "feat: API listar/upsert fila_faltantes"
```

---

### Task 4: Estado Alpine + ganchos no fluxo Ofício (`app.js`)

**Files:**
- Modify: `app.js` (estado inicial, `init`/watch aba, métodos da fila, ganchos em `oficioSalvarProcesso` / `oficioAvancarFila` / `oficioRemoverDaFila`)
- Modify: `index.html` — só adicionar `<script src="fila-faltantes.js"></script>` antes de `app.js` nesta task (UI completa na Task 5)

Constante sugerida no topo de `app.js` (junto de `BASE_CSV_URL`):

```js
var FILA_FALTANTES_CSV_URL = "data/Processos_faltando_no_sistema.csv";
```

- [ ] **Step 1: Estado inicial**

No `return { ... }` do Alpine, adicionar:

```js
filaFaltantes: [],
filaIndice: 0,
filaCarregando: false,
filaErro: null,
filaDisponivel: false,
```

- [ ] **Step 2: Getters**

```js
get filaAtual() {
    if (!this.filaFaltantes.length) return null;
    if (this.filaIndice < 0 || this.filaIndice >= this.filaFaltantes.length) return null;
    return this.filaFaltantes[this.filaIndice];
},
get filaFeitosCount() {
    return typeof FilaFaltantes !== "undefined"
        ? FilaFaltantes.contarFeitos(this.filaFaltantes)
        : 0;
},
get filaRestantesCount() {
    return Math.max(0, this.filaFaltantes.length - this.filaFeitosCount);
},
```

- [ ] **Step 3: Métodos de carga / persistência / navegação**

```js
filaPersistirLocal: function() {
    if (typeof FilaFaltantes === "undefined") return;
    var snap = FilaFaltantes.paraLocalStorage(this.filaFaltantes, this.filaIndice);
    FilaFaltantes.gravarLocalStorage(snap);
},

filaAplicarCardAoOficio: function() {
    var card = this.filaAtual;
    if (!card) return;
    if (!this.oficioProcesso) this.oficioProcesso = { sei: "", pro_reitoria_unidade: "", campus_id: "", bloco_id: "", sala: "" };
    this.oficioProcesso.sei = card.sei;
},

filaCarregar: function() {
    var self = this;
    if (typeof FilaFaltantes === "undefined" || typeof Papa === "undefined") {
        this.filaDisponivel = false;
        this.filaErro = "Módulo da fila indisponível.";
        return Promise.resolve();
    }
    this.filaCarregando = true;
    this.filaErro = null;
    var local = FilaFaltantes.lerLocalStorage();
    return fetch(FILA_FALTANTES_CSV_URL)
        .then(function (res) {
            if (!res.ok) throw new Error("CSV da fila HTTP " + res.status);
            return res.text();
        })
        .then(function (texto) {
            var parsed = Papa.parse(texto, { header: true, skipEmptyLines: true });
            var catalogo = FilaFaltantes.catalogoDeCsv(parsed.data);
            return API.listarFilaFaltantes().catch(function () {
                return [];
            }).then(function (remoto) {
                self.filaFaltantes = FilaFaltantes.mergeProgresso(catalogo, remoto, local);
                var idx = FilaFaltantes.indicePrimeiroPendente(self.filaFaltantes);
                if (idx < 0) idx = 0;
                if (local && typeof local.indice_atual === "number"
                    && local.indice_atual >= 0
                    && local.indice_atual < self.filaFaltantes.length
                    && self.filaFaltantes[local.indice_atual].status !== "feito") {
                    idx = local.indice_atual;
                }
                self.filaIndice = idx;
                self.filaDisponivel = self.filaFaltantes.length > 0;
                self.filaPersistirLocal();
                self.filaAplicarCardAoOficio();
                self.filaCarregando = false;
                // Sync: upsert itens locais mais novos que o remoto (best-effort)
                var remotoMap = {};
                (remoto || []).forEach(function (r) { remotoMap[r.sei] = r; });
                self.filaFaltantes.forEach(function (item) {
                    if (item.status !== "feito") return;
                    var r = remotoMap[item.sei];
                    var localTs = item.atualizado_em ? Date.parse(item.atualizado_em) : 0;
                    var remotoTs = r && r.atualizado_em ? Date.parse(r.atualizado_em) : 0;
                    if (!r || localTs > remotoTs) {
                        API.upsertFilaFaltante(item).catch(function () { /* retry na próxima abertura */ });
                    }
                });
            });
        })
        .catch(function (err) {
            self.filaCarregando = false;
            self.filaDisponivel = false;
            self.filaErro = err && err.message ? err.message : "Falha ao carregar fila";
        });
},

filaAnterior: function() {
    if (this.filaIndice > 0) {
        this.filaIndice -= 1;
        this.filaPersistirLocal();
        this.filaAplicarCardAoOficio();
    }
},

filaProximo: function() {
    if (this.filaIndice < this.filaFaltantes.length - 1) {
        this.filaIndice += 1;
        this.filaPersistirLocal();
        this.filaAplicarCardAoOficio();
    }
},

filaPular: function() {
    if (typeof FilaFaltantes === "undefined") return;
    var next = FilaFaltantes.indiceProximoPendente(this.filaFaltantes, this.filaIndice);
    if (next < 0) {
        alert("Não há próximo pendente na fila.");
        return;
    }
    this.filaIndice = next;
    this.filaPersistirLocal();
    this.oficioReset();
    this.filaAplicarCardAoOficio();
},

filaAbrirSei: function() {
    var card = this.filaAtual;
    if (!card || !card.link) {
        alert("Este item não tem Link_Permanente.");
        return;
    }
    window.open(card.link, "_blank", "noopener,noreferrer");
},

filaMarcarFeitoEAvancar: function() {
    var self = this;
    if (!this.filaDisponivel || typeof FilaFaltantes === "undefined") return Promise.resolve();
    var card = this.filaAtual;
    if (!card) return Promise.resolve();
    if (!FilaFaltantes.seiIguais(card.sei, this.oficioProcesso && this.oficioProcesso.sei)) {
        alert("SEI do formulário difere do card da fila. Feito automático bloqueado.");
        return Promise.resolve();
    }
    var agora = new Date().toISOString();
    card.status = "feito";
    card.atualizado_em = agora;
    card.processo_id = this.processoId || card.processo_id || null;
    this.filaPersistirLocal();
    return API.upsertFilaFaltante({
        sei: card.sei,
        status: "feito",
        atualizado_em: agora,
        processo_id: card.processo_id
    }).catch(function (err) {
        console.warn("fila_faltantes sync falhou; mantido no localStorage", err);
        alert("Progresso salvo neste navegador. Sync com servidor falhou — será retentado ao reabrir a aba.");
    }).then(function () {
        var next = FilaFaltantes.indiceProximoPendente(self.filaFaltantes, self.filaIndice);
        self.oficioReset();
        if (next >= 0) {
            self.filaIndice = next;
        } else {
            self.filaIndice = Math.min(self.filaIndice, Math.max(0, self.filaFaltantes.length - 1));
        }
        self.filaPersistirLocal();
        self.filaAplicarCardAoOficio();
    });
},
```

- [ ] **Step 4: Carregar ao entrar na aba Ofício**

Onde o app troca `aba` (ou em `init` + `$watch` se já usar Alpine watch). Preferência mínima: no click da tab Ofício **e** se `aba === 'oficio'` no `init` após boot.

Exemplo no botão da navbar (Task 5 ajusta o HTML): `x-on:click="aba = 'oficio'; filaCarregar()"`.

Também chamar `filaCarregar()` uma vez no `init()` se quiser pré-carregar (opcional). Obrigatório: chamar ao abrir a aba.

- [ ] **Step 5: Ganchos de “concluir cadastro”**

Em `oficioSalvarProcesso`, quando `oficioFila.length === 0` após filtrar (vai para passo 4):

```js
if (self.oficioFila.length === 0) {
    self.oficioPasso = 4;
    return self.filaMarcarFeitoEAvancar();
}
```

Em `oficioAvancarFila` e `oficioRemoverDaFila`, quando a fila de itens zera e `oficioPasso = 4`:

```js
if (this.oficioFila.length === 0) {
    this.oficioPasso = 4;
    this.filaMarcarFeitoEAvancar();
    return;
}
```

**Não** chamar `filaMarcarFeitoEAvancar` se ainda houver itens em `oficioFila`.

- [ ] **Step 6: Script tag**

Em `index.html` head (junto de `oficio-match.js`):

```html
<script src="fila-faltantes.js"></script>
```

Bump do cache-buster: `app.js?v=fila-1`.

- [ ] **Step 7: Commit**

```bash
git add app.js index.html
git commit -m "feat: estado Alpine da fila de faltantes e Feito automatico"
```

---

### Task 5: UI barra + card na aba Ofício (`index.html`)

**Files:**
- Modify: `index.html` — bloco no topo de `x-show="aba === 'oficio'"`

- [ ] **Step 1: Inserir UI acima dos passos do ofício**

Logo após `<div x-show="aba === 'oficio'" ...>`:

```html
<!-- Fila de faltantes -->
<div class="bg-white p-4 rounded-xl shadow border-t-4 border-violet-600 space-y-3" x-show="filaDisponivel || filaCarregando || filaErro">
    <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs font-bold text-slate-700">
            <span x-show="filaCarregando">Carregando fila…</span>
            <span x-show="!filaCarregando && filaDisponivel"
                  x-text="'Faltante ' + (filaIndice + 1) + ' de ' + filaFaltantes.length
                    + ' · feitos ' + filaFeitosCount
                    + ' · restantes ' + filaRestantesCount"></span>
        </p>
        <div class="flex flex-wrap gap-2">
            <button type="button" class="px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg bg-slate-100 text-slate-700"
                    x-on:click="filaAnterior()" x-bind:disabled="filaIndice <= 0">Anterior</button>
            <button type="button" class="px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg bg-slate-100 text-slate-700"
                    x-on:click="filaProximo()" x-bind:disabled="filaIndice >= filaFaltantes.length - 1">Próximo</button>
            <button type="button" class="px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg bg-amber-100 text-amber-800"
                    x-on:click="filaPular()">Pular</button>
            <button type="button" class="px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg bg-violet-600 text-white"
                    x-on:click="filaAbrirSei()"
                    x-bind:disabled="!(filaAtual && filaAtual.link)">Abrir no SEI</button>
        </div>
    </div>
    <div x-show="filaErro" class="text-xs text-red-700 font-bold" x-text="filaErro"></div>
    <div x-show="filaAtual" class="rounded-lg bg-violet-50 border border-violet-100 p-3 text-xs space-y-1">
        <p><span class="font-bold text-slate-500 uppercase text-[10px]">SEI</span>
           <span class="font-mono font-bold text-slate-800 ml-2" x-text="filaAtual.sei"></span></p>
        <p x-show="filaAtual.especificacao"><span class="font-bold text-slate-500 uppercase text-[10px]">Especificação</span>
           <span class="ml-2 text-slate-700" x-text="filaAtual.especificacao"></span></p>
        <p x-show="filaAtual.etiqueta"><span class="font-bold text-slate-500 uppercase text-[10px]">Etiqueta</span>
           <span class="ml-2 text-slate-700" x-text="filaAtual.etiqueta"></span></p>
        <p><span class="font-bold text-slate-500 uppercase text-[10px]">Status</span>
           <span class="ml-2 font-bold"
                 x-bind:class="filaAtual.status === 'feito' ? 'text-emerald-700' : 'text-amber-700'"
                 x-text="filaAtual.status === 'feito' ? 'feito' : (oficioPasso > 1 ? 'em andamento' : 'pendente')"></span></p>
    </div>
</div>
```

- [ ] **Step 2: Navbar Ofício chama `filaCarregar`**

No botão da aba Ofício:

```html
x-on:click="aba = 'oficio'; filaCarregar()"
```

- [ ] **Step 3: Verificação manual (checklist)**

Com `netlify dev` no worktree:

1. Abrir aba Ofício → vê “Faltante 1 de 267…” e SEI do CSV.
2. **Abrir no SEI** abre o link correto.
3. Cadastrar fluxo completo (ou salvar processo com fila de itens vazia após filtro) → marca Feito, avança, limpa formulário, SEI do próximo.
4. Recarregar → feitos restaurados (Supabase e/ou localStorage).
5. Renomear temporariamente o CSV / 404 → Ofício solto ainda funciona.
6. Alterar SEI do formulário ≠ card e concluir → alert bloqueia Feito.

- [ ] **Step 4: Commit**

```bash
git add index.html app.js
git commit -m "feat: UI da fila de faltantes na aba Oficio"
```

---

## Spec coverage (self-review)

| Requisito da spec | Task |
|---|---|
| Extender aba Ofício, tudo numa tela | 4, 5 |
| CSV estático catálogo | 2 |
| Merge Supabase + localStorage | 1, 3, 4 |
| Barra + card + Abrir SEI | 5 |
| Feito automático ao concluir | 4 (ganchos passo 4) |
| Pular só muda foco | 4 `filaPular` |
| Guardrail SEI divergente | 4 `filaMarcarFeitoEAvancar` |
| CSV falha → Ofício solto | 4 `filaDisponivel` / 5 `x-show` |
| Testes helpers | 1 |
| DDL tabela | 2 |

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-02-fila-faltantes.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
