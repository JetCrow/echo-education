import { test } from "node:test";
import assert from "node:assert/strict";
import { AlinaVoice } from "../app/lib/alina-voice.js";

const done = id => ({ type: "response.done", response: { id, status: "completed",
  output: [{ role: "assistant", content: [{ type: "output_text", text: "Привіт!" }] }] } });
const flush = () => new Promise(resolve => setImmediate(resolve));

test("barge-in rejects delayed synthesis and ignores an old response.done", async t => {
  let resolveFetch, sources = 0;
  const states = [];
  t.mock.method(globalThis, "fetch", (_url, options) => options.method === "DELETE"
    ? Promise.resolve({ ok: true }) : new Promise(resolve => { resolveFetch = resolve; }));
  const voice = new AlinaVoice({ context: { createBufferSource: () => { sources++; } },
    avatar: { close() {} }, onState: s => states.push(s), onError: assert.fail });
  voice.handle({ type: "response.created", response: { id: "old" } });
  voice.handle(done("old"));
  voice.handle({ type: "input_audio_buffer.speech_started" });
  resolveFetch({ ok: true, json: async () => ({ wav: "", cues: [] }) });
  await flush();
  voice.handle(done("old"));
  assert.equal(sources, 0);
  assert.equal(voice.run, null);
  assert.equal(states.at(-1), "listening");
});

test("interruption during avatar preparation never schedules sound", async t => {
  let prepared, sources = 0;
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ wav: "AA==", cues: [] }) }));
  t.mock.method(globalThis, "requestAnimationFrame", callback => setImmediate(callback));
  const voice = new AlinaVoice({ context: { decodeAudioData: async () => ({ duration: 1 }), createBufferSource: () => { sources++; } },
    avatar: { close() {}, waitForSpeech: () => new Promise(resolve => { prepared = resolve; }) },
    onState() {}, onError: assert.fail });
  voice.handle({ type: "response.created", response: { id: "one" } });
  voice.handle(done("one"));
  await flush(); await flush();
  voice.handle({ type: "input_audio_buffer.speech_started" });
  prepared(); await flush();
  assert.equal(sources, 0);
});

test("playback owns speaking duration; end stops the source and allows a fresh turn", async t => {
  const states = [], sources = [];
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ wav: "AA==", cues: [] }) }));
  t.mock.method(globalThis, "requestAnimationFrame", callback => setImmediate(callback));
  const voice = new AlinaVoice({ context: { currentTime: 5, destination: {},
    decodeAudioData: async () => ({ duration: 2 }), createBufferSource: () => {
      const source = { connect() {}, start(t) { this.started = t; }, stop() { this.stopped = true; } }; sources.push(source); return source;
    } }, avatar: { close() {}, waitForSpeech: async () => {}, begin() {} }, onState: s => states.push(s), onError: assert.fail });
  voice.handle({ type: "response.created", response: { id: "one" } }); voice.handle(done("one"));
  await flush(); await flush();
  assert.equal(sources[0].started, 5.035);
  assert.equal(states.at(-1), "speaking");
  voice.handle({ type: "input_audio_buffer.speech_started" });
  assert.equal(sources[0].stopped, true);
  assert.equal(sources[0].onended, null);
  voice.handle({ type: "response.created", response: { id: "two" } }); voice.handle(done("two"));
  await flush(); await flush();
  sources[1].onended();
  assert.equal(states.at(-1), "listening");
  voice.dispose(); voice.handle(done("two"));
  assert.equal(voice.run, null);
});

// The browser provides this API; Node needs a stub for scheduling tests.
globalThis.requestAnimationFrame ??= callback => setImmediate(callback);
