const express = require("express");
module.exports = function createStripchat(PUBLIC_URL) {
  const handlers = {};
  const builder = {
    defineCatalogHandler(fn) { handlers.catalog = fn; },
    defineMetaHandler(fn) { handlers.meta = fn; },
    defineStreamHandler(fn) { handlers.stream = fn; }
  };
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const PREFIX = "stripchat:";
const CACHE_MS = 60000;
const PAGE_SIZE = 80;
const MAX_PAGES = 8;

// v1.3.3 style: prefere URL direta da API; proxy só como fallback
function thumb(usuario, previewUrl) {
  if (
    previewUrl &&
    (previewUrl.startsWith("http://") || previewUrl.startsWith("https://"))
  ) {
    return previewUrl;
  }
  if (previewUrl && previewUrl.startsWith("/")) {
    return "https://static-proxy.strpst.com" + previewUrl;
  }
  return (
    PUBLIC_URL +
    "/stripchat/imagem/" +
    encodeURIComponent(usuario) +
    ".jpg"
  );
}

async function getJson(url) {
  const resposta = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Referer: "https://br.stripchat.com/men/brazilian",
      Origin: "https://stripchat.com"
    },
    signal: AbortSignal.timeout(25000)
  });

  if (!resposta.ok) {
    throw new Error("HTTP " + resposta.status + " em " + url);
  }

  return resposta.json();
}

let cache = {
  t: 0,
  data: []
};

// Lista masculina original, com o filtro Brasil aplicado permanentemente.
async function listarOnline() {
  if (Date.now() - cache.t < CACHE_MS && cache.data.length) return cache.data;
  const vistos = new Map();
  for (let pagina = 0; pagina < MAX_PAGES; pagina++) {
    const params = new URLSearchParams({
      removeShows: "false", recInFeatured: "false", limit: String(PAGE_SIZE),
      offset: String(pagina * PAGE_SIZE), sortBy: "stripRanking",
      primaryTag: "men", nic: "true"
    });
    const data = await getJson("https://stripchat.com/api/front/models?" + params);
    const models = Array.isArray(data?.models) ? data.models : [];
    for (const m of models) {
      const username = String(m.username || "").trim();
      const country = String(m.country || m.countryCode || "").toLowerCase();
      const status = String(m.status || "").toLowerCase();
      if (!username || country !== "br" || vistos.has(username)) continue;
      if (!["public", "groupshow", "group"].includes(status)) continue;
      vistos.set(username, {
        username, id: m.id || m.streamName,
        streamName: m.streamName || (m.id ? String(m.id) : null),
        country, status, viewers: Number(m.viewersCount) || 0,
        isHd: !!m.isHd, isMobile: !!m.isMobile, isVr: !!m.isVr,
        preview: m.previewUrlThumbBig || m.previewUrlThumbSmall || m.previewUrl || m.avatarUrl || "",
        title: m.groupShowTopic || ""
      });
    }
    if (models.length < PAGE_SIZE) break;
  }
  const lista = [...vistos.values()].sort((a,b) => b.viewers - a.viewers);
  cache = {t: Date.now(), data: lista};
  console.log("[Stripchat]", lista.length, "câmeras do Brasil");
  return lista;
}

builder.defineCatalogHandler(async function ({ extra }) {
  try {
    let usuarios = await listarOnline();

    // Busca por nome
    if (extra?.search) {
      const busca = String(extra.search).toLowerCase().trim();
      usuarios = usuarios.filter((u) =>
        u.username.toLowerCase().includes(busca)
      );
    }

    const skipInformado = parseInt(extra?.skip || "0", 10);
    const skip =
      Number.isFinite(skipInformado) && skipInformado >= 0
        ? skipInformado
        : 0;

    const metas = usuarios.slice(skip, skip + 100).map(function (u) {
      const descParts = [];
      if (u.viewers > 0) descParts.push(u.viewers + " espectadores");
      if (u.country) descParts.push(u.country.toUpperCase());
      if (u.isHd) descParts.push("HD");
      if (u.isMobile) descParts.push("Mobile");
      if (u.isVr) descParts.push("VR");
      if (u.title) descParts.push(u.title);

      const img = thumb(u.username, u.preview);
      return {
        id: PREFIX + u.username,
        type: "tv",
        name: u.username,
        poster: img,
        background: img,
        posterShape: "landscape",
        description: descParts.join(" · ")
      };
    });

    return { metas };
  } catch (erro) {
    console.error("[catalogo]", erro.message);
    return { metas: [] };
  }
});

