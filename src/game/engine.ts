import * as THREE from "three";
import { GameAudio } from "./audio";
import {
  boxCollider,
  losBlocked,
  moveCharacter,
  rayAabb,
  type Collider,
} from "./collision";
import { Input } from "./input";
import { LEVELS } from "./levels";
import type { HudSnapshot, LevelDef, MissionStats, WeaponId } from "./types";

const WALK = 4.4;
const SPRINT = 7.0;
const CROUCH = 2.15;
const GRAVITY = 22;
const JUMP = 7.4;
const PLAYER_R = 0.34;
const EYE_STAND = 1.58;
const EYE_CROUCH = 1.05;
const HEIGHT_STAND = 1.72;
const HEIGHT_CROUCH = 1.12;

type Weapon = {
  id: WeaponId;
  name: string;
  magSize: number;
  mag: number;
  reserve: number;
  cooldown: number;
  reload: number;
  damage: number;
  quiet: number;
  spread: number;
  adsFov: number;
  adsSens: number;
};

type Enemy = {
  group: THREE.Group;
  bodyMat: THREE.MeshLambertMaterial;
  headMat: THREE.MeshLambertMaterial;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  hvt: boolean;
  waypoints: { x: number; z: number }[];
  wp: number;
  state: "patrol" | "investigate" | "combat" | "dead";
  suspicion: number;
  lastKnown: { x: number; z: number };
  shootCd: number;
  wait: number;
  speed: number;
  deadT: number;
};

type Particle = {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
};

export type GameHooks = {
  onHud: (h: HudSnapshot) => void;
  onWin: (s: MissionStats) => void;
  onLose: () => void;
  onPause: () => void;
  onLock: (locked: boolean) => void;
};

export class ShadowNestGame {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(78, 1, 0.08, 180);
  weaponScene = new THREE.Scene();
  weaponCam = new THREE.PerspectiveCamera(52, 1, 0.05, 8);
  input = new Input();
  audio = new GameAudio();
  canvas: HTMLCanvasElement;
  hooks: GameHooks;

  paused = false;
  running = false;
  ended = false;
  pointerLocked = false;
  isTouch = false;

  level!: LevelDef;
  colliders: Collider[] = [];
  nestBoxes: Collider[] = [];
  worldRoot = new THREE.Group();
  extractMesh: THREE.Mesh | null = null;

  pos = { x: 0, y: 0, z: 0 };
  vel = { x: 0, y: 0, z: 0 };
  yaw = 0;
  pitch = 0;
  onGround = true;
  crouched = false;
  health = 100;
  ads = false;
  weapon: WeaponId = "sniper";
  loadout: Record<WeaponId, Weapon> = {
    pistol: {
      id: "pistol",
      name: "GHOST 9",
      magSize: 12,
      mag: 12,
      reserve: 36,
      cooldown: 0.18,
      reload: 1.15,
      damage: 38,
      quiet: 13,
      spread: 0.012,
      adsFov: 58,
      adsSens: 0.65,
    },
    sniper: {
      id: "sniper",
      name: "KESTREL .338",
      magSize: 5,
      mag: 5,
      reserve: 15,
      cooldown: 1.15,
      reload: 2.4,
      damage: 125,
      quiet: 72,
      spread: 0.002,
      adsFov: 16,
      adsSens: 0.28,
    },
  };
  fireCd = 0;
  reloadT = 0;
  bob = 0;
  swayX = 0;
  swayY = 0;
  recPitch = 0;
  recYaw = 0;
  shake = 0;

  enemies: Enemy[] = [];
  intelGot: boolean[] = [];
  intelMeshes: THREE.Mesh[] = [];
  suspicion = 0;
  spottedEver = false;
  combatEver = false;
  damageTaken = false;
  kills = 0;
  headshots = 0;
  time = 0;
  hitFlash = 0;
  damageFlash = 0;
  footT = 0;
  lastHud = 0;
  lastHudSnap: HudSnapshot | null = null;

  particles: Particle[] = [];
  tracers: { line: THREE.Line; t: number }[] = [];
  muzzle: THREE.PointLight;
  viewRoot = new THREE.Group();
  pistolView: THREE.Group;
  sniperView: THREE.Group;
  mats = new Map<number, THREE.MeshLambertMaterial>();

  tmp = {
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    c: new THREE.Vector3(),
    ray: new THREE.Raycaster(),
  };

