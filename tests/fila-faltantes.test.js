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
