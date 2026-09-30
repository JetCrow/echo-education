"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

  const releaseSession = useCallback(() => {
    const request = requestRef.current;
    requestRef.current = null;
    if (request) {
      clearTimeout(request.timeout);
      request.controller.abort();
      if (request.channel) {
        request.channel.onclose = null;
        request.channel.onerror = null;
        request.channel.close();
      }
      if (request.peer) {
        request.peer.ontrack = null;
        request.peer.onconnectionstatechange = null;
        request.peer.getReceivers().forEach(({ track }) => track?.stop());
        request.peer.close();
      }
      if (request.audio) {
        request.audio.pause();
        request.audio.srcObject?.getTracks().forEach((track) => track.stop());
        request.audio.srcObject = null;
      }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => releaseSession, [releaseSession]);

  async function startSession() {
    if (streamRef.current || requestRef.current) {
      return;
    }

    const request = { controller: new AbortController() };
    requestRef.current = request;
    setIsStarting(true);
    setError("");

    function fail(message = "Не вдалося підключитися. Спробуйте ще раз.") {
      if (requestRef.current !== request) return;
      releaseSession();
      setIsStarting(false);
      setIsMuted(false);
      setState("idle");
      setError(message);
    }

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
      request.timeout = setTimeout(() => {
        fail();
      }, 30000);

      const tokenResponse = await fetch("/api/realtime-token", {
        method: "POST",
        signal: request.controller.signal,
      });
      if (requestRef.current !== request) return;
      if (!tokenResponse.ok) throw new Error("Token request failed");
      const { value, expires_at } = await tokenResponse.json();
      if (requestRef.current !== request) return;
      if (typeof value !== "string" || !value || !Number.isFinite(expires_at) || expires_at * 1000 <= Date.now()) {
        throw new Error("Invalid client secret");
      }

      const peer = new RTCPeerConnection();
      request.peer = peer;
      const audio = new Audio();
      request.audio = audio;
      audio.autoplay = true;
      peer.ontrack = (event) => {
        if (requestRef.current !== request) {
          event.track.stop();
          return;
        }
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        audio.play().catch(() => {
          fail("Не вдалося відтворити звук. Спробуйте почати знову.");
        });
      };
      peer.onconnectionstatechange = () => {
        if (requestRef.current !== request) return;
        if (peer.connectionState === "connected") {
          clearTimeout(request.timeout);
          setError("");
          setIsStarting(false);
          setState("listening");
        } else if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
          fail("З’єднання перервано. Спробуйте почати знову.");
        }
      };
      stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));
      request.channel = peer.createDataChannel("oai-events");
      request.channel.onerror = () => fail();
      request.channel.onclose = () => fail("З’єднання завершено. Спробуйте почати знову.");

      const offer = await peer.createOffer();
      if (requestRef.current !== request) return;
      await peer.setLocalDescription(offer);
      if (requestRef.current !== request) return;
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${value}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
        signal: request.controller.signal,
      });
      if (requestRef.current !== request) return;
      if (!sdpResponse.ok) throw new Error("SDP request failed");
      const sdp = await sdpResponse.text();
      if (requestRef.current !== request) return;
      await peer.setRemoteDescription({ type: "answer", sdp });
      if (requestRef.current !== request) return;
    } catch (cause) {
      if (requestRef.current !== request) return;
      fail(cause.name === "NotAllowedError"
        ? "Доступ до мікрофона заборонено. Дозвольте доступ і спробуйте ще раз."
        : "Не вдалося підключитися. Перевірте мікрофон і з’єднання та спробуйте ще раз.");
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
    releaseSession();
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
            {isStarting ? "Підключення…" : "Почати"}
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
