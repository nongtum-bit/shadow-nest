export type Collider = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

export function boxCollider(
  x: number,
  yBottom: number,
  z: number,
  w: number,
  h: number,
  d: number,
): Collider {
  const hw = w * 0.5;
  const hd = d * 0.5;
  return {
    minX: x - hw,
    maxX: x + hw,
    minY: yBottom,
    maxY: yBottom + h,
    minZ: z - hd,
    maxZ: z + hd,
  };
}

export function aabbOverlap(
  ax0: number,
  ay0: number,
  az0: number,
  ax1: number,
  ay1: number,
  az1: number,
  c: Collider,
): boolean {
  return ax0 < c.maxX && ax1 > c.minX && ay0 < c.maxY && ay1 > c.minY && az0 < c.maxZ && az1 > c.minZ;
}

export function rayAabb(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  c: Collider,
): number | null {
  const invX = dx !== 0 ? 1 / dx : 1e12;
  const invY = dy !== 0 ? 1 / dy : 1e12;
  const invZ = dz !== 0 ? 1 / dz : 1e12;
  let tmin = 0;
  let tmax = maxDist;

  const tx1 = (c.minX - ox) * invX;
  const tx2 = (c.maxX - ox) * invX;
  tmin = Math.max(tmin, Math.min(tx1, tx2));
  tmax = Math.min(tmax, Math.max(tx1, tx2));

  const ty1 = (c.minY - oy) * invY;
  const ty2 = (c.maxY - oy) * invY;
  tmin = Math.max(tmin, Math.min(ty1, ty2));
  tmax = Math.min(tmax, Math.max(ty1, ty2));

  const tz1 = (c.minZ - oz) * invZ;
  const tz2 = (c.maxZ - oz) * invZ;
  tmin = Math.max(tmin, Math.min(tz1, tz2));
  tmax = Math.min(tmax, Math.max(tz1, tz2));

  if (tmax >= tmin && tmin <= maxDist && tmax >= 0) return tmin >= 0 ? tmin : 0;
  return null;
}

export function losBlocked(
  ox: number,
  oy: number,
  oz: number,
  tx: number,
  ty: number,
  tz: number,
  colliders: Collider[],
  skipNear = 0.2,
): boolean {
  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.001) return false;
  const inv = 1 / dist;
  const rdx = dx * inv;
  const rdy = dy * inv;
  const rdz = dz * inv;
  const max = dist - 0.35;
  for (const c of colliders) {
    const t = rayAabb(ox, oy, oz, rdx, rdy, rdz, max, c);
    if (t !== null && t > skipNear) return true;
  }
  return false;
}

const STEP_UP = 0.42;
const SKIN = 0.012;

export function moveCharacter(
  pos: { x: number; y: number; z: number },
  vel: { x: number; y: number; z: number },
  dt: number,
  radius: number,
  height: number,
  colliders: Collider[],
  gravity: number,
): boolean {
  const prevY = pos.y;
  vel.y -= gravity * dt;
  if (vel.y < -24) vel.y = -24;

  pos.x += vel.x * dt;
  slideWalls(pos, vel, radius, height, colliders, "x");
  pos.z += vel.z * dt;
  slideWalls(pos, vel, radius, height, colliders, "z");

  pos.y += vel.y * dt;
  const onGround = resolveVertical(pos, vel, radius, height, colliders, prevY);
  unstick(pos, radius, height, colliders);

  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z) || !Number.isFinite(pos.y)) {
    pos.x = 0;
    pos.y = 0.4;
    pos.z = 8;
    vel.x = vel.y = vel.z = 0;
    return true;
  }
  if (pos.y < -1) {
    pos.y = 0.2;
    vel.y = 0;
    return true;
  }
  return onGround;
}

function isFloor(c: Collider, posY: number) {
  const thick = c.maxY - c.minY;
  return thick <= 0.55 || c.maxY <= posY + STEP_UP + 0.08;
}

function slideWalls(
  pos: { x: number; y: number; z: number },
  vel: { x: number; y: number; z: number },
  radius: number,
  height: number,
  colliders: Collider[],
  axis: "x" | "z",
) {
  for (const c of colliders) {
    if (isFloor(c, pos.y)) continue;
    if (c.minY > pos.y + height - 0.05) continue;
    if (c.maxY < pos.y + 0.18) continue;
    if (!aabbOverlap(pos.x - radius, pos.y + 0.12, pos.z - radius, pos.x + radius, pos.y + height, pos.z + radius, c)) {
      continue;
    }

    const step = c.maxY - pos.y;
    if (step > 0.02 && step <= STEP_UP) {
      const raised = c.maxY + 0.01;
      if (!blockedAt(pos.x, raised, pos.z, radius, height, colliders, c)) {
        pos.y = raised;
        continue;
      }
    }

    if (axis === "x") {
      const mid = (c.minX + c.maxX) * 0.5;
      pos.x = pos.x < mid ? c.minX - radius - SKIN : c.maxX + radius + SKIN;
      vel.x = 0;
    } else {
      const mid = (c.minZ + c.maxZ) * 0.5;
      pos.z = pos.z < mid ? c.minZ - radius - SKIN : c.maxZ + radius + SKIN;
      vel.z = 0;
    }
  }
}

function resolveVertical(
  pos: { x: number; y: number; z: number },
  vel: { x: number; y: number; z: number },
  radius: number,
  height: number,
  colliders: Collider[],
  prevY: number,
): boolean {
  let onGround = false;
  for (const c of colliders) {
    if (pos.x + radius <= c.minX || pos.x - radius >= c.maxX) continue;
    if (pos.z + radius <= c.minZ || pos.z - radius >= c.maxZ) continue;

    if (vel.y <= 0 && prevY >= c.maxY - 0.16 && pos.y <= c.maxY + 0.04) {
      pos.y = c.maxY;
      vel.y = 0;
      onGround = true;
      continue;
    }
    if (vel.y > 0 && prevY + height <= c.minY + 0.08 && pos.y + height >= c.minY) {
      pos.y = c.minY - height - SKIN;
      vel.y = 0;
    }
  }
  return onGround;
}

function unstick(
  pos: { x: number; y: number; z: number },
  radius: number,
  height: number,
  colliders: Collider[],
) {
  for (let n = 0; n < 5; n++) {
    let hit = false;
    for (const c of colliders) {
      if (isFloor(c, pos.y)) continue;
      if (c.minY > pos.y + height - 0.05) continue;
      if (c.maxY < pos.y + 0.18) continue;
      const minX = pos.x - radius;
      const maxX = pos.x + radius;
      const minZ = pos.z - radius;
      const maxZ = pos.z + radius;
      if (!aabbOverlap(minX, pos.y + 0.12, minZ, maxX, pos.y + height, maxZ, c)) continue;
      const penX = Math.min(maxX - c.minX, c.maxX - minX);
      const penZ = Math.min(maxZ - c.minZ, c.maxZ - minZ);
      if (penX < penZ) {
        pos.x += pos.x < (c.minX + c.maxX) * 0.5 ? -(penX + SKIN) : penX + SKIN;
      } else {
        pos.z += pos.z < (c.minZ + c.maxZ) * 0.5 ? -(penZ + SKIN) : penZ + SKIN;
      }
      hit = true;
    }
    if (!hit) break;
  }
}

function blockedAt(
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
  colliders: Collider[],
  ignore: Collider,
): boolean {
  for (const c of colliders) {
    if (c === ignore) continue;
    if (isFloor(c, y)) continue;
    if (aabbOverlap(x - radius, y + 0.08, z - radius, x + radius, y + height, z + radius, c)) return true;
  }
  return false;
}
