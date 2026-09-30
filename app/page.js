"use client";

import { useState } from "react";

const stateLabels = {
  idle: "Очікування",
  listening: "Слухає",
  speaking: "Говорить",
};

export default function Home() {
  const [state, setState] = useState("idle");
  const [isMuted, setIsMuted] = useState(false);

  // Temporary UI preview: reuse the start button to switch active states.
  function advanceState() {
    setState((current) => current === "listening" ? "speaking" : "listening");
  }

  function endSession() {
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
          <button type="button" className="primaryButton" onClick={advanceState}>
            {state === "idle" ? "Почати" : state === "listening" ? "Показати мовлення" : "Показати слухання"}
          </button>
          <button type="button" aria-pressed={isMuted} onClick={() => setIsMuted((current) => !current)}>
            {isMuted ? "Увімкнути мікрофон" : "Вимкнути мікрофон"}
          </button>
          <button type="button" onClick={endSession}>
            {"\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0438"}
          </button>
        </div>
      </section>
    </main>
  );
}
