/** Minimal HTTP server so Fly health checks pass while Telegram polling runs. */
export function startHealthServer(port: number): void {
  Deno.serve({
    port,
    hostname: "0.0.0.0",
    onListen: ({ port: p }) =>
      console.log(`[health] http://0.0.0.0:${p}/health`),
  }, (req) => {
    if (req.method === "GET" && new URL(req.url).pathname === "/health") {
      return new Response("ok");
    }
    return new Response("vifu bot", { status: 404 });
  });
}