// Meta: poster = preview do modelo; background = logo Stripchat Guys (fixo)
builder.defineMetaHandler(async function ({ id }) {
  if (typeof id !== "string" || !id.startsWith(PREFIX)) {
    return { meta: null };
  }

  const usuario = id.slice(PREFIX.length);

  const encontrar = (lista) =>
    lista.find(
      (modelo) =>
        modelo.username.toLowerCase() === usuario.toLowerCase()
    );

  // Prioriza a mesma imagem já usada no catálogo.
  let modelo = encontrar(cache.data);

  // Pode ocorrer ao abrir um favorito após reiniciar o servidor.
  if (!modelo?.preview) {
    try {
      const lista = await listarOnline();
      modelo = encontrar(lista) || modelo;
    } catch (erro) {
      console.error(
        "[Stripchat meta] Falha ao atualizar catálogo:",
        erro.message
      );
    }
  }

  let imageUrl = thumb(usuario, modelo?.preview);

  // Só consulta os detalhes da câmera se não houver preview no catálogo.
  if (!modelo?.preview) {
    try {
      const userData = await getJson(
        "https://stripchat.com/api/front/users/user-ids/" +
          encodeURIComponent(usuario)
      );

      if (userData?.id) {
        const camData = await getJson(
          "https://stripchat.com/api/front/v2/models/" +
            userData.id +
            "/cam"
        );

        const user =
          camData?.user?.user ||
          camData?.user ||
          {};

        const preview =
          user.previewUrlThumbBig ||
          user.previewUrlThumbSmall ||
          user.previewUrl ||
          user.avatarUrl ||
          user.avatarUrlOriginal;

        if (preview) {
          imageUrl = thumb(usuario, preview);
        }
      }
    } catch (erro) {
      console.error(
        "[Stripchat meta] Falha ao buscar preview:",
        erro.message
      );
    }
  }

  console.log("[Stripchat meta]", usuario, "imagem:", imageUrl);

  return {
    meta: {
      id,
      type: "tv",
      name: usuario,
      poster: imageUrl,
      background: imageUrl,
      posterShape: "landscape",
      description: modelo
        ? `${modelo.viewers || 0} espectadores · Brasil`
        : "Transmissão ao vivo · Brasil",
      behaviorHints: {
        isLive: true
      }
    },
    cacheMaxAge: 0
  };
});

// Resolve streamName a partir do username
async function resolveStreamName(usuario) {
  let modelId = null;
  let streamName = null;

  try {
    const userData = await getJson(
      "https://stripchat.com/api/front/users/user-ids/" +
        encodeURIComponent(usuario)
    );
    if (userData && userData.id) modelId = userData.id;
  } catch (e) {}

  let camData = null;
  if (modelId) {
    try {
      camData = await getJson(
        "https://stripchat.com/api/front/v2/models/" + modelId + "/cam"
      );
    } catch (e) {}
  }

  if (!camData) {
    try {
      camData = await getJson(
        "https://stripchat.com/api/front/v2/models/username/" +
          encodeURIComponent(usuario) +
          "/cam"
      );
    } catch (e) {}
  }

  if (camData) {
    streamName =
      camData.streamName ||
      (camData.cam && camData.cam.streamName) ||
      (camData.user && camData.user.streamName) ||
      modelId;
  }

  if (!streamName && modelId) streamName = String(modelId);
  if (!streamName) {
    const known = cache.data.find(m => m.username.toLowerCase() === usuario.toLowerCase());
    streamName = known?.streamName || known?.id;
  }
  if (!streamName) throw new Error("Stream não resolvido: " + usuario);

  return String(streamName);
}

