# ECHO Architecture — MVP

## Principle

Keep the first version intentionally small.

Do not build infrastructure for future features until those features are approved.

## Initial stack

- **Frontend:** Next.js
- **Deployment:** Vercel
- **Voice AI:** OpenAI Realtime API
- **Browser transport:** WebRTC
- **Avatar:** lightweight client-side visual state only

## High-level flow

```text
Student browser
    |
    | microphone + speaker
    |
  WebRTC
    |
OpenAI Realtime session
    |
Teacher-role instructions
```

The application backend is responsible for securely creating the realtime session / temporary credentials.

The permanent API key must never be exposed to the browser.

## Frontend responsibilities

The browser should only contain:

- one main screen;
- avatar;
- session state;
- Start button;
- Mute button;
- End button;
- realtime audio connection.

## Avatar state

Only these states are needed initially:

- idle
- listening
- speaking

A separate thinking state may be added later only if needed.

The avatar does not need photorealistic lip sync in the MVP.

## Backend responsibilities

Only what is necessary to establish the realtime voice session.

No persistent application database is required for MVP.

## No persistence

For the first prototype:

- no account;
- no student history;
- no stored transcript;
- no memory between sessions.

Closing the session ends the interaction.

## Security rules

- OpenAI secret keys remain server-side.
- Do not store child audio by default.
- Do not add logging of conversation content unless explicitly approved.
- The AI must clearly identify itself as an AI assistant if asked.
- The app must not pretend that the avatar is the real teacher.

## Development rule

Architecture changes require explicit approval before implementation.

Codex must not introduce additional frameworks, state-management systems, databases, queues, auth providers, or infrastructure because they may be useful later.
