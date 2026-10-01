"use client";
import { useEffect, useRef, useState } from "react";
import { decodePcm } from "./pcm";
import styles from "./page.module.css";

const phrases = ["Привіт! Розкажи, які кольори ти бачиш навколо себе.", "Чим теплі кольори відрізняються від холодних?", "Поглянь на картину. Що ти помітив спочатку? Спробуй пояснити, чому саме ця деталь привернула твою увагу.", "Уяви, що ти малюєш осінній парк. Обери три кольори й поясни свій вибір. Тут може бути багато правильних відповідей.", "Порівняй дві мелодії: одну спокійну й одну жваву. Як змінюються темп і настрій? Спробуй передати ритм плесканням, а потім розкажи про свої відчуття."];
const fields = ["id", "kind", "characters", "firstByteMs", "serverFirstByteMs", "scheduledMs", "firstRenderedMs", "interruptToClearMs", "interruptToLastSampleMs", "underruns", "contextRate", "baseLatencyMs", "outputLatencyMs", "userAgent", "result"];
const fmt = value => Number.isFinite(value) ? value.toFixed(1) : "—";
function percentile(rows, key, p) { const values = rows.filter(r => r.result === "done").map(r => r[key]).filter(Number.isFinite).sort((a,b)=>a-b); return values.length ? values[Math.ceil(values.length*p)-1] : null; }

