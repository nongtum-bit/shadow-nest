import { create } from "zustand";
import { LEVELS, loadProgress, saveProgress } from "./levels";
import type { HudSnapshot, MissionStats } from "./types";

export type Screen = "title" | "missions" | "briefing" | "playing" | "paused" | "win" | "lose" | "help";

type Store = {
  screen: Screen;
  mission: number;
  locked: boolean;
  hud: HudSnapshot | null;
  stats: MissionStats | null;
  best: Record<string, string>;
  muted: boolean;
  setScreen: (s: Screen) => void;
  selectMission: (i: number) => void;
  deploy: () => void;
  pause: () => void;
  resume: () => void;
  abort: () => void;
  win: (s: MissionStats) => void;
  lose: () => void;
  retry: () => void;
  setHud: (h: HudSnapshot) => void;
  setLocked: (v: boolean) => void;
  toggleMute: () => void;
};

export const useGame = create<Store>((set, get) => ({
  screen: "title",
  mission: 0,
  locked: false,
  hud: null,
  stats: null,
  best: loadProgress().best,
  muted: false,
  setScreen: (screen) => set({ screen }),
  selectMission: (mission) => set({ mission, screen: "briefing" }),
  deploy: () => set({ screen: "playing", hud: null, stats: null, locked: false }),
  pause: () => {
    if (get().screen === "playing") set({ screen: "paused" });
  },
  resume: () => set({ screen: "playing" }),
  abort: () => set({ screen: "missions", hud: null }),
  win: (stats) => {
    const id = LEVELS[get().mission]?.id ?? "";
    const rankScore = { GHOST: 3, SHADOW: 2, OPERATIVE: 1 };
    const prev = get().best[id];
    const best = { ...get().best };
    if (!prev || (rankScore[stats.rank] ?? 0) > (rankScore[prev as MissionStats["rank"]] ?? 0)) {
      best[id] = stats.rank;
      saveProgress(best);
    }
    set({ screen: "win", stats, best });
  },
  lose: () => set({ screen: "lose" }),
  retry: () => set({ screen: "playing", hud: null, stats: null, locked: false }),
  setHud: (hud) => set({ hud }),
  setLocked: (locked) => set({ locked }),
  toggleMute: () => set({ muted: !get().muted }),
}));

export { LEVELS };
