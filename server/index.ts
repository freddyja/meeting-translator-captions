import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./api.ts";
import { loadLocalEnv } from "./env.ts";
import { attachCaptionRelay } from "./relay.ts";
import { reportedTranslateProvider, resolveTranslateProvider, warnIfGoogleRequestedWithoutKey } from "./translate.ts";

loadLocalEnv();

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
};

const IMMUTABLE = /\.[0-9a-f]{8,}\.(js|css|woff2)$/i;

function send(res: ServerResponse, status: number, body: string, type: string, extra: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": type, "x-content-type-options": "nosniff", ...extra });
  res.end(body);
}

function cacheControl(filePath: string): string {
  const base = path.basename(filePath);
  if (base === "index.html" || base === "sw.js" || base.endsWith(".webmanifest")) {
    return "no-cache";
  }
  if (IMMUTABLE.test(base)) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600";
}

function safeFile(urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const trimmed = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.resolve(DIST, `.${trimmed}`);
  if (resolved !== DIST && !resolved.startsWith(`${DIST}${path.sep}`)) return null;
  return resolved;
}

async function sendFile(res: ServerResponse, filePath: string): Promise<void> {
  const type = MIME[path.extname(filePath)] ?? "application/octet-stream";
  res.writeHead(200, {
    "content-type": type,
    "cache-control": cacheControl(filePath),
    "x-content-type-options": "nosniff",
  });
  createReadStream(filePath).pipe(res);
}

export function createCaptionServer() {
  const relay = { roomCount: () => 0 };

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    const pathname = url.split("?")[0] || "/";

    if (pathname === "/health") {
      send(
        res,
        200,
        JSON.stringify({
          ok: true,
          rooms: relay.roomCount(),
          translate: reportedTranslateProvider(),
        }),
        "application/json; charset=utf-8",
        { "cache-control": "no-store" },
      );
      return;
    }

    if (await handleApi(req, res)) return;

    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, "Method not allowed", "text/plain; charset=utf-8");
      return;
    }

    const filePath = safeFile(pathname);
    if (!filePath) {
      send(res, 400, "Bad path", "text/plain; charset=utf-8");
      return;
    }

    try {
      const info = await stat(filePath);
      if (info.isFile()) {
        if (req.method === "HEAD") {
          res.writeHead(200, {
            "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream",
            "cache-control": cacheControl(filePath),
          });
          res.end();
          return;
        }
        await sendFile(res, filePath);
        return;
      }
    } catch {
      /* fall through to SPA shell */
    }

    try {
      await sendFile(res, path.join(DIST, "index.html"));
    } catch {
      send(res, 500, "App bundle missing. Run npm run build.", "text/plain; charset=utf-8");
    }
  });

  const attached = attachCaptionRelay(server);
  relay.roomCount = attached.roomCount;
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  warnIfGoogleRequestedWithoutKey();
  const server = createCaptionServer();
  server.listen(PORT, HOST, () => {
    console.log(`Meeting Translator listening on http://${HOST}:${PORT}`);
    console.log(`Translate provider: ${resolveTranslateProvider()}`);
  });
}
