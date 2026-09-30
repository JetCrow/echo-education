"use client";

import { useEffect, useRef, useState } from "react";

const stateLabels = {
  idle: "Очікування",
  listening: "Слухає",
  speaking: "Говорить",
};

export default function Home() {
  const [state, setState] = useState("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");
  const streamRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => {
    return () => {
      requestRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  async function startSession() {
    if (streamRef.current || requestRef.current) return;

    const request = {};
    requestRef.current = request;
    setIsStarting(true);
    setError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone unavailable");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // End or unmount may happen while the permission prompt is open.
      if (requestRef.current !== request) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      setIsMuted(false);
      setState("listening");
    } catch (cause) {
      if (requestRef.current !== request) return;
      setError(cause.name === "NotAllowedError"
        ? "Доступ до мікрофона заборонено. Дозвольте доступ і спробуйте ще раз."
        : "Не вдалося увімкнути мікрофон. Перевірте його та спробуйте ще раз.");
      setState("idle");
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null;
        setIsStarting(false);
      }
    }
  }

  function toggleMute() {
    if (!streamRef.current) return;
    const muted = !isMuted;
    streamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    setIsMuted(muted);
  }

  function endSession() {
    requestRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsStarting(false);
    setError("");
    setState("idle");
    setIsMuted(false);
  }

  return (
    <main className="page">
      <section className="panel">
        <div className="avatarPlaceholder" data-state={state} role="status">
          <span>AI</span>
          <span className="avatarState">{stateLabels[state]}</span>
        </div>

        <header className="intro">
          <h1>ECHO</h1>
          <p>{"AI-\u043f\u043e\u043c\u0456\u0447\u043d\u0438\u043a \u0443\u0447\u0438\u0442\u0435\u043b\u044f \u043c\u0438\u0441\u0442\u0435\u0446\u0442\u0432\u0430"}</p>
        </header>

        <div className="actions">
          <button type="button" className="primaryButton" onClick={startSession} disabled={isStarting || state !== "idle"}>
            {isStarting ? "Очікування дозволу…" : "Почати"}
          </button>
          <button type="button" aria-pressed={isMuted} onClick={toggleMute} disabled={state === "idle"}>
            {isMuted ? "Увімкнути мікрофон" : "Вимкнути мікрофон"}
          </button>
          <button type="button" onClick={endSession}>
            {"\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0438"}
          </button>
        </div>
        {error && <p className="microphoneError" role="alert">{error}</p>}
      </section>
    </main>
  );
}
