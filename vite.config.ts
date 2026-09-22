import basicSsl from "@vitejs/plugin-basic-ssl";
import type { IncomingMessage, ServerResponse } from "node:http";
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

const useHttps = process.env.MT_HTTPS !== "0";

export default defineConfig({
  plugins: [...(useHttps ? [basicSsl()] : []), captionServices()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
