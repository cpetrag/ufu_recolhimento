# Colar ofício Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova aba **Ofício** que cola texto de ofício SEI, extrai dados via Netlify Function (IA), salva o processo e confirma itens um a um (foto/avaliação opcionais, tamanho sugerido).

**Architecture:** Frontend Alpine (`app.js` + `index.html`) chama `API.extrairOficio` → Netlify Function `extrair-oficio` (chave só no servidor) devolve JSON. Helpers puros em `oficio-match.js` casam campus/bloco/unidade e cruzam patrimônio com `baseCSV`. Processo salva na hora; itens ficam em fila de confirmação.

**Tech Stack:** Vanilla JS, Alpine.js, Supabase JS, Netlify Functions, OpenAI Chat Completions (env `OPENAI_API_KEY`), Node assert para testes dos helpers.

**Spec:** `docs/superpowers/specs/2026-09-02-colar-oficio-design.md`

---

## File map

| Arquivo | Responsabilidade |
|---|---|
| `oficio-match.js` | Helpers puros: normalizar texto, match campus/bloco/unidade, enriquecer item com base.csv |
| `tests/oficio-match.test.js` | Testes Node (`node --test` ou assert) dos helpers |
| `netlify/functions/extrair-oficio.js` | Proxy IA: recebe texto, devolve JSON estruturado |
| `api.js` | `API.extrairOficio(texto)`; garantir `tamanho: null` quando vazio em `salvarItem` |
| `config.public.js` / `config.example.js` | `EXTRAIR_OFICIO_URL` |
| `app.js` | Estado Alpine da aba Ofício + métodos do fluxo |
| `index.html` | Aba na navbar + UI dos 4 passos |

---

### Task 1: Helpers de match (`oficio-match.js`) + testes

**Files:**
- Create: `oficio-match.js`
- Create: `tests/oficio-match.test.js`

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/oficio-match.test.js
var assert = require("assert");
var path = require("path");
var match = require(path.join(__dirname, "..", "oficio-match.js"));

assert.strictEqual(match.normalizar("Santa Mônica"), "santa monica");
assert.strictEqual(match.normalizar("  CTIC  "), "ctic");

var campus = [
  { id: "c1", nome: "Santa Mônica" },
  { id: "c2", nome: "Umuarama" }
];
assert.strictEqual(match.casarPorNome("Sta Monica", campus).id, "c1");
assert.strictEqual(match.casarPorNome("xyz", campus), null);

var blocos = [
  { id: "b1", campus_id: "c1", nome: "1J" },
  { id: "b2", campus_id: "c2", nome: "1J" }
];
assert.strictEqual(match.casarBloco("1J", "c1", blocos).id, "b1");
assert.strictEqual(match.casarBloco("1J", "c2", blocos).id, "b2");

var base = [
  { NroPatrimonio: "707657", CodioBarra: "0", DescricaoBem: "NOTEBOOK DA BASE" }
];
var enr = match.enriquecerItem({ patrimonio: "707657", descricao: "texto oficio" }, base);
assert.strictEqual(enr.descricao, "NOTEBOOK DA BASE");
assert.strictEqual(enr.naBase, true);

var enr2 = match.enriquecerItem({ patrimonio: "999", descricao: "mesa" }, base);
assert.strictEqual(enr2.descricao, "mesa");
assert.strictEqual(enr2.naBase, false);

