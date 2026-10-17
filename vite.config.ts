import basicSsl from "@vitejs/plugin-basic-ssl";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { defineConfig, type Connect, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import { handleApi } from "./server/api";
import { loadLocalEnv } from "./server/env";
import { attachCaptionRelay } from "./server/relay";
import { warnIfGoogleRequestedWithoutKey } from "./server/translate";

loadLocalEnv();
warnIfGoogleRequestedWithoutKey();

function attachRelay(server: ViteDevServer | PreviewServer) {
  attachCaptionRelay(server.httpServer);
}

function translateApi(): Connect.NextHandleFunction {
  return async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    try {
      if (await handleApi(req, res)) return;
    } catch {
      /* fall through */
    }
    next();
  };
}

function captionServices(): Plugin {
  return {
    name: "meeting-translator-caption-services",
    configureServer(server) {
      server.middlewares.use(translateApi());
      attachRelay(server);
      return () => attachRelay(server);
    },
    configurePreviewServer(server) {
      server.middlewares.use(translateApi());
      attachRelay(server);
      return () => attachRelay(server);
    },
  };
}

/** Deploy SHA from the host, then git, then the build time. */
function buildVersion(): string {
  const env =
    process.env.RENDER_GIT_COMMIT ||
    process.env.SOURCE_VERSION ||
    process.env.GITHUB_SHA ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.FLY_IMAGE_REF;
  if (env) return env.replace(/^.*:/, "").slice(0, 12);
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return `t${Date.now().toString(36)}`;
  }
}

const BUILD_VERSION = buildVersion();

/** dist/version.json plus a sw.js stamped with the same id. */
function buildStamp(): Plugin {
  let outDir = "dist";
  return {
    name: "meeting-translator-build-stamp",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      writeFileSync(
        path.join(outDir, "version.json"),
        `${JSON.stringify({ version: BUILD_VERSION, builtAt: new Date().toISOString() })}\n`,
      );
      const sw = path.join(outDir, "sw.js");
      if (existsSync(sw)) writeFileSync(sw, readFileSync(sw, "utf8").replaceAll("__BUILD_ID__", BUILD_VERSION));
    },
  };
}

const useHttps = process.env.MT_HTTPS !== "0";

export default defineConfig({
  plugins: [...(useHttps ? [basicSsl()] : []), captionServices(), buildStamp()],
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
