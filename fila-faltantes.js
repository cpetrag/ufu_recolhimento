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
