import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { Crosshair, Volume2, VolumeX } from "lucide-react";
import type { ShadowNestGame } from "@/game/engine";
import { LEVELS, useGame } from "@/game/store";
import type { HudSnapshot } from "@/game/types";

function isTouchDevice() {
  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

const liveGame: { current: ShadowNestGame | null } = { current: null };

function useForceLand() {
  const [force, setForce] = useState(() =>
    typeof window === "undefined" ? false : isTouchDevice() && window.innerHeight > window.innerWidth,
  );
  const [size, setSize] = useState(() => ({
    w: typeof window === "undefined" ? 844 : Math.max(window.innerWidth, window.innerHeight),
    h: typeof window === "undefined" ? 390 : Math.min(window.innerWidth, window.innerHeight),
  }));
  useEffect(() => {
    const apply = () => {
      const vv = window.visualViewport;
      const pw = Math.round(vv?.width ?? window.innerWidth);
      const ph = Math.round(vv?.height ?? window.innerHeight);
      const touch = isTouchDevice();
      const portrait = ph > pw;
      setForce(touch && portrait);
      setSize({ w: Math.max(pw, ph), h: Math.min(pw, ph) });
    };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    window.visualViewport?.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      window.visualViewport?.removeEventListener("resize", apply);
    };
  }, []);
  return { force, ...size };
}

export function GameApp() {
  const screen = useGame((s) => s.screen);
  const land = useForceLand();
  const innerRef = useRef<HTMLDivElement>(null);
  const hold = useRef<{ el: HTMLElement; lx: number; ly: number; id: number } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.has("qa")) {
      const i = Number(q.get("mission") ?? "0") || 0;
      useGame.setState({ mission: i, screen: "playing" });
    }
  }, []);

  const pick = (x: number, y: number) => {
    const root = innerRef.current;
    if (!root) return null;
    const nodes = root.querySelectorAll<HTMLElement>("button, [data-hit]");
    for (let i = nodes.length - 1; i >= 0; i--) {
      const el = nodes[i]!;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el;
    }
    return null;
  };

  const toLocal = (cx: number, cy: number) => {
    if (!land.force) return { x: cx, y: cy };
    return { x: land.w - cy, y: cx };
  };

  const applyHit = (el: HTMLElement, type: "down" | "move" | "up", x: number, y: number) => {
    const hit = el.dataset.hit;
    const g = liveGame.current;
    if (hit === "stick" && g) {
      if (type === "up") {
        g.input.touchMoveX = 0;
        g.input.touchMoveY = 0;
        return;
      }
      const r = el.getBoundingClientRect();
      const c = toLocal(r.left + r.width / 2, r.top + r.height / 2);
      const p = toLocal(x, y);
      const mx = (p.x - c.x) / 38;
      const my = -(p.y - c.y) / 38;
      const m = Math.hypot(mx, my);
      if (m < 0.14) {
        g.input.touchMoveX = 0;
        g.input.touchMoveY = 0;
        return;
      }
      const k = Math.min(1, m);
      g.input.touchMoveX = (mx / m) * k;
      g.input.touchMoveY = (my / m) * k;
      return;
    }
    if (hit === "look" && g) {
      if (type === "move" && hold.current) {
        const a = toLocal(hold.current.lx, hold.current.ly);
        const b = toLocal(x, y);
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const jump = Math.hypot(dx, dy);
        if (jump > 64) {
          hold.current.lx = x;
          hold.current.ly = y;
          return;
        }
        dx = Math.max(-18, Math.min(18, dx));
        dy = Math.max(-18, Math.min(18, dy));
        g.input.touchLookX += dx;
        g.input.touchLookY += dy;
        hold.current.lx = x;
        hold.current.ly = y;
      }
      return;
    }
    if (g && hit === "fire") g.input.touchFire = type !== "up";
    if (g && hit === "ads") g.input.touchAds = type !== "up";
    if (g && hit === "crouch") g.input.touchCrouch = type !== "up";
    if (g && hit === "jump" && type === "down") g.input.touchJump = true;
    if (g && hit === "weapon" && type === "down") g.input.touchWeapon = true;
    if (g && hit === "interact" && type === "down") g.input.touchInteract = true;
    if (!hit && el.tagName === "BUTTON" && type === "up") el.click();
  };

  const onDown = (e: ReactPointerEvent) => {
    if (!land.force) return;
    if (hold.current) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const el = pick(e.clientX, e.clientY);
    if (!el) return;
    hold.current = { el, lx: e.clientX, ly: e.clientY, id: e.pointerId };
    applyHit(el, "down", e.clientX, e.clientY);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!land.force || !hold.current || e.pointerId !== hold.current.id) return;
    applyHit(hold.current.el, "move", e.clientX, e.clientY);
  };
  const onUp = (e: ReactPointerEvent) => {
    if (!land.force || !hold.current || e.pointerId !== hold.current.id) return;
    const h = hold.current;
    hold.current = null;
    applyHit(h.el, "up", e.clientX, e.clientY);
  };

  const innerStyle = land.force
    ? {
        position: "absolute" as const,
        top: 0,
        left: 0,
        width: land.w,
        height: land.h,
        transform: `translateY(${land.w}px) rotate(-90deg)`,
        transformOrigin: "top left",
        pointerEvents: "none" as const,
      }
    : { position: "relative" as const, height: "100dvh", width: "100%" };

  return (
    <div
      className="overflow-hidden bg-bg text-fg"
      style={{ position: "fixed", inset: 0, touchAction: "none" }}
      onPointerDown={land.force ? onDown : undefined}
      onPointerMove={land.force ? onMove : undefined}
      onPointerUp={land.force ? onUp : undefined}
      onPointerCancel={land.force ? onUp : undefined}
    >
      <div ref={innerRef} className="h-full w-full overflow-hidden bg-bg" style={innerStyle}>
        {screen === "playing" || screen === "paused" || screen === "win" || screen === "lose" ? (
          <PlayView />
        ) : (
          <MenuView />
        )}
      </div>
    </div>
  );
}

