var ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";
var POWER_AUTOMATE_URL = process.env.POWER_AUTOMATE_URL || "";

function json(statusCode, body, extraHeaders) {
    return {
        statusCode: statusCode,
        headers: Object.assign({
            "Content-Type": "application/json"
        }, extraHeaders || {}),
        body: JSON.stringify(body)
    };
}

function isValidPayload(payload) {
    return !!(
        payload &&
        typeof payload === "object" &&
        typeof payload.SEI === "string" &&
        payload.SEI.trim().length >= 20 &&
        typeof payload.Patrimonio === "string" &&
        payload.Patrimonio.trim().length > 0
    );
}

exports.handler = async function(event) {
    if (!POWER_AUTOMATE_URL) {
        return json(500, { ok: false, error: "POWER_AUTOMATE_URL não configurada." });
    }

    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 204,
            headers: {
                "Access-Control-Allow-Origin": ALLOWED_ORIGIN || "*",
                "Access-Control-Allow-Methods": "POST,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        };
    }

    if (event.httpMethod !== "POST") {
        return json(405, { ok: false, error: "Method Not Allowed" });
    }

    var origin = event.headers.origin || event.headers.Origin || "";
    if (ALLOWED_ORIGIN && origin !== ALLOWED_ORIGIN) {
        return json(403, { ok: false, error: "Forbidden origin" });
    }

    var payload;
    try {
        payload = JSON.parse(event.body || "{}");
    } catch (err) {
        return json(400, { ok: false, error: "JSON inválido" });
    }

    if (!isValidPayload(payload)) {
        return json(400, { ok: false, error: "Payload inválido" });
    }

    try {
        var response = await fetch(POWER_AUTOMATE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            var bodyText = await response.text().catch(function() { return ""; });
            return json(502, { ok: false, error: bodyText || ("Falha no Power Automate: " + response.status) }, {
                "Access-Control-Allow-Origin": ALLOWED_ORIGIN || "*"
            });
        }

        return json(200, { ok: true }, {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN || "*"
        });
    } catch (err2) {
        return json(500, { ok: false, error: err2 && err2.message ? err2.message : "Erro interno" }, {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN || "*"
        });
    }
};
