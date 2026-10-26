var assert = require("assert");
var path = require("path");
var Relatorio = require(path.join(__dirname, "..", "relatorio.js"));

var dados = {
  campus: [
    { id: "c1", nome: "Santa Mônica" },
    { id: "c2", nome: "Umuarama" }
  ],
  blocos: [{ id: "b1", nome: "1M" }],
  processos: [
    { id: "p2", sei: "23117.000002/2026-10", pro_reitoria_unidade: "FACOM", campus_id: "c2", bloco_id: null, sala: "12", recolhido: false },
    { id: "p1", sei: "23117.000001/2026-10", pro_reitoria_unidade: "FEMEC", campus_id: "c1", bloco_id: "b1", sala: "129", recolhido: false },
    { id: "p3", sei: "23117.000003/2026-10", pro_reitoria_unidade: "CTIC", campus_id: null, bloco_id: null, sala: "", recolhido: true }
  ],
  itens: [
    { id: "i2", processo_id: "p1", patrimonio: "200", descricao: "Mesa" },
    { id: "i1", processo_id: "p1", patrimonio: "10", descricao: "Cadeira" },
    { id: "i3", processo_id: "p2", patrimonio: "300", descricao: "Monitor" }
  ]
};

var linhas = Relatorio.montarLinhas(dados);
assert.strictEqual(linhas.length, 4);
var femec = linhas.filter(function (l) { return l.processoId === "p1"; });
assert.strictEqual(femec.length, 2);
assert.strictEqual(femec[0].campus, "Santa Mônica");
assert.strictEqual(femec[0].departamento, "FEMEC");
assert.strictEqual(femec[0].sala, "1M · 129");
assert.strictEqual(femec[0].totalItens, 2);

var semCampus = linhas.filter(function (l) { return l.processoId === "p3"; })[0];
assert.strictEqual(semCampus.campus, "Sem campus");
assert.strictEqual(semCampus.patrimonio, "");
assert.strictEqual(semCampus.recolhido, true);

var visiveis = Relatorio.filtrar(linhas, { incluirRecolhidos: false });
assert.strictEqual(visiveis.length, 3);

var porCampus = Relatorio.ordenar(visiveis, "campus", "asc");
assert.strictEqual(porCampus[0].campus, "Santa Mônica");
assert.strictEqual(porCampus[0].patrimonio, "10");
assert.strictEqual(porCampus[1].patrimonio, "200");
assert.strictEqual(porCampus[2].campus, "Umuarama");

var porItem = Relatorio.ordenar(visiveis, "item", "desc");
assert.strictEqual(porItem[0].patrimonio, "300");

var busca = Relatorio.filtrar(linhas, { busca: "santa monica", incluirRecolhidos: true });
assert.strictEqual(busca.length, 2);

var soFacom = Relatorio.filtrar(linhas, { departamento: "FACOM", incluirRecolhidos: false });
assert.strictEqual(soFacom.length, 1);

var resumo = Relatorio.resumir(visiveis);
assert.strictEqual(resumo.processos, 2);
assert.strictEqual(resumo.itens, 3);
assert.deepStrictEqual(Relatorio.paraTabela(soFacom)[0][4], "300");

var campi = Relatorio.opcoes(visiveis, "campus");
assert.deepStrictEqual(campi, ["Santa Mônica", "Umuarama"]);

var grupos = Relatorio.agrupar(porCampus);
assert.strictEqual(grupos.length, 2);
assert.strictEqual(grupos[0].campus, "Santa Mônica");
assert.strictEqual(grupos[0].processos, 1);
assert.strictEqual(grupos[0].itens, 2);
assert.strictEqual(grupos[0].departamentos[0].departamento, "FEMEC");
assert.strictEqual(grupos[0].departamentos[0].processos[0].itens[0].patrimonio, "10");
assert.strictEqual(grupos[0].departamentos[0].processos[0].itens[1].patrimonio, "200");
assert.strictEqual(grupos[1].campus, "Umuarama");
assert.strictEqual(grupos[1].departamentos[0].processos[0].processo, "23117.000002/2026-10");

var ordem = Relatorio.processosOrdenados(grupos);
assert.strictEqual(ordem.length, 2);
assert.strictEqual(ordem[0].campusNome, "Santa Mônica");
assert.strictEqual(ordem[0].pro_reitoria_unidade, "FEMEC");
assert.strictEqual(ordem[1].campusNome, "Umuarama");
assert.strictEqual(ordem[1].id, "p2");

console.log("relatorio.test.js ok");
