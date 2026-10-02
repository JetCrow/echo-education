"use client";

import { useEffect, useRef } from "react";
import { MouthPlayer } from "../lib/mouth-player";

export default function TeacherAvatar({ playerRef, onError }) {
  const canvas = useRef(null);
  const idle = useRef(null);
  const thinking = useRef(null);
  useEffect(() => {
    const player = new MouthPlayer({ canvas: canvas.current, idle: idle.current,
      thinking: thinking.current, onError });
    playerRef.current = player;
    return () => {
      player.destroy();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [playerRef, onError]);
  return (
    <div className="teacherAvatar" role="img" aria-label="Аліна — AI-помічниця вчителя">
      <video ref={idle} src="/teachers/alina/live/idle.mp4" autoPlay muted loop playsInline aria-hidden="true" />
      <video ref={thinking} src="/teachers/alina/live/thinking.mp4" autoPlay muted loop playsInline aria-hidden="true" />
      <canvas ref={canvas} width="768" height="960" aria-hidden="true" />
    </div>
  );
}
