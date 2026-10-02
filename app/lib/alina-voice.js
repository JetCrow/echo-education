// A response owns its fetch, audio source and cues. Late results never regain ownership.
export class AlinaVoice {
  constructor({ context, avatar, onState, onError }) {
    Object.assign(this, { context, avatar, onState, onError });
    this.responseId = null;
    this.run = null;
    this.closed = false;
  }
  interrupt() {
    this.responseId = null;
    const run = this.run;
    this.run = null;
    if (run) {
      run.controller.abort();
      if (run.source) { run.source.onended = null; try { run.source.stop(); } catch {} }
      fetch("/api/alina/synthesize", { method: "DELETE", keepalive: true,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: run.id }) }).catch(() => {});
    }
    this.avatar.close();
  }
  dispose() { this.closed = true; this.interrupt(); }
  handle(event) {
    if (this.closed) return;
    if (event.type === "input_audio_buffer.speech_started") {
      this.interrupt(); this.onState("listening");
    } else if (event.type === "input_audio_buffer.speech_stopped") {
      this.onState("thinking");
    } else if (event.type === "response.created") {
      this.interrupt(); this.responseId = event.response.id; this.onState("thinking");
    } else if (event.type === "response.done" && event.response?.id === this.responseId) {
      if (event.response.status !== "completed") { this.interrupt(); this.onState("listening"); return; }
      const text = (event.response.output ?? []).filter(item => item.role === "assistant")
        .flatMap(item => item.content ?? []).filter(part => part.type === "output_text")
        .map(part => part.text).join(" ").trim();
      if (text) void this.speak(event.response.id, text);
      else this.onState("listening");
    }
  }
  async speak(responseId, text) {
    if (this.closed || this.responseId !== responseId || this.run) return;
    const run = { id: crypto.randomUUID(), controller: new AbortController(), source: null };
    this.run = run;
    const current = () => !this.closed && this.run === run && this.responseId === responseId;
    try {
      const response = await fetch("/api/alina/synthesize", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: run.id, text }),
        signal: run.controller.signal });
      if (!current()) return;
      if (!response.ok) throw new Error("Voice service failed");
      const data = await response.json();
      if (!current()) return;
      if (typeof data.wav !== "string" || !Array.isArray(data.cues)) throw new Error("Invalid voice result");
      const bytes = Uint8Array.from(atob(data.wav), c => c.charCodeAt(0));
      const buffer = await this.context.decodeAudioData(bytes.buffer);
      if (!current()) return;
      this.onState("speaking");
      await new Promise(resolve => requestAnimationFrame(resolve));
      await this.avatar.waitForSpeech(run.controller.signal);
      if (!current()) return;
      const start = this.context.currentTime + 0.035;
      const source = this.context.createBufferSource();
      run.source = source;
      source.buffer = buffer; source.connect(this.context.destination);
      this.avatar.begin(this.context, [{ start, end: start + buffer.duration, cues: data.cues }]);
      source.onended = () => {
        if (!current()) return;
        this.run = null; this.responseId = null; this.avatar.close(); this.onState("listening");
      };
      source.start(start);
    } catch {
      if (current()) { this.interrupt(); this.onError("Не вдалося озвучити відповідь. Перевірте локальний сервіс голосу."); }
    }
  }
}
