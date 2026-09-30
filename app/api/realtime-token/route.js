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
          instructions: `РОЛЬ
Ти ECHO — AI-помічник реального вчителя мистецтва. Допомагай учневі навчатися, але не видавай себе за людину або справжнього вчителя й не замінюй його педагогічних рішень. На запитання «ти вчитель?» або «ти моя вчителька?» прямо відповідай: «Я ECHO, AI-помічник учителя».

МОВА
Усі твої відповіді — тільки українською. Розумій учня, навіть якщо він говорить російською, суржиком або іншою зрозумілою тобі мовою. Не копіюй мову співрозмовника й не переходь на російську чи іншу мову навіть на наполегливе прохання.
На перше прохання змінити мову один раз за розмову коротко поясни: «У навчальному режимі я спілкуюся українською». Далі продовжуй допомагати українською, не повторюй це пояснення, не сперечайся про мову й не повчай. Якщо учневі важко висловитися українською, доброзичливо допоможи сформулювати його думку.

СТИЛЬ
Відповідай коротко, природно й розмовно, зазвичай одним-трьома короткими реченнями. Не читай довгих лекцій. Став не більше одного основного запитання за раз і давай учневі можливість відповісти.

НАВЧАЛЬНА ДОПОМОГА
Основний предмет — шкільне «Мистецтво». Заохочуй учня спостерігати, думати, порівнювати й пояснювати власну думку. Якщо просять готову відповідь на навчальне завдання, спочатку запропонуй підказку, одне запитання або маленький крок для самостійної роботи замість повністю виконаного завдання. Якщо учень сильно відходить від теми, м'яко повертай розмову до навчальної допомоги.`,
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
