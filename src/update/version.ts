/** Build stamp written to dist/version.json and baked into the bundle. */
export type BuildInfo = { version: string; builtAt: string };

export function parseBuildInfo(data: unknown): BuildInfo | null {
  if (!data || typeof data !== "object") return null;
  const { version, builtAt } = data as Record<string, unknown>;
  if (typeof version !== "string" || !version.trim()) return null;
  return { version: version.trim(), builtAt: typeof builtAt === "string" ? builtAt : "" };
}

/** True when the server is on a different build than this page. */
export function isNewBuild(current: string, remote: BuildInfo | null): boolean {
  if (!remote || !current || current === "dev") return false;
  return remote.version !== current;
}
