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
    var i, n, item, melhor = null, melhorScore = -1, score;

    for (i = 0; i < lista.length; i++) {
      item = lista[i];
      n = normalizar(item.nome);
      if (!n) continue;
      if (n === t) return item; // match exato sempre vence

      score = -1;
      if (n.indexOf(t) === 0 || t.indexOf(n) === 0) {
        // um começa com o outro — favorece o nome mais longo (mais específico)
        score = 200 + Math.min(n.length, t.length);
      } else if (n.indexOf(t) !== -1 || t.indexOf(n) !== -1) {
        // contains — nomes genéricos curtos (ex.: "instituto") perdem para "instituto de quimica"
        score = 100 + Math.min(n.length, t.length);
      }

      if (score > melhorScore) {
        melhorScore = score;
        melhor = item;
      } else if (score === melhorScore && melhor && n.length > normalizar(melhor.nome).length) {
        melhor = item;
      }
    }

    // aliases de campus
    if (!melhor && (t.indexOf("santa monica") !== -1 || t.indexOf("sta monica") !== -1)) {
      for (i = 0; i < lista.length; i++) {
        if (normalizar(lista[i].nome).indexOf("santa monica") !== -1) return lista[i];
      }
    }
    return melhor;
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
