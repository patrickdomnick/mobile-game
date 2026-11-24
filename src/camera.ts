// Exact pinhole camera math matching sim/engine.go and src/renderer/raytrace.wgsl
export const CAM_POS = [0.0, 12.6, 2.35] as const;
export const CAM_TARGET = [0.0, 0.0, 0.25] as const;
export const CAM_FOV_Y = 0.72;

interface Basis {
  fx: number;
  fy: number;
  fz: number;
  rx: number;
  ry: number;
  rz: number;
  ux: number;
  uy: number;
  uz: number;
  tanHalfFov: number;
}

function getCameraBasis(): Basis {
  const dx = CAM_TARGET[0] - CAM_POS[0];
  const dy = CAM_TARGET[1] - CAM_POS[1];
  const dz = CAM_TARGET[2] - CAM_POS[2];
  const fLen = Math.hypot(dx, dy, dz);
  const fx = dx / fLen;
  const fy = dy / fLen;
  const fz = dz / fLen;

  // right = normalize(cross(forward, (0, 1, 0))) = normalize((-fz, 0, fx))
  const rLen = Math.hypot(-fz, fx);
  const rx = -fz / rLen;
  const ry = 0;
  const rz = fx / rLen;

  // up = cross(right, forward)
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  return {
    fx,
    fy,
    fz,
    rx,
    ry,
    rz,
    ux,
    uy,
    uz,
    tanHalfFov: Math.tan(CAM_FOV_Y * 0.5),
  };
}

const BASIS = getCameraBasis();

/**
 * Unprojects a normalized viewport coordinate (u, v in [0, 1], top-left origin)
 * onto the horizontal plane y = planeY in world space.
 */
export function unprojectScreenToPlane(
  u: number,
  v: number,
  aspect: number,
  planeY = 0.0,
): { wx: number; wz: number } | null {
  // WGSL uv.y = 0 at bottom, 1 at top -> screen v = 0 at top means ndcY = 1 - 2*v
  const ndcX = u * 2 - 1;
  const ndcY = 1 - v * 2;

  const rdx = BASIS.fx + BASIS.rx * (ndcX * aspect * BASIS.tanHalfFov) + BASIS.ux * (ndcY * BASIS.tanHalfFov);
  const rdy = BASIS.fy + BASIS.ry * (ndcX * aspect * BASIS.tanHalfFov) + BASIS.uy * (ndcY * BASIS.tanHalfFov);
  const rdz = BASIS.fz + BASIS.rz * (ndcX * aspect * BASIS.tanHalfFov) + BASIS.uz * (ndcY * BASIS.tanHalfFov);

  if (Math.abs(rdy) < 1e-5) return null;
  const t = (planeY - CAM_POS[1]) / rdy;
  if (t <= 0) return null;

  return {
    wx: CAM_POS[0] + rdx * t,
    wz: CAM_POS[2] + rdz * t,
  };
}

/**
 * Projects a world-space point (wx, wy, wz) to normalized viewport coordinates
 * (screenX, screenY in [0, 1], top-left origin) for exact E2E touch tapping.
 */
export function projectWorldToScreen(
  wx: number,
  wy: number,
  wz: number,
  aspect: number,
): { screenX: number; screenY: number } {
  const vx = wx - CAM_POS[0];
  const vy = wy - CAM_POS[1];
  const vz = wz - CAM_POS[2];

  const zDepth = vx * BASIS.fx + vy * BASIS.fy + vz * BASIS.fz;
  const xProj = vx * BASIS.rx + vy * BASIS.ry + vz * BASIS.rz;
  const yProj = vx * BASIS.ux + vy * BASIS.uy + vz * BASIS.uz;

  const ndcX = xProj / (zDepth * aspect * BASIS.tanHalfFov);
  const ndcY = yProj / (zDepth * BASIS.tanHalfFov);

  return {
    screenX: (ndcX + 1) * 0.5,
    screenY: (1 - ndcY) * 0.5,
  };
}
