import type { Config } from "@/config.ts";

export type RenderResult = {
  outputPath: string;
};

export async function renderVifu(
  cfg: Config,
  opts: {
    inputPath: string;
    outputPath: string;
    player1: string;
    player2: string;
  },
): Promise<RenderResult> {
  const args = [
    "run",
    "vifu",
    "process",
    "--input",
    opts.inputPath,
    "--output",
    opts.outputPath,
    "--player1",
    opts.player1,
    "--player2",
    opts.player2,
    "--style",
    "arcade_fight",
  ];

  const cmd = new Deno.Command("uv", {
    args,
    cwd: cfg.vifuRoot,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await cmd.output();
  const out = new TextDecoder().decode(stdout);
  const err = new TextDecoder().decode(stderr);

  if (code !== 0) {
    throw new Error(
      `vifu failed (exit ${code})\n${err || out}`.slice(0, 3500),
    );
  }

  try {
    await Deno.stat(opts.outputPath);
  } catch {
    throw new Error("vifu finished but output file was not created");
  }

  return { outputPath: opts.outputPath };
}

export function parsePlayerNames(text: string): { player1: string; player2: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const vsMatch = trimmed.match(/^(.+?)\s+(?:vs|v|×|x|\-)\s+(.+)$/i);
  if (vsMatch) {
    const player1 = vsMatch[1].trim();
    const player2 = vsMatch[2].trim();
    if (player1 && player2) return { player1, player2 };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { player1: parts[0], player2: parts.slice(1).join(" ") };
  }

  return null;
}