builder.defineStreamHandler(async function ({ id }) {
  if (typeof id !== "string" || !id.startsWith(PREFIX)) {
    return { streams: [] };
  }

  const usuario = id.slice(PREFIX.length);

  try {
    // Aponta para o nosso proxy de playlist (mais estável que URL direta)
    const proxyUrl = PUBLIC_URL + "/stripchat/proxy/" + encodeURIComponent(usuario) + "/master.m3u8";

    return {
      streams: [
        {
          name: "Stripchat",
          title: "Ao vivo • HLS (proxy)",
          url: proxyUrl,
          behaviorHints: {
            notWebReady: false, // tenta player interno primeiro
            bingeGroup: "stripchat-live"
          }
        }
      ]
    };
  } catch (erro) {
    console.error("[stream]", usuario, erro.message);
    return { streams: [] };
  }
});

const app = express.Router();

// ========== PROXY HLS COM DECRYPT MOUFLON ==========

const crypto = require("crypto");

// Chaves pkey → pdkey (atualizadas da comunidade kesamom/stripchat_mouflon)
// Serão atualizadas automaticamente se possível
let MOUFLON_KEYS = {
  Zokee2OhPh9kugh4: "Quean4cai9boJa5a",
  Zeechoej4aleeshi: "ubahjae7goPoodi6",
  Ook7quaiNgiyuhai: "EQueeGh2kaewa3ch",
  Fq6m2TO2ZeBkRPm9: "xb6di1NF9EFXHUwb",
  GrRncsoByZmsiT6L: "NigHYyOD9l4rvAEb",
  "1Dzcc6OjP73LKbtI": "Y64UVwX5RrIWnOLp",
  N2oLovTIXb0o28Uj: "ABE7Sj8jh3oPM2ae",
  NTK9aqcLmNFMWrpQ: "tOcYOap4Ty1l9Jzb",
  "7uUnbD0jMCB9GH32": "lzCQ6QBTnLpB0zMF",
  Ohi7eTRBpkAuML0l: "kExe29N2sLFrHGqu",
  OLzu7QlySkG2fVRn: "CsovScFH9VirSJ4Z"
};

let keysLastFetch = 0;

async function refreshMouflonKeys() {
  if (Date.now() - keysLastFetch < 30 * 60 * 1000) return; // 30 min
  try {
    const r = await fetch(
      "https://raw.githubusercontent.com/kesamom/stripchat_mouflon/main/stripchat_mouflon_keys.json",
      { signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) {
      const data = await r.json();
      if (data && typeof data === "object") {
        MOUFLON_KEYS = { ...MOUFLON_KEYS, ...data };
        keysLastFetch = Date.now();
        console.log("[mouflon] keys refreshed, total:", Object.keys(MOUFLON_KEYS).length);
      }
    }
  } catch (e) {
    // mantém as chaves embutidas
  }
}

// Decripta token MOUFLON v2
function mouflonDecode(encryptedB64, pdkey) {
  const hash = crypto.createHash("sha256").update(pdkey, "utf8").digest();
  let b64 = encryptedB64;
  while (b64.length % 4 !== 0) b64 += "=";
  let data;
  try {
    data = Buffer.from(b64, "base64");
  } catch (e) {
    return null;
  }
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ hash[i % hash.length];
  }
  try {
    return out.toString("utf8");
  } catch (e) {
    return null;
  }
}

