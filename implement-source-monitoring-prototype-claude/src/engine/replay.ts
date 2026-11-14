import { SPEEDS } from "./constants";

/**
 * Replay clock as a pure reducer. The virtual time T is the ONLY input to derivation, so
 * playing, stepping and seeking to the same T give identical results by construction.
 * The wall-clock delta used by `advance` is supplied by the UI timer; this module never reads a clock.
 */
export interface ReplayState {
  T: number;
  duration: number;
  speed: number;
  playing: boolean;
  /** Sub-second remainder (virtual ms) carried between timer ticks. */
  carryMs: number;
}

export type ReplayAction =
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle" }
  | { type: "step"; delta: number }
  | { type: "seek"; T: number }
  | { type: "restart" }
  | { type: "setSpeed"; speed: number }
  | { type: "advance"; wallMs: number };

export function initialReplay(duration: number, T = 0, speed = 1): ReplayState {
  return { T: clamp(T, 0, duration), duration, speed, playing: false, carryMs: 0 };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function replayStatus(s: ReplayState): "PLAYING" | "PAUSED" | "STOPPED (end of log)" {
  if (s.playing) return "PLAYING";
  return s.T >= s.duration ? "STOPPED (end of log)" : "PAUSED";
}

export function replayReducer(s: ReplayState, a: ReplayAction): ReplayState {
  switch (a.type) {
    case "play": {
      if (s.T >= s.duration) return { ...s, T: 0, playing: true, carryMs: 0 };
      return { ...s, playing: true };
    }
    case "pause":
      return { ...s, playing: false, carryMs: 0 };
    case "toggle":
      return replayReducer(s, { type: s.playing ? "pause" : "play" });
    case "step":
      return { ...s, T: clamp(Math.trunc(s.T + a.delta), 0, s.duration), playing: false, carryMs: 0 };
    case "seek":
      return { ...s, T: clamp(Math.trunc(a.T), 0, s.duration), playing: false, carryMs: 0 };
    case "restart":
      return { ...s, T: 0, playing: false, carryMs: 0 };
    case "setSpeed":
      return (SPEEDS as readonly number[]).includes(a.speed) ? { ...s, speed: a.speed } : s;
    case "advance": {
      if (!s.playing || !(a.wallMs > 0)) return s;
      const total = s.carryMs + a.wallMs * s.speed;
      const whole = Math.floor(total / 1000);
      const T = clamp(s.T + whole, 0, s.duration);
      const done = T >= s.duration;
      return { ...s, T, carryMs: done ? 0 : total - whole * 1000, playing: !done };
    }
  }
}
