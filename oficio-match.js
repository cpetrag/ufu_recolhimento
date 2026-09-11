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

  var NOMES_GENERICOS = {
    instituto: true,
    faculdade: true,
    centro: true,
    diretoria: true,
    escola: true,
    orgao: true
  };

  function casarPorNome(texto, lista) {
    var t = normalizar(texto);
    if (!t || !lista || !lista.length) return null;
    var i, n, item, melhor = null, melhorScore = -1, score;

    for (i = 0; i < lista.length; i++) {
      item = lista[i];
      n = normalizar(item.nome);
      if (!n) continue;
      if (n === t) return item;

      score = -1;
      if (n.indexOf(t) === 0 || t.indexOf(n) === 0) {
        score = 200 + Math.min(n.length, t.length);
        // Evita "INSTITUTO" ganhar de "Instituto de Química"
        if (t.indexOf(n) === 0 && t.length > n.length + 2 && (NOMES_GENERICOS[n] || n.length <= 12)) {
          score = 20 + n.length;
        }
      } else if (n.indexOf(t) !== -1 || t.indexOf(n) !== -1) {
        score = 100 + Math.min(n.length, t.length);
        if (NOMES_GENERICOS[n] && t.length > n.length + 2) score = 15 + n.length;
      }

      // Alias: só quando o TEXTO buscado fala de Química / IQUFU (nunca pelo nome do cadastro sozinho)
      if (/quimica|iqufu|diriqufu/.test(t) && (n === "iqufu" || /quimica/.test(n))) {
        score = Math.max(score, 500);
      }

      if (score > melhorScore) {
        melhorScore = score;
        melhor = item;
      } else if (score === melhorScore && melhor && n.length > normalizar(melhor.nome).length) {
        melhor = item;
      }
    }

    if (!melhor && (t.indexOf("santa monica") !== -1 || t.indexOf("sta monica") !== -1)) {
      for (i = 0; i < lista.length; i++) {
        if (normalizar(lista[i].nome).indexOf("santa monica") !== -1) return lista[i];
      }
    }
    return melhor;
  }

  function casarUnidadeNoTexto(textoOficio, lista) {
    var t = normalizar(textoOficio);
    if (!t || !lista || !lista.length) return null;
    var i, n, melhor = null, melhorScore = -1, score;
    for (i = 0; i < lista.length; i++) {
      n = normalizar(lista[i].nome);
      if (!n || n.length < 4) continue;
      if (t.indexOf(n) === -1) continue;
      score = n.length;
      if (NOMES_GENERICOS[n] && /instituto de /.test(t)) score = 1; // quase ignora
      if (n === "iqufu" && /iqufu|diriqufu|instituto de quimica/.test(t)) score = 1000;
      if (score > melhorScore) {
        melhorScore = score;
        melhor = lista[i];
      }
    }
    return melhor;
  }

  /**
   * Escolhe o rótulo da unidade para o formulário.
   * No banco muitas vezes só existe "INSTITUTO" / "IQUFU"; o ofício traz "Instituto de Química".
   */
  function resolverNomeUnidade(textoOficio, unidadeTextoIa, lista) {
    var t = normalizar(textoOficio || "");
    var ia = String(unidadeTextoIa || "").trim();
    var iaN = normalizar(ia);

    // Preferência Química só com evidência explícita (não confundir outros institutos/faculdades).
    var iaEQuimica = /instituto de quimica|iqufu|diriqufu/.test(iaN);
    var textoEQuimica = /instituto de quimica/.test(t) || /(?:^|[^a-z])(?:dir)?iqufu(?:[^a-z]|$)/.test(t);
    if (iaEQuimica || textoEQuimica) {
      if (/instituto de quimica/.test(iaN) && ia) return ia;
      var mQuim = String(textoOficio || "").match(/Instituto\s+de\s+Qu[ií]mica/i);
      if (mQuim) return mQuim[0].replace(/\s+/g, " ").trim();
      if (iaEQuimica && ia && !NOMES_GENERICOS[iaN]) return ia;
      return "Instituto de Química";
    }

    // 1) Match pelo rótulo da IA (curto). 2) Scan do ofício por nomes da lista.
    var matched = (ia ? casarPorNome(ia, lista) : null) || casarUnidadeNoTexto(textoOficio, lista);
    if (matched) {
      var mn = normalizar(matched.nome);
      if (NOMES_GENERICOS[mn] && ia && iaN.length > mn.length && !NOMES_GENERICOS[iaN]) return ia;
      if (NOMES_GENERICOS[mn]) {
        var mInst = String(textoOficio || "").match(/Instituto\s+de\s+[A-Za-zÀ-ú]+(?:\s+(?:de\s+)?[A-Za-zÀ-ú]+){0,3}/i);
        if (mInst) return mInst[0].replace(/\s+/g, " ").trim();
        if (ia && !NOMES_GENERICOS[iaN]) return ia;
      }
      // Se a IA deu um nome mais específico que a sigla do banco, preferir a IA
      if (ia && iaN.length > mn.length && iaN.indexOf(mn) === -1 && mn.indexOf(iaN) === -1) {
        return ia;
      }
      return matched.nome;
    }
    return ia || "";
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

  return {
    normalizar: normalizar,
    casarPorNome: casarPorNome,
    casarUnidadeNoTexto: casarUnidadeNoTexto,
    resolverNomeUnidade: resolverNomeUnidade,
    casarBloco: casarBloco,
    acharNaBase: acharNaBase,
    enriquecerItem: enriquecerItem
  };
});
