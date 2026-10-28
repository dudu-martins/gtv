// Testes locais com respostas simuladas; não acessam os serviços externos.
const assert = require("node:assert/strict");
const Module = require("node:module");
const originalLoad = Module._load;
function router() {
  return { routes: [], get(route, handler) { this.routes.push({ route, handler }); }, use() {} };
}
const express = () => router();
express.Router = router;
class Builder {
  constructor(manifest) { this.manifest = manifest; }
  defineCatalogHandler(fn) { this.catalog = fn; }
  defineMetaHandler(fn) { this.meta = fn; }
  defineStreamHandler(fn) { this.stream = fn; }
  getInterface() { return {}; }
}
Module._load = function(name, ...args) {
  if (name === "express") return express;
  if (name === "stremio-addon-sdk") return { addonBuilder: Builder, getRouter: () => ({}) };
  return originalLoad.call(this, name, ...args);
};
const calls = [];
global.fetch = async (url) => {
  const value = String(url); calls.push(value);
  let data;
  if (value.includes("directoryCams")) data = { users: [
    { username: "CamBrasil", countryCode: "br", viewers: 15 },
    { username: "CamFora", countryCode: "us" }
  ] };
  else if (value.includes("/api/front/models?")) data = { models: [
    { username: "StripBrasil", country: "br", status: "public", id: 123, previewUrlThumbBig: "https://example.test/thumb.jpg" },
    { username: "StripFora", country: "us", status: "public", id: 456 }
  ] };
  else if (value.includes("user-ids/")) data = { id: 123 };
  else if (value.includes("/cam")) data = { user: { user: { previewUrl: "https://example.test/thumb.jpg" } } };
  else if (value.includes("/streamInfo")) data = { cdnURL: "https://example.test/live.m3u8" };
  else throw new Error("Requisição inesperada: " + value);
  return { ok: true, status: 200, json: async () => data };
};
(async () => {
  const { createAddon } = require("./index");
  const { manifest, handlers } = createAddon({ publicUrl: "https://gtv.example/" });
  Module._load = originalLoad;
  assert.equal(manifest.name, "G-TV");
  assert.equal(manifest.catalogs.length, 2);
  assert.equal(manifest.logo, "https://gtv.example/logo.png");
  assert.ok(manifest.catalogs.every(c => !c.extra.some(e => e.name === "genre")));
  for (const id of ["cam4br", "stripchatbr"]) {
    const { metas } = await handlers.catalog({ type: "tv", id, extra: {} });
    assert.equal(metas.length, 1);
    const meta = metas[0];
    assert.equal(meta.background, meta.poster);
    assert.ok(!meta.name.includes("Fora"));
    const detailed = await handlers.meta({ type: "tv", id: meta.id });
    assert.equal(detailed.meta.poster, detailed.meta.background);
    const { streams } = await handlers.stream({ type: "tv", id: meta.id });
    assert.equal(streams.length, 1);
    assert.ok(streams[0].url.startsWith(id === "cam4br" ? "https://example.test/" : "https://gtv.example/stripchat/proxy/"));
    const found = await handlers.catalog({ type: "tv", id, extra: { search: "nao-existe" } });
    assert.equal(found.metas.length, 0);
    const paged = await handlers.catalog({ type: "tv", id, extra: { skip: "100" } });
    assert.equal(paged.metas.length, 0);
  }
  assert.deepEqual(await handlers.catalog({ type: "tv", id: "invalid" }), { metas: [] });
  assert.deepEqual(await handlers.stream({ type: "tv", id: "other:123" }), { streams: [] });
  assert.deepEqual(await handlers.meta({ type: "movie", id: "cam4:CamBrasil" }), { meta: null });
  const fs = require("node:fs");
  for (const file of ["index.js", "cam4.js", "stripchat.js"]) {
    assert.ok(!fs.readFileSync(require("node:path").join(__dirname, file), "utf8").toLowerCase().includes("svg"));
  }
  console.log("OK: manifesto, catálogos, filtro Brasil, busca, paginação, backgrounds, roteamento e ausência de SVG (dados simulados).");
})().catch(e => { console.error(e); process.exitCode = 1; });