// Extrai pkey/pdkey de um master m3u8
function extractMouflon(masterText) {
  const lines = masterText.split("\n");
  for (const line of lines) {
    if (line.includes("#EXT-X-MOUFLON:PSCH:v2:")) {
      const parts = line.trim().split(":");
      // #EXT-X-MOUFLON:PSCH:v2:PKEY
      if (parts.length >= 4) {
        const pkey = parts[3].trim();
        const pdkey = MOUFLON_KEYS[pkey];
        if (pdkey) {
          return { psch: "v2", pkey, pdkey };
        }
      }
    }
  }
  // tenta qualquer pkey conhecido que apareça
  for (const line of lines) {
    for (const pkey of Object.keys(MOUFLON_KEYS)) {
      if (line.includes(pkey)) {
        return { psch: "v2", pkey, pdkey: MOUFLON_KEYS[pkey] };
      }
    }
  }
  return null;
}

// Decripta uma media playlist (substitui tokens criptografados)
function decryptMediaPlaylist(body, pdkey) {
  const lines = body.split("\n");
  const out = [];
  let lastDecoded = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("#EXT-X-MOUFLON:URI:")) {
      // Formato: #EXT-X-MOUFLON:URI:https://.../xxx_ENCODED_yyy.mp4
      const uri = trimmed.slice("#EXT-X-MOUFLON:URI:".length);
      try {
        const parts = uri.split("_");
        if (parts.length >= 2) {
          const encodedPart = parts[parts.length - 2];
          const reversed = encodedPart.split("").reverse().join("");
          const decodedPart = mouflonDecode(reversed, pdkey);
          if (decodedPart) {
            const newUri = uri.replace(encodedPart, decodedPart);
            // Pega só o path relativo final (como o StreaMonitor faz)
            const pathParts = newUri.split("/");
            lastDecoded = pathParts.slice(4).join("/") || newUri;
            // Não emite a linha MOUFLON, só guarda o resultado
            continue;
          }
        }
      } catch (e) {}
      // se falhar, ignora a linha MOUFLON
      continue;
    }

    // Linha de segmento que normalmente é um placeholder
    if (lastDecoded && !trimmed.startsWith("#") && trimmed.length > 0) {
      // Substitui o placeholder pelo path decriptado
      // Muitos casos o segmento vem como nome fixo; usamos o lastDecoded
      if (trimmed.includes("media") || trimmed.endsWith(".mp4") || trimmed.endsWith(".ts") || !trimmed.startsWith("http")) {
        out.push(lastDecoded.startsWith("http") ? lastDecoded : trimmed.replace(/[^/]+$/, lastDecoded.split("/").pop()));
        // Melhor: se lastDecoded for path completo relativo ao host
        // Vamos preferir construir URL absoluta se possível
        lastDecoded = null;
        continue;
      }
    }

    out.push(line);
  }

  return out.join("\n");
}

// Versão mais robusta de decrypt (baseada no StreaMonitor)
// Substitui o placeholder media.mp4 pela URL completa decriptada
function decryptMediaPlaylistV2(body, pdkey) {
  const lines = body.split("\n");
  const out = [];
  let pendingUrl = null;
  const MOUFLON_URI = "#EXT-X-MOUFLON:URI:";

  for (const line of lines) {
    const trimmed = line.trim();

    // Token criptografado
    if (trimmed.startsWith(MOUFLON_URI)) {
      const uri = trimmed.slice(MOUFLON_URI.length);
      try {
        const parts = uri.split("_");
        if (parts.length >= 2) {
          const encodedPart = parts[parts.length - 2];
          const reversed = encodedPart.split("").reverse().join("");
          const decodedPart = mouflonDecode(reversed, pdkey);
          if (decodedPart && decodedPart.length > 2) {
            pendingUrl = uri.replace(encodedPart, decodedPart);
          }
        }
      } catch (e) {
        pendingUrl = null;
      }
      continue; // nunca emite a tag MOUFLON
    }

    // Linha de segmento (placeholder media.mp4) → troca pela URL real
    if (pendingUrl && trimmed && !trimmed.startsWith("#")) {
      out.push(pendingUrl);
      pendingUrl = null;
      continue;
    }

    // Remove tags MOUFLON residuais
    if (trimmed.includes("MOUFLON")) continue;

    out.push(line);
  }

  return out.join("\n");
}