console.log("oficio-match tests OK");
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node tests/oficio-match.test.js`

Expected: `Cannot find module` ou erro equivalente (arquivo ainda não existe).

- [ ] **Step 3: Implementar `oficio-match.js`**

```js
// oficio-match.js
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.OficioMatch = factory();
})(typeof self !== "undefined" ? self : this, function () {
  function normalizar(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function casarPorNome(texto, lista) {
    var t = normalizar(texto);
    if (!t || !lista || !lista.length) return null;
    var i, n, exato = null, parcial = null;
    for (i = 0; i < lista.length; i++) {
      n = normalizar(lista[i].nome);
      if (n === t) return lista[i];
      if (!exato && (n.indexOf(t) !== -1 || t.indexOf(n) !== -1)) parcial = lista[i];
    }
    // aliases comuns
    if (t.indexOf("santa monica") !== -1 || t.indexOf("sta monica") !== -1) {
      for (i = 0; i < lista.length; i++) {
        if (normalizar(lista[i].nome).indexOf("santa monica") !== -1) return lista[i];
      }
    }
    return parcial;
  }

  function casarBloco(texto, campusId, blocos) {
    if (!campusId) return null;
    var filtrados = (blocos || []).filter(function (b) { return b.campus_id === campusId; });
    return casarPorNome(texto, filtrados);
  }

  function acharNaBase(patrimonio, baseCSV) {
    var v = String(patrimonio || "").trim();
    if (!v || !baseCSV || !baseCSV.length) return null;
    var vNum = parseInt(v, 10);
    return baseCSV.find(function (i) {
      var nroPat = parseInt(String(i.NroPatrimonio || "").trim(), 10);
      var codBar = parseInt(String(i.CodioBarra || "").trim(), 10);
      if (!isNaN(nroPat) && nroPat === vNum) return true;
      if (!isNaN(codBar) && codBar !== 0 && codBar === vNum) return true;
      return String(i.NroPatrimonio || "").trim() === v || String(i.CodioBarra || "").trim() === v;
    }) || null;
  }

  function enriquecerItem(item, baseCSV) {
    var achado = acharNaBase(item.patrimonio, baseCSV);
    return {
      patrimonio: item.patrimonio || "",
      descricao: achado && achado.DescricaoBem ? String(achado.DescricaoBem).trim() : String(item.descricao || "").trim(),
      tamanho: item.tamanho_sugerido || item.tamanho || "",
      viavel: false,
      bvm: false,
      foto: "",
      avaliacao: "",
      semPatrimonio: !item.patrimonio,
      naBase: !!achado
    };
  }

  return { normalizar: normalizar, casarPorNome: casarPorNome, casarBloco: casarBloco, acharNaBase: acharNaBase, enriquecerItem: enriquecerItem };
});
```

- [ ] **Step 4: Rodar testes — devem passar**

Run: `node tests/oficio-match.test.js`

Expected: `oficio-match tests OK`

- [ ] **Step 5: Commit**

```bash
git add oficio-match.js tests/oficio-match.test.js
git commit -m "feat: helpers de match para Colar ofício"
```

---

### Task 2: Netlify Function `extrair-oficio`

**Files:**
- Create: `netlify/functions/extrair-oficio.js`
- Reference pattern: `netlify/functions/enviar-sharepoint.js`

- [ ] **Step 1: Criar a function**

```js
// netlify/functions/extrair-oficio.js
var ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";
var OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
var OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function json(statusCode, body, extraHeaders) {
  return {
    statusCode: statusCode,
    headers: Object.assign({ "Content-Type": "application/json" }, extraHeaders || {}),
    body: JSON.stringify(body)
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

var SYSTEM_PROMPT = [
  "Você extrai dados de ofícios UFU de recolhimento/baixa de bens.",
  "Responda SOMENTE JSON válido (sem markdown) no formato:",
  '{"sei":"23117.000000/0000-00","unidade_texto":"","campus_texto":"","bloco_texto":"","sala_texto":"","itens":[{"patrimonio":"","descricao":"","tamanho_sugerido":"P|M|G|GG|null","confianca":0.0}],"avisos":[]}',
  "Regras: SEI no padrão 5.6/4-2 dígitos; patrimônios numéricos; tamanho_sugerido por porte físico do bem;",
  "sala_texto = trecho de local do ofício; se algo incerto, use avisos[] e deixe campo vazio."
].join(" ");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders() };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method Not Allowed" }, corsHeaders());
  }
  if (!OPENAI_API_KEY) {
    return json(500, { ok: false, error: "OPENAI_API_KEY não configurada." }, corsHeaders());
  }

  var origin = event.headers.origin || event.headers.Origin || "";
  if (ALLOWED_ORIGIN && origin && origin !== ALLOWED_ORIGIN) {
    return json(403, { ok: false, error: "Forbidden origin" }, corsHeaders());
  }

  var payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { ok: false, error: "JSON inválido" }, corsHeaders());
  }
  var texto = payload && typeof payload.texto === "string" ? payload.texto.trim() : "";
  if (texto.length < 40) {
    return json(400, { ok: false, error: "Texto do ofício muito curto." }, corsHeaders());
  }
  if (texto.length > 30000) {
    return json(400, { ok: false, error: "Texto do ofício muito longo." }, corsHeaders());
  }

  try {
    var aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: texto }
        ]
      })
    });
    var aiBody = await aiRes.json().catch(function () { return {}; });
    if (!aiRes.ok) {
      var msg = (aiBody && aiBody.error && aiBody.error.message) || ("OpenAI HTTP " + aiRes.status);
      return json(502, { ok: false, error: msg }, corsHeaders());
    }
    var content = aiBody.choices && aiBody.choices[0] && aiBody.choices[0].message && aiBody.choices[0].message.content;
    var data = JSON.parse(content || "{}");
    if (!Array.isArray(data.itens)) data.itens = [];
    if (!Array.isArray(data.avisos)) data.avisos = [];
    return json(200, { ok: true, data: data }, corsHeaders());
  } catch (err) {
    return json(500, { ok: false, error: err && err.message ? err.message : "Erro interno" }, corsHeaders());
  }
};
```

- [ ] **Step 2: Documentar env vars no README (trecho curto)**

Em `README.MD`, na seção de Netlify/env, adicionar:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini   # opcional
ALLOWED_ORIGIN=https://cpetrag.github.io
```

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/extrair-oficio.js README.MD
git commit -m "feat: Netlify function extrair-oficio (proxy OpenAI)"
```

---

### Task 3: Config + `API.extrairOficio` + `salvarItem` com tamanho null

**Files:**
- Modify: `config.public.js`
- Modify: `config.example.js`
- Modify: `api.js`

- [ ] **Step 1: Adicionar URL nas configs**

Em `config.public.js` e `config.example.js`, incluir:

```js
EXTRAIR_OFICIO_URL: "https://gregarious-boba-7c3368.netlify.app/.netlify/functions/extrair-oficio"
```

(No example: `https://YOUR_NETLIFY_SITE.netlify.app/.netlify/functions/extrair-oficio`)

