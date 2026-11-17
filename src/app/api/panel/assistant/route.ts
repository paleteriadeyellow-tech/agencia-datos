import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireApiAuth } from "@/lib/api-auth";
import { type AgencySlug } from "@/lib/agencies";
import { prisma } from "@/lib/prisma";
import {
  ASSISTANT_MODEL,
  anthropic,
  assistantSystemPrompt,
  buildAssistantTools,
  type AssistantAction,
} from "@/lib/assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  /** Historial completo devuelto por la llamada anterior (se manda tal cual). */
  history?: Anthropic.Beta.BetaMessageParam[];
  text: string;
};

/** Orden del admin al asistente: ejecuta herramientas en el panel y responde. */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  if (!auth.isAdmin) return NextResponse.json({ error: "Solo el admin puede dar órdenes al asistente" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Falta configurar ANTHROPIC_API_KEY en Vercel." }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const text = body?.text?.trim();
  if (!text) return NextResponse.json({ error: "Escribe una orden" }, { status: 400 });

  const agencySlug = auth.agencySlug as AgencySlug;
  const userId = String(auth.token.id);
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const actor = { id: userId, name: me?.name ?? "Admin" };

  const actions: AssistantAction[] = [];
  const history = Array.isArray(body?.history) ? body!.history : [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: "user", content: text }];

  try {
    const runner = anthropic().beta.messages.toolRunner({
      model: ASSISTANT_MODEL,
      max_tokens: 16000,
      max_iterations: 20,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: assistantSystemPrompt(agencySlug, actor.name), cache_control: { type: "ephemeral" } }],
      tools: buildAssistantTools(agencySlug, actor, actions),
      messages,
    });
    const final = await runner.runUntilDone();

    const newHistory = [...runner.params.messages];
    const last = newHistory[newHistory.length - 1];
    if (!last || last.role !== "assistant") newHistory.push({ role: "assistant", content: final.content });

    let reply = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (final.stop_reason === "refusal") reply = reply || "No puedo hacer eso.";
    if (!reply) reply = "Listo.";

    return NextResponse.json({ reply, actions, history: newHistory });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Demasiadas órdenes seguidas, espera un momento." }, { status: 429 });
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "La ANTHROPIC_API_KEY no es válida." }, { status: 500 });
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Error del asistente (${e.status}): ${e.message}`, actions }, { status: 502 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error", actions }, { status: 500 });
  }
}
