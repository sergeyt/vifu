import * as Sentry from "@sentry/deno";

const dsn = Deno.env.get("SENTRY_DSN")?.trim();

export const sentryEnabled = Boolean(dsn);

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: Deno.env.get("SENTRY_ENVIRONMENT") ??
      Deno.env.get("FLY_APP_NAME") ??
      "development",
    tracesSampleRate: Number(
      Deno.env.get("SENTRY_TRACES_SAMPLE_RATE") ?? "0",
    ),
  });
  console.log("[sentry] enabled");
}

export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!sentryEnabled) return;
  if (context) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
      Sentry.captureException(error);
    });
    return;
  }
  Sentry.captureException(error);
}

export function captureMessage(message: string): void {
  if (!sentryEnabled) return;
  Sentry.captureMessage(message);
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!sentryEnabled) return;
  await Sentry.flush(timeoutMs);
}