- [ ] **Step 2: Em `api.js`, ler config e expor método**

No topo, junto das outras URLs:

```js
var EXTRAIR_OFICIO_URL = APP_CONFIG.EXTRAIR_OFICIO_URL || "";
```

Em `salvarItem`, trocar a montagem do registro para:

```js
tamanho: item.tamanho ? item.tamanho : null,
foto: item.foto || "",
```

Adicionar função e export no objeto `API`:

```js
function extrairOficio(texto) {
  if (!EXTRAIR_OFICIO_URL) {
    return Promise.reject(new Error("EXTRAIR_OFICIO_URL não configurada."));
  }
  return fetch(EXTRAIR_OFICIO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto: texto })
  }).then(function (res) {
    return res.json().then(function (body) {
      if (!res.ok || !body || body.ok === false) {
        throw new Error((body && body.error) || ("Falha ao extrair ofício: HTTP " + res.status));
      }
      return body.data;
    });
  });
}
```

No `return` / objeto `API` existente, incluir `extrairOficio: extrairOficio`.

- [ ] **Step 3: Commit**

```bash
git add config.public.js config.example.js api.js
git commit -m "feat: API.extrairOficio e tamanho null no salvarItem"
```

---

### Task 4: Estado e métodos Alpine em `app.js`

**Files:**
- Modify: `app.js`
- Modify: `index.html` (apenas incluir script `oficio-match.js` antes de `app.js`)

- [ ] **Step 1: Incluir script no `index.html` head**

Antes de `app.js`:

```html
<script src="oficio-match.js"></script>
```

- [ ] **Step 2: Adicionar estado inicial no `return` de `app()`**

```js
// aba Ofício
oficioPasso: 1, // 1 colar, 2 revisar processo, 3 fila itens, 4 pronto
oficioTexto: "",
oficioExtraindo: false,
oficioErro: null,
oficioAvisos: [],
oficioProcesso: { sei: "", pro_reitoria_unidade: "", campus_id: "", bloco_id: "", sala: "" },
oficioBlocos: [],
oficioFila: [],
oficioFilaIndex: 0,
oficioItemForm: { patrimonio: "", descricao: "", tamanho: "", viavel: false, bvm: false, foto: "", avaliacao: "", semPatrimonio: false, naBase: false },
oficioConfirmados: 0,
oficioProcessoExistente: false,
```

- [ ] **Step 3: Implementar métodos** (inserir na seção de métodos do `app()`, agrupados)

