import type { BoxSpec, EnemySpec, LevelDef, LightSpec, Vec2 } from "./types";

function box(
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  color: number,
  y = 0,
  extra: Partial<BoxSpec> = {},
): BoxSpec {
  return { x, y, z, w, h, d, color, collide: extra.collide ?? true, nest: extra.nest, ...extra };
}

function wall(x0: number, z0: number, x1: number, z1: number, h: number, color: number, thick = 0.55): BoxSpec {
  const x = (x0 + x1) * 0.5;
  const z = (z0 + z1) * 0.5;
  const w = Math.abs(x1 - x0) || thick;
  const d = Math.abs(z1 - z0) || thick;
  return box(x, z, Math.max(w, thick), Math.max(d, thick), h, color);
}

function stairs(
  x: number,
  z: number,
  dir: "n" | "s" | "e" | "w",
  steps: number,
  stepH: number,
  stepRun: number,
  width: number,
  color: number,
): BoxSpec[] {
  const out: BoxSpec[] = [];
  for (let i = 0; i < steps; i++) {
    const h = stepH * (i + 1);
    let sx = x;
    let sz = z;
    if (dir === "n") sz = z - i * stepRun;
    if (dir === "s") sz = z + i * stepRun;
    if (dir === "e") sx = x + i * stepRun;
    if (dir === "w") sx = x - i * stepRun;
    const ns = dir === "n" || dir === "s";
    out.push(box(sx, sz, ns ? width : stepRun, ns ? stepRun : width, h, color));
  }
  return out;
}

function tower(
  x: number,
  z: number,
  platformH: number,
  color: number,
  stairDir: "n" | "s" | "e" | "w",
): BoxSpec[] {
  const out: BoxSpec[] = [];
  const s = 3.4;
  const post = 0.38;
  const posts = [
    [x - s, z - s],
    [x + s, z - s],
    [x - s, z + s],
    [x + s, z + s],
  ];
  for (const [px, pz] of posts) out.push(box(px, pz, post, post, platformH, color));
  out.push(box(x, z, s * 2 + 0.8, s * 2 + 0.8, 0.38, color, platformH, { nest: true }));
  const parapet = 1.05;
  const t = 0.28;
  out.push(box(x, z - s - 0.2, s * 2 + 0.8, t, parapet, color, platformH + 0.38));
  out.push(box(x, z + s + 0.2, s * 2 + 0.8, t, parapet, color, platformH + 0.38));
  out.push(box(x - s - 0.2, z, t, s * 2 + 0.4, parapet, color, platformH + 0.38));
  out.push(box(x + s + 0.2, z, t, s * 2 + 0.4, parapet, color, platformH + 0.38));
  const run = 0.72;
  const steps = Math.max(6, Math.round(platformH / 0.42));
  let sx = x;
  let sz = z;
  if (stairDir === "s") sz = z + s + 0.6;
  if (stairDir === "n") sz = z - s - 0.6;
  if (stairDir === "e") sx = x + s + 0.6;
  if (stairDir === "w") sx = x - s - 0.6;
  out.push(...stairs(sx, sz, stairDir, steps, platformH / steps, run, 1.6, color));
  return out;
}

