const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const express = require("express");
const path = require("node:path");
const fs = require("node:fs");

function createAddon({ publicUrl = process.env.PUBLIC_URL || "https://gtv-d1pm.onrender.com:" + (process.env.PORT || "7000") } = {}) {
  const PUBLIC_URL = publicUrl.replace(/\/+$/, "");
  const parsed = new URL(PUBLIC_URL);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error("PUBLIC_URL deve ser uma URL HTTP(S), sem credenciais, query ou fragmento");
  }
  const providers = {
    cam4: require("./cam4")(PUBLIC_URL),
    stripchat: require("./stripchat")(PUBLIC_URL)
  };
  const manifest = {
    id: "community.gtv", version: "1.0.0", name: "G-TV",
    description: "CAM4 e Stripchat · Câmeras masculinas do Brasil · Conteúdo adulto 18+",
    logo: PUBLIC_URL + "/logo.png",
    resources: ["catalog", "meta", "stream"], types: ["tv"],
    idPrefixes: ["cam4:", "stripchat:"],
    catalogs: [
      { type: "tv", id: "cam4br", name: "CAM4 Brasil", extra: [{ name: "search" }, { name: "skip" }] },
      { type: "tv", id: "stripchatbr", name: "Stripchat Brasil", extra: [{ name: "search" }, { name: "skip" }] }
    ],
    behaviorHints: { adult: true }
  };
  const builder = new addonBuilder(manifest);
  const getProvider = id => typeof id === "string" ? providers[id.split(":")[0]] : null;
  const handlers = {
    catalog: async args => {
      if (args.type !== "tv") return { metas: [] };
      const provider = args.id === "cam4br" ? providers.cam4 : args.id === "stripchatbr" ? providers.stripchat : null;
      return provider ? provider.catalog(args) : { metas: [] };
    },
    meta: async args => {
      const provider = args.type === "tv" ? getProvider(args.id) : null;
      return provider ? provider.meta(args) : { meta: null };
    },
    stream: async args => {
      const provider = args.type === "tv" ? getProvider(args.id) : null;
      return provider ? provider.stream(args) : { streams: [] };
    }
  };
  builder.defineCatalogHandler(handlers.catalog);
  builder.defineMetaHandler(handlers.meta);
  builder.defineStreamHandler(handlers.stream);
  const app = express();
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.get("/logo.png", (req, res) => {
    const logo = path.join(__dirname, "logo.png");
    if (!fs.existsSync(logo)) return res.status(404).send("logo.png ainda não definido");
    res.sendFile(logo);
  });
  app.get("/health", (req, res) => res.json({ ok: true, addon: "G-TV" }));
  app.use("/cam4", providers.cam4.router);
  app.use("/stripchat", providers.stripchat.router);
  app.use(getRouter(builder.getInterface()));
  return { app, manifest, handlers };
}
if (require.main === module) {
  const { app } = createAddon();
  const port = Number(process.env.PORT) || 7000;
  app.listen(port, "0.0.0.0", () => {
    console.log("G-TV na porta " + port);
    console.log("PUBLIC_URL: " + (process.env.PUBLIC_URL || "http://127.0.0.1:" + port));
    if (!process.env.PUBLIC_URL) console.warn("Para TV/rede ou hospedagem, defina PUBLIC_URL com o endereço acessível do servidor.");
  });
}
module.exports = { createAddon };
