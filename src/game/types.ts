export type Vec2 = { x: number; z: number };

export type BoxSpec = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: number;
  collide?: boolean;
  nest?: boolean;
};

export type LightSpec = {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
};

export type EnemySpec = {
  x: number;
  z: number;
  waypoints: Vec2[];
  hvt?: boolean;
};

export type LevelDef = {
  id: string;
  codename: string;
  nameTh: string;
  place: string;
  briefing: string;
  objectives: string[];
  nestHint: string;
  fog: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  sunColor: number;
  sunIntensity: number;
  sunDir: [number, number, number];
  groundColor: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawn: { x: number; y: number; z: number; yaw: number };
  extract: { x: number; z: number; r: number };
  intel: { x: number; y: number; z: number }[];
  boxes: BoxSpec[];
  lights: LightSpec[];
  enemies: EnemySpec[];
  minimap: { x: number; z: number; w: number; d: number }[];
};

export type WeaponId = "pistol" | "sniper";

export type HudSnapshot = {
  health: number;
  mag: number;
  reserve: number;
  weapon: WeaponId;
  ads: boolean;
  scope: boolean;
  crouched: boolean;
  sprinting: boolean;
  reloading: boolean;
  suspicion: number;
  spotted: boolean;
  combat: boolean;
  hitFlash: number;
  damageFlash: number;
  hvtAlive: boolean;
  intelGot: number;
  intelNeed: number;
  enemiesAlive: number;
  extractedReady: boolean;
  yaw: number;
  px: number;
  pz: number;
  nest: boolean;
  objective: string;
  takedownReady: boolean;
  interactReady: boolean;
  ammoName: string;
  ammoHint: string;
};

export type MissionStats = {
  timeSec: number;
  kills: number;
  headshots: number;
  spotted: boolean;
  damageTaken: boolean;
  intel: number;
  rank: "GHOST" | "SHADOW" | "OPERATIVE";
};

export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  getPosition: () => { x: number; y: number; z: number };
  setKeys: (codes: string[]) => void;
  setSteer?: (v: number) => void;
  getDebug?: () => Record<string, unknown>;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}