function building(
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  color: number,
  door: "n" | "s" | "e" | "w",
  roof = true,
): BoxSpec[] {
  const t = 0.5;
  const out: BoxSpec[] = [];
  const y = 0;
  const gap = 1.8;
  const doorH = Math.min(2.35, h - 0.35);
  const lintel = Math.max(0.35, h - doorH);

  const south = (hasDoor: boolean) => {
    if (!hasDoor) out.push(box(x, z + d / 2, w, t, h, color, y));
    else {
      const side = (w - gap) / 2;
      out.push(box(x - (gap / 2 + side / 2), z + d / 2, side, t, h, color, y));
      out.push(box(x + (gap / 2 + side / 2), z + d / 2, side, t, h, color, y));
      out.push(box(x, z + d / 2, gap, t, lintel, color, doorH));
    }
  };
  const north = (hasDoor: boolean) => {
    if (!hasDoor) out.push(box(x, z - d / 2, w, t, h, color, y));
    else {
      const side = (w - gap) / 2;
      out.push(box(x - (gap / 2 + side / 2), z - d / 2, side, t, h, color, y));
      out.push(box(x + (gap / 2 + side / 2), z - d / 2, side, t, h, color, y));
      out.push(box(x, z - d / 2, gap, t, lintel, color, doorH));
    }
  };
  const east = (hasDoor: boolean) => {
    if (!hasDoor) out.push(box(x + w / 2, z, t, d, h, color, y));
    else {
      const side = (d - gap) / 2;
      out.push(box(x + w / 2, z - (gap / 2 + side / 2), t, side, h, color, y));
      out.push(box(x + w / 2, z + (gap / 2 + side / 2), t, side, h, color, y));
      out.push(box(x + w / 2, z, t, gap, lintel, color, doorH));
    }
  };
  const west = (hasDoor: boolean) => {
    if (!hasDoor) out.push(box(x - w / 2, z, t, d, h, color, y));
    else {
      const side = (d - gap) / 2;
      out.push(box(x - w / 2, z - (gap / 2 + side / 2), t, side, h, color, y));
      out.push(box(x - w / 2, z + (gap / 2 + side / 2), t, side, h, color, y));
      out.push(box(x - w / 2, z, t, gap, lintel, color, doorH));
    }
  };

  south(door === "s");
  north(door === "n");
  east(door === "e");
  west(door === "w");
  if (roof) out.push(box(x, z, w + 0.4, d + 0.4, 0.4, color, h));
  return out;
}

function crate(x: number, z: number, color: number, h = 1.2, y = 0): BoxSpec {
  return box(x, z, 1.3, 1.3, h, color, y);
}

function patrol(...pts: [number, number][]): Vec2[] {
  return pts.map(([x, z]) => ({ x, z }));
}

function mmFromBoxes(boxes: BoxSpec[]): LevelDef["minimap"] {
  return boxes
    .filter((b) => (b.collide ?? true) && b.h >= 1.2 && b.w * b.d > 2)
    .map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d }));
}

