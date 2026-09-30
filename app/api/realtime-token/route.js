export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  const headers = { "Cache-Control": "no-store" };

  if (!apiKey) {
    return Response.json(
      { error: "OpenAI API key is not configured on the server." },
      { status: 500, headers },
    );
  }

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": "echo-education-prototype",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: "gpt-realtime-2.1",
          audio: { output: { voice: "marin" } },
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error("Client secret request failed");
    }

    const { value, expires_at } = await response.json();
    if (
      typeof value !== "string" || !value || value === apiKey ||
      !Number.isInteger(expires_at) || expires_at <= 0
    ) {
      throw new Error("Invalid client secret response");
    }

    return Response.json({ value, expires_at }, { headers });
  } catch {
    return Response.json(
      { error: "Unable to create a Realtime client secret." },
      { status: 502, headers },
    );
  }
}
