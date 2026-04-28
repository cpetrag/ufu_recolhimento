// =============================================
// CONFIGURAÇÃO
// =============================================
var APP_CONFIG = window.APP_CONFIG || {};
var SUPABASE_URL = APP_CONFIG.SUPABASE_URL || "";
var SUPABASE_KEY = APP_CONFIG.SUPABASE_KEY || "";
var SHAREPOINT_PROXY_URL = APP_CONFIG.SHAREPOINT_PROXY_URL || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Configuração ausente: defina SUPABASE_URL e SUPABASE_KEY em window.APP_CONFIG.");
}

var db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =============================================
// AUXILIARES
// =============================================
function mascaraSEI(v) {
    v = v.replace(/\D/g, "");
    if (v.length > 17) v = v.substring(0, 17);
    v = v.replace(/^(\d{5})(\d)/, "$1.$2");
    v = v.replace(/^(\d{5})\.(\d{6})(\d)/, "$1.$2/$3");
    v = v.replace(/^(\d{5})\.(\d{6})\/(\d{4})(\d)/, "$1.$2/$3-$4");
    return v;
}

function processarFoto(file) {
    return new Promise(function(resolve) {
        var reader = new FileReader();
        reader.onload = function(event) {
            var img = new Image();
            img.onload = function() {
                var canvas = document.createElement("canvas");
                var MAX = 1024; var w = img.width, h = img.height;
                if (w > MAX) { h *= MAX / w; w = MAX; }
                canvas.width = w; canvas.height = h;
                canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", 0.7));
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// =============================================
// SUPABASE
// =============================================
function carregarCampus() {
    return db.from("campus").select("*").order("nome").then(function(r) { return r.data || []; });
}
function carregarUnidades() {
    return db.from("unidades").select("*").order("nome").then(function(r) { return r.data || []; });
}
function carregarBlocos(campusId) {
    if (!campusId) return Promise.resolve([]);
    return db.from("blocos").select("*").eq("campus_id", campusId).order("nome").then(function(r) { return r.data || []; });
}
function buscarProcessoPorSEI(sei) {
    if (sei.length < 20) return Promise.resolve(null);
    return db.from("processos").select("*").eq("sei", sei).maybeSingle().then(function(r) { return r.data; });
}
function carregarItensProcesso(processoId) {
    return db.from("patrimonios").select("*").eq("processo_id", processoId).order("created_at", { ascending: false }).then(function(r) { return r.data || []; });
}
function carregarItensProcessoCompleto(processoId) {
    return db.from("patrimonios").select("*").eq("processo_id", processoId).order("created_at", { ascending: true }).then(function(r) { return r.data || []; });
}
function salvarProcesso(processo) {
    return db.from("processos").upsert([{
        sei: processo.sei, pro_reitoria_unidade: processo.pro_reitoria_unidade,
        campus_id: processo.campus_id || null, bloco_id: processo.bloco_id || null, sala: processo.sala
    }], { onConflict: "sei" }).select().single().then(function(r) {
        if (r.error) throw r.error; return r.data;
    });
}
function salvarItem(item, processoId) {
    return db.from("patrimonios").insert([{
        patrimonio: item.patrimonio, descricao: item.descricao, tamanho: item.tamanho,
        viavel: item.viavel, bvm: item.bvm, foto: item.foto, processo_id: processoId
    }]).select().single().then(function(r) {
        if (r.error) throw r.error; return r.data;
    });
}
function editarItem(itemId, campos) {
    return db.from("patrimonios").update(campos).eq("id", itemId).select().single().then(function(r) {
        if (r.error) throw r.error; return r.data;
    });
}
function excluirItem(itemId) {
    return db.from("patrimonios").delete().eq("id", itemId).then(function(r) {
        if (r.error) throw r.error; return true;
    });
}
function excluirProcesso(processoId) {
    return db.from("patrimonios").delete().eq("processo_id", processoId).then(function(r) {
        if (r.error) throw r.error;
        return db.from("processos").delete().eq("id", processoId).then(function(r2) {
            if (r2.error) throw r2.error; return true;
        });
    });
}
function listarProcessos() {
    return db.from("processos").select("*").order("created_at", { ascending: false }).then(function(res) {
        var processos = res.data || [];
        if (processos.length === 0) return [];
        var ids = processos.map(function(p) { return p.id; });

        // Pagina de 1000 em 1000 para nao truncar com muitos itens
        function buscarPagina(from, acumulado) {
            return db.from("patrimonios")
                .select("processo_id, enviado_sharepoint")
                .in("processo_id", ids)
                .range(from, from + 999)
                .then(function(r) {
                    var pagina = r.data || [];
                    var total = acumulado.concat(pagina);
                    if (pagina.length === 1000) {
                        return buscarPagina(from + 1000, total);
                    }
                    return total;
                });
        }

        return buscarPagina(0, []).then(function(itens) {
            return processos.map(function(p) {
                var seus = itens.filter(function(i) { return i.processo_id === p.id; });
                var enviados = seus.filter(function(i) { return i.enviado_sharepoint; }).length;
                return Object.assign({}, p, {
                    total_itens: seus.length,
                    enviados_sharepoint: enviados,
                    status_envio: seus.length === 0 ? "vazio"
                               : enviados === seus.length ? "completo"
                               : enviados > 0 ? "parcial" : "pendente"
                });
            });
        });
    });
}

// =============================================
// SHAREPOINT
// =============================================
function enviarItemSharePoint(processo, item) {
    if (!SHAREPOINT_PROXY_URL) {
        return Promise.resolve({ ok: false, erro: "SHAREPOINT_PROXY_URL não configurada." });
    }
    var payload = {
        SEI: processo.sei, Unidade: processo.pro_reitoria_unidade || "",
        Sala: processo.sala || "", Patrimonio: String(item.patrimonio),
        Descricao: item.descricao || "", Tamanho: item.tamanho || "",
        Viavel: item.viavel ? "Sim" : "Não", BVM: item.bvm ? "Sim" : "Não",
        FotoBase64: item.foto || "", DataRegistro: new Date().toISOString()
    };
    return fetch(SHAREPOINT_PROXY_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }).then(function(response) {
        if (response.ok) {
            return db.from("patrimonios").update({ enviado_sharepoint: true }).eq("id", item.id).then(function(updateRes) {
                if (updateRes.error) return { ok: false, erro: updateRes.error.message || "Erro ao atualizar status no banco." };
                return { ok: true };
            });
        }
        return response.text().then(function(body) {
            return { ok: false, erro: body || ("Falha no proxy SharePoint: " + response.status) };
        }).catch(function() {
            return { ok: false, erro: "Falha no proxy SharePoint: " + response.status };
        });
    }).catch(function(err) { return { ok: false, erro: err.message }; });
}

function enviarParaSharePoint(processo, itens) {
    var pendentes = itens.filter(function(i) { return !i.enviado_sharepoint; });
    if (pendentes.length === 0) return Promise.resolve([]);
    var resultados = [];
    return Promise.all(pendentes.map(function(item) {
        return enviarItemSharePoint(processo, item).then(function(r) {
            resultados.push(Object.assign({ patrimonio: item.patrimonio }, r));
        });
    })).then(function() { return resultados; });
}

// =============================================
// EXPORTAR
// =============================================
window.API = {
    db: db,
    mascaraSEI: mascaraSEI, processarFoto: processarFoto,
    carregarCampus: carregarCampus, carregarUnidades: carregarUnidades, carregarBlocos: carregarBlocos,
    buscarProcessoPorSEI: buscarProcessoPorSEI,
    carregarItensProcesso: carregarItensProcesso, carregarItensProcessoCompleto: carregarItensProcessoCompleto,
    salvarProcesso: salvarProcesso, salvarItem: salvarItem,
    editarItem: editarItem, excluirItem: excluirItem, excluirProcesso: excluirProcesso,
    listarProcessos: listarProcessos,
    enviarItemSharePoint: enviarItemSharePoint, enviarParaSharePoint: enviarParaSharePoint
};