function dockyard(): LevelDef {
  const wood = 0x3d3428;
  const metal = 0x3a4044;
  const ware = 0x4a4e46;
  const rust = 0x6b3a32;
  const teal = 0x2f4a44;
  const navy = 0x3d4a5c;
  const boxes: BoxSpec[] = [];
  const lights: LightSpec[] = [];

  boxes.push(box(0, 0, 88, 92, 0.2, 0x1a2224, -0.2, { collide: true }));
  boxes.push(box(0, 4, 46, 62, 0.28, wood, 0));

  boxes.push(...building(-16, 6, 14, 16, 6.4, ware, "e"));
  boxes.push(...building(16, 8, 13, 15, 6.2, ware, "w"));
  boxes.push(...building(-6, -16, 9, 9, 4.2, 0x45423c, "s"));

  boxes.push(...tower(20, -18, 8.4, metal, "w"));
  boxes.push(...tower(-20, -10, 7.2, metal, "e"));

  for (let i = 0; i < 5; i++) {
    const col = [rust, teal, navy][i % 3]!;
    boxes.push(box(-4 + i * 2.4, 16, 2.2, 5.4, 2.4, col, 0));
  }
  boxes.push(box(2, 16, 2.2, 5.4, 2.4, rust, 2.4));
  boxes.push(box(4.4, 16, 2.2, 5.4, 2.4, teal, 2.4));

  boxes.push(crate(-2, 2, rust));
  boxes.push(crate(1, 1.5, teal));
  boxes.push(crate(8, -4, navy));
  boxes.push(crate(-10, 18, rust, 1.2));
  boxes.push(crate(10, -8, teal, 1.8));
  boxes.push(box(6, -6, 1.3, 1.3, 1.2, rust, 0));
  boxes.push(box(6, -6, 1.3, 1.3, 1.2, navy, 1.2));

  boxes.push(box(-8, 22, 6, 1.2, 1.1, wood));
  boxes.push(box(8, 22, 6, 1.2, 1.1, wood));

  boxes.push(box(-22, -24, 8, 4, 0.5, 0x2a3230));
  boxes.push(box(-22, -24, 2.2, 6, 1.1, rust));

  for (const [x, z] of [
    [-18, 20],
    [18, 20],
    [-18, -4],
    [8, -22],
    [0, 10],
  ] as [number, number][]) {
    boxes.push(box(x, z, 0.28, 0.28, 5.2, 0x2a2e30));
    lights.push({ x, y: 4.6, z, color: 0xff9a4a, intensity: 2.2, distance: 16 });
  }

  const enemies: EnemySpec[] = [
    { x: 0, z: 10, waypoints: patrol([0, 10], [8, 10], [8, 0], [0, 0]) },
    { x: -8, z: 8, waypoints: patrol([-8, 8], [-8, 18], [4, 18], [4, 8]) },
    { x: 10, z: 4, waypoints: patrol([10, 4], [18, 4], [18, -6], [8, -6]) },
    { x: -12, z: -8, waypoints: patrol([-12, -8], [-4, -8], [-4, -18], [-12, -18]) },
    { x: 8, z: -14, waypoints: patrol([8, -14], [16, -14], [16, -22], [6, -22]) },
    { x: -6, z: -16, waypoints: patrol([-6, -14], [0, -14], [0, -20], [-8, -20]), hvt: true },
    { x: 0, z: 20, waypoints: patrol([0, 20], [-10, 20], [10, 20]) },
  ];

  return {
    id: "dockyard",
    codename: "DOCKYARD",
    nameTh: "ท่าริมน้ำ",
    place: "คลังสินค้าท่าเรือกลางคืน",
    briefing:
      "หัวหน้าเครือข่ายลักลอบอาวุธมาประชุมที่คลังด้านทิศใต้ ขึ้นหอเครนแล้วรอจังหวะ เก็บแฟ้มจากลัง แล้วถอนตัวที่เรือด้านตะวันตก",
    objectives: ["กำจัดเป้าหมายสำคัญในสำนักงานคลัง", "เก็บแฟ้มข่าวกรอง 2 ชิ้น", "ถอนตัวที่เรือด้านตะวันตก"],
    nestHint: "หอซุ่มทิศตะวันออกมองเห็นลานกลางและทางเดินของเป้าหมาย",
    fog: 0x1a2830,
    fogNear: 24,
    fogFar: 96,
    hemiSky: 0x6a8a98,
    hemiGround: 0x2a3432,
    sunColor: 0xffe0b0,
    sunIntensity: 0.95,
    sunDir: [0.35, 0.82, 0.28],
    groundColor: 0x1a2224,
    bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
    spawn: { x: 0, y: 0.35, z: 34, yaw: 0 },
    extract: { x: -22, z: -24, r: 4.2 },
    intel: [
      { x: 6, y: 1.4, z: -6 },
      { x: -2, y: 1.4, z: 2 },
    ],
    boxes,
    lights,
    enemies,
    minimap: mmFromBoxes(boxes),
  };
}