```js
oficioReset: function () {
  this.oficioPasso = 1;
  this.oficioTexto = "";
  this.oficioExtraindo = false;
  this.oficioErro = null;
  this.oficioAvisos = [];
  this.oficioProcesso = { sei: "", pro_reitoria_unidade: "", campus_id: "", bloco_id: "", sala: "" };
  this.oficioBlocos = [];
  this.oficioFila = [];
  this.oficioFilaIndex = 0;
  this.oficioItemForm = { patrimonio: "", descricao: "", tamanho: "", viavel: false, bvm: false, foto: "", avaliacao: "", semPatrimonio: false, naBase: false };
  this.oficioConfirmados = 0;
  this.oficioProcessoExistente = false;
},

oficioExtrair: function () {
  var self = this;
  var texto = String(this.oficioTexto || "").trim();
  if (texto.length < 40) { alert("Cole o texto completo do ofício."); return; }
  this.oficioExtraindo = true;
  this.oficioErro = null;
  API.extrairOficio(texto).then(function (data) {
    self.oficioExtraindo = false;
    self.oficioAvisos = data.avisos || [];
    var unidade = OficioMatch.casarPorNome(data.unidade_texto, self.unidades_db);
    var campus = OficioMatch.casarPorNome(data.campus_texto, self.campus);
    self.oficioProcesso = {
      sei: API.mascaraSEI(String(data.sei || "").replace(/\D/g, "")) || String(data.sei || ""),
      pro_reitoria_unidade: unidade ? unidade.nome : (data.unidade_texto || ""),
      campus_id: campus ? campus.id : "",
      bloco_id: "",
      sala: data.sala_texto || ""
    };
    var carregarBlocos = campus
      ? API.carregarBlocos(campus.id)
      : Promise.resolve([]);
    return carregarBlocos.then(function (blocos) {
      self.oficioBlocos = blocos;
      var bloco = OficioMatch.casarBloco(data.bloco_texto, self.oficioProcesso.campus_id, blocos);
      if (bloco) self.oficioProcesso.bloco_id = bloco.id;
      var fila = (data.itens || []).map(function (it) {
        return OficioMatch.enriquecerItem(it, self.baseCSV);
      });
      if (fila.length === 0 && data.sala_texto) {
        // sem patrimônio: um item sem número com descrição genérica do ofício
        fila.push(OficioMatch.enriquecerItem({ patrimonio: "", descricao: texto.slice(0, 280), tamanho_sugerido: "" }, self.baseCSV));
        fila[0].semPatrimonio = true;
        fila[0].patrimonio = "Sem número";
      }
      self.oficioFila = fila;
      self.oficioPasso = 2;
      return API.buscarProcessoPorSEI(self.oficioProcesso.sei).then(function (existente) {
        self.oficioProcessoExistente = !!existente;
        if (existente) {
          self.oficioProcesso = Object.assign({}, self.oficioProcesso, {
            sei: existente.sei,
            pro_reitoria_unidade: existente.pro_reitoria_unidade || self.oficioProcesso.pro_reitoria_unidade,
            campus_id: existente.campus_id || self.oficioProcesso.campus_id,
            bloco_id: existente.bloco_id || self.oficioProcesso.bloco_id,
            sala: existente.sala || self.oficioProcesso.sala,
            id: existente.id
          });
          if (existente.campus_id) {
            return API.carregarBlocos(existente.campus_id).then(function (b) { self.oficioBlocos = b; });
          }
        }
      });
    });
  }).catch(function (err) {
    self.oficioExtraindo = false;
    self.oficioErro = err && err.message ? err.message : "Falha ao extrair ofício";
  });
},

oficioCarregarBlocos: function () {
  var self = this;
  this.oficioProcesso.bloco_id = "";
  API.carregarBlocos(this.oficioProcesso.campus_id).then(function (b) { self.oficioBlocos = b; });
},

oficioSalvarProcesso: function () {
  var self = this;
  var p = this.oficioProcesso;
  if (!p.sei || String(p.sei).length < 20) { alert("SEI inválido."); return; }
  if (!p.pro_reitoria_unidade) { alert("Informe a Pró-Reitoria / Unidade."); return; }
  if (!p.campus_id) { alert("Selecione o Campus."); return; }
  if (!p.sala) { alert("Informe a Sala/Espaço."); return; }
  var payload = {
    sei: p.sei,
    pro_reitoria_unidade: p.pro_reitoria_unidade,
    campus_id: p.campus_id,
    bloco_id: p.bloco_id || null,
    sala: p.sala
  };
  if (p.id) payload.id = p.id;
  API.salvarProcesso(payload).then(function (data) {
    self.processoId = data.id;
    self.processo = data;
    // filtrar patrimônios já existentes no processo
    return API.carregarItensProcesso(data.id).then(function (itens) {
      self.itens = itens;
      var existentes = {};
      itens.forEach(function (i) { existentes[String(i.patrimonio)] = true; });
      self.oficioFila = self.oficioFila.filter(function (f) {
        if (f.semPatrimonio || f.patrimonio === "Sem número") return true;
        return !existentes[String(f.patrimonio)];
      });
      self.oficioConfirmados = 0;
      if (self.oficioFila.length === 0) {
        self.oficioPasso = 4;
        return;
      }
      self.oficioFilaIndex = 0;
      self.oficioCarregarItemAtual();
      self.oficioPasso = 3;
    });
  }).catch(function (err) {
    alert("Erro ao salvar processo: " + (err && err.message ? err.message : "tente novamente"));
  });
},

oficioCarregarItemAtual: function () {
  var cur = this.oficioFila[this.oficioFilaIndex];
  if (!cur) return;
  this.oficioItemForm = {
    patrimonio: cur.patrimonio || "",
    descricao: cur.descricao || "",
    tamanho: cur.tamanho || "",
    viavel: !!cur.viavel,
    bvm: !!cur.bvm,
    foto: cur.foto || "",
    avaliacao: cur.avaliacao || "",
    semPatrimonio: !!cur.semPatrimonio || cur.patrimonio === "Sem número",
    naBase: !!cur.naBase
  };
},

oficioCapturarFoto: function (e) {
  var self = this;
  var file = e.target.files && e.target.files[0];
  if (file) API.processarFoto(file).then(function (foto) { self.oficioItemForm.foto = foto; });
},

oficioColarFoto: function (e) {
  var self = this;
  var items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  this._extrairImagemClipboard(items, function (blob) {
    API.processarFoto(blob).then(function (foto) { self.oficioItemForm.foto = foto; });
  });
},

oficioConfirmarItem: function () {
  var self = this;
  var f = this.oficioItemForm;
  if (!f.patrimonio) { alert("Informe o patrimônio."); return; }
  if (!f.descricao || !String(f.descricao).trim()) { alert("Informe a descrição."); return; }
  if (f.patrimonio !== "Sem número") {
    var existe = this.itens.some(function (i) { return String(i.patrimonio) === String(f.patrimonio); });
    if (existe) { alert("Este patrimônio já está neste processo."); return; }
  }
  var payload = {
    patrimonio: f.semPatrimonio ? "Sem número" : f.patrimonio,
    descricao: String(f.descricao).trim(),
    tamanho: f.tamanho || null,
    viavel: !!f.viavel,
    bvm: !!f.bvm,
    foto: f.foto || "",
    avaliacao: f.avaliacao || null,
    semPatrimonio: !!f.semPatrimonio
  };
  this.loading = true;
  API.salvarItem(payload, this.processoId).then(function (salvo) {
    self.itens.unshift(salvo);
    self.oficioConfirmados += 1;
    self.loading = false;
    self.oficioAvancarFila(true);
  }).catch(function (err) {
    self.loading = false;
    alert("Erro ao salvar item: " + (err && err.message ? err.message : ""));
  });
},

oficioPularItem: function () {
  // mantém na fila: move para o fim
  if (!this.oficioFila.length) return;
  var cur = this.oficioFila.splice(this.oficioFilaIndex, 1)[0];
  this.oficioFila.push(cur);
  if (this.oficioFilaIndex >= this.oficioFila.length) this.oficioFilaIndex = 0;
  this.oficioCarregarItemAtual();
},

oficioRemoverDaFila: function () {
  if (!this.oficioFila.length) return;
  this.oficioFila.splice(this.oficioFilaIndex, 1);
  if (this.oficioFila.length === 0) {
    this.oficioPasso = 4;
    return;
  }
  if (this.oficioFilaIndex >= this.oficioFila.length) this.oficioFilaIndex = 0;
  this.oficioCarregarItemAtual();
},

oficioAvancarFila: function (removeAtual) {
  if (removeAtual) this.oficioFila.splice(this.oficioFilaIndex, 1);
  if (this.oficioFila.length === 0) {
    this.oficioPasso = 4;
    return;
  }
  if (this.oficioFilaIndex >= this.oficioFila.length) this.oficioFilaIndex = 0;
  this.oficioCarregarItemAtual();
},
```

