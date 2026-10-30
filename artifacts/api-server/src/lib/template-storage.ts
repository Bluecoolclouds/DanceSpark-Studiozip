import { Storage } from "@google-cloud/storage";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Replit App Storage's sidecar provides short-lived credentials.
export const templateStorage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: "http://127.0.0.1:1106/token",
    type: "external_account",
    credential_source: {
      url: "http://127.0.0.1:1106/credential",
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export function publicTemplateFile(id: string, asset: string) {
  const root = process.env.PUBLIC_OBJECT_SEARCH_PATHS?.split(",")[0]?.trim();
  if (!root) throw new Error("Template storage is not configured");
  const parts = root.replace(/^\/+/, "").split("/");
  const bucket = parts.shift()!;
  return templateStorage.bucket(bucket).file([...parts, "dance-templates", id, asset].join("/"));
}

// Read-through cache only; the durable originals remain in App Storage.
// A client closing its video request must not cancel the SDK's internal pipeline.
const cacheDir = mkdtemp(join(tmpdir(), "danceflow-template-media-"));
const downloads = new Map<string, Promise<{ path: string; size: number }>>();

export function cachedTemplateFile(id: string, asset: string) {
  const key = `${id}-${asset}`;
  let pending = downloads.get(key);
  if (!pending) {
    pending = (async () => {
      const path = join(await cacheDir, key);
      try {
        await publicTemplateFile(id, asset).download({ destination: path });
        const { size } = await stat(path);
        return { path, size };
      } catch (error) {
        await rm(path, { force: true }).catch(() => {});
        downloads.delete(key);
        throw error;
      }
    })();
    downloads.set(key, pending);
  }
  return pending;
}
