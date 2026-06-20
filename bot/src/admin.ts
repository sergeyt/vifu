import type { Bot } from "grammy";
import type { User } from "grammy/types";

type Api = Bot["api"];

const seenUsers = new Set<number>();

/** True the first time we see this Telegram user (until bot restart). */
export function markUserSeen(userId: number): boolean {
  if (seenUsers.has(userId)) return false;
  seenUsers.add(userId);
  return true;
}

export async function notifyNewUser(
  api: Api,
  adminChatId: number,
  user: User,
): Promise<void> {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const username = user.username ? `@${user.username}` : "—";
  const lines = [
    "🆕 <b>New vifu user</b>",
    "",
    `<b>Name:</b> ${escapeHtml(name || "—")}`,
    `<b>Username:</b> ${escapeHtml(username)}`,
    `<b>User ID:</b> <code>${user.id}</code>`,
  ];
  if (user.language_code) {
    lines.push(`<b>Lang:</b> ${escapeHtml(user.language_code)}`);
  }
  if (user.is_premium) {
    lines.push("<b>Telegram Premium:</b> yes");
  }

  try {
    await api.sendMessage(adminChatId, lines.join("\n"), {
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error("[admin] notify failed:", error);
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
