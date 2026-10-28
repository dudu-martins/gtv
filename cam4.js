const express = require("express");
module.exports = function createCam4(PUBLIC_URL) {
  const router = express.Router();
  const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
  const PREFIX = "cam4:";
  const MAX_PAGES = 15;
  let cache = { t: 0, data: [] };
  const thumb = user => PUBLIC_URL + "/cam4/imagem/" + encodeURIComponent(user) + ".jpg";
  async function getJson(url) {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(30000)
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  async function listarOnline() {
    if (Date.now() - cache.t < 60000 && cache.data.length) return cache.data;
    const base = "https://pt.cam4.com/directoryCams?directoryJson=true&online=true&url=true&gender=male";
    const vistos = new Map();
    for (let inicio = 1; inicio <= MAX_PAGES; inicio += 5) {
      const lote = [];
      for (let pagina = inicio; pagina < inicio + 5 && pagina <= MAX_PAGES; pagina++) {
        lote.push(getJson(base + "&page=" + pagina).catch(e => {
          console.error("[CAM4 catálogo]", e.message);
          return null;
        }));
      }
      const respostas = await Promise.all(lote);
      let vazias = 0;
      for (const resposta of respostas) {
        const users = Array.isArray(resposta?.users) ? resposta.users : [];
        if (!users.length) { vazias++; continue; }
        for (const user of users) {
          const nome = String(user.username || "").trim();
          if (String(user.countryCode || "").toLowerCase() !== "br" || !nome || vistos.has(nome)) continue;
          vistos.set(nome, { username: nome, viewers: Number(user.viewers) || 0, title: user.statusMessage || "" });
        }
      }
      if (vazias === respostas.length) break;
    }
    cache = { t: Date.now(), data: [...vistos.values()] };
    return cache.data;
  }
  async function catalog({ extra = {} }) {
    try {
      let users = await listarOnline();
      if (extra.search) {
        const search = String(extra.search).toLowerCase();
        users = users.filter(u => u.username.toLowerCase().includes(search));
      }
      const skip = Math.max(0, parseInt(extra.skip, 10) || 0);
      return { metas: users.slice(skip, skip + 100).map(u => ({
        id: PREFIX + u.username, type: "tv", name: u.username,
        poster: thumb(u.username), background: thumb(u.username), posterShape: "landscape",
        description: u.viewers + " espectadores. " + u.title
      })) };
    } catch (e) { console.error("[CAM4 catálogo]", e.message); return { metas: [] }; }
  }
  async function meta({ id }) {
    const user = id.slice(PREFIX.length);
    return { meta: { id, type: "tv", name: user, poster: thumb(user), background: thumb(user),
      posterShape: "landscape", behaviorHints: { isLive: true } } };
  }
  async function stream({ id }) {
    const user = id.slice(PREFIX.length);
    try {
      const data = await getJson("https://www.cam4.com/rest/v1.0/profile/" + encodeURIComponent(user) + "/streamInfo");
      if (typeof data.cdnURL !== "string" || !data.cdnURL) return { streams: [] };
      return { streams: [{ name: "CAM4", title: "Ao vivo (HLS)", url: data.cdnURL,
        behaviorHints: { notWebReady: true, proxyHeaders: { request: {
          "User-Agent": UA, Referer: "https://www.cam4.com/"
        } } } }] };
    } catch (e) { console.error("[CAM4 stream]", user, e.message); return { streams: [] }; }
  }
  router.get("/imagem/:usuario.jpg", async (req, res) => {
    try {
      const user = String(req.params.usuario || "").trim();
      if (!user || user.length > 100 || user.includes("/") || user.includes("..")) return res.sendStatus(400);
      const r = await fetch("https://snapshots.xcdnpro.com/thumbnails/" + encodeURIComponent(user), {
        headers: { "User-Agent": UA, Accept: "image/*", Referer: "https://www.cam4.com/" },
        signal: AbortSignal.timeout(15000)
      });
      if (!r.ok) return res.status(502).send("Imagem indisponível");
      const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const image = Buffer.from(await r.arrayBuffer());
      if (type !== "image/jpeg" || image.length < 3 || image[0] !== 255 || image[1] !== 216 || image[2] !== 255) {
        return res.status(502).send("Imagem inválida");
      }
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.send(image);
    } catch (e) { console.error("[CAM4 imagem]", e.message); if (!res.headersSent) res.sendStatus(502); }
  });
  return { catalog, meta, stream, router };
};
