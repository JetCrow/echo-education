export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const headers = { "Cache-Control": "no-store" };
  let text;
  try { ({ text } = await request.json()); } catch {
    return Response.json({ error: "Некоректний запит." }, { status: 400, headers });
  }
  if (typeof text !== "string" || !text.trim() || text.length > 1500) {
    return Response.json({ error: "Введіть від 1 до 1500 символів." }, { status: 400, headers });
  }
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "На сервері не налаштовано OPENAI_API_KEY." }, { status: 503, headers });
  }
  const abort = new AbortController();
  const cancel = () => abort.abort();
  request.signal.addEventListener("abort", cancel, { once: true });
  if (request.signal.aborted) cancel();
  const timer = setTimeout(cancel, 55000);
  const cleanup = () => { clearTimeout(timer); request.signal.removeEventListener("abort", cancel); };
  let reader;
  try {
    const started = performance.now();
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST", cache: "no-store", signal: abort.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json", "OpenAI-Safety-Identifier": "echo-education-tts-test" },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "coral", input: text.trim(), response_format: "pcm", instructions: "Говори українською природно, спокійно й чітко, як доброзичливий дорослий учитель. Не сповільнюй мовлення надмірно." }),
    });
    if (!response.ok || !response.body) {
      abort.abort(); cleanup();
      return Response.json({ error: "Сервіс синтезу недоступний.", upstreamStatus: response.status }, { status: 502, headers });
    }
    reader = response.body.getReader();
    let first = await reader.read();
    while (!first.done && !first.value.length) first = await reader.read();
    if (first.done) throw new Error("Empty upstream audio");
    const firstByteMs = performance.now() - started;
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(first.value); },
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) { cleanup(); reader.releaseLock(); controller.close(); }
          else controller.enqueue(chunk.value);
        } catch { cleanup(); abort.abort(); controller.error(new Error("Audio stream interrupted")); }
      },
      async cancel() { abort.abort(); cleanup(); try { await reader.cancel(); } catch {} },
    }), { headers: { ...headers, "Content-Type": "application/octet-stream", "X-Accel-Buffering": "no", "X-TTS-First-Byte-Ms": firstByteMs.toFixed(2), "X-PCM-Sample-Rate": "24000" } });
  } catch {
    cleanup(); abort.abort(); if (reader) { try { await reader.cancel(); } catch {} }
    return Response.json({ error: "Не вдалося отримати потік аудіо." }, { status: 502, headers });
  }
}