  private unsubLock: (() => void) | null = null;
  private onResize: (() => void) | null = null;
  private ro: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, hooks: GameHooks) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setClearColor(0x152028);
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.shadowMap.enabled = false;

    const fill = new THREE.PointLight(0xffe6c8, 2.6, 22);
    fill.position.set(0.15, 0.12, 0.35);
    this.cam.add(fill);
    this.scene.add(this.cam);

    this.muzzle = new THREE.PointLight(0xffcc88, 0, 6);
    this.weaponScene.add(this.muzzle);
    this.weaponScene.add(new THREE.HemisphereLight(0xc8d0d4, 0x202428, 1.1));
    this.pistolView = this.buildPistol();
    this.sniperView = this.buildSniper();
    this.viewRoot.add(this.pistolView);
    this.viewRoot.add(this.sniperView);
    this.weaponCam.add(this.viewRoot);
    this.weaponScene.add(this.weaponCam);
    this.viewRoot.position.set(0.28, -0.24, -0.55);

    this.isTouch = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    if (this.isTouch) this.input.lookSens = 0.0044;
    this.input.attach(canvas);
    this.bindLock();
    this.fit();
    this.onResize = () => this.fit();
    window.addEventListener("resize", this.onResize);
    window.addEventListener("orientationchange", this.onResize);
    window.visualViewport?.addEventListener("resize", this.onResize);
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(canvas);
  }

  start(levelIndex: number) {
    this.disposeWorld();
    this.level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, levelIndex))]!;
    this.buildWorld();
    this.pos.x = this.level.spawn.x;
    this.pos.y = this.level.spawn.y;
    this.pos.z = this.level.spawn.z;
    this.yaw = this.level.spawn.yaw;
    this.pitch = 0;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.health = 100;
    this.ended = false;
    this.paused = false;
    this.time = 0;
    this.kills = 0;
    this.headshots = 0;
    this.spottedEver = false;
    this.combatEver = false;
    this.damageTaken = false;
    this.suspicion = 0;
    this.weapon = "sniper";
    this.loadout.pistol.mag = 12;
    this.loadout.pistol.reserve = 36;
    this.loadout.sniper.mag = 5;
    this.loadout.sniper.reserve = 15;
    this.intelGot = this.level.intel.map(() => false);
    this.fireCd = 0;
    this.reloadT = 0;
    this.running = true;
    this.last = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
    this.installProbe();
    this.fit();
    this.emitHud(true);
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p && this.pointerLocked) document.exitPointerLock();
  }

  requestLock() {
    this.audio.unlock();
    if (this.isTouch) return;
    const el = this.canvas as HTMLCanvasElement & {
      requestPointerLock: (opts?: { unadjustedMovement?: boolean }) => Promise<void> | void;
    };
    try {
      const r = el.requestPointerLock({ unadjustedMovement: true });
      if (r && typeof (r as Promise<void>).catch === "function") {
        (r as Promise<void>).catch(() => el.requestPointerLock());
      }
    } catch {
      el.requestPointerLock();
    }
  }

  dispose() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.input.detach(this.canvas);
    this.disposeWorld();
    this.renderer.dispose();
    this.ro?.disconnect();
    this.ro = null;
    if (this.onResize) {
      window.removeEventListener("resize", this.onResize);
      window.removeEventListener("orientationchange", this.onResize);
      window.visualViewport?.removeEventListener("resize", this.onResize);
    }
    this.unsubLock?.();
    if (window.__controlsTest) delete window.__controlsTest;
  }

  private last = 0;
  private frame(now: number) {
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (!this.running) return;
    if (!this.paused && !this.ended) this.update(dt);
    this.render();
  }

  private update(dt: number) {
    this.time += dt;
    const act = this.input.sample();
    if (act.just.pause) {
      this.hooks.onPause();
      return;
    }

    const w = this.loadout[this.weapon];
    if (act.just.weapon1) this.weapon = "pistol";
    if (act.just.weapon2) this.weapon = "sniper";
    if (act.just.weaponNext) this.weapon = this.weapon === "pistol" ? "sniper" : "pistol";

    this.ads = act.ads && this.reloadT <= 0;
    const sens = this.input.lookSens * (this.ads ? w.adsSens : 1);
    this.yaw -= act.lookX * sens;
    this.pitch -= act.lookY * sens;
    const lim = Math.PI / 2 - 0.02;
    if (this.pitch > lim) this.pitch = lim;
    if (this.pitch < -lim) this.pitch = -lim;
    this.yaw += this.recYaw;
    this.pitch += this.recPitch;
    this.recYaw *= Math.exp(-dt * 10);
    this.recPitch *= Math.exp(-dt * 10);

    this.crouched = act.crouch;
    const height = this.crouched ? HEIGHT_CROUCH : HEIGHT_STAND;
    const walk = this.isTouch ? 5.8 : WALK;
    const sprint = this.isTouch ? 8.4 : SPRINT;
    const speedMax = this.ads ? CROUCH : this.crouched ? CROUCH : act.sprint ? sprint : walk;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const wishX = act.moveY * fx + act.moveX * rx;
    const wishZ = act.moveY * fz + act.moveX * rz;
    const accel = this.onGround ? 28 : 8;
    this.vel.x += (wishX * speedMax - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wishZ * speedMax - this.vel.z) * Math.min(1, accel * dt);
    if (this.onGround && act.just.jump && !this.crouched) {
      this.vel.y = JUMP;
      this.onGround = false;
    }

    const b = this.level.bounds;
    this.onGround = moveCharacter(this.pos, this.vel, dt, PLAYER_R, height, this.colliders, GRAVITY);
    this.pos.x = Math.min(b.maxX - 0.6, Math.max(b.minX + 0.6, this.pos.x));
    this.pos.z = Math.min(b.maxZ - 0.6, Math.max(b.minZ + 0.6, this.pos.z));

    const spd = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && spd > 1.2) {
      this.bob += dt * spd * 1.7;
      this.footT -= dt;
      if (this.footT <= 0) {
        this.audio.foot(spd > 5.5);
        this.footT = spd > 5.5 ? 0.32 : 0.46;
      }
    } else {
      this.bob *= Math.exp(-dt * 6);
    }

    this.fireCd = Math.max(0, this.fireCd - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.finishReload();
    }
    if (act.just.reload) this.startReload();
    if (act.fire && this.reloadT <= 0) this.tryFire();
    if (act.just.melee || act.just.interact) this.tryMeleeOrInteract();
    this.tryPickIntel();

    this.updateEnemies(dt, spd);
    this.updateParticles(dt);
    this.updateTracers(dt);
    this.muzzle.intensity *= Math.exp(-dt * 22);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.4);
    this.shake = Math.max(0, this.shake - dt * 6);

    if (this.health <= 0 && !this.ended) {
      this.ended = true;
      this.audio.lose();
      this.hooks.onLose();
    }

    const hvtAlive = this.enemies.some((e) => e.hvt && e.state !== "dead");
    const ex = this.level.extract;
    const inExtract = Math.hypot(this.pos.x - ex.x, this.pos.z - ex.z) < ex.r;
    if (!hvtAlive && inExtract && !this.ended) {
      this.ended = true;
      this.audio.win();
      this.hooks.onWin(this.stats());
    }

    if (this.extractMesh) {
      this.extractMesh.rotation.y += dt * 0.6;
      const mat = this.extractMesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.22 + Math.sin(this.time * 2.2) * 0.08;
      mat.color.setHex(hvtAlive ? 0x5a6a72 : 0x7d9a7a);
    }

    this.syncCamera(dt, spd);
    this.emitHud(performance.now() - this.lastHud > 80);
  }

  private syncCamera(dt: number, spd: number) {
    const eye = this.crouched ? EYE_CROUCH : EYE_STAND;
    const bobY = Math.sin(this.bob * 2) * Math.min(spd, 6) * 0.012;
    const bobX = Math.cos(this.bob) * Math.min(spd, 6) * 0.008;
    const sh = this.shake * 0.04;
    this.cam.position.set(
      this.pos.x + bobX + (Math.random() - 0.5) * sh,
      this.pos.y + eye + bobY + (Math.random() - 0.5) * sh,
      this.pos.z,
    );
    this.cam.rotation.order = "YXZ";
    this.cam.rotation.y = this.yaw;
    this.cam.rotation.x = this.pitch;

    const w = this.loadout[this.weapon];
    const targetFov = this.ads ? w.adsFov : 78;
    this.cam.fov += (targetFov - this.cam.fov) * Math.min(1, dt * 10);
    this.cam.updateProjectionMatrix();

    this.swayX += (-this.input.mouseDX * 0.0004 - this.swayX) * Math.min(1, dt * 8);
    this.swayY += (-this.input.mouseDY * 0.0004 - this.swayY) * Math.min(1, dt * 8);
    const kick = this.fireCd > 0 ? Math.min(0.12, this.fireCd) : 0;
    this.viewRoot.position.set(0.28 + this.swayX, -0.24 + this.swayY - kick * 0.15, -0.55 - kick * 0.2);
    this.viewRoot.rotation.set(this.swayY * 0.4 - kick * 0.5, this.swayX * 0.4, this.swayX * 0.2);
    this.pistolView.visible = this.weapon === "pistol" && !this.ads;
    this.sniperView.visible = this.weapon === "sniper" && !this.ads;
  }

  private tryFire() {
    const w = this.loadout[this.weapon];
    if (this.fireCd > 0) return;
    if (w.mag <= 0) {
      this.audio.empty();
      this.fireCd = 0.22;
      if (w.reserve > 0) this.startReload();
      return;
    }
    w.mag -= 1;
    this.fireCd = w.cooldown;
    this.audio.shot(this.weapon === "sniper");
    this.shake = this.weapon === "sniper" ? 0.7 : 0.28;
    this.recPitch += this.weapon === "sniper" ? 0.028 : 0.01;
    this.recYaw += (Math.random() - 0.5) * (this.weapon === "sniper" ? 0.01 : 0.006);
    this.muzzle.position.set(0.18, -0.08, -0.9);
    this.muzzle.intensity = this.weapon === "sniper" ? 8 : 4;

    const origin = this.tmp.a;
    const dir = this.tmp.b;
    this.cam.getWorldPosition(origin);
    this.cam.getWorldDirection(dir);
    const spread = w.spread * (this.ads ? 0.25 : 1.4);
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    const hit = this.hitscan(origin, dir, 160);
    this.spawnTracer(origin, hit.point);
    if (hit.kind === "enemy") {
      this.applyHit(hit.enemy!, hit.head === true);
    } else if (hit.kind === "world") {
      this.spawnSparks(hit.point, 0x9aa3a0, 4);
    }
    this.alertShot(w.quiet);
  }

  private hitscan(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
  ): { kind: "none" | "world" | "enemy"; point: THREE.Vector3; enemy?: Enemy; head?: boolean } {
    let best = maxDist;
    let kind: "none" | "world" | "enemy" = "none";
    let enemy: Enemy | undefined;
    let head = false;
    const point = origin.clone().addScaledVector(dir, maxDist);

    for (const c of this.colliders) {
      const t = rayAabb(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, best, c);
      if (t !== null && t < best && t > 0.05) {
        best = t;
        kind = "world";
        point.copy(origin).addScaledVector(dir, t);
      }
    }
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      const body: Collider = {
        minX: e.x - 0.32,
        maxX: e.x + 0.32,
        minY: e.y,
        maxY: e.y + 1.28,
        minZ: e.z - 0.32,
        maxZ: e.z + 0.32,
      };
      const hd: Collider = {
        minX: e.x - 0.18,
        maxX: e.x + 0.18,
        minY: e.y + 1.28,
        maxY: e.y + 1.62,
        minZ: e.z - 0.18,
        maxZ: e.z + 0.18,
      };
      const th = rayAabb(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, best, hd);
      if (th !== null && th < best && th > 0.05) {
        best = th;
        kind = "enemy";
        enemy = e;
        head = true;
        point.copy(origin).addScaledVector(dir, th);
      }
      const tb = rayAabb(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, best, body);
      if (tb !== null && tb < best && tb > 0.05) {
        best = tb;
        kind = "enemy";
        enemy = e;
        head = false;
        point.copy(origin).addScaledVector(dir, tb);
      }
    }
    return { kind, point, enemy, head };
  }

  private applyHit(e: Enemy, head: boolean) {
    const w = this.loadout[this.weapon];
    const dmg = w.damage * (head ? 2.4 : 1);
    e.hp -= dmg;
    e.suspicion = 1;
    e.lastKnown = { x: this.pos.x, z: this.pos.z };
    if (e.state !== "dead") e.state = "combat";
    this.hitFlash = 1;
    this.audio.hit();
    if (head) {
      this.headshots += 1;
      this.audio.headshot();
    }
    this.spawnSparks(new THREE.Vector3(e.x, e.y + (head ? 1.45 : 1.0), e.z), 0x8a2a24, 8);
    e.bodyMat.emissive.setHex(0x441010);
    e.headMat.emissive.setHex(0x441010);
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy) {
    if (e.state === "dead") return;
    e.state = "dead";
    e.deadT = 0;
    this.kills += 1;
    e.group.rotation.x = 0;
  }

  private startReload() {
    const w = this.loadout[this.weapon];
    if (this.reloadT > 0 || w.mag >= w.magSize || w.reserve <= 0) return;
    this.reloadT = w.reload;
    this.ads = false;
    this.audio.reload();
  }

  private finishReload() {
    const w = this.loadout[this.weapon];
    const need = w.magSize - w.mag;
    const take = Math.min(need, w.reserve);
    w.mag += take;
    w.reserve -= take;
  }

  private tryMeleeOrInteract() {
    for (let i = 0; i < this.level.intel.length; i++) {
      if (this.intelGot[i]) continue;
      const it = this.level.intel[i]!;
      if (Math.hypot(this.pos.x - it.x, this.pos.z - it.z) < 1.8) {
        this.intelGot[i] = true;
        this.intelMeshes[i]!.visible = false;
        this.audio.pickup();
        return;
      }
    }
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      const dx = e.x - this.pos.x;
      const dz = e.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.85) continue;
      const toward = (dx * fx + dz * fz) / Math.max(0.001, dist);
      const efx = -Math.sin(e.yaw);
      const efz = -Math.cos(e.yaw);
      const fromBehind = efx * dx + efz * dz > 0.1;
      if (toward > 0.25 && (fromBehind || e.suspicion < 0.4)) {
        this.audio.takedown();
        this.killEnemy(e);
        this.shake = 0.4;
        return;
      }
    }
  }

  private tryPickIntel() {
    for (let i = 0; i < this.level.intel.length; i++) {
      if (this.intelGot[i]) continue;
      const it = this.level.intel[i]!;
      if (Math.hypot(this.pos.x - it.x, this.pos.y - it.y, this.pos.z - it.z) < 1.35) {
        this.intelGot[i] = true;
        this.intelMeshes[i]!.visible = false;
        this.audio.pickup();
      }
    }
  }

  private alertShot(radius: number) {
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      const d = Math.hypot(e.x - this.pos.x, e.z - this.pos.z);
      if (d < radius) {
        e.lastKnown = { x: this.pos.x, z: this.pos.z };
        if (e.state === "patrol") e.state = "investigate";
        e.suspicion = Math.max(e.suspicion, 0.45);
        if (d < radius * 0.35) e.state = "combat";
      }
    }
  }

  private updateEnemies(dt: number, playerSpd: number) {
    let maxSus = 0;
    const eyeY = this.pos.y + (this.crouched ? EYE_CROUCH : EYE_STAND);
    const hear = playerSpd > 5.6 ? 11 : playerSpd > 1.4 ? (this.crouched ? 3.5 : 6.5) : 1.5;

    for (const e of this.enemies) {
      if (e.state === "dead") {
        e.deadT += dt;
        e.group.rotation.x = Math.min(1.45, e.deadT * 3.2);
        e.group.position.y = e.y + 0.15;
        e.bodyMat.emissive.setHex(0x000000);
        continue;
      }
      e.bodyMat.emissive.multiplyScalar(Math.exp(-dt * 6));
      e.headMat.emissive.multiplyScalar(Math.exp(-dt * 6));
      e.shootCd = Math.max(0, e.shootCd - dt);

      const dx = this.pos.x - e.x;
      const dz = this.pos.z - e.z;
      const dist = Math.hypot(dx, dz);
      const efx = -Math.sin(e.yaw);
      const efz = -Math.cos(e.yaw);
      const ang = dist > 0.01 ? (dx / dist) * efx + (dz / dist) * efz : 1;
      const visRange = this.crouched ? 13 : playerSpd > 5.5 ? 28 : 20;
      const dy = eyeY - (e.y + 1.45);
      const highHide = dy > 4.2 && dist > 7 && this.crouched;
      const inCone = ang > 0.42 && dist < visRange && !highHide;
      const seen =
        inCone &&
        !losBlocked(e.x, e.y + 1.45, e.z, this.pos.x, eyeY, this.pos.z, this.colliders);
      const heard = dist < hear;

      if (seen || heard) {
        e.suspicion = Math.min(1, e.suspicion + dt * (seen ? 1.5 : 0.55) * (1 - dist / (visRange + 4)));
        e.lastKnown = { x: this.pos.x, z: this.pos.z };
        if (e.suspicion >= 1) {
          if (e.state !== "combat") this.audio.alarm();
          e.state = "combat";
          this.spottedEver = true;
          this.combatEver = true;
        } else if (e.state === "patrol") e.state = "investigate";
      } else {
        e.suspicion = Math.max(0, e.suspicion - dt * 0.18);
        if (e.state === "combat" && e.suspicion < 0.2) {
          e.wait += dt;
          if (e.wait > 4) {
            e.state = "investigate";
            e.wait = 0;
          }
        }
      }
      maxSus = Math.max(maxSus, e.suspicion);

      if (e.state === "combat") {
        const tx = this.pos.x - e.x;
        const tz = this.pos.z - e.z;
        e.yaw = Math.atan2(-tx, -tz);
        if (dist > 9) this.steerEnemy(e, this.pos.x, this.pos.z, dt, 2.3);
        if (seen && e.shootCd <= 0 && dist < 34) {
          this.enemyShoot(e);
          e.shootCd = 1.15 + Math.random() * 0.4;
        }
      } else if (e.state === "investigate") {
        this.steerEnemy(e, e.lastKnown.x, e.lastKnown.z, dt, 2.6);
        if (Math.hypot(e.x - e.lastKnown.x, e.z - e.lastKnown.z) < 1.2) {
          e.wait += dt;
          if (e.wait > 2.2) {
            e.state = "patrol";
            e.wait = 0;
          }
        }
      } else {
        const wp = e.waypoints[e.wp] ?? e.waypoints[0]!;
        this.steerEnemy(e, wp.x, wp.z, dt, e.speed);
        if (Math.hypot(e.x - wp.x, e.z - wp.z) < 0.7) {
          e.wp = (e.wp + 1) % e.waypoints.length;
        }
      }

      e.group.position.set(e.x, e.y, e.z);
      e.group.rotation.y = e.yaw;
    }
    this.suspicion = maxSus;
  }

  private steerEnemy(e: Enemy, tx: number, tz: number, dt: number, speed: number) {
    const dx = tx - e.x;
    const dz = tz - e.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const nx = dx / d;
    const nz = dz / d;
    e.yaw = Math.atan2(-nx, -nz);
    const ox = e.x;
    const oz = e.z;
    e.x += nx * speed * dt;
    const hitX = this.enemyBlocked(e);
    if (hitX) e.x = ox;
    e.z += nz * speed * dt;
    const hitZ = this.enemyBlocked(e);
    if (hitZ) e.z = oz;
  }

  private enemyBlocked(e: Enemy): boolean {
    const r = 0.32;
    for (const c of this.colliders) {
      if (c.maxY - c.minY < 0.5) continue;
      if (c.minY > e.y + 1.2) continue;
      if (c.maxY < e.y + 0.3) continue;
      if (e.x + r > c.minX && e.x - r < c.maxX && e.z + r > c.minZ && e.z - r < c.maxZ) return true;
    }
    return false;
  }

  private enemyShoot(e: Enemy) {
    const origin = this.tmp.a.set(e.x, e.y + 1.35, e.z);
    const targetY = this.pos.y + (this.crouched ? 1.0 : 1.35);
    const dir = this.tmp.b
      .set(
        this.pos.x - e.x + (Math.random() - 0.5) * 0.85,
        targetY - (e.y + 1.35),
        this.pos.z - e.z + (Math.random() - 0.5) * 0.85,
      )
      .normalize();
    const hit = this.hitscan(origin, dir, 48);
    this.spawnTracer(origin, hit.point);
    if (hit.kind === "world") return;
    const toPlayer = Math.hypot(this.pos.x - e.x, this.pos.y + 1.2 - (e.y + 1.35), this.pos.z - e.z);
    if (hit.point.distanceTo(origin) + 0.35 < toPlayer) return;
    if (Math.random() < Math.max(0.18, 0.62 - toPlayer / 70)) this.hurt(10 + Math.random() * 8);
  }

  private hurt(n: number) {
    this.health = Math.max(0, this.health - n);
    this.damageFlash = 1;
    this.shake = 0.9;
    this.damageTaken = true;
    this.audio.hurt();
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3) {
    const g = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const m = new THREE.LineBasicMaterial({ color: 0xe8d8a8, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(g, m);
    this.scene.add(line);
    this.tracers.push({ line, t: 0.08 });
  }

  private spawnSparks(p: THREE.Vector3, color: number, n: number) {
    for (let i = 0; i < n; i++) {
      let slot = this.particles.find((q) => q.life <= 0);
      if (!slot) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.08, 0.08),
          new THREE.MeshBasicMaterial({ color }),
        );
        this.scene.add(mesh);
        slot = { mesh, vx: 0, vy: 0, vz: 0, life: 0, max: 0.4 };
        this.particles.push(slot);
      }
      (slot.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      slot.mesh.position.copy(p);
      slot.mesh.visible = true;
      slot.vx = (Math.random() - 0.5) * 6;
      slot.vy = Math.random() * 4;
      slot.vz = (Math.random() - 0.5) * 6;
      slot.life = slot.max = 0.28 + Math.random() * 0.18;
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.life -= dt;
      p.vy -= 12 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.visible = p.life > 0;
    }
  }

  private updateTracers(dt: number) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i]!;
      tr.t -= dt;
      (tr.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, tr.t / 0.08);
      if (tr.t <= 0) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        (tr.line.material as THREE.LineBasicMaterial).dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  private render() {
    this.renderer.clear();
    this.renderer.render(this.scene, this.cam);
    if (!this.ads) {
      this.weaponCam.aspect = this.cam.aspect;
      this.weaponCam.updateProjectionMatrix();
      this.renderer.clearDepth();
      this.renderer.render(this.weaponScene, this.weaponCam);
    }
  }

  private buildWorld() {
    const L = this.level;
    this.scene.background = new THREE.Color(L.fog);
    this.scene.fog = new THREE.Fog(L.fog, L.fogNear, L.fogFar);
    this.scene.add(this.worldRoot);
    this.renderer.setClearColor(L.fog);

    this.worldRoot.add(new THREE.AmbientLight(0xd0d8dc, 0.72));
    const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, 1.35);
    this.worldRoot.add(hemi);
    const sun = new THREE.DirectionalLight(L.sunColor, Math.max(1.25, L.sunIntensity * 1.5));
    sun.position.set(L.sunDir[0] * 40, L.sunDir[1] * 40, L.sunDir[2] * 40);
    this.worldRoot.add(sun);

    this.colliders.push(
      boxCollider(0, -2.2, 0, L.bounds.maxX - L.bounds.minX + 8, 2.2, L.bounds.maxZ - L.bounds.minZ + 8),
    );

    for (const b of L.boxes) {
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const mesh = new THREE.Mesh(geo, this.mat(b.color));
      mesh.position.set(b.x, b.y + b.h * 0.5, b.z);
      this.worldRoot.add(mesh);
      if (b.collide !== false) {
        const c = boxCollider(b.x, b.y, b.z, b.w, b.h, b.d);
        this.colliders.push(c);
        if (b.nest) this.nestBoxes.push(c);
      }
    }

    for (const l of L.lights) {
      const p = new THREE.PointLight(l.color, l.intensity * 2.1, l.distance * 1.5);
      p.position.set(l.x, l.y, l.z);
      this.worldRoot.add(p);
      const bulb = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.12, 0.18),
        new THREE.MeshBasicMaterial({ color: l.color }),
      );
      bulb.position.copy(p.position);
      this.worldRoot.add(bulb);
    }

    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(L.extract.r, L.extract.r, 0.12, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x5a6a72, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
    );
    ring.position.set(L.extract.x, 0.2, L.extract.z);
    this.worldRoot.add(ring);
    this.extractMesh = ring;

    for (const it of L.intel) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.12, 0.32),
        new THREE.MeshLambertMaterial({ color: 0xc8c2a8, emissive: 0x333022 }),
      );
      m.position.set(it.x, it.y, it.z);
      this.worldRoot.add(m);
      this.intelMeshes.push(m);
    }

    for (const spec of L.enemies) this.spawnEnemy(spec.x, spec.z, spec.waypoints, !!spec.hvt);
  }

  private spawnEnemy(x: number, z: number, waypoints: { x: number; z: number }[], hvt: boolean) {
    const bodyMat = new THREE.MeshLambertMaterial({ color: hvt ? 0x3a3430 : 0x1e2624, flatShading: true });
    const headMat = new THREE.MeshLambertMaterial({ color: 0x8a6a54, flatShading: true });
    const group = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.34), bodyMat);
    torso.position.y = 0.95;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.28), bodyMat);
    legs.position.y = 0.35;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), headMat);
    head.position.y = 1.45;
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.1, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x2a2c2a, flatShading: true }),
    );
    gun.position.set(0.22, 1.12, -0.28);
    group.add(torso, legs, head, gun);
    if (hvt) {
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.08, 0.34),
        new THREE.MeshLambertMaterial({ color: 0x2a2e28, flatShading: true }),
      );
      cap.position.y = 1.62;
      group.add(cap);
    }
    group.position.set(x, 0, z);
    this.worldRoot.add(group);
    this.enemies.push({
      group,
      bodyMat,
      headMat,
      x,
      y: 0,
      z,
      yaw: 0,
      hp: hvt ? 140 : 70,
      hvt,
      waypoints: waypoints.length ? waypoints : [{ x, z }],
      wp: 0,
      state: "patrol",
      suspicion: 0,
      lastKnown: { x, z },
      shootCd: 1 + Math.random(),
      wait: 0,
      speed: hvt ? 1.35 : 1.55,
      deadT: 0,
    });
  }

  private mat(color: number) {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({
        color,
        flatShading: true,
        emissive: new THREE.Color(color).multiplyScalar(0.16),
      });
      this.mats.set(color, m);
    }
    return m;
  }

  private buildPistol() {
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x1c1e1c, flatShading: true });
    const steel = new THREE.MeshLambertMaterial({ color: 0x6a7270, flatShading: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.38), dark);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.4), steel);
    slide.position.y = 0.1;
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.28), steel);
    barrel.position.set(0, 0.06, -0.28);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.12), dark);
    grip.position.set(0, -0.14, 0.1);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.08), steel);
    mag.position.set(0, -0.2, 0.08);
    g.add(body, slide, barrel, grip, mag);
    g.rotation.y = 0.04;
    return g;
  }

  private buildSniper() {
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x1a1c1a, flatShading: true });
    const wood = new THREE.MeshLambertMaterial({ color: 0x3a3228, flatShading: true });
    const steel = new THREE.MeshLambertMaterial({ color: 0x5a605c, flatShading: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.9), dark);
    body.position.z = 0.05;
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.7), steel);
    barrel.position.set(0, 0.02, -0.7);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.32), wood);
    stock.position.set(0, -0.04, 0.48);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.12), dark);
    mag.position.set(0, -0.12, 0.02);
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.32), steel);
    scope.position.set(0, 0.14, -0.08);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: 0x1a3040 }));
    lens.position.set(0, 0.14, 0.1);
    g.add(body, barrel, stock, mag, scope, lens);
    g.position.set(0.04, 0.02, 0.1);
    return g;
  }

  private inNest() {
    const y = this.pos.y;
    for (const c of this.nestBoxes) {
      if (this.pos.x > c.minX - 0.4 && this.pos.x < c.maxX + 0.4 && this.pos.z > c.minZ - 0.4 && this.pos.z < c.maxZ + 0.4) {
        if (y >= c.minY - 0.2 && y <= c.maxY + 1.2) return true;
      }
    }
    return this.pos.y > 5.4;
  }

  private takedownReady() {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      const dx = e.x - this.pos.x;
      const dz = e.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.85) continue;
      const toward = (dx * fx + dz * fz) / Math.max(0.001, dist);
      const efx = -Math.sin(e.yaw);
      const efz = -Math.cos(e.yaw);
      const fromBehind = efx * dx + efz * dz > 0.05;
      if (toward > 0.2 && (fromBehind || e.suspicion < 0.4)) return true;
    }
    return false;
  }

  private stats(): MissionStats {
    const rank = !this.spottedEver ? "GHOST" : !this.damageTaken ? "SHADOW" : "OPERATIVE";
    return {
      timeSec: this.time,
      kills: this.kills,
      headshots: this.headshots,
      spotted: this.spottedEver,
      damageTaken: this.damageTaken,
      intel: this.intelGot.filter(Boolean).length,
      rank,
    };
  }

  private emitHud(force: boolean) {
    if (!force && this.lastHudSnap) return;
    this.lastHud = performance.now();
    const w = this.loadout[this.weapon];
    const hvtAlive = this.enemies.some((e) => e.hvt && e.state !== "dead");
    const intelNeed = this.level.intel.length;
    const intelGot = this.intelGot.filter(Boolean).length;
    let objective = hvtAlive ? "กำจัดเป้าหมายสำคัญ" : "ไปยังจุดถอนตัว";
    if (intelGot < intelNeed && !hvtAlive) objective = "เก็บข่าวกรอง แล้วถอนตัว";
    if (this.inNest()) objective = this.ads ? "เล็งหัว แล้วค้างหายใจ" : "ซุ่มแล้วเล็ง (คลิกขวา)";
    const snap: HudSnapshot = {
      health: this.health,
      mag: w.mag,
      reserve: w.reserve,
      weapon: this.weapon,
      ads: this.ads,
      scope: this.ads && this.weapon === "sniper",
      crouched: this.crouched,
      sprinting: !this.crouched && Math.hypot(this.vel.x, this.vel.z) > 5.4,
      reloading: this.reloadT > 0,
      suspicion: this.suspicion,
      spotted: this.suspicion > 0.72,
      combat: this.enemies.some((e) => e.state === "combat"),
      hitFlash: this.hitFlash,
      damageFlash: this.damageFlash,
      hvtAlive,
      intelGot,
      intelNeed,
      enemiesAlive: this.enemies.filter((e) => e.state !== "dead").length,
      extractedReady: !hvtAlive,
      yaw: this.yaw,
      px: this.pos.x,
      pz: this.pos.z,
      nest: this.inNest(),
      objective,
      takedownReady: this.takedownReady(),
      interactReady: this.level.intel.some(
        (it, i) => !this.intelGot[i] && Math.hypot(this.pos.x - it.x, this.pos.z - it.z) < 1.8,
      ),
      ammoName: w.name,
      ammoHint: this.weapon === "sniper" ? "โบลต์ · คลิกขวาส่องกล้อง" : "เก็บเสียง · ระยะใกล้",
    };
    this.lastHudSnap = snap;
    this.hooks.onHud(snap);
  }

  getHudFull(): HudSnapshot | null {
    this.emitHud(true);
    return this.lastHudSnap;
  }

  private installProbe() {
    window.__controlsTest = {
      getYaw: () => this.yaw,
      getSpeed: () => Math.hypot(this.vel.x, this.vel.z),
      getPosition: () => ({ x: this.pos.x, y: this.pos.y, z: this.pos.z }),
      getDebug: () => ({
        boxes: this.level.boxes.length,
        children: this.worldRoot.children.length,
        fogNear: (this.scene.fog as THREE.Fog | null)?.near ?? null,
        cam: [this.cam.position.x, this.cam.position.y, this.cam.position.z],
        fov: this.cam.fov,
      }),
      setKeys: (codes: string[]) => {
        this.input.setKeys(codes);
      },
    };
  }

  private bindLock() {
    const onChange = () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      this.hooks.onLock(this.pointerLocked);
    };
    document.addEventListener("pointerlockchange", onChange);
    this.unsubLock = () => document.removeEventListener("pointerlockchange", onChange);
  }

  private fit() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / Math.max(1, h);
    this.cam.updateProjectionMatrix();
    this.weaponCam.aspect = this.cam.aspect;
    this.weaponCam.updateProjectionMatrix();
  }

  private disposeWorld() {
    for (const tr of this.tracers) {
      this.scene.remove(tr.line);
      tr.line.geometry.dispose();
      (tr.line.material as THREE.LineBasicMaterial).dispose();
    }
    this.tracers = [];
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
    this.worldRoot.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.scene.remove(this.worldRoot);
    this.worldRoot = new THREE.Group();
    this.colliders = [];
    this.nestBoxes = [];
    this.enemies = [];
    this.intelMeshes = [];
    this.extractMesh = null;
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
}