const CDN_HEADERS = {
  "User-Agent": UA,
  Referer: "https://br.stripchat.com/men/brazilian",
  Origin: "https://stripchat.com",
  Accept: "*/*"
};

// Master playlist → reescreve media playlists para nosso proxy + tenta anexar psch/pkey
app.get("/proxy/:usuario/master.m3u8", async function (req, res) {
  try {
    await refreshMouflonKeys();

    const usuario = String(req.params.usuario || "").trim();
    if (!usuario || usuario.length > 80) {
      return res.status(400).send("invalid");
    }

    const streamName = await resolveStreamName(usuario);

    const masterCandidates = [
      `https://edge-hls.doppiocdn.com/hls/${streamName}/master/${streamName}_auto.m3u8`,
      `https://edge-hls.doppiocdn.org/hls/${streamName}/master/${streamName}_auto.m3u8`,
      `https://media-hls.doppiocdn.com/b-hls-12/${streamName}/master/${streamName}_auto.m3u8`
    ];

    let masterText = null;

    for (const url of masterCandidates) {
      try {
        const r = await fetch(url, {
          headers: CDN_HEADERS,
          signal: AbortSignal.timeout(12000)
        });
        if (r.ok) {
          masterText = await r.text();
          break;
        }
      } catch (e) {}
    }

    if (!masterText) {
      return res.status(502).send("master unavailable");
    }

    const mouflon = extractMouflon(masterText);

    // Reescreve as media playlists para passarem pelo nosso proxy decriptador
    const lines = masterText.split("\n");
    const out = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("#") || trimmed === "") {
        // Remove as tags MOUFLON do master (já vamos tratar no media)
        if (trimmed.includes("MOUFLON")) continue;
        out.push(line);
        continue;
      }

      if (trimmed.startsWith("http")) {
        let mediaUrl = trimmed;
        // Alguns players se beneficiam de receber psch/pkey na query
        if (mouflon) {
          const sep = mediaUrl.includes("?") ? "&" : "?";
          mediaUrl = mediaUrl + sep + "psch=" + mouflon.psch + "&pkey=" + encodeURIComponent(mouflon.pkey);
        }

        const proxied =
          PUBLIC_URL +
          "/stripchat/proxy/" +
          encodeURIComponent(usuario) +
          "/media?u=" +
          encodeURIComponent(mediaUrl) +
          (mouflon ? "&pk=" + encodeURIComponent(mouflon.pkey) : "");
        out.push(proxied);
      } else {
        out.push(line);
      }
    }

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.send(out.join("\n"));
  } catch (err) {
    console.error("[proxy master]", err.message);
    res.status(502).send("proxy error");
  }
});

