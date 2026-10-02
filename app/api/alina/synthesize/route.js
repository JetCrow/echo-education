export const runtime = "nodejs";
const service = "http://127.0.0.1:8006";
const headers = { "Cache-Control": "no-store" };
const validId = (id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);

export async function GET() {
  try {
    const response = await fetch(`${service}/health`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error();
    return Response.json({ ready: true }, { headers });
  } catch {
    return Response.json({ error: "Запустіть локальний сервіс голосу Аліни (порт 8006)." }, { status: 503, headers });
  }
}

export async function POST(request) {
  let data;
  try { data = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers }); }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return Response.json({ error: "Invalid synthesis request" }, { status: 400, headers });
  }
  if (!validId(data.id) || typeof data.text !== "string" || !data.text.trim() || data.text.length > 6000) {
    return Response.json({ error: "Invalid synthesis request" }, { status: 400, headers });
  }
  try {
    const response = await fetch(`${service}/synthesize`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: data.id, text: data.text }), cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
    });
    if (!response.ok) throw new Error();
    return new Response(response.body, { headers: { ...headers, "Content-Type": "application/json" } });
  } catch {
    fetch(`${service}/cancel/${data.id}`, { method: "POST", signal: AbortSignal.timeout(2000) }).catch(() => {});
    return Response.json({ error: "Не вдалося озвучити відповідь. Перевірте локальний сервіс голосу." }, { status: 502, headers });
  }
}

export async function DELETE(request) {
  let data;
  try { data = await request.json(); } catch { return Response.json({}, { status: 400, headers }); }
  if (!data || typeof data !== "object" || Array.isArray(data)) return Response.json({}, { status: 400, headers });
  if (!validId(data.id)) return Response.json({}, { status: 400, headers });
  try {
    await fetch(`${service}/cancel/${data.id}`, { method: "POST", signal: AbortSignal.timeout(2000) });
  } catch { /* Playback has already stopped in the browser. */ }
  return Response.json({ ok: true }, { headers });
}
