var ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";
var OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
var OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function json(statusCode, body, extraHeaders) {
    return {
        statusCode: statusCode,
        headers: Object.assign({
            "Content-Type": "application/json"
        }, extraHeaders || {}),
        body: JSON.stringify(body)
    };
}

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN || "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };
}

var SYSTEM_PROMPT = [
    "Você extrai dados de ofícios UFU de recolhimento/baixa de bens.",
    "Responda SOMENTE JSON válido (sem markdown) no formato:",
    '{"sei":"23117.000000/0000-00","unidade_texto":"","campus_texto":"","bloco_texto":"","sala_texto":"","itens":[{"patrimonio":"","descricao":"","tamanho_sugerido":"P|M|G|GG|null","confianca":0.0}],"avisos":[]}',
    "Regras: SEI no padrão 5.6/4-2 dígitos; patrimônios numéricos; tamanho_sugerido por porte físico do bem;",
    "sala_texto = trecho de local do ofício; se algo incerto, use avisos[] e deixe campo vazio."
].join(" ");

exports.handler = async function(event) {
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers: corsHeaders() };
    }
    if (event.httpMethod !== "POST") {
        return json(405, { ok: false, error: "Method Not Allowed" }, corsHeaders());
    }
    if (!OPENAI_API_KEY) {
        return json(500, { ok: false, error: "OPENAI_API_KEY não configurada." }, corsHeaders());
    }

    var origin = event.headers.origin || event.headers.Origin || "";
    if (ALLOWED_ORIGIN && origin && origin !== ALLOWED_ORIGIN) {
        return json(403, { ok: false, error: "Forbidden origin" }, corsHeaders());
    }

    var payload;
    try {
        payload = JSON.parse(event.body || "{}");
    } catch (e) {
        return json(400, { ok: false, error: "JSON inválido" }, corsHeaders());
    }
    var texto = payload && typeof payload.texto === "string" ? payload.texto.trim() : "";
    if (texto.length < 40) {
        return json(400, { ok: false, error: "Texto do ofício muito curto." }, corsHeaders());
    }
    if (texto.length > 30000) {
        return json(400, { ok: false, error: "Texto do ofício muito longo." }, corsHeaders());
    }

    try {
        var aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + OPENAI_API_KEY
            },
            body: JSON.stringify({
                model: OPENAI_MODEL,
                temperature: 0,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: texto }
                ]
            })
        });
        var aiBody = await aiRes.json().catch(function() { return {}; });
        if (!aiRes.ok) {
            var msg = (aiBody && aiBody.error && aiBody.error.message) || ("OpenAI HTTP " + aiRes.status);
            return json(502, { ok: false, error: msg }, corsHeaders());
        }
        var content = aiBody.choices && aiBody.choices[0] && aiBody.choices[0].message && aiBody.choices[0].message.content;
        var data = JSON.parse(content || "{}");
        if (!Array.isArray(data.itens)) data.itens = [];
        if (!Array.isArray(data.avisos)) data.avisos = [];
        return json(200, { ok: true, data: data }, corsHeaders());
    } catch (err) {
        return json(500, { ok: false, error: err && err.message ? err.message : "Erro interno" }, corsHeaders());
    }
};
