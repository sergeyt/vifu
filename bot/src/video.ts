/** Read clip length with ffprobe (ffmpeg package). */
export async function probeVideoDurationSec(path: string): Promise<number> {
  const cmd = new Deno.Command("ffprobe", {
    args: [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  if (code !== 0) {
    const err = new TextDecoder().decode(stderr).trim();
    throw new Error(err || "ffprobe failed");
  }
  const raw = new TextDecoder().decode(stdout).trim();
  const sec = Number(raw);
  if (!Number.isFinite(sec) || sec <= 0) {
    throw new Error("Could not read video duration");
  }
  return sec;
}

export function telegramVideoDurationSec(ctx: {
  message?: {
    video?: { duration?: number };
    document?: unknown;
  };
}): number | undefined {
  const d = ctx.message?.video?.duration;
  return d !== undefined && Number.isFinite(d) ? d : undefined;
}

export function formatDurationLimit(maxSec: number): string {
  return `Clips must be ${maxSec} seconds or shorter.`;
}