**Nota:** se `API.mascaraSEI` não estiver no objeto `API`, usar a função global `mascaraSEI` já existente em `api.js` (confirmar export; se não exportada, chamar `mascaraSEI` direto ou exportar).

- [ ] **Step 4: Commit**

```bash
git add app.js index.html
git commit -m "feat: estado e métodos da aba Ofício"
```

---

### Task 5: UI da aba Ofício em `index.html`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Botão na navbar** (junto aos outros, após Processo ou antes de Backup)

```html
<button x-on:click="aba = 'oficio'" x-bind:class="aba === 'oficio' ? 'tab-active' : 'text-slate-400'" class="px-3 py-2 text-[10px] uppercase flex flex-col items-center transition-all">
    <span>📄</span><span>Ofício</span>
</button>
```

(Preferir ícone/texto sem emoji se o restante da navbar não usar emoji — espelhar o padrão visual das abas existentes.)

- [ ] **Step 2: Painel da aba** (após a aba `processo` ou antes de `itens`)

Implementar quatro blocos `x-show="aba === 'oficio' && oficioPasso === N"`:

1. **Passo 1:** textarea `x-model="oficioTexto"`, botão Extrair, `x-show="oficioErro"`, loading `oficioExtraindo`
2. **Passo 2:** campos SEI / unidade (datalist ou select das `unidades_db`) / campus select / bloco select / sala; banner se `oficioProcessoExistente`; lista `oficioAvisos`; botões Voltar / Salvar processo
3. **Passo 3:** indicador “Item X de Y”; form do item (patrimônio, descrição, tamanho P/M/G/GG, foto opcional, avaliação opcional, viável/BVM); botões Confirmar / Pular / Remover
4. **Passo 4:** resumo + botões “Ir para Itens”, “Novo ofício” (`oficioReset()`), “Classificação prévia”