function villa(): LevelDef {
  const stone = 0x8a8680;
  const stucco = 0x9a9588;
  const roof = 0x4a4038;
  const hedge = 0x243326;
  const grass = 0x2c3a2e;
  const trim = 0x6a6660;
  const boxes: BoxSpec[] = [];
  const lights: LightSpec[] = [];

  boxes.push(box(0, 0, 84, 84, 0.18, grass, -0.18));

  boxes.push(wall(-32, -30, 32, -30, 3.2, stone, 0.6));
  boxes.push(wall(-32, 30, -8, 30, 3.2, stone, 0.6));
  boxes.push(wall(8, 30, 32, 30, 3.2, stone, 0.6));
  boxes.push(wall(-32, -30, -32, 30, 3.2, stone, 0.6));
  boxes.push(wall(32, -30, 32, 30, 3.2, stone, 0.6));

  boxes.push(...building(2, -4, 18, 14, 4.6, stucco, "s", false));
  boxes.push(box(2, -4, 19, 15, 0.42, roof, 4.6));
  boxes.push(box(2, -4, 10, 8, 3.2, stucco, 5.0));
  boxes.push(box(2, -4, 11, 9, 0.38, roof, 8.2, { nest: true }));
  boxes.push(box(2, -8.4, 8, 0.32, 0.95, trim, 8.58));
  boxes.push(box(2, 0.4, 8, 0.32, 0.95, trim, 8.58));
  boxes.push(box(-2.6, -4, 0.32, 7, 0.95, trim, 8.58));
  boxes.push(box(6.6, -4, 0.32, 7, 0.95, trim, 8.58));

  boxes.push(...stairs(12.4, -4, "e", 12, 0.4, 0.68, 1.8, stone));
  boxes.push(box(20.2, -4, 4.4, 4.4, 0.4, stone, 4.8));
  boxes.push(...stairs(20.2, -8.4, "n", 9, 0.38, 0.62, 1.7, stone));
  boxes.push(box(2, -4, 12, 4, 0.4, stone, 8.2));

  boxes.push(box(-10, 6, 10, 8, 0.35, stone, 0));
  boxes.push(box(-10, 2.2, 10, 0.4, 1.1, stone, 0.35));
  boxes.push(box(-14.8, 6, 0.4, 7.2, 1.1, stone, 0.35));
  boxes.push(box(-5.2, 6, 0.4, 7.2, 1.1, stone, 0.35));

  for (const [x, z] of [
    [-18, 16],
    [-10, 18],
    [16, 16],
    [22, 10],
    [-22, -8],
    [18, -18],
  ] as [number, number][]) {
    boxes.push(box(x, z, 2.4, 2.4, 1.8, hedge));
    boxes.push(box(x, z, 0.5, 0.5, 3.4, 0x3a2e22, 1.8, { collide: false }));
    boxes.push(box(x, z, 3.2, 3.2, 2.2, 0x1e2c20, 3.4, { collide: false }));
  }

  boxes.push(box(0, 16, 4.4, 4.4, 0.4, stone));
  boxes.push(box(0, 16, 1.6, 1.6, 1.1, 0x4a6a72, 0.4, { collide: false }));

  boxes.push(crate(-4, 8, 0x5a4638));
  boxes.push(crate(10, 8, 0x5a4638));
  boxes.push(crate(8, -16, 0x4a4038, 1.4));

  boxes.push(...tower(-22, 20, 6.8, stone, "s"));

  for (const [x, z] of [
    [-12, 12],
    [12, 12],
    [-8, -18],
    [14, -12],
  ] as [number, number][]) {
    boxes.push(box(x, z, 0.24, 0.24, 3.6, 0x3a3a36));
    lights.push({ x, y: 3.2, z, color: 0xe8dcc0, intensity: 1.6, distance: 12 });
  }

  const enemies: EnemySpec[] = [
    { x: 0, z: 18, waypoints: patrol([0, 22], [0, 10], [10, 10], [-10, 10]) },
    { x: 12, z: 0, waypoints: patrol([12, 0], [22, 0], [22, -14], [12, -14]) },
    { x: -16, z: 4, waypoints: patrol([-16, 4], [-16, 16], [-8, 16], [-8, 4]) },
    { x: 4, z: -16, waypoints: patrol([4, -16], [-8, -16], [-8, -8], [8, -8]) },
    { x: -10, z: 6, waypoints: patrol([-10, 8], [-8, 4], [-12, 4]), hvt: true },
    { x: 20, z: 16, waypoints: patrol([20, 16], [26, 16], [26, 8]) },
    { x: -24, z: -16, waypoints: patrol([-24, -16], [-24, 4], [-18, 4]) },
  ];

  return {
    id: "villa",
    codename: "VILLA PERCH",
    nameTh: "คฤหาสน์บนเขา",
    place: "วิลล่าหินในสวนจันทร์",
    briefing:
      "นายหน้าอาวุธกำลังดื่มบนระเบียงทิศตะวันตก ขึ้นดาดฟ้าวิลล่าหรือหอสวนแล้วรอให้เขาเดินออก แฟ้มอยู่ในห้องชั้นล่าง ถอนตัวที่ประตูตะวันตก",
    objectives: ["กำจัดเป้าหมายบนระเบียง", "เก็บแฟ้มจากในวิลล่า", "ถอนตัวที่ประตูสวนด้านตะวันตก"],
    nestHint: "ดาดฟ้าวิลล่าและหอสวนทิศตะวันตกเฉียงเหนือเป็นจุดซุ่มหลัก",
    fog: 0x1e2a30,
    fogNear: 26,
    fogFar: 108,
    hemiSky: 0x7a96a4,
    hemiGround: 0x2c382c,
    sunColor: 0xe8eef8,
    sunIntensity: 1.05,
    sunDir: [-0.2, 0.9, 0.25],
    groundColor: 0x2c3a2e,
    bounds: { minX: -38, maxX: 38, minZ: -38, maxZ: 38 },
    spawn: { x: 0, y: 0.2, z: 34, yaw: 0 },
    extract: { x: -30, z: 0, r: 4.4 },
    intel: [
      { x: 2, y: 1.1, z: -4 },
      { x: -10, y: 1.1, z: 6 },
    ],
    boxes,
    lights,
    enemies,
    minimap: mmFromBoxes(boxes),
  };
}

