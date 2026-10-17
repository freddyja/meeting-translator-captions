import assert from "node:assert/strict";
import { describe, it } from "node:test";

const mem = new Map<string, string>();
const g = globalThis as any;
g.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
const { authHeaders, readToken, saveToken, withLinkToken, wsAuthQuery } = await import("../src/auth.ts");

describe("client token helpers", () => {
  it("stores the token per device and sends it as Bearer and ?auth=", () => {
    saveToken("v1.abc.sig");
    assert.equal(mem.get("mt-auth-token"), "v1.abc.sig");
    assert.equal(readToken(), "v1.abc.sig");
    assert.deepEqual(authHeaders({ a: "1" }), { a: "1", authorization: "Bearer v1.abc.sig" });
    assert.equal(wsAuthQuery(), "?auth=v1.abc.sig");
    saveToken("");
    assert.equal(wsAuthQuery(), "");
    assert.deepEqual(authHeaders(), {});
  });

  it("TV links carry the token in the fragment only, never the query", () => {
    const url = withLinkToken("https://x.test/?view=tv&room=ABCD", "v1.abc.sig");
    const u = new URL(url);
    assert.equal(u.search, "?view=tv&room=ABCD");
    assert.equal(new URLSearchParams(u.hash.slice(1)).get("k"), "v1.abc.sig");
    assert.equal(withLinkToken("https://x.test/?view=tv&room=ABCD", ""), "https://x.test/?view=tv&room=ABCD");
  });
});
