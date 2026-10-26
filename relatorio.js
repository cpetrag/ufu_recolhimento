// relatorio.js — linhas, filtros e ordenação do relatório de recolhimento
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Relatorio = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var CHAVES = {
    campus: ["campus", "departamento", "processo", "patrimonio"],
    departamento: ["departamento", "campus", "processo", "patrimonio"],
    processo: ["processo", "patrimonio", "campus", "departamento"],
    item: ["patrimonio", "descricao", "campus", "departamento", "processo"]
  };

  function normalizar(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function compararTexto(a, b) {
    return String(a || "").localeCompare(String(b || ""), "pt-BR", { sensitivity: "base", numeric: true });
  }

  function montarLinhas(dados) {
    dados = dados || {};
    var campusPorId = {};
    var blocoPorId = {};
    var itensPorProcesso = {};
    var linhas = [];

    (dados.campus || []).forEach(function (c) {
      campusPorId[c.id] = (c.nome || "").trim();
    });
    (dados.blocos || []).forEach(function (b) {
      blocoPorId[b.id] = (b.nome || "").trim();
    });
    (dados.itens || []).forEach(function (item) {
      var chave = item.processo_id;
      if (!itensPorProcesso[chave]) itensPorProcesso[chave] = [];
      itensPorProcesso[chave].push(item);
    });

    (dados.processos || []).forEach(function (processo) {
      var itens = itensPorProcesso[processo.id] || [];
      var bloco = blocoPorId[processo.bloco_id] || "";
      var sala = (processo.sala || "").trim();
      var base = {
        processoId: processo.id,
        campus: campusPorId[processo.campus_id] || "Sem campus",
        departamento: (processo.pro_reitoria_unidade || "").trim() || "Sem departamento",
        processo: processo.sei || "",
        sala: [bloco, sala].filter(Boolean).join(" · ") || "—",
        recolhido: !!processo.recolhido,
        totalItens: itens.length
      };

      if (!itens.length) {
        linhas.push(Object.assign({ _i: linhas.length }, base, {
          itemId: "",
          patrimonio: "",
          descricao: ""
        }));
        return;
      }

      itens.forEach(function (item) {
        linhas.push(Object.assign({ _i: linhas.length }, base, {
          itemId: item.id || "",
          patrimonio: item.patrimonio || "",
          descricao: item.descricao || ""
        }));
      });
    });

    return linhas;
  }

  function filtrar(linhas, filtros) {
    filtros = filtros || {};
    var busca = normalizar(filtros.busca);
    return (linhas || []).filter(function (linha) {
      if (!filtros.incluirRecolhidos && linha.recolhido) return false;
      if (filtros.campus && linha.campus !== filtros.campus) return false;
      if (filtros.departamento && linha.departamento !== filtros.departamento) return false;
      if (!busca) return true;
      var alvo = normalizar([
        linha.campus,
        linha.departamento,
        linha.processo,
        linha.sala,
        linha.patrimonio,
        linha.descricao
      ].join(" "));
      return alvo.indexOf(busca) !== -1;
    });
  }

  function ordenar(linhas, chave, direcao) {
    var ordem = CHAVES[chave] || CHAVES.campus;
    var fator = direcao === "desc" ? -1 : 1;
    return (linhas || []).slice().sort(function (a, b) {
      var i, cmp;
      for (i = 0; i < ordem.length; i++) {
        cmp = compararTexto(a[ordem[i]], b[ordem[i]]);
        if (cmp) return i === 0 ? cmp * fator : cmp;
      }
      return a._i - b._i;
    });
  }

  function opcoes(linhas, campo) {
    var visto = {};
    var lista = [];
    (linhas || []).forEach(function (linha) {
      var valor = linha[campo];
      if (!valor || visto[valor]) return;
      visto[valor] = true;
      lista.push(valor);
    });
    lista.sort(compararTexto);
    return lista;
  }

  function resumir(linhas) {
    var processos = {};
    var itens = 0;
    (linhas || []).forEach(function (linha) {
      processos[linha.processoId] = true;
      if (linha.patrimonio) itens += 1;
    });
    return {
      linhas: (linhas || []).length,
      processos: Object.keys(processos).length,
      itens: itens
    };
  }

  function agrupar(linhas) {
    var campi = [];
    var campusAtual = null;
    var deptoAtual = null;
    var procAtual = null;

    (linhas || []).forEach(function (linha) {
      if (!campusAtual || campusAtual.campus !== linha.campus) {
        campusAtual = { campus: linha.campus, departamentos: [], processos: 0, itens: 0 };
        campi.push(campusAtual);
        deptoAtual = null;
        procAtual = null;
      }
      if (!deptoAtual || deptoAtual.departamento !== linha.departamento) {
        deptoAtual = { departamento: linha.departamento, processos: [] };
        campusAtual.departamentos.push(deptoAtual);
        procAtual = null;
      }
      if (!procAtual || procAtual.processoId !== linha.processoId) {
        procAtual = {
          processoId: linha.processoId,
          processo: linha.processo,
          sala: linha.sala,
          totalItens: linha.totalItens,
          itens: []
        };
        deptoAtual.processos.push(procAtual);
        campusAtual.processos += 1;
      }
      if (linha.patrimonio || linha.descricao) {
        procAtual.itens.push({
          itemId: linha.itemId,
          patrimonio: linha.patrimonio,
          descricao: linha.descricao
        });
        campusAtual.itens += 1;
      }
    });

    return campi;
  }

  function processosOrdenados(grupos) {
    var lista = [];
    (grupos || []).forEach(function (campus) {
      (campus.departamentos || []).forEach(function (dep) {
        (dep.processos || []).forEach(function (proc) {
          lista.push({
            id: proc.processoId,
            sei: proc.processo,
            pro_reitoria_unidade: dep.departamento,
            sala: proc.sala,
            campusNome: campus.campus
          });
        });
      });
    });
    return lista;
  }

  function paraTabela(linhas) {
    return (linhas || []).map(function (linha) {
      return [
        linha.campus,
        linha.departamento,
        linha.processo,
        linha.sala,
        linha.patrimonio || "—",
        linha.descricao || "—",
        String(linha.totalItens)
      ];
    });
  }

  return {
    montarLinhas: montarLinhas,
    filtrar: filtrar,
    ordenar: ordenar,
    opcoes: opcoes,
    resumir: resumir,
    agrupar: agrupar,
    processosOrdenados: processosOrdenados,
    paraTabela: paraTabela
  };
});