function MenuView() {
  const screen = useGame((s) => s.screen);
  const setScreen = useGame((s) => s.setScreen);
  const selectMission = useGame((s) => s.selectMission);
  const deploy = useGame((s) => s.deploy);
  const mission = useGame((s) => s.mission);
  const L = LEVELS[mission]!;

  return (
    <div className="flex h-full flex-col">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--color-accent)_14%,transparent),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,var(--color-fg)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-fg)_1px,transparent_1px)] [background-size:48px_48px]" />

      <header className="relative z-10 flex items-center justify-between px-5 pt-3">
        <p className="font-display text-sm tracking-[0.28em] text-muted uppercase">Protocol N-04</p>
        <p className="text-xs text-subtle">low-poly · stealth · perch</p>
      </header>

      {screen === "title" && (
        <main className="relative z-10 mx-auto flex w-full flex-1 flex-row items-center gap-8 px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="mb-2 font-display text-xs tracking-[0.3em] text-accent uppercase">Field Ops</p>
            <h1 className="font-display text-5xl font-semibold leading-[0.9] tracking-tight">SHADOW NEST</h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
              เกมสายลับมุมมองบุคคลที่หนึ่ง ซุ่มบนหอ แล้วเล็งนัดเดียว
            </p>
          </div>
          <div className="flex w-52 shrink-0 flex-col gap-2">
            <Primary onClick={() => setScreen("missions")}>เริ่มปฏิบัติการ</Primary>
            <Ghost onClick={() => setScreen("help")}>วิธีเล่น</Ghost>
          </div>
        </main>
      )}

      {screen === "missions" && (
        <main className="relative z-10 flex h-full flex-col px-5 py-3">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => setScreen("title")} className="text-sm text-muted hover:text-fg">
              กลับ
            </button>
            <h2 className="font-display text-xl font-semibold">เลือกด่าน — แตะแล้วเข้าเกม</h2>
            <span className="w-10" />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-3 gap-3">
            {LEVELS.map((lv, i) => (
              <button
                key={lv.id}
                type="button"
                onClick={() => {
                  selectMission(i);
                  deploy();
                }}
                className="panel flex flex-col rounded-lg p-3 text-left"
              >
                <p className="font-display text-[10px] tracking-[0.2em] text-accent uppercase">
                  0{i + 1} {lv.codename}
                </p>
                <h3 className="mt-1 font-display text-xl font-semibold">{lv.nameTh}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{lv.place}</p>
                <p className="mt-auto pt-3 font-display text-xs tracking-wide text-accent">แตะเพื่อเล่น →</p>
              </button>
            ))}
          </div>
        </main>
      )}

      {screen === "briefing" && (
        <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-5 sm:px-8">
          <button
            type="button"
            onClick={() => setScreen("missions")}
            className="mb-4 self-start text-sm text-muted hover:text-fg"
          >
            เลือกด่านอื่น
          </button>
          <p className="font-display text-sm tracking-[0.28em] text-accent uppercase">{L.codename}</p>
          <h2 className="mt-1 font-display text-3xl font-semibold">{L.nameTh}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{L.briefing}</p>
          <div className="mt-auto pt-6">
            <Primary
              onClick={() => {
                deploy();
              }}
            >
              เข้าเกม
            </Primary>
          </div>
        </main>
      )}

      {screen === "help" && (
        <main className="relative z-10 flex h-full flex-col justify-center px-6 py-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h2 className="font-display text-3xl font-semibold">วิธีเล่น</h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <Row k="จอยซ้าย" v="เดิน" />
                <Row k="ลากกลางจอ" v="เล็ง" />
                <Row k="ปุ่มขาว" v="ยิง" />
                <Row k="เล็ง / ย่อ" v="ซุ่มหลังกำแพงแล้วส่องกล้อง" />
                <Row k="E" v="เปิดลัง / ปิดเงียบ / เก็บแฟ้ม" />
                <Row k="เป้าหมาย" v="กำจัด HVT แล้วเข้าโซนถอนตัว" />
              </dl>
            </div>
            <div className="w-48 shrink-0">
              <Primary onClick={() => setScreen("missions")}>เลือกด่าน</Primary>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

function PlayView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ShadowNestGame | null>(null);
  const screen = useGame((s) => s.screen);
  const mission = useGame((s) => s.mission);
  const hud = useGame((s) => s.hud);
  const locked = useGame((s) => s.locked);
  const muted = useGame((s) => s.muted);
  const stats = useGame((s) => s.stats);
  const setHud = useGame((s) => s.setHud);
  const setLocked = useGame((s) => s.setLocked);
  const pause = useGame((s) => s.pause);
  const resume = useGame((s) => s.resume);
  const abort = useGame((s) => s.abort);
  const win = useGame((s) => s.win);
  const lose = useGame((s) => s.lose);
  const retry = useGame((s) => s.retry);
  const toggleMute = useGame((s) => s.toggleMute);
  const setScreen = useGame((s) => s.setScreen);
  const [touch, setTouch] = useState(false);
  const [session, setSession] = useState(0);

  useEffect(() => {
    setTouch(isTouchDevice());
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let game: ShadowNestGame | null = null;
    void import("@/game/engine").then(({ ShadowNestGame }) => {
      if (disposed || !canvas) return;
      game = new ShadowNestGame(canvas, {
        onHud: (h) => setHud(h),
        onWin: (s) => win(s),
        onLose: () => lose(),
        onPause: () => pause(),
        onLock: (v) => setLocked(v),
      });
      game.start(mission);
      game.audio.setMuted(useGame.getState().muted);
      gameRef.current = game;
      liveGame.current = game;
    });
    return () => {
      disposed = true;
      game?.dispose();
      gameRef.current = null;
      liveGame.current = null;
    };
  }, [mission, session, lose, pause, setHud, setLocked, win]);

  useEffect(() => {
    gameRef.current?.setPaused(screen !== "playing");
  }, [screen]);

  useEffect(() => {
    gameRef.current?.audio.setMuted(muted);
  }, [muted]);

  const onCanvasClick = useCallback(() => {
    if (screen !== "playing") return;
    gameRef.current?.requestLock();
    gameRef.current?.audio.unlock();
  }, [screen]);

  const L = LEVELS[mission]!;

  return (
    <div className="relative h-full w-full" style={{ touchAction: "none" }}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        onClick={onCanvasClick}
        onContextMenu={(e) => e.preventDefault()}
      />
      {hud && screen === "playing" && <Hud hud={hud} compact={touch} />}
      {hud && screen === "playing" && hud.scope && <Scope />}
      {screen === "playing" && !locked && !touch && (
        <button
          type="button"
          className="absolute inset-0 z-20 flex items-center justify-center bg-bg/25"
          onClick={onCanvasClick}
        >
          <span className="panel rounded-md px-6 py-4 font-display text-xl tracking-wide">
            คลิกเพื่อล็อกเมาส์
          </span>
        </button>
      )}
      {touch && screen === "playing" && <TouchPad gameRef={gameRef} />}
      {(screen === "paused" || screen === "win" || screen === "lose") && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/70 px-5">
          <div className="panel w-full max-w-md rounded-xl p-6">
            {screen === "paused" && (
              <>
                <h2 className="font-display text-3xl font-semibold">พักการปฏิบัติ</h2>
                <p className="mt-1 text-sm text-muted">{L.nameTh}</p>
                <div className="mt-6 flex flex-col gap-2">
                  <Primary onClick={resume}>กลับเข้าพื้นที่</Primary>
                  <Ghost onClick={abort}>ทิ้งภารกิจ</Ghost>
                </div>
              </>
            )}
            {screen === "win" && stats && (
              <>
                <p className="font-display text-sm tracking-[0.28em] text-ok uppercase">{stats.rank}</p>
                <h2 className="mt-1 font-display text-3xl font-semibold">ถอนตัวสำเร็จ</h2>
                <ul className="mt-4 space-y-1 text-sm text-muted tabular-nums">
                  <li>
                    เวลา {Math.floor(stats.timeSec / 60)}:
                    {String(Math.floor(stats.timeSec % 60)).padStart(2, "0")}
                  </li>
                  <li>
                    กำจัด {stats.kills} · ยิงหัว {stats.headshots}
                  </li>
                  <li>ข่าวกรอง {stats.intel}</li>
                  <li>{stats.spotted ? "ถูกพบ" : "ไม่ถูกพบ"}</li>
                </ul>
                <div className="mt-6 flex flex-col gap-2">
                  <Primary onClick={() => setScreen("missions")}>เลือกด่านถัดไป</Primary>
                  <Ghost
                    onClick={() => {
                      setSession((n) => n + 1);
                      retry();
                    }}
                  >
                    ลงซ้ำ
                  </Ghost>
                </div>
              </>
            )}
            {screen === "lose" && (
              <>
                <h2 className="font-display text-3xl font-semibold">ปฏิบัติการล้มเหลว</h2>
                <p className="mt-2 text-sm text-muted">โดนยิงจนหมดสภาพ ลองซุ่มจากที่สูงกว่านี้</p>
                <div className="mt-6 flex flex-col gap-2">
                  <Primary
                    onClick={() => {
                      setSession((n) => n + 1);
                      retry();
                    }}
                  >
                    ลงใหม่
                  </Primary>
                  <Ghost onClick={abort}>กลับเลือกด่าน</Ghost>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <div className="pointer-events-auto absolute top-[max(0.5rem,env(safe-area-inset-top))] right-[max(0.5rem,env(safe-area-inset-right))] z-40 flex gap-2">
        <IconBtn label={muted ? "เปิดเสียง" : "ปิดเสียง"} onClick={toggleMute}>
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </IconBtn>
        {screen === "playing" && (
          <IconBtn label="พัก" onClick={pause}>
            <span className="font-display text-xs tracking-widest">ESC</span>
          </IconBtn>
        )}
      </div>
    </div>
  );
}

function Hud({ hud, compact }: { hud: HudSnapshot; compact: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {!hud.scope && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <Crosshair
            className={`size-5 ${hud.hitFlash > 0 ? "text-ok" : hud.spotted ? "text-danger" : "text-fg/80"}`}
            strokeWidth={1.6}
          />
        </div>
      )}
      {hud.damageFlash > 0 && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, transparent 40%, color-mix(in oklab, var(--color-danger) ${Math.round(hud.damageFlash * 45)}%, transparent) 100%)`,
          }}
        />
      )}
      {compact ? <HudCompact hud={hud} /> : <HudDesktop hud={hud} />}
      {(hud.takedownReady || hud.interactReady || hud.toast) && (
        <div className="absolute bottom-[30%] left-1/2 -translate-x-1/2 hud-chip px-3 py-1.5 text-sm">
          {hud.toast || (hud.takedownReady ? "E ปิดเงียบ" : hud.interactHint || "E เก็บของ")}
        </div>
      )}
    </div>
  );
}

function HudCompact({ hud }: { hud: HudSnapshot }) {
  return (
    <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-3 pt-2 pr-24">
      <div className="hud-chip min-w-0 flex-1 truncate px-2.5 py-1 text-xs">{hud.objective}</div>
      {hud.nest && <div className="hud-chip px-2 py-1 text-[10px] tracking-widest text-accent">ซุ่ม</div>}
      <div className="hud-chip flex items-center gap-2 px-2 py-1">
        <span className="text-[10px] text-muted">HP</span>
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-fg" style={{ width: `${hud.health}%` }} />
        </div>
        <span className="font-display text-sm tabular-nums">
          {hud.mag}
          <span className="text-[10px] text-muted">/{hud.reserve}</span>
        </span>
      </div>
      <div className="hud-chip px-2 py-1">
        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full ${hud.spotted ? "bg-danger" : "bg-accent"}`}
            style={{ width: `${Math.round(hud.suspicion * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function HudDesktop({ hud }: { hud: HudSnapshot }) {
  return (
    <>
      <div className="absolute top-4 left-4 right-16 flex flex-wrap items-start gap-2">
        <div className="hud-chip px-3 py-2">
          <p className="font-display text-[10px] tracking-[0.22em] text-muted uppercase">Objective</p>
          <p className="text-sm">{hud.objective}</p>
        </div>
        {hud.nest && (
          <div className="hud-chip px-3 py-2 text-accent">
            <p className="font-display text-[10px] tracking-[0.22em] uppercase">Nest</p>
            <p className="text-sm">จุดซุ่ม</p>
          </div>
        )}
      </div>
      <div className="absolute bottom-6 left-4 flex flex-col gap-2">
        <div className="hud-chip w-40 px-3 py-2">
          <p className="font-display text-[10px] tracking-[0.2em] text-muted uppercase">สภาพ</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-fg" style={{ width: `${hud.health}%` }} />
          </div>
        </div>
        <div className="hud-chip px-3 py-2">
          <p className="font-display text-[10px] tracking-[0.2em] text-muted uppercase">{hud.ammoName}</p>
          <p className="font-display text-2xl tabular-nums leading-none">
            {hud.mag}
            <span className="ml-1 text-sm text-muted">/ {hud.reserve}</span>
          </p>
          <p className="mt-1 text-xs text-subtle">{hud.ammoHint}</p>
          {hud.reloading && <p className="text-xs text-accent">กำลังบรรจุ</p>}
        </div>
      </div>
      <div className="absolute right-4 bottom-6 flex flex-col items-end gap-2">
        <Minimap hud={hud} />
        <div className="hud-chip px-3 py-2 text-right">
          <p className="font-display text-[10px] tracking-[0.2em] text-muted uppercase">ตรวจจับ</p>
          <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full ${hud.spotted ? "bg-danger" : "bg-accent"}`}
              style={{ width: `${Math.round(hud.suspicion * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            ศัตรู {hud.enemiesAlive} · แฟ้ม {hud.intelGot}/{hud.intelNeed}
          </p>
        </div>
      </div>
    </>
  );
}

function Minimap({ hud }: { hud: HudSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mission = useGame((s) => s.mission);
  const L = LEVELS[mission]!;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = (c.width = 148);
    const hgt = (c.height = 148);
    ctx.clearRect(0, 0, w, hgt);
    ctx.fillStyle = "rgba(9,11,13,0.72)";
    ctx.fillRect(0, 0, w, hgt);
    const scale = 1.55;
    ctx.save();
    ctx.translate(w / 2, hgt / 2);
    ctx.rotate(-hud.yaw);
    ctx.translate(-hud.px * scale, -hud.pz * scale);
    ctx.fillStyle = "rgba(232,235,230,0.16)";
    for (const b of L.minimap) {
      ctx.fillRect(b.x * scale - (b.w * scale) / 2, b.z * scale - (b.d * scale) / 2, b.w * scale, b.d * scale);
    }
    ctx.fillStyle = hud.extractedReady ? "#7d9a7a" : "#5c6560";
    ctx.beginPath();
    ctx.arc(L.extract.x * scale, L.extract.z * scale, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#9db4c0";
    ctx.beginPath();
    ctx.moveTo(w / 2, hgt / 2 - 7);
    ctx.lineTo(w / 2 - 4, hgt / 2 + 5);
    ctx.lineTo(w / 2 + 4, hgt / 2 + 5);
    ctx.closePath();
    ctx.fill();
  }, [hud.px, hud.pz, hud.yaw, hud.extractedReady, L]);

  return <canvas ref={ref} className="hud-chip h-[92px] w-[92px] rounded-md sm:h-[124px] sm:w-[124px]" />;
}

function Scope() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at center, transparent 16vmin, rgba(9,11,13,0.88) 28vmin, rgba(9,11,13,0.96) 100%)",
        }}
      />
      <div className="absolute top-1/2 left-1/2 h-[52vmin] w-[52vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-fg/30" />
      <div className="absolute top-1/2 left-[calc(50%-18vmin)] h-px w-[12vmin] bg-fg/50" />
      <div className="absolute top-1/2 right-[calc(50%-18vmin)] h-px w-[12vmin] bg-fg/50" />
      <div className="absolute left-1/2 top-[calc(50%-18vmin)] h-[12vmin] w-px bg-fg/50" />
      <div className="absolute left-1/2 bottom-[calc(50%-18vmin)] h-[12vmin] w-px bg-fg/50" />
      <div className="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-danger" />
    </div>
  );
}

function TouchPad({ gameRef }: { gameRef: RefObject<ShadowNestGame | null> }) {
  const moveId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const last = useRef({ x: 0, y: 0 });

  const setMove = (x: number, y: number) => {
    const g = gameRef.current;
    if (!g) return;
    g.input.touchMoveX = x;
    g.input.touchMoveY = y;
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        className="pointer-events-auto absolute bottom-3 left-4 h-20 w-20 rounded-full border-2 border-fg/40 bg-bg/50"
        data-hit="stick"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          moveId.current = e.pointerId;
          origin.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== moveId.current) return;
          const dx = (e.clientX - origin.current.x) / 32;
          const dy = (e.clientY - origin.current.y) / 32;
          const m = Math.hypot(dx, dy) || 1;
          const k = Math.min(1, m);
          setMove((dx / m) * k, (-dy / m) * k);
        }}
        onPointerUp={() => {
          moveId.current = null;
          setMove(0, 0);
        }}
        onPointerCancel={() => {
          moveId.current = null;
          setMove(0, 0);
        }}
      />
      <div
        className="pointer-events-auto absolute inset-y-10 right-28 left-[28%]"
        data-hit="look"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          lookId.current = e.pointerId;
          last.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== lookId.current) return;
          const g = gameRef.current;
          if (!g) return;
          g.input.touchLookX += Math.max(-18, Math.min(18, e.clientX - last.current.x));
          g.input.touchLookY += Math.max(-18, Math.min(18, e.clientY - last.current.y));
          last.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => {
          lookId.current = null;
        }}
      />
      <div className="pointer-events-auto absolute right-3 bottom-3 flex flex-row-reverse items-end gap-1.5">
        <TouchBtn
          label="ยิง"
          fire
          hit="fire"
          onDown={() => {
            const g = gameRef.current;
            if (g) g.input.touchFire = true;
          }}
          onUp={() => {
            const g = gameRef.current;
            if (g) g.input.touchFire = false;
          }}
        />
        <div className="flex gap-1.5">
          <TouchBtn
            label="เล็ง"
            hit="ads"
            onDown={() => {
              const g = gameRef.current;
              if (g) g.input.touchAds = true;
            }}
            onUp={() => {
              const g = gameRef.current;
              if (g) g.input.touchAds = false;
            }}
          />
          <TouchBtn
            label="ย่อ"
            small
            hit="crouch"
            onDown={() => {
              const g = gameRef.current;
              if (g) g.input.touchCrouch = true;
            }}
            onUp={() => {
              const g = gameRef.current;
              if (g) g.input.touchCrouch = false;
            }}
          />
        </div>
        <div className="flex gap-1.5">
          <TouchBtn
            label="โดด"
            small
            hit="jump"
            onDown={() => {
              const g = gameRef.current;
              if (g) g.input.touchJump = true;
            }}
          />
          <TouchBtn
            label="1/2"
            small
            hit="weapon"
            onDown={() => {
              const g = gameRef.current;
              if (g) g.input.touchWeapon = true;
            }}
          />
          <TouchBtn
            label="E"
            small
            hit="interact"
            onDown={() => {
              const g = gameRef.current;
              if (g) g.input.touchInteract = true;
            }}
          />
        </div>
      </div>
    </div>
  );
}

function TouchBtn({
  label,
  small,
  fire,
  hit,
  onDown,
  onUp,
}: {
  label: string;
  small?: boolean;
  fire?: boolean;
  hit?: string;
  onDown: () => void;
  onUp?: () => void;
}) {
  return (
    <button
      type="button"
      data-hit={hit}
      className={`border font-display tracking-wide ${
        fire
          ? "h-16 w-16 rounded-full border-fg/40 bg-fg text-sm text-accent-fg"
          : small
            ? "h-9 min-w-9 rounded-md border-fg/20 bg-bg/70 px-2 text-[11px]"
            : "h-10 min-w-12 rounded-md border-fg/25 bg-bg/70 px-3 text-xs"
      }`}
      onPointerDown={(e) => {
        e.preventDefault();
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {label}
    </button>
  );
}

function Primary({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 w-full rounded-md bg-fg px-5 font-display text-lg tracking-wide text-accent-fg transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-90 active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function Ghost({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 w-full rounded-md border border-border bg-surface px-5 font-display text-lg tracking-wide text-fg transition-transform duration-150 hover:bg-surface-2 active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="pointer-events-auto flex size-11 items-center justify-center rounded-md border border-fg/12 bg-bg/55 text-fg"
    >
      {children}
    </button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 font-display text-accent">{k}</dt>
      <dd className="text-muted">{v}</dd>
    </div>
  );
}