// Media playlist com decrypt MOUFLON
app.get("/proxy/:usuario/media", async function (req, res) {
  try {
    const target = req.query.u;
    const pkey = req.query.pk || null;

    if (!target || typeof target !== "string" || !target.startsWith("http")) {
      return res.status(400).send("missing url");
    }

    let upstream;
    try { upstream = new URL(target); } catch { return res.status(400).send("invalid url"); }
    const allowed = ["doppiocdn.com", "doppiocdn.org", "strpst.com"];
    if (upstream.protocol !== "https:" || upstream.username || upstream.password ||
        (upstream.port && upstream.port !== "443") ||
        !allowed.some(host => upstream.hostname === host || upstream.hostname.endsWith("." + host))) {
      return res.status(403).send("forbidden");
    }

    const r = await fetch(target, {
      headers: CDN_HEADERS,
      redirect: "error",
      signal: AbortSignal.timeout(15000)
    });

    if (!r.ok) {
      return res.status(502).send("upstream " + r.status);
    }

    let body = await r.text();
    const baseUrl = target.substring(0, target.lastIndexOf("/") + 1);

    // Tenta encontrar pdkey
    let pdkey = null;
    if (pkey && MOUFLON_KEYS[pkey]) {
      pdkey = MOUFLON_KEYS[pkey];
    } else {
      // tenta extrair do próprio body
      const m = extractMouflon(body);
      if (m) pdkey = m.pdkey;
    }

    if (pdkey && body.includes("MOUFLON")) {
      body = decryptMediaPlaylistV2(body, pdkey);
    } else {
      // fallback: só absolutiza segmentos
      const lines = body.split("\n");
      const out = [];
      for (const line of lines) {
        const t = line.trim();
        if (t && !t.startsWith("#") && !t.startsWith("http")) {
          out.push(baseUrl + t);
        } else if (!t.includes("MOUFLON")) {
          out.push(line);
        }
      }
      body = out.join("\n");
    }

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.send(body);
  } catch (err) {
    console.error("[proxy media]", err.message);
    res.status(502).send("proxy error");
  }
});

// Proxy de thumbnail – tenta várias fontes reais do Stripchat
// Proxy de imagem no estilo do brazilcam4-nuvio
app.get("/imagem/:usuario.jpg", async function (req, res) {
  try {
    const usuario = String(req.params.usuario || "").trim();

    if (
      usuario === "" ||
      usuario.length > 100 ||
      usuario.includes("/") ||
      usuario.includes("..")
    ) {
      return res.status(400).send("Nome inválido");
    }

    let imageUrl = null;

    // 1. Busca preview real pela API (estrutura camData.user.user.*)
    try {
      const userData = await getJson(
        "https://stripchat.com/api/front/users/user-ids/" +
          encodeURIComponent(usuario)
      );

      if (userData && userData.id) {
        const camData = await getJson(
          "https://stripchat.com/api/front/v2/models/" + userData.id + "/cam"
        );

        const u =
          (camData && camData.user && camData.user.user) ||
          (camData && camData.user) ||
          {};

        imageUrl =
          u.previewUrl ||
          u.previewUrlThumbBig ||
          u.previewUrlThumbSmall ||
          u.avatarUrl ||
          u.avatarUrlOriginal ||
          null;
      }
    } catch (e) {
      // continua
    }

    if (imageUrl && imageUrl.startsWith("/")) {
      imageUrl = "https://static-proxy.strpst.com" + imageUrl;
    }

    const candidates = [
      imageUrl,
      "https://static-proxy.strpst.com/previews/" + encodeURIComponent(usuario) + "/thumb_big",
      "https://static-proxy.strpst.com/avatars/" + encodeURIComponent(usuario)
    ].filter(Boolean);

    for (const url of candidates) {
      try {
        const imgRes = await fetch(url, {
          headers: {
            "User-Agent": UA,
            Referer: "https://br.stripchat.com/men/brazilian",
            Accept: "image/*"
          },
          signal: AbortSignal.timeout(12000)
        });

        if (!imgRes.ok) continue;

        const tipo = (imgRes.headers.get("content-type") || "")
          .split(";")[0]
          .trim()
          .toLowerCase();

        if (!tipo.startsWith("image/")) continue;

        const buf = Buffer.from(await imgRes.arrayBuffer());
        if (buf.length < 500) continue;

        res.setHeader("Content-Type", tipo);
        res.setHeader("Cache-Control", "public, max-age=120");
        return res.send(buf);
      } catch (e) {
        // tenta próximo
      }
    }

    // Placeholder cinza 1x1
    const placeholder = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=30");
    res.send(placeholder);
  } catch (erro) {
    console.error("[imagem]", erro.message);
    if (!res.headersSent) {
      res.status(502).send("Falha ao carregar imagem");
    }
  }
});


return { ...handlers, router: app };
};