export default function VoiceTest() {
  const [text, setText] = useState(phrases[2]), [busy, setBusy] = useState(false), [status, setStatus] = useState("Готова"), [rows, setRows] = useState([]), [error, setError] = useState("");
  const engine = useRef(null), active = useRef(null), counter = useRef(0), batch = useRef(false), mounting = useRef(null);
  const settle = (run, result) => {
    if (run.settled) return; run.settled = true; run.row.result = result;
    if (active.current === run) { active.current = null; setBusy(false); setStatus(result === "done" ? "Готова" : result === "interrupted" ? "Перервано" : "Помилка"); }
    setRows(previous => [...previous, { ...run.row }]); run.resolve();
  };
  async function initialize() {
    if (engine.current) { await engine.current.context.resume(); return engine.current; }
    if (mounting.current) return mounting.current;
    mounting.current = (async () => {
      const context = new AudioContext();
      try {
        await context.audioWorklet.addModule("/tts-test/pcm-worklet.js"); await context.resume();
        const node = new AudioWorkletNode(context, "pcm-player", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
        node.connect(context.destination); engine.current = { context, node };
        node.port.onmessage = ({ data }) => {
          const run = active.current; if (!run || run.id !== data.id) return;
          const elapsed = data.audioTime * 1000 + run.clockOffset - run.clicked;
          if (data.type === "scheduled") run.row.scheduledMs = elapsed;
          if (data.type === "first") { run.row.firstRenderedMs = elapsed; setStatus("Говорить"); }
          if (data.type === "done" || data.type === "stopped") {
            run.row.underruns = data.underruns;
            if (run.interruptedAt !== undefined) {
              run.row.interruptToClearMs = Math.max(0, data.audioTime * 1000 + run.clockOffset - run.interruptedAt);
              run.row.interruptToLastSampleMs = data.lastNonSilent === null ? 0 : Math.max(0, data.lastNonSilent * 1000 + run.clockOffset - run.interruptedAt);
            }
            settle(run, data.type === "done" ? "done" : run.failure ? "error" : "interrupted");
          }
          if (data.type === "overflow") { setError("Переповнено аудіобуфер."); run.failure = true; run.abort.abort(); settle(run,"error"); }
        };
        return engine.current;
      } catch (e) { await context.close(); throw e; }
      finally { mounting.current = null; }
    })();
    return mounting.current;
  }
  function interrupt() {
    batch.current = false; const run = active.current; if (!run) return;
    run.interruptedAt = performance.now(); run.abort.abort();
    if (engine.current && run.started) engine.current.node.port.postMessage({ type: "stop", id: run.id });
    else settle(run, "interrupted");
  }
  async function play(value) {
    const clicked = performance.now(), id = ++counter.current;
    let resolve; const done = new Promise(r => { resolve = r; });
    const run = { id, clicked, abort: new AbortController(), resolve, row: { id, kind: engine.current ? "warm-client" : "cold-client", characters: value.length, userAgent: navigator.userAgent, result: "pending" } };
    active.current = run; setBusy(true); setError(""); setStatus("Отримує аудіо…");
    try {
      const { context, node } = await initialize();
      if (active.current !== run || run.abort.signal.aborted) return done;
      run.clockOffset = performance.now() - context.currentTime * 1000;
      Object.assign(run.row, { contextRate: context.sampleRate, baseLatencyMs: context.baseLatency * 1000, outputLatencyMs: typeof context.outputLatency === "number" ? context.outputLatency * 1000 : null });
      run.started = true; node.port.postMessage({ type: "start", id });
      const response = await fetch("/api/tts-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: value }), signal: run.abort.signal });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || "Помилка синтезу."); }
      run.row.serverFirstByteMs = Number(response.headers.get("X-TTS-First-Byte-Ms"));
      const reader = response.body.getReader(); let remainder = null;
      while (true) {
        const { value: bytes, done: ended } = await reader.read();
        if (active.current !== run || run.abort.signal.aborted) { await reader.cancel(); break; }
        if (ended) {
          if (remainder !== null) throw new Error("Неповний PCM sample.");
          node.port.postMessage({ type: "end", id }); break;
        }
        if (!bytes.length) continue;
        if (run.row.firstByteMs === undefined) run.row.firstByteMs = performance.now() - clicked;
        const decoded = decodePcm(bytes, remainder); remainder = decoded.remainder;
        if (decoded.samples.length) node.port.postMessage({ type: "pcm", id, samples: decoded.samples }, [decoded.samples.buffer]);
      }
    } catch (e) {
      if (!run.settled && !run.abort.signal.aborted) {
        batch.current = false; run.failure = true; setError(e.message || "Помилка аудіо."); run.abort.abort();
        if (run.started) engine.current.node.port.postMessage({ type: "stop", id }); else settle(run,"error");
      }
    }
    return done;
  }
  async function measure20() {
    batch.current = true;
    for (let i = 0; i < 20 && batch.current; i++) await play(`${phrases[i % phrases.length]} ${i < 10 ? "Спробуй відповісти своїми словами." : "Можеш не поспішати. Подумай і наведи власний приклад."}`);
    batch.current = false;
  }
  useEffect(() => () => {
    batch.current = false; active.current?.abort.abort();
    if (engine.current) { engine.current.node.disconnect(); engine.current.context.close(); }
  }, []);
  function download() {
    const csv = [fields.join(","), ...rows.map(r => fields.map(k => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const a = document.createElement("a"); a.href = url; a.download = "tts-measurements.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  const completed = rows.filter(r => r.result === "done").length;
  return <main className={styles.page}>
    <h1>Тест потокового голосу</h1>
    <p className={styles.note}>ECHO — AI-помічник учителя. Голос coral, не голос реальної Аліни. Тут тестуємо синтез нового тексту; губи залишаються закритими.</p>
    <div className={styles.content}>
      <video className={styles.video} src="/tts-test/idle.mp4" autoPlay muted loop playsInline aria-label="Аліна в стані спокою" />
      <div className={styles.form}>
        <label htmlFor="tts-text">Текст українською</label>
        <textarea id="tts-text" maxLength={1500} value={text} onChange={e => setText(e.target.value)} />
        <div className={styles.buttons}>
          <button disabled={busy || !text.trim()} onClick={() => play(text)}>Озвучити</button>
          <button disabled={!busy} onClick={interrupt}>Перебити</button>
          <button disabled={busy} onClick={measure20}>20 запусків API</button>
          <button disabled={!rows.length} onClick={download}>Зберегти CSV</button>
        </div>
        <p role="status">{status}</p>{error && <p className={styles.error} role="alert">{error}</p>}
        <p className={styles.note}>20 запусків використовують платний API. Результати лише в пам’яті цієї вкладки; текст не записується в CSV. Cold/warm означає стан клієнтського AudioContext, не сервера OpenAI.</p>
      </div>
    </div>
    <p>Завершено: {completed}. Перший PCM у рендері: p50 {fmt(percentile(rows,"firstRenderedMs",.5))} мс; p95 {fmt(percentile(rows,"firstRenderedMs",.95))} мс. Помилок: {rows.filter(r=>r.result==="error").length}.</p>
    <p className={styles.note}>Час PCM у рендері — наближення, а не акустичний замір. Затримка пристрою вказана окремо. API first byte вимірюється на сервері незалежно від годинника браузера.</p>
    <div className={styles.table}><table><thead><tr>{fields.map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}>{fields.map(k=><td key={k}>{typeof r[k]==="number"?fmt(r[k]):r[k]??"—"}</td>)}</tr>)}</tbody></table></div>
  </main>;
}
