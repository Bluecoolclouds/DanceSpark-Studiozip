import { spawn } from "node:child_process";

export const MAX_CUSTOM_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_CUSTOM_VIDEO_SECONDS = 300;
const FFPROBE_TIMEOUT_MS = 15_000;

export class CustomVideoValidationError extends Error {
  constructor(public readonly code: "invalid_source_video" | "source_validation_unavailable") {
    super(code);
    this.name = "CustomVideoValidationError";
  }
}

/**
 * Validate actual MP4 media and read its container duration. Never accept a
 * client-provided duration or trust the upload's filename/content-type alone.
 */
export async function inspectCustomVideo(
  bytes: Buffer, constraints?: { minimumSeconds: number; minimumPixels: number },
): Promise<number> {
  if (!bytes.length || bytes.length > MAX_CUSTOM_VIDEO_BYTES ||
      bytes.length < 12 || bytes.toString("ascii", 4, 8) !== "ftyp") {
    throw new CustomVideoValidationError("invalid_source_video");
  }
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("ffprobe", [
        "-v", "error",
        "-protocol_whitelist", "pipe",
        "-probesize", "10000000",
        "-analyzeduration", "10000000",
        "-show_entries", "format=format_name,duration:stream=codec_type,width,height",
        "-of", "json",
        "-i", "pipe:0",
      ], { stdio: ["pipe", "pipe", "ignore"] });
    } catch {
      reject(new CustomVideoValidationError("source_validation_unavailable"));
      return;
    }

    let stdout = "";
    let failed = false;
    const rejectInvalid = () => {
      if (failed) return;
      failed = true;
      clearTimeout(timer);
      try { child.kill("SIGKILL"); } catch {}
      reject(new CustomVideoValidationError("invalid_source_video"));
    };
    const timer = setTimeout(rejectInvalid, FFPROBE_TIMEOUT_MS);
    timer.unref();
    child.stdout!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 64 * 1024) rejectInvalid();
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      if (failed) return;
      failed = true;
      clearTimeout(timer);
      reject(new CustomVideoValidationError(error.code === "ENOENT"
        ? "source_validation_unavailable" : "invalid_source_video"));
    });
    child.once("close", (code) => {
      if (failed) return;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new CustomVideoValidationError("invalid_source_video"));
        return;
      }
      try {
        const metadata = JSON.parse(stdout) as {
          format?: { format_name?: string; duration?: string };
          streams?: { codec_type?: string; width?: number; height?: number }[];
        };
        const duration = Number(metadata.format?.duration);
        const mp4 = metadata.format?.format_name?.split(",").some(name =>
          ["mp4", "mov", "3gp", "mj2"].includes(name),
        );
        const video = metadata.streams?.find(stream => stream.codec_type === "video");
        if (!mp4 || !video ||
            !Number.isFinite(duration) || duration <= 0 || duration > MAX_CUSTOM_VIDEO_SECONDS) {
          throw new Error("Invalid video metadata");
        }
        if (constraints && (duration < constraints.minimumSeconds ||
            (constraints.minimumPixels > 0 && (!video.width || !video.height ||
              video.width * video.height < constraints.minimumPixels)))) {
          throw new Error("Video does not meet the selected model's constraints");
        }
        resolve(duration);
      } catch {
        reject(new CustomVideoValidationError("invalid_source_video"));
      }
    });
    child.stdin!.once("error", () => {});
    child.stdin!.end(bytes);
  });
}