function outpost(): LevelDef {
  const sand = 0x8a7a5c;
  const conc = 0x6a6860;
  const bunker = 0x4a4c46;
  const bag = 0x7a6a4a;
  const rust = 0x5a4034;
  const boxes: BoxSpec[] = [];
  const lights: LightSpec[] = [];

  boxes.push(box(0, 0, 96, 96, 0.18, sand, -0.18));

  boxes.push(wall(-38, -36, 38, -36, 2.6, conc, 0.7));
  boxes.push(wall(-38, 36, -6, 36, 2.6, conc, 0.7));
  boxes.push(wall(6, 36, 38, 36, 2.6, conc, 0.7));
  boxes.push(wall(-38, -36, -38, 36, 2.6, conc, 0.7));
  boxes.push(wall(38, -36, 38, 36, 2.6, conc, 0.7));

  boxes.push(...building(0, -18, 22, 14, 7.2, conc, "s"));
  boxes.push(...building(18, 8, 12, 10, 4.4, bunker, "w"));
  boxes.push(...building(-16, 10, 10, 10, 3.8, bunker, "e"));

  boxes.push(...tower(0, 6, 11.2, 0x4a4e4a, "s"));
  boxes.push(...tower(-28, -22, 7.4, bunker, "e"));
  boxes.push(...tower(28, -22, 7.4, bunker, "w"));

  for (const z of [-8, 0, 8]) {
    boxes.push(box(-8, z, 3.6, 0.9, 1.05, bag));
    boxes.push(box(8, z, 3.6, 0.9, 1.05, bag));
  }
  boxes.push(box(0, -6, 8, 0.9, 1.05, bag));
  boxes.push(box(-22, 0, 0.9, 8, 1.05, bag));
  boxes.push(box(22, 18, 6, 0.9, 1.05, bag));

  boxes.push(box(-10, 22, 4.8, 2.2, 1.6, rust));
  boxes.push(box(12, 22, 4.8, 2.2, 1.6, rust));
  boxes.push(box(-10, 22, 1.8, 1.8, 1.1, 0x2a2c28, 1.6, { collide: false }));

  boxes.push(crate(-4, 14, rust));
  boxes.push(crate(4, 14, bag, 1.4));
  boxes.push(crate(16, -4, rust, 1.2));
  boxes.push(crate(-18, -8, bag));
  boxes.push(box(4, 2, 1.4, 1.4, 2.2, rust));

  boxes.push(box(0, 6, 0.6, 0.6, 4.2, 0x3a3c38, 11.6, { collide: false }));

  for (const [x, z] of [
    [-20, 20],
    [20, 20],
    [-12, -8],
    [12, -8],
    [0, 18],
  ] as [number, number][]) {
    boxes.push(box(x, z, 0.28, 0.28, 5.5, 0x3a3c38));
    lights.push({ x, y: 5, z, color: 0xffb070, intensity: 1.8, distance: 14 });
  }

  const enemies: EnemySpec[] = [
    { x: 0, z: 16, waypoints: patrol([0, 16], [-10, 16], [10, 16], [10, 6], [-10, 6]) },
    { x: -16, z: 0, waypoints: patrol([-16, 0], [-16, 12], [-8, 12], [-8, 0]) },
    { x: 16, z: 2, waypoints: patrol([16, 2], [24, 2], [24, 14], [16, 14]) },
    { x: -8, z: -12, waypoints: patrol([-8, -12], [8, -12], [8, -20], [-8, -20]) },
    { x: 18, z: 8, waypoints: patrol([14, 8], [20, 8], [20, 4], [14, 4]), hvt: true },
    { x: -28, z: -8, waypoints: patrol([-28, -8], [-28, 8], [-22, 8]) },
    { x: 28, z: -8, waypoints: patrol([28, -8], [28, 8], [22, 8]) },
    { x: 0, z: -28, waypoints: patrol([-10, -28], [10, -28]) },
  ];

  return {
    id: "outpost",
    codename: "SAND BASE",
    nameTh: "ฐานทราย",
    place: "ฐานทัพทะเลทรายยามสนธยา",
    briefing:
      "ผู้บัญชาการกำลังตรวจบังเกอร์ทิศตะวันออก ขึ้นหอวิทยุกลางลานจะเห็นทั้งลาน เก็บแผนที่จากบังเกอร์แล้วถอนตัวช่องรั้วทิศเหนือ",
    objectives: ["กำจัดผู้บัญชาการที่บังเกอร์", "เก็บแผนที่ปฏิบัติการ", "ถอนตัวช่องรั้วด้านเหนือ"],
    nestHint: "หอวิทยุสูงกลางลานเป็นรังซุ่มที่ดีที่สุดของทั้งปฏิบัติการ",
    fog: 0x3a2e22,
    fogNear: 24,
    fogFar: 108,
    hemiSky: 0xb89060,
    hemiGround: 0x4a3a28,
    sunColor: 0xffc090,
    sunIntensity: 1.15,
    sunDir: [-0.55, 0.5, 0.35],
    groundColor: 0x8a7a5c,
    bounds: { minX: -42, maxX: 42, minZ: -42, maxZ: 42 },
    spawn: { x: 0, y: 0.2, z: 34, yaw: 0 },
    extract: { x: 0, z: -34, r: 4.6 },
    intel: [
      { x: 18, y: 1.1, z: 8 },
      { x: -16, y: 1.1, z: 10 },
    ],
    boxes,
    lights,
    enemies,
    minimap: mmFromBoxes(boxes),
  };
}

export const LEVELS: LevelDef[] = [dockyard(), villa(), outpost()];

export function loadProgress() {
  try {
    if (typeof localStorage === "undefined") return { best: {} as Record<string, string> };
    const raw = localStorage.getItem("shadow-nest-v1");
    if (!raw) return { best: {} as Record<string, string> };
    return JSON.parse(raw) as { best: Record<string, string> };
  } catch {
    return { best: {} as Record<string, string> };
  }
}

export function saveProgress(best: Record<string, string>) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem("shadow-nest-v1", JSON.stringify({ v: 1, best }));
}