Reutilizar classes Tailwind já usadas nas abas Processo/Itens (cards brancos, `border-t-4`, inputs `rounded-lg`).

- [ ] **Step 3: Bump cache-buster do `app.js`**

```html
<script src="app.js?v=oficio-1"></script>
```

- [ ] **Step 4: Smoke visual local**

Abrir `index.html` (ou GitHub Pages após deploy da function), ir em Ofício, colar o ofício de exemplo da spec (CTIC / 707657), verificar passos 1→2.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: UI da aba Ofício (colar, revisar, fila, pronto)"
```

---

### Task 6: Deploy Netlify + checklist E2E

**Files:** nenhum código novo (configuração)

- [ ] **Step 1: Configurar no Netlify (projeto `gregarious-boba-7c3368`)**

Site settings → Environment variables:

- `OPENAI_API_KEY`
- `ALLOWED_ORIGIN=https://cpetrag.github.io`
- `OPENAI_MODEL=gpt-4o-mini` (opcional)

Fazer deploy da function (`extrair-oficio`).

- [ ] **Step 2: Push do frontend**

```bash
git push origin main
```

Aguardar GitHub Pages.

- [ ] **Step 3: Checklist E2E manual**

1. Colar ofício CTIC com patrimônio 707657 → extrai SEI e item  
2. Revisar processo → salvar  
3. Confirmar item sem foto e sem avaliação → item aparece na aba Itens  
4. Colar de novo o mesmo SEI → detecta existente, não duplica patrimônios já salvos  
5. DevTools → Network: request vai para Netlify; nenhum header `Authorization: Bearer sk-` no frontend  
6. Item com patrimônio inexistente na base → descrição do ofício editável  

- [ ] **Step 4: Commit final se houver ajustes de polish**

```bash
git add -u
git commit -m "fix: polish Colar ofício após E2E"
```

---

## Self-review (plan vs spec)

| Requisito da spec | Task |
|---|---|
| Aba Ofício dedicada | 5 |
| Colar texto + Extrair IA | 2, 3, 4, 5 |
| Netlify proxy (chave no servidor) | 2, 6 |
| Revisar + salvar processo | 4, 5 |
| SEI existente → carregar / enfileirar novos | 4 |
| Fila item a item | 4, 5 |
| Foto opcional | 4, 5 |
| Avaliação opcional | 4, 5 |
| Tamanho sugerido + null no banco | 1, 3, 4 |
| Match campus/bloco/unidade | 1, 4 |
| base.csv para descrição | 1, 4 |
| Sem PDF/OCR, sem lote faltantes, sem SharePoint auto | respeitado (fora do plano) |
| EXTRAIR_OFICIO_URL em config | 3 |
| Critérios de sucesso / CORS | 2, 6 |

Placeholders: nenhum TBD/TODO de implementação deixado nos steps.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-02-colar-oficio.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration  
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints  

Which approach?
