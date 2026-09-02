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
  { id: "u0", nome: "Instituto" },
  { id: "u1", nome: "Instituto de Química" },
  { id: "u2", nome: "Instituto de Física" }
];
assert.strictEqual(match.casarPorNome("Instituto de Química", unidades).id, "u1");
assert.strictEqual(match.casarPorNome("Instituto de Quimica", unidades).id, "u1");

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
