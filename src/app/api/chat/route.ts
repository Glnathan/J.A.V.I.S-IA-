import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, memories, messages, tasks } from "@/db/schema";
import { applyLLMTags, buildSystemPrompt, cleanCommand, fallbackBrain, makeCtx, runLocalBrain } from "@/lib/brain";
import { normalizeHistory, resolveAI, shortReason, streamChat, type ChatTurn } from "@/lib/brain/llm";
import { runPlugins } from "@/lib/brain/plugins";
import { getSettings } from "@/lib/brain/settings";
import { isDesktop, touchActivity } from "@/lib/runtime";
import type { BrainResult, ClientAction, ClientContext, StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { message?: unknown; conversationId?: unknown; client?: Partial<ClientContext>; image?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Requête invalide" }, { status: 400 });
  }
  const raw = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
  if (!raw) return Response.json({ error: "Message vide" }, { status: 400 });
  // Vision (écran ou caméra) : image jointe en URL de données, 5 Mo maximum.
  const image = typeof body.image === "string" && body.image.startsWith("data:image/") && body.image.length < 5_500_000 ? body.image : undefined;

  touchActivity();
  const settings = await getSettings();
  const ai = resolveAI(settings);
  const ctx = makeCtx(cleanCommand(raw), settings, body.client && typeof body.client === "object" ? body.client : {}, Boolean(ai));

  let conversationId = typeof body.conversationId === "number" && Number.isInteger(body.conversationId) ? body.conversationId : null;
  if (conversationId) {
    const found = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    if (!found.length) conversationId = null;
  }
  if (!conversationId) {
    const [created] = await db.insert(conversations).values({ title: raw.slice(0, 80) }).returning({ id: conversations.id });
    conversationId = created.id;
  }
  const convId = conversationId;
  await db.insert(messages).values({ conversationId: convId, role: "user", content: raw });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (e: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          closed = true;
        }
      };
      const finish = async (r: BrainResult, provider?: string) => {
        if (r.cards?.length) send({ type: "cards", cards: r.cards });
        if (r.actions?.length) send({ type: "actions", actions: r.actions });
        const [m] = await db
          .insert(messages)
          .values({
            conversationId: convId,
            role: "assistant",
            content: r.text,
            source: r.source,
            meta: { cards: r.cards, actions: r.actions, provider },
          })
          .returning({ id: messages.id });
        send({ type: "final", text: r.text, messageId: m.id });
      };

      try {
        let pluginLabel: string | undefined;
        let local: BrainResult | null = null;
        if (image) {
          // Une image est jointe : seule l'IA (multimodale) peut la comprendre.
          if (!ai) {
            local = {
              text: `Je ne peux pas analyser d'image sans IA connectée, ${ctx.sir}. Ajoutez une clé (Gemini ou OpenAI par exemple) dans Paramètres → Intelligence.`,
              source: "local",
            };
          }
        }
        if (!local && settings.pluginsEnabled && ctx.text) {
          const out = await runPlugins(ctx.text, {
            appellation: ctx.sir,
            Appellation: ctx.Sir,
            prenom: settings.userName,
            ville: settings.city,
            fuseau: ctx.tz,
            maintenant: new Date().toISOString(),
            version_pc: isDesktop(),
            plateforme: process.platform,
          });
          if (out) {
            pluginLabel = `Plugin · ${out.plugin}`;
            if (out.error) {
              const lines = out.error.trim().split("\n");
              local = {
                text: `Le plugin « ${out.plugin} » a rencontré une erreur, ${ctx.sir} : ${lines[lines.length - 1]}`,
                source: "plugin",
                cards: [{ kind: "list", title: "Détail de l'erreur Python", items: lines.slice(-8) }],
              };
            } else {
              const actions: ClientAction[] = out.open.map((o): ClientAction => ({ type: "open", url: o.url, label: o.label }));
              if (out.timer) actions.push({ type: "timer", seconds: out.timer.seconds, label: out.timer.label });
              local = {
                text: out.text,
                source: "plugin",
                cards: out.list ? [{ kind: "list", title: out.list.title, items: out.list.items }] : undefined,
                actions,
              };
            }
          }
        }
        if (!local) local = ctx.text ? await runLocalBrain(ctx) : { text: `Oui, ${ctx.sir} ? Je vous écoute.`, source: "local" };

        if (local) {
          send({ type: "meta", conversationId: convId, source: local.source, provider: pluginLabel });
          send({ type: "delta", text: local.text });
          await finish(local, pluginLabel);
        } else if (ai) {
          const providerLabel = `${ai.label} · ${ai.model}`;
          send({ type: "meta", conversationId: convId, source: "llm", provider: providerLabel });
          const [hist, mems, pend] = await Promise.all([
            db
              .select({ role: messages.role, content: messages.content })
              .from(messages)
              .where(eq(messages.conversationId, convId))
              .orderBy(desc(messages.createdAt), desc(messages.id))
              .limit(16),
            db.select({ content: memories.content }).from(memories).orderBy(desc(memories.createdAt)).limit(40),
            db.select({ title: tasks.title, dueAt: tasks.dueAt }).from(tasks).where(eq(tasks.done, false)).orderBy(asc(tasks.createdAt)).limit(20),
          ]);
          const history = normalizeHistory(
            hist.reverse().map((h): ChatTurn => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.content })),
          );
          const system = buildSystemPrompt(ctx, mems.map((m) => m.content), pend);
          let full = "";
          try {
            for await (const chunk of streamChat(ai, system, history, req.signal, image)) {
              full += chunk;
              send({ type: "delta", text: chunk });
            }
            if (!full.trim()) throw new Error("réponse vide du modèle");
            const { text, actions } = await applyLLMTags(full, ctx);
            await finish({ text: text || "…", source: "llm", actions }, providerLabel);
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            console.error("[jarvis] LLM error:", reason);
            if (req.signal.aborted) {
              if (full.trim()) {
                const { text } = await applyLLMTags(full, ctx);
                await finish({ text, source: "llm" }, providerLabel);
              }
            } else if (full.trim()) {
              const note = "\n\n(Connexion à l'IA interrompue.)";
              send({ type: "delta", text: note });
              const { text, actions } = await applyLLMTags(full, ctx);
              await finish({ text: text + note, source: "llm", actions }, providerLabel);
            } else {
              const fb = await fallbackBrain(ctx, shortReason(reason));
              send({ type: "meta", conversationId: convId, source: fb.source });
              send({ type: "delta", text: fb.text });
              await finish(fb);
            }
          }
        } else {
          const fb = await fallbackBrain(ctx);
          send({ type: "meta", conversationId: convId, source: fb.source });
          send({ type: "delta", text: fb.text });
          await finish(fb);
        }
        await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, convId));
      } catch (err) {
        console.error("[jarvis] chat error", err);
        send({ type: "error", message: err instanceof Error ? err.message : "Erreur interne" });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
