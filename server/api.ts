import type { IncomingMessage, ServerResponse } from "node:http";
import { isLang, reportedTranslateProvider, translateCaption } from "./translate.ts";

const MAX_BODY = 8 * 1024;

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BODY) {
      throw Object.assign(new Error("Body too large"), { status: 413 });
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pathname = (req.url ?? "/").split("?")[0] || "/";
  if (pathname === "/api/translate") return handleTranslate(req, res);
  return false;
}

async function handleTranslate(req: IncomingMessage, res: ServerResponse): Promise<true> {

  if (req.method === "GET" || req.method === "HEAD") {
    const body = { provider: reportedTranslateProvider() };
    if (req.method === "HEAD") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end();
      return true;
    }
    send(res, 200, body);
    return true;
  }

  if (req.method !== "POST") {
    send(res, 405, { error: "Method not allowed" });
    return true;
  }

  let payload: unknown;
  try {
    payload = await readJson(req);
  } catch (err) {
    const status = typeof err === "object" && err && "status" in err ? Number(err.status) : 400;
    send(res, status || 400, { error: "Invalid JSON" });
    return true;
  }

  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const text = typeof body.text === "string" ? body.text : "";
  if (!isLang(body.from)) {
    send(res, 400, { error: "from must be en, es, or pt" });
    return true;
  }

  let targets: Array<"en" | "es" | "pt"> | undefined;
  if (body.to !== undefined) {
    const list = Array.isArray(body.to) ? body.to : [body.to];
    if (!list.every(isLang)) {
      send(res, 400, { error: "to must be en, es, and/or pt" });
      return true;
    }
    targets = list;
  }

  const requestProvider = typeof body.provider === "string" ? body.provider : undefined;

  try {
    const result = await translateCaption(text, body.from, targets, {
      provider: requestProvider,
      trustHint: body.trustHint === true,
    });
    send(res, 200, result);
  } catch (err) {
    const status = typeof err === "object" && err && "status" in err ? Number(err.status) : 502;
    send(res, status || 502, { error: "Translate failed" });
  }
  return true;
}
