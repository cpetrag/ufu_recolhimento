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

var unidades = [
  { id: "u0", nome: "INSTITUTO" },
  { id: "u1", nome: "IQUFU" },
  { id: "u2", nome: "FACED" },
  { id: "u3", nome: "FACOM" },
  { id: "u4", nome: "CTIC" }
];

var oficioIqufu = "UNIVERSIDADE FEDERAL DE UBERLÂNDIA\nInstituto de Química\nOfício nº 157/2026/DIRIQUFU/IQUFU-UFU";
assert.strictEqual(
  match.resolverNomeUnidade(oficioIqufu, "Instituto de Química", unidades),
  "Instituto de Química"
);
assert.strictEqual(
  match.resolverNomeUnidade(oficioIqufu, "Instituto", unidades),
  "Instituto de Química"
);
assert.strictEqual(match.casarUnidadeNoTexto(oficioIqufu, unidades).nome, "IQUFU");

// Não forçar IQUFU em outros departamentos
assert.strictEqual(
  match.resolverNomeUnidade(
    "UNIVERSIDADE\nFaculdade de Computacao\nOficio 1/2026/FACOM-UFU",
    "Faculdade de Computacao",
    unidades
  ),
  "Faculdade de Computacao"
);
assert.strictEqual(
  match.resolverNomeUnidade(
    "UNIVERSIDADE\nFaculdade de Educacao\nFACED-UFU",
    "Faculdade de Educacao",
    unidades
  ),
  "Faculdade de Educacao"
);
assert.strictEqual(
  match.resolverNomeUnidade(
    "UNIVERSIDADE\nInstituto de Fisica\nINFIS-UFU",
    "Instituto de Fisica",
    unidades
  ),
  "Instituto de Fisica"
);
assert.strictEqual(
  match.casarPorNome("Faculdade de Computacao", unidades),
  null
);
assert.strictEqual(
  match.casarUnidadeNoTexto("Oficio FACOM-UFU Faculdade", unidades).nome,
  "FACOM"
);

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
