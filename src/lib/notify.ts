/**
 * Avisos al celular del dueño por Telegram (gratis).
 * Configura en Vercel: TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID.
 * Si no están configurados, no se manda nada (el robot sigue funcionando).
 */
export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || !chatIds.length) return { sent: false, reason: "Telegram no configurado" };

  const errors: string[] = [];
  for (const chatId of chatIds) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    }).catch((e: unknown) => ({ ok: false, text: async () => String(e) }) as const);
    if (!res.ok) errors.push(await res.text());
  }
  return errors.length ? { sent: false, reason: errors.join(" | ") } : { sent: true };
}
