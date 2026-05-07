var SUPABASE_URL = process.env.SUPABASE_URL || "";
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "";
var POWER_AUTOMATE_BACKUP_URL = process.env.POWER_AUTOMATE_BACKUP_URL || "";
var ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";
var BACKUP_TRIGGER_TOKEN = process.env.BACKUP_TRIGGER_TOKEN || "";

var BACKUP_VERSION = "1.0";
var MAX_CHUNK_BYTES = 80 * 1024 * 1024;
var SUPABASE_PAGE_SIZE = 200;

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN || "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
}

function jsonResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders()),
        body: JSON.stringify(body)
    };
}

function sanitizarSEI(sei) {
    return String(sei || "sem_sei").replace(/[\\/:*?"<>|]/g, "_");
}

async function supabaseFetch(path) {
    var url = SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/" + path;
    var res = await fetch(url, {
        headers: {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": "Bearer " + SUPABASE_SERVICE_KEY,
            "Accept": "application/json",
            "Content-Profile": "public"
        }
    });
    if (!res.ok) {
        var txt = await res.text().catch(function() { return ""; });
        throw new Error("Supabase " + res.status + ": " + txt);
    }
    return res.json();
}

async function buscarTabelaSimples(tabela, colunas) {
    return supabaseFetch(tabela + "?select=" + (colunas || "*"));
}

async function buscarPaginado(tabela, colunas) {
    var todos = [];
    var from = 0;
    while (true) {
        var to = from + SUPABASE_PAGE_SIZE - 1;
        var url = SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/" + tabela + "?select=" + (colunas || "*") + "&order=created_at.asc.nullslast";
        var res = await fetch(url, {
            headers: {
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": "Bearer " + SUPABASE_SERVICE_KEY,
                "Range-Unit": "items",
                "Range": from + "-" + to,
                "Accept": "application/json"
            }
        });
        if (!res.ok && res.status !== 206) {
            var txt = await res.text().catch(function() { return ""; });
            throw new Error("Supabase " + res.status + ": " + txt);
        }
        var lote = await res.json();
        todos = todos.concat(lote);
        if (lote.length < SUPABASE_PAGE_SIZE) break;
        from += SUPABASE_PAGE_SIZE;
    }
    return todos;
}

function dataDoDia() {
    var d = new Date();
    var pad = function(n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function dividirEmChunks(processos, patrimoniosPorProcesso) {
    var chunks = [];
    var atual = { processos: [], itens: [] };
    var atualBytes = 200;

    function tamanhoBytes(obj) {
        try { return Buffer.byteLength(JSON.stringify(obj), "utf8"); } catch (e) { return 0; }
    }

    for (var i = 0; i < processos.length; i++) {
        var proc = processos[i];
        var itens = patrimoniosPorProcesso[proc.id] || [];
        var procBytes = tamanhoBytes(proc) + tamanhoBytes(itens) + 10;

        if (procBytes > MAX_CHUNK_BYTES) {
            if (atual.processos.length > 0) { chunks.push(atual); atual = { processos: [], itens: [] }; atualBytes = 200; }
            var subchunkAtual = { processo: proc, itens: [] };
            var subchunkBytes = tamanhoBytes(proc) + 200;
            for (var j = 0; j < itens.length; j++) {
                var itemBytes = tamanhoBytes(itens[j]) + 10;
                if (subchunkBytes + itemBytes > MAX_CHUNK_BYTES && subchunkAtual.itens.length > 0) {
                    chunks.push({ processos: [subchunkAtual.processo], itens: subchunkAtual.itens, parcial: true });
                    subchunkAtual = { processo: proc, itens: [] };
                    subchunkBytes = tamanhoBytes(proc) + 200;
                }
                subchunkAtual.itens.push(itens[j]);
                subchunkBytes += itemBytes;
            }
            if (subchunkAtual.itens.length > 0) {
                chunks.push({ processos: [subchunkAtual.processo], itens: subchunkAtual.itens, parcial: true });
            }
            continue;
        }

        if (atualBytes + procBytes > MAX_CHUNK_BYTES && atual.processos.length > 0) {
            chunks.push(atual);
            atual = { processos: [], itens: [] };
            atualBytes = 200;
        }
        atual.processos.push(proc);
        atual.itens = atual.itens.concat(itens);
        atualBytes += procBytes;
    }
    if (atual.processos.length > 0) chunks.push(atual);
    return chunks;
}

async function enviarChunk(payload) {
    var res = await fetch(POWER_AUTOMATE_BACKUP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        var txt = await res.text().catch(function() { return ""; });
        throw new Error("Power Automate " + res.status + ": " + (txt || "sem corpo"));
    }
    return true;
}

async function executarBackup(trigger) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_KEY não configurados.");
    if (!POWER_AUTOMATE_BACKUP_URL) throw new Error("POWER_AUTOMATE_BACKUP_URL não configurada.");

    var inicio = Date.now();
    var dia = dataDoDia();

    var resultados = await Promise.all([
        buscarTabelaSimples("campus"),
        buscarTabelaSimples("blocos"),
        buscarTabelaSimples("unidades"),
        buscarPaginado("processos"),
        buscarPaginado("patrimonios")
    ]);
    var campus = resultados[0];
    var blocos = resultados[1];
    var unidades = resultados[2];
    var processos = resultados[3];
    var patrimonios = resultados[4];

    var porProcesso = {};
    for (var i = 0; i < patrimonios.length; i++) {
        var pid = patrimonios[i].processo_id;
        if (!porProcesso[pid]) porProcesso[pid] = [];
        porProcesso[pid].push(patrimonios[i]);
    }

    var chunks = dividirEmChunks(processos, porProcesso);
    var totalChunks = chunks.length + 1;

    var manifest = {
        SEI: "23117.000000/0000-00",
        Patrimonio: "MANIFEST",
        BackupVersion: BACKUP_VERSION,
        BackupDate: dia,
        BackupTrigger: trigger || "scheduled",
        BackupGeneratedAt: new Date().toISOString(),
        FileType: "manifest",
        FileName: "Backup/" + dia + "/00_manifest.json",
        ChunkIndex: 0,
        ChunkTotal: totalChunks,
        ChunkContent: JSON.stringify({
            version: BACKUP_VERSION,
            generated_at: new Date().toISOString(),
            trigger: trigger || "scheduled",
            counts: {
                campus: campus.length, blocos: blocos.length, unidades: unidades.length,
                processos: processos.length, patrimonios: patrimonios.length
            },
            chunks: chunks.length,
            reference_tables: { campus: campus, blocos: blocos, unidades: unidades }
        })
    };
    await enviarChunk(manifest);

    var enviados = 1;
    for (var c = 0; c < chunks.length; c++) {
        var ck = chunks[c];
        var seqProc = ck.processos.length === 1 ? sanitizarSEI(ck.processos[0].sei) : "lote_" + String(c + 1).padStart(3, "0");
        var sufixo = ck.parcial ? "_parte_" + (c + 1) : "";
        var nome = "Backup/" + dia + "/" + seqProc + sufixo + ".json";
        var conteudo = {
            version: BACKUP_VERSION,
            generated_at: new Date().toISOString(),
            chunk_index: c + 1,
            chunk_total: totalChunks,
            data: { processos: ck.processos, patrimonios: ck.itens }
        };
        var payload = {
            SEI: ck.processos[0].sei || "23117.000000/0000-00",
            Patrimonio: ck.processos.length === 1 ? "BACKUP_PROC" : "BACKUP_LOTE",
            BackupVersion: BACKUP_VERSION,
            BackupDate: dia,
            FileType: "data",
            FileName: nome,
            ChunkIndex: c + 1,
            ChunkTotal: totalChunks,
            ChunkContent: JSON.stringify(conteudo)
        };
        await enviarChunk(payload);
        enviados++;
    }

    return {
        ok: true,
        trigger: trigger || "scheduled",
        date: dia,
        duration_ms: Date.now() - inicio,
        processos: processos.length,
        patrimonios: patrimonios.length,
        chunks_enviados: enviados,
        chunks_total: totalChunks
    };
}

exports.handler = async function(event) {
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers: corsHeaders() };
    }

    var trigger = "scheduled";
    if (event.httpMethod === "POST") {
        var origin = event.headers.origin || event.headers.Origin || "";
        if (ALLOWED_ORIGIN && origin && origin !== ALLOWED_ORIGIN) {
            return jsonResponse(403, { ok: false, error: "Forbidden origin" });
        }
        if (BACKUP_TRIGGER_TOKEN) {
            var auth = event.headers.authorization || event.headers.Authorization || "";
            if (auth !== "Bearer " + BACKUP_TRIGGER_TOKEN) {
                return jsonResponse(401, { ok: false, error: "Unauthorized" });
            }
        }
        try {
            var body = event.body ? JSON.parse(event.body) : {};
            trigger = body.trigger || "manual";
        } catch (e) { trigger = "manual"; }
    } else if (event.httpMethod !== "GET" && !event.isScheduled) {
        return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
    }

    try {
        var resultado = await executarBackup(trigger);
        return jsonResponse(200, resultado);
    } catch (err) {
        return jsonResponse(500, { ok: false, error: err && err.message ? err.message : "Erro interno" });
    }
};
