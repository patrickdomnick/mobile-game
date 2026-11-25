struct RenderUniforms {
  resolution: vec2<f32>,
  time: f32,
  _pad: f32,
};

struct PearlNode {
  posRad: vec4<f32>, // xyz = center, w = radius
  props: vec4<f32>,  // x = colorIdx, y = dir/bloom/occ, z = flags/shimmer/pulse, w = interiorGlowT/active/tension
};

// Exact 1248-float (4,992-byte) scene buffer matching sim/engine.go
struct SceneData {
  cameraPos: vec4<f32>,    // [0] xyz = pos (with micro-shake), w = elapsed
  cameraTarget: vec4<f32>, // [1] xyz = target, w = fovY
  sunDir: vec4<f32>,       // [2] xyz = dir, w = sunIntensity
  sunColor: vec4<f32>,     // [3] rgb = sunColor, w = candleIntensity
  ambientSky: vec4<f32>,   // [4] rgb = ambient, w = timeOfDayHours
  deskTint: vec4<f32>,     // [5] rgb = deskBase, w = celebrateT
  boardInfo: vec4<f32>,    // [6] x = cols, y = rows, z = cellPitch, w = tileCount
  countsInfo: vec4<f32>,   // [7] x = hoopCount, y = trayLen, z = flyingCount, w = phase
  activeColors: vec4<f32>, // [8] x = c0, y = c1, z = rem0, w = rem1
  boardBounds: vec4<f32>,  // [9] x = cx, y = cz, z = halfW, w = halfD
  hoopBounds: vec4<f32>,   // [10] x = cx, y = cz, z = radius, w = trayZ
  themeSolar: vec4<f32>,   // [11] x = themeIndex (0..3), y = daylightFactor, z = horizonWarmth, w = traySpacing
  juiceFX: vec4<f32>,      // [12] x = colorBurstPulse, y = colorBurstColor, z = layerBurstPulse, w = trayTension
  blockerFX: vec4<f32>,    // [13] x = tappedX, y = tappedZ, z = blockerX, w = blockerZ
  extraFX: vec4<f32>,      // [14] x = blockerFlashT, y = streakFloat, z = layersDoneRatio, w = hintIdx
  queueFX: vec4<f32>,      // [15] x = multiplier, y = nextQueuedColor, z = levelIdx, w = spotlightMaxGlowT
  palette: array<vec4<f32>, 6>,
  tiles: array<PearlNode, 64>,
  hoopPearls: array<PearlNode, 64>,
  trayPearls: array<PearlNode, 5>,
  flyingPearls: array<PearlNode, 12>,
};

@group(0) @binding(0) var<uniform> renderU: RenderUniforms;
@group(0) @binding(1) var<storage, read> scene: SceneData;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  let p = positions[vid];
  var out: VSOut;
  out.pos = vec4<f32>(p, 0.0, 1.0);
  out.uv = p * 0.5 + vec2<f32>(0.5, 0.5);
  return out;
}

const MAX_DIST: f32 = 80.0;
const EPS: f32 = 0.0015;

// Fast physical linear conversion (gamma 2.0, zero transcendental pow() calls!)
fn toLinear(srgb: vec3<f32>) -> vec3<f32> {
  let c = max(srgb, vec3<f32>(0.0));
  return c * c;
}

// 4 vivid native themes: 0 = Jewel Atelier, 1 = Cyber Arcade, 2 = Pop Studio, 3 = Cathedral Glass
fn getTheme() -> u32 {
  return min(u32(max(scene.themeSolar.x + 0.5, 0.0)), 3u);
}

fn getPaletteLinear(idxF: f32) -> vec4<f32> {
  let idx = min(u32(max(idxF + 0.5, 0.0)), 5u);
  let raw = scene.palette[idx];
  return vec4<f32>(toLinear(raw.rgb), raw.w);
}

fn sdRoundedBox2D(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let q = abs(p) - b + vec2<f32>(r);
  return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn sdSegment2D(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let denom = max(dot(ba, ba), 0.00001);
  let h = clamp(dot(pa, ba) / denom, 0.0, 1.0);
  return length(pa - ba * h);
}

fn sdChevron(p: vec2<f32>, size: f32, thickness: f32) -> f32 {
  let ax = abs(p.x);
  let tip = vec2<f32>(0.0, -size * 0.62);
  let wing = vec2<f32>(size * 0.92, size * 0.44);
  let pa = vec2<f32>(ax, p.y) - tip;
  let ba = wing - tip;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - thickness;
}

fn rotateForDir(localXZ: vec2<f32>, dir: u32) -> vec2<f32> {
  if (dir == 1u) { return vec2<f32>(localXZ.y, -localXZ.x); }
  if (dir == 2u) { return vec2<f32>(-localXZ.x, -localXZ.y); }
  if (dir == 3u) { return vec2<f32>(-localXZ.y, localXZ.x); }
  return localXZ;
}

fn dirOffsetXZ(dir: u32) -> vec2<f32> {
  if (dir == 0u) { return vec2<f32>(0.0, -1.0); }
  if (dir == 1u) { return vec2<f32>(1.0, 0.0); }
  if (dir == 2u) { return vec2<f32>(0.0, 1.0); }
  return vec2<f32>(-1.0, 0.0);
}

fn skyReflection(rd: vec3<f32>, theme: u32) -> vec3<f32> {
  let sunDir = normalize(scene.sunDir.xyz);
  let sunLin = toLinear(scene.sunColor.rgb);
  let ambLin = toLinear(scene.ambientSky.rgb);
  let t = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  var warmSky = ambLin * 1.4 + sunLin * 0.28;
  var deepSky = ambLin * 0.45;
  if (theme == 1u) {
    warmSky = vec3<f32>(0.04, 0.24, 0.48);
    deepSky = vec3<f32>(0.10, 0.01, 0.20);
  } else if (theme == 3u) {
    warmSky = vec3<f32>(0.20, 0.12, 0.44) + sunLin * 0.22;
    deepSky = vec3<f32>(0.02, 0.03, 0.10);
  }
  var col = mix(warmSky, deepSky, sqrt(t));
  let sunAmt = max(dot(rd, sunDir), 0.0);
  col += sunLin * pow(sunAmt, 24.0) * (1.1 * scene.sunDir.w);
  col += toLinear(vec3<f32>(1.0, 0.76, 0.44)) * scene.sunColor.w * pow(max(dot(rd, normalize(vec3<f32>(0.6, 0.55, -0.55))), 0.0), 12.0) * 1.1;
  return col;
}

// Physical linear-space 3D raytraced pearl shading with 4s interior unlock spotlight & inactive-pearl antipattern dimming
fn shadePearl(
  pos: vec3<f32>,
  normal: vec3<f32>,
  rd: vec3<f32>,
  baseColorLin: vec3<f32>,
  iridescence: f32,
  sparkle: f32,
  isBlockerFlash: bool,
  interiorGlowT: f32,
  isBoardPearl: bool,
) -> vec3<f32> {
  let theme = getTheme();
  let n = normalize(normal);
  let v = -rd;
  let sunDir = normalize(scene.sunDir.xyz);
  let ndotv = clamp(dot(n, v), 0.0, 1.0);
  let daylight = scene.themeSolar.y;

  var albedo = baseColorLin;

  // Delicate pearlescent thin-film luster at grazing angles (Jewel & Cathedral Glass)
  if (theme == 0u || theme == 3u) {
    let phase = (1.0 - ndotv) * 4.5 + pos.x * 0.35;
    let irid = toLinear(0.5 + 0.5 * vec3<f32>(sin(phase), sin(phase + 2.094), sin(phase + 4.188)));
    albedo = mix(albedo, mix(albedo, irid, 0.22), (1.0 - ndotv) * (1.0 - ndotv) * iridescence * 0.45);
  }

  // Blend real solar angle with a subtle upper-left studio key so pearls always show natural 3D roundness
  // (and never develop a harsh dead-center pinhole dot at solar noon!)
  let studioKey = normalize(vec3<f32>(-0.46, 0.72, -0.52));
  let keyDir = normalize(mix(sunDir, studioKey, 0.45));
  let sunLin = toLinear(scene.sunColor.rgb);
  let wrapDiffuse = clamp((dot(n, keyDir) + 0.30) / 1.30, 0.0, 1.0);
  let direct = sunLin * wrapDiffuse * (0.48 + 0.64 * scene.sunDir.w);

  // Smooth upper-left glossy specular sheen
  let hVec = normalize(keyDir + v);
  let specPow = select(44.0, 56.0, theme == 1u || theme == 3u);
  let spec = pow(max(dot(n, hVec), 0.0), specPow) * (0.62 + 0.40 * scene.sunDir.w);

  // Soft studio rim fill light for 3D volume
  let fillDir = normalize(vec3<f32>(0.52, 0.40, 0.62));
  let fillDiff = max(dot(n, fillDir), 0.0) * 0.22;
  let oneMinusV = 1.0 - ndotv;
  let rimGlow = oneMinusV * oneMinusV * oneMinusV;

  // Warm evening candle light at night
  let candlePos = vec3<f32>(2.3, 2.4, -2.5);
  let toCandle = candlePos - pos;
  let candleDistSq = max(dot(toCandle, toCandle), 1.0);
  let candleDir = normalize(toCandle);
  let candleAtten = scene.sunColor.w * (10.5 / (1.0 + candleDistSq * 0.24));
  let candleDiff = max(dot(n, candleDir), 0.0) * candleAtten;
  let candleHalf = normalize(candleDir + v);
  let candleSpec = pow(max(dot(n, candleHalf), 0.0), 48.0) * candleAtten * 0.85;
  let candleTint = toLinear(vec3<f32>(1.0, 0.74, 0.38));

  let hemiBot = mix(vec3<f32>(0.06), vec3<f32>(0.14), daylight);
  let hemiTop = mix(vec3<f32>(0.18), vec3<f32>(0.36), daylight);
  let hemi = mix(hemiBot, hemiTop, n.y * 0.5 + 0.5);

  let fresnel = 0.04 + 0.32 * oneMinusV * oneMinusV * oneMinusV * oneMinusV;
  let envRefl = skyReflection(reflect(rd, n), theme);

  var col = albedo * (hemi + direct + fillDiff + candleTint * candleDiff * 0.60);

  if (theme == 0u) {
    // Jewel Atelier: calm physical enameled gemstone (zero resting self-glow!)
    col = mix(col, envRefl, fresnel * 0.22);
    col += albedo * (rimGlow * 0.10);
    col += vec3<f32>(1.0, 0.98, 0.94) * spec * 0.80;
    col += candleTint * candleSpec;
  } else if (theme == 1u) {
    // Cyber Arcade: sleek, physically rounded 3D glossy neon glass orbs (zero resting washout!)
    let edgeRound = 0.44 + 0.56 * smoothstep(0.0, 0.36, ndotv);
    let innerDepth = ndotv * ndotv * 0.14;
    col = (col * 0.95 + albedo * innerDepth) * edgeRound;
    col = mix(col, envRefl, fresnel * 0.26);
    col += albedo * rimGlow * 0.24 * smoothstep(0.0, 0.24, ndotv);
    col += vec3<f32>(0.95, 0.98, 1.0) * spec * 0.85;
  } else if (theme == 2u) {
    // Pop Studio: crisp dot-free comic cel-shaded primaries + sleek AA ink contour
    let popKey = normalize(vec3<f32>(-0.55, 0.68, -0.48));
    let ndotlPop = dot(n, popKey);
    let cel = 0.60 + 0.42 * smoothstep(0.05, 0.42, ndotlPop);
    let softCrescent = smoothstep(0.72, 0.88, ndotlPop) * 0.18;
    col = albedo * cel + mix(albedo, vec3<f32>(1.0), 0.32) * softCrescent + candleTint * candleDiff * 0.14;
    let inkRim = smoothstep(0.24, 0.12, ndotv);
    col = mix(col, vec3<f32>(0.005, 0.005, 0.008), inkRim);
  } else {
    // Cathedral Glass (Theme 3): calm faceted stained-glass prism (zero constant glowing!)
    let innerDepth = ndotv * sqrt(ndotv) * 0.24 + 0.10;
    col = albedo * innerDepth + col * 0.68;
    col = mix(col, envRefl, fresnel * 0.30);
    col += albedo * rimGlow * 0.26;
    col += vec3<f32>(1.0, 0.97, 0.92) * spec * 0.90;
  }

  // PURE ADDITIVE 3.5s DOUBLE-HEARTBEAT INTERIOR GLOW (default = ZERO glow & ZERO dimming!):
  // Strictly lights ONLY the 2 starting active colors at start & ONLY a newly unlocked color on unlock,
  // using pure chromatic inner jewel fire + a tight luminous center ember (zero pastel washout!).
  if (isBoardPearl && interiorGlowT > 0.005) {
    let fade = smoothstep(0.0, 0.30, interiorGlowT);
    // Two smooth breathing heartbeats peaking at t=0s and t=1.75s, then smoothly fading to calm rest
    let heartbeat = 0.56 + 0.44 * cos((1.0 - interiorGlowT) * 12.566);
    let jewelFire = pow(ndotv, 1.65) * 1.15;
    let centerEmber = pow(ndotv, 6.5) * 0.68;
    col += (albedo * jewelFire + mix(albedo, vec3<f32>(1.0, 0.96, 0.86), 0.55) * centerEmber) * (fade * heartbeat);
  }

  col += toLinear(vec3<f32>(1.0, 0.92, 0.72)) * (sparkle * 0.55);

  if (isBlockerFlash && scene.extraFX.x > 0.01) {
    let flash = scene.extraFX.x * (0.65 + 0.35 * sin(renderU.time * 28.0));
    col += vec3<f32>(1.4, 0.12, 0.05) * (0.28 + rimGlow * 1.3) * flash;
  }

  return col;
}

// Fast analytic ray-sphere intersection (used for shadow rays)
fn intersectSphere(ro: vec3<f32>, rd: vec3<f32>, center: vec3<f32>, radius: f32) -> f32 {
  let oc = ro - center;
  let b = dot(oc, rd);
  let c = dot(oc, oc) - radius * radius;
  let disc = b * b - c;
  if (disc <= 0.0) {
    return -1.0;
  }
  let t = -b - sqrt(disc);
  if (t > EPS) {
    return t;
  }
  return -1.0;
}

// Analytic 1-SPP Anti-Aliased Sphere Hit: returns (tHit, coverage in [0..1])!
// Eliminates jagged staircase edges on EVERY pearl sphere at zero supersampling cost!
struct SphereAA {
  t: f32,
  cov: f32,
  normal: vec3<f32>,
  pos: vec3<f32>,
};

fn intersectSphereAA(ro: vec3<f32>, rd: vec3<f32>, center: vec3<f32>, radius: f32, pixelScale: f32) -> SphereAA {
  var res: SphereAA;
  res.t = -1.0;
  res.cov = 0.0;
  res.normal = vec3<f32>(0.0, 1.0, 0.0);
  res.pos = center;

  let oc = ro - center;
  let b = dot(oc, rd);
  let tClosest = -b;
  if (tClosest <= EPS) {
    return res;
  }
  let dPerpSq = max(0.0, dot(oc, oc) - b * b);
  let pxW = tClosest * pixelScale;
  let outerR = radius + pxW * 0.52;
  if (dPerpSq >= outerR * outerR) {
    return res;
  }

  let dPerp = sqrt(dPerpSq);
  let cov = smoothstep(radius + pxW * 0.52, radius - pxW * 0.52, dPerp);
  if (cov <= 0.002) {
    return res;
  }

  // Exact surface point for interior pixels; tangent rim point for subpixel anti-aliased edge pixels
  let disc = max(0.0, radius * radius - dPerpSq);
  let tHit = max(EPS, tClosest - sqrt(disc));
  let hitP = ro + rd * tHit;
  res.t = tHit;
  res.cov = cov;
  res.pos = hitP;
  res.normal = normalize(hitP - center);
  return res;
}

// Analytic 2D Heart SDF (tip at (0,0), twin lobes at (+-0.25, 0.75))
fn sdHeart2D(pIn: vec2<f32>) -> f32 {
  let p = vec2<f32>(abs(pIn.x), pIn.y);
  if (p.y + p.x > 1.0) {
    let d = p - vec2<f32>(0.25, 0.75);
    return sqrt(dot(d, d)) - 0.35355339;
  }
  let d1 = p - vec2<f32>(0.0, 1.0);
  let d2 = p - 0.5 * max(p.x + p.y, 0.0);
  return sqrt(min(dot(d1, d1), dot(d2, d2))) * sign(p.x - p.y);
}

// True 3D Sculpted Plump Heart-Shaped Pearl SDF (lobes point screen-UP along -Z, tip screen-DOWN along +Z)
fn sdHeartPearl3D(p: vec3<f32>, center: vec3<f32>, radius: f32) -> f32 {
  let q = (p - center) / radius;
  let scale = 0.52;
  let h2 = vec2<f32>(q.x * scale, -q.z * scale + 0.56);
  let d2 = sdHeart2D(h2) / scale;
  let k = 0.74;
  let d3 = (length(vec2<f32>(d2 + k, q.y * 1.08)) - k) * 0.80;
  return d3 * radius;
}

fn calcHeartNormal3D(p: vec3<f32>, center: vec3<f32>, radius: f32) -> vec3<f32> {
  let e = radius * 0.004;
  let k1 = vec3<f32>(1.0, -1.0, -1.0);
  let k2 = vec3<f32>(-1.0, -1.0, 1.0);
  let k3 = vec3<f32>(-1.0, 1.0, -1.0);
  let k4 = vec3<f32>(1.0, 1.0, 1.0);
  return normalize(
    k1 * sdHeartPearl3D(p + k1 * e, center, radius) +
    k2 * sdHeartPearl3D(p + k2 * e, center, radius) +
    k3 * sdHeartPearl3D(p + k3 * e, center, radius) +
    k4 * sdHeartPearl3D(p + k4 * e, center, radius)
  );
}

// Fast bounding-sphere guarded 3D Heart Pearl raymarcher with analytic silhouette AA
fn intersectHeartPearlAA(ro: vec3<f32>, rd: vec3<f32>, center: vec3<f32>, radius: f32, pixelScale: f32) -> SphereAA {
  var res: SphereAA;
  res.t = -1.0;
  res.cov = 0.0;
  res.normal = vec3<f32>(0.0, 1.0, 0.0);
  res.pos = center;

  let boundR = radius * 1.28;
  let oc = ro - center;
  let b = dot(oc, rd);
  let c = dot(oc, oc) - boundR * boundR;
  let disc = b * b - c;
  if (disc <= 0.0) {
    return res;
  }
  let sq = sqrt(disc);
  let tStart = max(EPS, -b - sq);
  let tEnd = -b + sq;
  if (tEnd <= EPS) {
    return res;
  }

  var t = tStart;
  var minD = 1e6;
  var tBest = tStart;
  var hit = false;
  for (var s: i32 = 0; s < 18; s = s + 1) {
    let p = ro + rd * t;
    let d = sdHeartPearl3D(p, center, radius);
    if (d < minD) {
      minD = d;
      tBest = t;
    }
    if (d < radius * 0.004) {
      hit = true;
      break;
    }
    t += d;
    if (t > tEnd) {
      break;
    }
  }

  let pxW = tBest * pixelScale;
  if (hit) {
    let hitP = ro + rd * t;
    res.t = t;
    res.cov = 1.0;
    res.pos = hitP;
    res.normal = calcHeartNormal3D(hitP, center, radius);
    return res;
  }

  // Smooth subpixel anti-aliasing along the 3D sculpted heart contour
  let aaBand = pxW * 0.85;
  if (minD < aaBand) {
    let cov = smoothstep(aaBand, 0.0, minD);
    if (cov > 0.002) {
      let edgeP = ro + rd * tBest;
      res.t = tBest;
      res.cov = cov;
      res.pos = edgeP;
      res.normal = calcHeartNormal3D(edgeP, center, radius);
    }
  }
  return res;
}

// Vivid swirling prismatic spectrum in linear space for Rainbow Wild Pearls
fn rainbowSpectrumLinear(n: vec3<f32>, time: f32) -> vec3<f32> {
  let angle = atan2(n.z, n.x) + n.y * 2.4 - time * 1.9;
  let srgb = vec3<f32>(
    0.55 + 0.45 * sin(angle),
    0.55 + 0.45 * sin(angle + 2.094395),
    0.55 + 0.45 * sin(angle + 4.188790),
  );
  return toLinear(clamp(srgb, vec3<f32>(0.04), vec3<f32>(1.0)));
}

// Computes the exact 3D center of a board pearl, including pearl-only joyful wiggle & tiny hop
// decoded from tl.posRad.y (0.22 + JiggleT * 0.10) while the tile card beneath stays rock-solid!
fn boardPearlCenter(tl: PearlNode, pitch: f32) -> vec3<f32> {
  let dir = u32(tl.props.y);
  let backOff = -dirOffsetXZ(dir) * (pitch * 0.105);
  let jT = clamp((tl.posRad.y - 0.22) * 10.0, 0.0, 1.0);
  if (jT <= 0.002) {
    return vec3<f32>(tl.posRad.x + backOff.x, 0.22, tl.posRad.z + backOff.y);
  }
  let wig = sin(jT * 12.566) * jT * (pitch * 0.085);
  let hop = sin(jT * 3.14159) * 0.085;
  return vec3<f32>(tl.posRad.x + backOff.x + wig, 0.22 + hop, tl.posRad.z + backOff.y);
}

fn computeDeskShadow(p: vec3<f32>, sunDir: vec3<f32>) -> f32 {
  var shadow: f32 = 1.0;
  let orig = p + vec3<f32>(0.0, 0.004, 0.0);

  let hoopC = scene.hoopBounds.xy;
  let hoopR = scene.hoopBounds.z;
  let trayZ = scene.hoopBounds.w;
  let boardC = scene.boardBounds.xy;
  let boardHalf = scene.boardBounds.zw;

  if (length(p.xz - hoopC) < hoopR + 0.32) {
    let hCount = min(u32(scene.countsInfo.x), 64u);
    for (var i: u32 = 0u; i < hCount; i = i + 1u) {
      let hp = scene.hoopPearls[i];
      let bloom = hp.props.y;
      if (bloom > 0.05) {
        if (abs(p.x - hp.posRad.x) > 0.42 || abs(p.z - hp.posRad.z) > 0.42) {
          continue;
        }
        let r = hp.posRad.w * (0.25 + 0.75 * bloom);
        if (intersectSphere(orig, sunDir, hp.posRad.xyz, r) > 0.0) {
          shadow *= 0.48;
        }
      }
    }
  } else if (abs(p.z - trayZ) < 0.52) {
    for (var i: u32 = 0u; i < 5u; i = i + 1u) {
      let tp = scene.trayPearls[i];
      if (tp.props.y > 0.5) {
        if (intersectSphere(orig, sunDir, tp.posRad.xyz, tp.posRad.w) > 0.0) {
          shadow *= 0.48;
        }
      }
    }
  } else if (abs(p.x - boardC.x) < boardHalf.x + 0.42 && abs(p.z - boardC.y) < boardHalf.y + 0.42) {
    let tCount = min(u32(scene.boardInfo.w), 64u);
    let pitch = scene.boardInfo.z;
    for (var i: u32 = 0u; i < tCount; i = i + 1u) {
      let tl = scene.tiles[i];
      let flags = u32(tl.props.z);
      if ((flags & 1u) == 0u) {
        continue;
      }
      if (abs(p.x - tl.posRad.x) > pitch * 1.1 || abs(p.z - tl.posRad.z) > pitch * 1.1) {
        continue;
      }
      let spCenter = boardPearlCenter(tl, pitch);
      if (intersectSphere(orig, sunDir, spCenter, tl.posRad.w) > 0.0) {
        shadow *= 0.46;
      }
    }
  }

  let fCount = min(u32(scene.countsInfo.z), 12u);
  if (fCount > 0u) {
    for (var i: u32 = 0u; i < 12u; i = i + 1u) {
      let fp = scene.flyingPearls[i];
      if (fp.props.y > 0.5) {
        if (intersectSphere(orig, sunDir, fp.posRad.xyz, fp.posRad.w) > 0.0) {
          shadow *= 0.56;
        }
      }
    }
  }

  return max(shadow, 0.34);
}

fn shadeAtelierDesk(p: vec3<f32>, rd: vec3<f32>, aa: f32) -> vec3<f32> {
  let theme = getTheme();
  let sunDir = normalize(scene.sunDir.xyz);
  let hoopC = scene.hoopBounds.xy;
  let hoopR = scene.hoopBounds.z;
  let trayZ = scene.hoopBounds.w;
  let boardC = scene.boardBounds.xy;
  let boardHalf = scene.boardBounds.zw;
  let celebrate = scene.deskTint.w;
  let daylight = scene.themeSolar.y;
  let horizon = scene.themeSolar.z;

  let colorBurstT = scene.juiceFX.x;
  let colorBurstCol = getPaletteLinear(scene.juiceFX.y).rgb;
  let layerBurstT = scene.juiceFX.z;
  let trayTension = scene.juiceFX.w;
  let blockerFlashT = scene.extraFX.x;
  let streakAmt = clamp(scene.extraFX.y / 10.0, 0.0, 1.0);

  var albedo = toLinear(scene.deskTint.rgb);
  var normal = vec3<f32>(0.0, 1.0, 0.0);
  var metallic: f32 = 0.08;
  var roughness: f32 = 0.65;
  var emissive = vec3<f32>(0.0);

  // =========================================================================
  // 4 VIVID THEME DESK BACKDROPS (All smoothly 24h Solar-Synced!)
  // =========================================================================
  let deskDist = length(p.xz * vec2<f32>(0.34, 0.20));
  if (theme == 0u) {
    let grain = 0.90 + 0.10 * sin(p.x * 16.0 + sin(p.z * 3.5) * 1.4);
    let deskNight = toLinear(vec3<f32>(0.10, 0.13, 0.26));
    let deskDay = toLinear(vec3<f32>(0.18, 0.28, 0.36));
    let deskSunset = toLinear(vec3<f32>(0.36, 0.18, 0.24));
    albedo = mix(deskNight, deskDay, daylight);
    albedo = mix(albedo, deskSunset, horizon * 0.65) * grain;
    albedo *= clamp(1.16 - deskDist * 0.36, 0.45, 1.16);
    roughness = 0.52;
  } else if (theme == 1u) {
    let baseDark = mix(vec3<f32>(0.004, 0.005, 0.014), vec3<f32>(0.010, 0.016, 0.036), daylight);
    let gx = smoothstep(0.955, 0.994, abs(cos(p.x * 3.14159 * 1.35)));
    let gz = smoothstep(0.955, 0.994, abs(cos(p.z * 3.14159 * 1.35)));
    let gridLine = max(gx, gz);
    let gridCol = mix(toLinear(vec3<f32>(0.04, 0.88, 1.0)), toLinear(vec3<f32>(1.0, 0.12, 0.62)), clamp(horizon * 0.8 + 0.15, 0.0, 1.0));
    albedo = baseDark;
    emissive += gridCol * gridLine * (0.45 + 0.25 * (1.0 - daylight));
    metallic = 0.55;
    roughness = 0.20;
  } else if (theme == 2u) {
    let bgDay = toLinear(vec3<f32>(0.06, 0.60, 0.98));
    let bgSunset = toLinear(vec3<f32>(0.98, 0.36, 0.16));
    let bgNight = toLinear(vec3<f32>(0.10, 0.14, 0.48));
    var popBg = mix(bgNight, bgDay, daylight);
    popBg = mix(popBg, bgSunset, horizon * 0.72);
    let cell = fract(p.xz * 2.4) - vec2<f32>(0.5);
    let dotMask = smoothstep(0.25 + aa * 2.4, 0.21 - aa * 2.4, length(cell));
    albedo = mix(popBg, popBg * 1.55 + vec3<f32>(0.04), dotMask * 0.55);
    roughness = 0.82;
  } else {
    let u = p.x * 1.35 + p.z * 1.35;
    let v = p.x * 1.35 - p.z * 1.35;
    let lead = max(smoothstep(0.92, 0.98, abs(cos(u * 3.14159))), smoothstep(0.92, 0.98, abs(cos(v * 3.14159))));
    let cellHash = fract(sin(floor(u) * 12.9898 + floor(v) * 78.233) * 43758.5453);
    let glassA = toLinear(vec3<f32>(0.10, 0.22, 0.52));
    let glassB = toLinear(vec3<f32>(0.32, 0.10, 0.48));
    let glassWarm = toLinear(vec3<f32>(0.54, 0.16, 0.24));
    var glassCol = mix(glassA, glassB, cellHash);
    glassCol = mix(glassCol, glassWarm, horizon * 0.65);
    albedo = mix(glassCol * (0.45 + 0.65 * daylight), vec3<f32>(0.008, 0.007, 0.012), lead);
    metallic = mix(0.25, 0.78, lead);
    roughness = mix(0.24, 0.42, lead);
  }

  let hpLocal = p.xz - hoopC;
  let hpDist = length(hpLocal);
  if (colorBurstT > 0.01) {
    let waveR = (1.0 - colorBurstT) * 6.5;
    let waveRing = exp(-pow((hpDist - waveR) / 0.40, 2.0)) * colorBurstT;
    emissive += colorBurstCol * (waveRing * 1.45 + colorBurstT * 0.22);
  }
  if (layerBurstT > 0.01) {
    let lWaveR = (1.0 - layerBurstT) * 5.8;
    let lRing = exp(-pow((hpDist - lWaveR) / 0.34, 2.0)) * layerBurstT;
    emissive += toLinear(vec3<f32>(1.0, 0.80, 0.22)) * (lRing * 1.65 + layerBurstT * 0.20);
  }
  if (streakAmt > 0.15) {
    let auraGlow = exp(-hpDist * 0.42) * (streakAmt - 0.15) * 0.24;
    let streakCol = select(toLinear(vec3<f32>(1.0, 0.72, 0.18)), toLinear(vec3<f32>(0.06, 0.92, 1.0)), theme == 1u);
    emissive += streakCol * auraGlow;
  }

  let trayLocal = vec2<f32>(p.x, p.z - trayZ);
  let trayHalf = vec2<f32>(1.68, 0.30);
  let dTray = sdRoundedBox2D(trayLocal, trayHalf, 0.16);

  let bLocal = p.xz - boardC;
  let frameHalf = boardHalf + vec2<f32>(0.15, 0.15);
  let dFrame = sdRoundedBox2D(bLocal, frameHalf, 0.18);

  // =========================================================================
  // MUTUALLY EXCLUSIVE ZONES (Huge GPU Battery Win + Full Screen-Space SDF AA!)
  // =========================================================================
  if (hpDist < hoopR + 0.30) {
    // ZONE 1: Embroidery Hoop + Stitchboard Active Highlights (AA!)
    let shadowOffset = hpLocal + sunDir.xz * 0.08;
    let outerShadowD = abs(length(shadowOffset) - hoopR);
    if (outerShadowD < 0.14 && hpDist > hoopR - 0.05) {
      albedo *= mix(0.45, 1.0, smoothstep(0.04, 0.14, outerShadowD));
    }

    let innerClothMask = smoothstep(hoopR - 0.055 + aa, hoopR - 0.055 - aa, hpDist);
    if (innerClothMask > 0.002) {
      let aida = 0.96 + 0.04 * (sin(p.x * 74.0) * sin(p.z * 74.0));
      var clothCol = toLinear(vec3<f32>(0.96, 0.93, 0.85));
      var clothEmissive = vec3<f32>(0.0);
      if (theme == 0u) {
        clothCol = mix(toLinear(vec3<f32>(0.76, 0.71, 0.65)), toLinear(vec3<f32>(0.96, 0.93, 0.85)), daylight) * aida;
      } else if (theme == 1u) {
        clothCol = vec3<f32>(0.008, 0.012, 0.032) * aida;
        let mesh = smoothstep(0.92, 0.99, max(abs(cos(p.x * 22.0)), abs(cos(p.z * 22.0))));
        clothEmissive += toLinear(vec3<f32>(0.04, 0.72, 1.0)) * mesh * 0.14;
      } else if (theme == 2u) {
        clothCol = toLinear(vec3<f32>(0.98, 0.97, 0.93));
      } else {
        clothCol = mix(toLinear(vec3<f32>(0.14, 0.16, 0.30)), toLinear(vec3<f32>(0.26, 0.24, 0.38)), daylight) * aida;
        let spokes = smoothstep(0.96, 0.992, abs(cos(atan2(hpLocal.y, hpLocal.x) * 6.0)));
        clothCol = mix(clothCol, vec3<f32>(0.012, 0.010, 0.016), spokes * 0.65);
      }
      let innerEdge = smoothstep(hoopR - 0.055, hoopR - 0.18, hpDist);
      clothCol *= mix(0.74, 1.0, innerEdge);

      let hCount = min(u32(scene.countsInfo.x), 64u);
      for (var i: u32 = 0u; i < hCount; i = i + 1u) {
        let hp = scene.hoopPearls[i];
        let dDot = length(p.xz - hp.posRad.xz);
        if (dDot > 0.26) {
          continue;
        }
        let bloom = hp.props.y;
        let isActive = hp.props.w;
        let pal = getPaletteLinear(hp.props.x).rgb;
        if (bloom > 0.25 && dDot < hp.posRad.w * 1.55) {
          let ao = mix(0.56, 1.0, smoothstep(hp.posRad.w * 0.72, hp.posRad.w * 1.55, dDot));
          clothCol *= mix(1.0, ao, bloom);
        }
        if (bloom < 0.95 && dDot < 0.165) {
          if (isActive > 0.5) {
            // Crisp anti-aliased active target ring on the stitchboard (continues glowing cleanly!)
            let innerRing = smoothstep(0.088 + aa, 0.088 - aa, dDot) - smoothstep(0.042 + aa, 0.042 - aa, dDot);
            let outerHalo = exp(-pow((dDot - 0.088) / 0.032, 2.0)) * 0.55;
            let centerDot = smoothstep(0.026 + aa, 0.026 - aa, dDot);
            clothCol = mix(clothCol, pal, clamp(innerRing, 0.0, 1.0));
            clothCol = mix(clothCol, vec3<f32>(0.02, 0.02, 0.03), centerDot * 0.80);
            clothEmissive += pal * (outerHalo + innerRing * 0.42);
          } else if (dDot < 0.09) {
            let ring = smoothstep(0.068 + aa, 0.068 - aa, dDot) - smoothstep(0.032 + aa, 0.032 - aa, dDot);
            let centerPin = smoothstep(0.020 + aa, 0.020 - aa, dDot);
            clothCol = mix(clothCol, pal, clamp(ring, 0.0, 1.0) * 0.42);
            clothCol = mix(clothCol, vec3<f32>(0.04, 0.04, 0.05), centerPin * 0.48);
          }
        }
        if (theme == 3u && bloom > 0.3 && dDot < 0.22) {
          clothEmissive += pal * exp(-dDot * 12.0) * bloom * 0.48;
        }
        let spark = max(hp.props.z, celebrate * (0.5 + 0.5 * sin(renderU.time * 6.5 + f32(i))));
        if (spark > 0.02) {
          let ringR = 0.11 + (1.0 - spark) * 0.13;
          let ringMask = exp(-pow((dDot - ringR) / 0.026, 2.0)) * spark;
          clothEmissive += mix(toLinear(vec3<f32>(1.0, 0.92, 0.62)), pal, 0.45) * ringMask * 1.1;
        }
      }

      albedo = mix(albedo, clothCol, innerClothMask);
      emissive = emissive * (1.0 - innerClothMask) + clothEmissive * innerClothMask;
    }

    // Silky-smooth AA 3D Curved Hoop Ring
    let rimDist = abs(hpDist - hoopR);
    let rimMask = smoothstep(0.080 + aa, 0.080 - aa, rimDist);
    if (rimMask > 0.002) {
      let profile = clamp((hpDist - hoopR) / 0.080, -1.0, 1.0);
      let radDir = normalize(hpLocal + vec2<f32>(0.0001));
      let rimNorm = normalize(vec3<f32>(radDir.x * profile * 0.78, sqrt(max(0.05, 1.0 - profile * profile * 0.60)), radDir.y * profile * 0.78));
      let brush = 0.92 + 0.08 * sin(atan2(hpLocal.y, hpLocal.x) * 44.0);
      var rimCol = toLinear(vec3<f32>(0.96, 0.76, 0.30)) * brush;
      var rimMet = 0.88;
      var rimRough = 0.18;
      var rimEmiss = vec3<f32>(0.0);
      if (theme == 1u) {
        let neonRim = mix(toLinear(vec3<f32>(0.04, 0.92, 1.0)), toLinear(vec3<f32>(1.0, 0.12, 0.64)), 0.5 + 0.5 * sin(atan2(hpLocal.y, hpLocal.x) * 2.0));
        rimCol = neonRim;
        rimEmiss += neonRim * 1.05;
        rimMet = 0.75;
        rimRough = 0.14;
      } else if (theme == 2u) {
        let inkEdge = smoothstep(0.66 - aa * 8.0, 0.66 + aa * 8.0, abs(profile));
        rimCol = mix(toLinear(vec3<f32>(1.0, 0.84, 0.04)), vec3<f32>(0.004), inkEdge);
        rimMet = 0.04;
        rimRough = 0.70;
      } else if (theme == 3u) {
        rimCol = toLinear(vec3<f32>(0.80, 0.58, 0.28)) * brush;
        rimMet = 0.84;
        rimRough = 0.24;
      }
      let rimCelebrate = max(celebrate, max(layerBurstT, colorBurstT * 0.85));
      if (rimCelebrate > 0.01) {
        rimEmiss += mix(toLinear(vec3<f32>(1.0, 0.82, 0.30)), colorBurstCol, colorBurstT * 0.7) * rimCelebrate * 0.95;
      }
      albedo = mix(albedo, rimCol, rimMask);
      normal = normalize(mix(normal, rimNorm, rimMask));
      metallic = mix(metallic, rimMet, rimMask);
      roughness = mix(roughness, rimRough, rimMask);
      emissive = emissive * (1.0 - rimMask) + rimEmiss * rimMask;
    }

    // Silky-smooth AA top hoop tightening clasp screw at 12 o'clock
    let claspP = hpLocal - vec2<f32>(0.0, -(hoopR + 0.105));
    let claspD = sdRoundedBox2D(claspP, vec2<f32>(0.14, 0.068), 0.025);
    let claspMask = smoothstep(aa, -aa, claspD);
    if (claspMask > 0.002) {
      var claspCol = toLinear(vec3<f32>(0.94, 0.74, 0.32));
      var claspEmiss = vec3<f32>(0.0);
      if (theme == 1u) {
        claspCol = toLinear(vec3<f32>(1.0, 0.14, 0.64));
        claspEmiss = claspCol * 0.70;
      } else if (theme == 2u) {
        let cInk = smoothstep(-0.020 - aa, -0.020 + aa, claspD);
        claspCol = mix(toLinear(vec3<f32>(0.98, 0.14, 0.18)), vec3<f32>(0.004), cInk);
      }
      albedo = mix(albedo, claspCol, claspMask);
      emissive = emissive * (1.0 - claspMask) + claspEmiss * claspMask;
      metallic = mix(metallic, 0.84, claspMask);
      roughness = mix(roughness, 0.22, claspMask);
      normal = normalize(mix(normal, normalize(vec3<f32>(claspP.x * 2.2, 1.0, claspP.y * 2.2)), claspMask));
    }
  } else {
    if (dTray < 0.16) {
      // ZONE 2: Silky-smooth AA 5-Slot Holding Tray + Escalating Tension Rim Glow
      if (trayTension > 0.05 && dTray > -0.04) {
        let pulseSpeed = mix(3.4, 9.0, trayTension);
        let tPulse = 0.55 + 0.45 * sin(renderU.time * pulseSpeed);
        let glow = exp(-pow(max(dTray, 0.0) / 0.095, 2.0)) * trayTension * tPulse;
        let tensionCol = mix(toLinear(vec3<f32>(1.0, 0.62, 0.08)), toLinear(vec3<f32>(1.0, 0.10, 0.18)), smoothstep(0.35, 0.95, trayTension));
        emissive += tensionCol * glow * 1.45;
      }

      let dTrayShad = sdRoundedBox2D(trayLocal + sunDir.xz * 0.055, trayHalf, 0.16);
      if (dTray > 0.0 && dTrayShad < 0.08) {
        albedo *= mix(0.45, 1.0, smoothstep(-0.02, 0.08, dTrayShad));
      }

      let trayMask = smoothstep(aa, -aa, dTray);
      if (trayMask > 0.002) {
        let bevel = smoothstep(0.0, -0.055, dTray);
        var trayCol = mix(toLinear(vec3<f32>(0.16, 0.13, 0.16)), toLinear(vec3<f32>(0.26, 0.22, 0.26)), bevel);
        if (theme == 1u) {
          trayCol = mix(vec3<f32>(0.008, 0.012, 0.032), vec3<f32>(0.018, 0.024, 0.058), bevel);
        } else if (theme == 2u) {
          trayCol = toLinear(vec3<f32>(1.0, 0.86, 0.08));
        } else if (theme == 3u) {
          trayCol = mix(toLinear(vec3<f32>(0.12, 0.10, 0.22)), toLinear(vec3<f32>(0.22, 0.18, 0.34)), bevel);
        }
        var trayMet = 0.08;
        var trayRough = 0.32;
        var trayNorm = vec3<f32>(0.0, 1.0, 0.0);
        var trayEmiss = vec3<f32>(0.0);

        let rimMask = smoothstep(-0.028 - aa, -0.028 + aa, dTray);
        if (rimMask > 0.002) {
          var rCol = toLinear(vec3<f32>(0.94, 0.75, 0.34));
          if (theme == 1u) {
            rCol = toLinear(vec3<f32>(0.04, 0.92, 1.0));
            trayEmiss += rCol * 0.75 * rimMask;
          } else if (theme == 2u) {
            rCol = vec3<f32>(0.004);
          } else {
            trayMet = mix(trayMet, 0.80, rimMask);
          }
          trayCol = mix(trayCol, rCol, rimMask);
          if (trayTension > 0.25) {
            let tCol = mix(toLinear(vec3<f32>(1.0, 0.62, 0.08)), toLinear(vec3<f32>(1.0, 0.12, 0.18)), trayTension);
            trayEmiss += tCol * trayTension * 1.1 * rimMask;
          }
        }

        let spacing = scene.themeSolar.w;
        for (var s: i32 = 0; s < 5; s = s + 1) {
          let sx = (f32(s) - 2.0) * spacing;
          let dp = vec2<f32>(p.x - sx, p.z - trayZ);
          let rDimple = length(dp);
          let dMask = smoothstep(0.22 + aa, 0.22 - aa, rDimple);
          if (dMask > 0.002) {
            let slope = clamp(rDimple / 0.22, 0.0, 1.0);
            trayNorm = normalize(mix(trayNorm, normalize(vec3<f32>(-dp.x * 2.2, 1.0, -dp.y * 2.2)), dMask));
            trayCol *= mix(1.0, mix(0.45, 0.96, slope * slope), dMask);
            trayRough = mix(trayRough, 0.44, dMask);
            let wellRim = smoothstep(0.185 - aa, 0.185 + aa, rDimple) * dMask;
            trayCol = mix(trayCol, toLinear(vec3<f32>(0.88, 0.76, 0.48)), wellRim * 0.45);
          }
        }

        albedo = mix(albedo, trayCol, trayMask);
        emissive = emissive * (1.0 - trayMask) + trayEmiss * trayMask;
        normal = normalize(mix(normal, trayNorm, trayMask));
        metallic = mix(metallic, trayMet, trayMask);
        roughness = mix(roughness, trayRough, trayMask);
      }
    }

    if (dFrame < 0.16) {
      // ZONE 3: Silky-smooth AA Untangle Board & Rounded Sculpted Tiles (ZERO Spoilers!)
      if (dFrame > 0.0) {
        albedo *= mix(0.55, 1.0, smoothstep(0.0, 0.13, dFrame));
      }

      let frameMask = smoothstep(aa, -aa, dFrame);
      if (frameMask > 0.002) {
        emissive *= (1.0 - frameMask);
        var boardCol = mix(toLinear(vec3<f32>(0.10, 0.12, 0.18)), toLinear(vec3<f32>(0.15, 0.18, 0.24)), daylight);
        if (theme == 1u) {
          boardCol = vec3<f32>(0.005, 0.007, 0.020);
        } else if (theme == 2u) {
          boardCol = toLinear(vec3<f32>(0.98, 0.16, 0.44));
        } else if (theme == 3u) {
          boardCol = toLinear(vec3<f32>(0.07, 0.08, 0.16));
        }
        var boardMet = 0.08;
        var boardRough = 0.62;
        var boardNorm = vec3<f32>(0.0, 1.0, 0.0);

        let frameRim = smoothstep(-0.028 - aa, -0.028 + aa, dFrame);
        if (frameRim > 0.002) {
          var fRimCol = toLinear(vec3<f32>(0.92, 0.74, 0.34));
          if (theme == 1u) {
            fRimCol = toLinear(vec3<f32>(1.0, 0.12, 0.64));
            emissive += fRimCol * 0.72 * frameRim * frameMask;
          } else if (theme == 2u) {
            fRimCol = vec3<f32>(0.004);
          } else {
            boardMet = mix(boardMet, 0.74, frameRim);
          }
          boardCol = mix(boardCol, fRimCol, frameRim);
        }

      let tCount = min(u32(scene.boardInfo.w), 64u);
      let pitch = scene.boardInfo.z;
      let tileHalf = pitch * 0.445;

      for (var i: u32 = 0u; i < tCount; i = i + 1u) {
        let tl = scene.tiles[i];
        let flags = u32(tl.props.z);
        if ((flags & 1u) == 0u) {
          continue;
        }
        let dLocal = p.xz - tl.posRad.xz;
        if (abs(dLocal.x) > pitch * 0.56 || abs(dLocal.y) > pitch * 0.56) {
          continue;
        }

        let dTile = sdRoundedBox2D(dLocal, vec2<f32>(tileHalf), pitch * 0.13);
        let hinted = (flags & 4u) != 0u;
        let isBlocker = (flags & 8u) != 0u;

        let dTileShad = sdRoundedBox2D(dLocal + sunDir.xz * 0.036, vec2<f32>(tileHalf), pitch * 0.13);
        if (dTile > 0.0 && dTileShad < 0.052) {
          boardCol *= mix(0.38, 1.0, smoothstep(-0.01, 0.052, dTileShad));
        }

        if (hinted && dTile > -0.03 && dTile < 0.10) {
          let hPulse = 0.60 + 0.40 * sin(renderU.time * 5.0);
          let aura = exp(-pow(max(dTile, 0.0) / 0.042, 2.0)) * hPulse;
          emissive += toLinear(vec3<f32>(1.0, 0.86, 0.24)) * aura * 1.7;
        }

        if (isBlocker && blockerFlashT > 0.01 && dTile > -0.04 && dTile < 0.10) {
          let bPulse = 0.65 + 0.35 * sin(renderU.time * 24.0);
          let bAura = exp(-pow(max(dTile, 0.0) / 0.04, 2.0)) * blockerFlashT * bPulse;
          emissive += vec3<f32>(1.6, 0.12, 0.05) * bAura * 1.65;
        }

        let tileMask = smoothstep(aa, -aa, dTile);
        let isQueuedTile = (flags & 16u) != 0u;
        let isRainbowTile = (flags & 64u) != 0u;
        let isHiddenTile = (flags & 128u) != 0u;
        let isLockedTile = (flags & 256u) != 0u;

        if (tileMask > 0.002) {
          let rawPal = getPaletteLinear(tl.props.x).rgb;
          let rainAngle = atan2(dLocal.y, dLocal.x) - renderU.time * 1.8;
          let rainPal = toLinear(clamp(vec3<f32>(
            0.55 + 0.45 * sin(rainAngle),
            0.55 + 0.45 * sin(rainAngle + 2.094395),
            0.55 + 0.45 * sin(rainAngle + 4.188790),
          ), vec3<f32>(0.08), vec3<f32>(1.0)));
          // Hidden tiles MUST NEVER leak their concealed color into tile background, border, or caustics!
          let pal = select(select(rawPal, rainPal, isRainbowTile), toLinear(vec3<f32>(0.42, 0.44, 0.52)), isHiddenTile);
          let edgeBevel = smoothstep(0.0, -0.048, dTile);

          // 3D sculpted beveled tile edge normal
          var tNorm = vec3<f32>(0.0, 1.0, 0.0);
          if (dTile > -0.052) {
            let bevelAmt = smoothstep(-0.052, 0.0, dTile) * 0.34;
            let edgeDir = normalize(dLocal + vec2<f32>(0.0001));
            tNorm = normalize(vec3<f32>(edgeDir.x * bevelAmt, 1.0, edgeDir.y * bevelAmt));
          }

          var tileCol = toLinear(vec3<f32>(0.94, 0.91, 0.85));
          var borderCol = mix(pal, toLinear(vec3<f32>(0.92, 0.78, 0.46)), 0.38);
          var arrowCol = vec3<f32>(0.012, 0.012, 0.018);
          var arrowEmissive = vec3<f32>(0.0);
          var tRough = 0.26;
          var tMet = 0.06;

          if (theme == 0u) {
            let ivory = mix(toLinear(vec3<f32>(0.80, 0.77, 0.72)), toLinear(vec3<f32>(0.96, 0.94, 0.88)), daylight);
            tileCol = mix(ivory, pal, 0.06);
            borderCol = mix(pal, toLinear(vec3<f32>(0.92, 0.76, 0.38)), 0.34);
            arrowCol = vec3<f32>(0.010, 0.010, 0.016);
          } else if (theme == 1u) {
            tileCol = vec3<f32>(0.014, 0.020, 0.046);
            borderCol = pal;
            arrowCol = vec3<f32>(0.95, 0.98, 1.0);
            arrowEmissive = mix(toLinear(vec3<f32>(0.25, 0.96, 1.0)), pal, 0.42) * 1.15;
            tRough = 0.18;
          } else if (theme == 2u) {
            tileCol = toLinear(vec3<f32>(0.98, 0.97, 0.93));
            borderCol = vec3<f32>(0.004, 0.004, 0.006);
            arrowCol = vec3<f32>(0.004, 0.004, 0.006);
            tRough = 0.72;
          } else {
            tileCol = toLinear(vec3<f32>(0.12, 0.13, 0.22));
            borderCol = toLinear(vec3<f32>(0.84, 0.64, 0.32));
            arrowCol = toLinear(vec3<f32>(1.0, 0.88, 0.48));
            arrowEmissive = toLinear(vec3<f32>(1.0, 0.80, 0.30)) * 0.50;
            if (!isHiddenTile) {
              let caustic = exp(-length(dLocal) / (pitch * 0.34));
              emissive += pal * caustic * 0.45 * tileMask;
            }
            tRough = 0.20;
          }

          if (isHiddenTile) {
            // Subtle slate-obsidian mystery card surface
            tileCol = mix(tileCol, toLinear(vec3<f32>(0.20, 0.22, 0.28)), 0.55);
            borderCol = toLinear(vec3<f32>(0.68, 0.74, 0.86));
          } else if (isRainbowTile) {
            borderCol = rainPal;
          }

          tileCol = mix(tileCol * 0.80, tileCol, edgeBevel);

          // Soft grounded contact AO directly under the seated/wiggling pearl (ZERO cheap external halo!)
          let dir = u32(tl.props.y);
          let spC = boardPearlCenter(tl, pitch);
          let distToPearl = length(p.xz - spC.xz);
          let liftFade = clamp(1.0 - (spC.y - 0.22) * 4.0, 0.45, 1.0);
          let pearlAO = mix(1.0 - 0.40 * liftFade, 1.0, smoothstep(tl.posRad.w * 0.72, tl.posRad.w * 1.48, distToPearl));
          tileCol *= pearlAO;

          let rimWidth = select(-0.022, -0.028, theme == 2u);
          let tRimMask = smoothstep(rimWidth - aa, rimWidth + aa, dTile);
          if (tRimMask > 0.002) {
            tileCol = mix(tileCol, borderCol, tRimMask);
            if (theme == 1u || isRainbowTile) {
              emissive += borderCol * select(0.36, 0.55, isRainbowTile) * tRimMask * tileMask;
            }
          }

          // Final-Color Mode player-queued tile indicator: crisp clean gold-ivory lock-on rim (zero gem glow!)
          if (isQueuedTile) {
            let qRim = smoothstep(-pitch * 0.065 - aa, -pitch * 0.065 + aa, dTile);
            let qCol = toLinear(vec3<f32>(1.0, 0.88, 0.42));
            tileCol = mix(tileCol, qCol, qRim * 0.88);
            emissive += qCol * 0.42 * qRim * tileMask;
          }

          // Locked Pearl Overlay: crisp brass-gold lock frame + directional clasp bars pointing ONLY to still-alive N/E/S/W neighbors!
          if (isLockedTile) {
            let goldCol = toLinear(vec3<f32>(0.96, 0.76, 0.26));
            let darkSteel = vec3<f32>(0.025, 0.024, 0.032);
            let frameBand = smoothstep(-pitch * 0.068 - aa, -pitch * 0.068 + aa, dTile);
            let innerGroove = smoothstep(-pitch * 0.088 - aa, -pitch * 0.088 + aa, dTile) * (1.0 - frameBand);
            tileCol = mix(tileCol, darkSteel, innerGroove * 0.78);
            tileCol = mix(tileCol, goldCol, frameBand * 0.90);
            tMet = mix(tMet, 0.82, frameBand);
            tRough = mix(tRough, 0.20, frameBand);
            emissive += goldCol * 0.14 * frameBand * tileMask;

            let barHalfW = pitch * 0.056;
            let barOutW = pitch * 0.086;
            let rivetR = pitch * 0.072;
            var lockBarOut: f32 = 0.0;
            var lockBarMask: f32 = 0.0;
            var lockRivetMask: f32 = 0.0;
            // North (1024u -> -Z)
            if ((flags & 1024u) != 0u) {
              let dSeg = sdSegment2D(dLocal, vec2<f32>(0.0, -pitch * 0.14), vec2<f32>(0.0, -tileHalf));
              lockBarOut = max(lockBarOut, smoothstep(aa, -aa, dSeg - barOutW));
              lockBarMask = max(lockBarMask, smoothstep(aa, -aa, dSeg - barHalfW));
              let dR = length(dLocal - vec2<f32>(0.0, -tileHalf + pitch * 0.055)) - rivetR;
              lockRivetMask = max(lockRivetMask, smoothstep(aa, -aa, dR));
            }
            // East (2048u -> +X)
            if ((flags & 2048u) != 0u) {
              let dSeg = sdSegment2D(dLocal, vec2<f32>(pitch * 0.14, 0.0), vec2<f32>(tileHalf, 0.0));
              lockBarOut = max(lockBarOut, smoothstep(aa, -aa, dSeg - barOutW));
              lockBarMask = max(lockBarMask, smoothstep(aa, -aa, dSeg - barHalfW));
              let dR = length(dLocal - vec2<f32>(tileHalf - pitch * 0.055, 0.0)) - rivetR;
              lockRivetMask = max(lockRivetMask, smoothstep(aa, -aa, dR));
            }
            // South (4096u -> +Z)
            if ((flags & 4096u) != 0u) {
              let dSeg = sdSegment2D(dLocal, vec2<f32>(0.0, pitch * 0.14), vec2<f32>(0.0, tileHalf));
              lockBarOut = max(lockBarOut, smoothstep(aa, -aa, dSeg - barOutW));
              lockBarMask = max(lockBarMask, smoothstep(aa, -aa, dSeg - barHalfW));
              let dR = length(dLocal - vec2<f32>(0.0, tileHalf - pitch * 0.055)) - rivetR;
              lockRivetMask = max(lockRivetMask, smoothstep(aa, -aa, dR));
            }
            // West (8192u -> -X)
            if ((flags & 8192u) != 0u) {
              let dSeg = sdSegment2D(dLocal, vec2<f32>(-pitch * 0.14, 0.0), vec2<f32>(-tileHalf, 0.0));
              lockBarOut = max(lockBarOut, smoothstep(aa, -aa, dSeg - barOutW));
              lockBarMask = max(lockBarMask, smoothstep(aa, -aa, dSeg - barHalfW));
              let dR = length(dLocal - vec2<f32>(-tileHalf + pitch * 0.055, 0.0)) - rivetR;
              lockRivetMask = max(lockRivetMask, smoothstep(aa, -aa, dR));
            }

            if (lockBarOut > 0.002) {
              tileCol = mix(tileCol, darkSteel, lockBarOut * 0.92);
            }
            if (lockBarMask > 0.002) {
              tileCol = mix(tileCol, goldCol, lockBarMask * 0.94);
              tMet = mix(tMet, 0.86, lockBarMask);
              tRough = mix(tRough, 0.18, lockBarMask);
              emissive += goldCol * 0.30 * lockBarMask * tileMask;
            }
            if (lockRivetMask > 0.002) {
              let amberGem = toLinear(vec3<f32>(1.0, 0.52, 0.10));
              tileCol = mix(tileCol, amberGem, lockRivetMask);
              emissive += amberGem * 0.90 * lockRivetMask * tileMask;
            }
          }

          if (isBlocker && blockerFlashT > 0.01) {
            emissive += vec3<f32>(1.3, 0.14, 0.06) * blockerFlashT * 0.45 * tileMask;
          }

          // Smooth screen-space anti-aliased directional chevron arrow (NEVER disappears or spoils!)
          let rot = rotateForDir(dLocal, dir);
          let arrowCenter = rot - vec2<f32>(0.0, -pitch * 0.285);
          let dArrow = sdChevron(arrowCenter, pitch * 0.145, pitch * 0.039);
          let arrowAA = smoothstep(aa * 1.15, -aa * 0.85, dArrow);
          if (arrowAA > 0.002) {
            tileCol = mix(tileCol, arrowCol, arrowAA);
            emissive += arrowEmissive * arrowAA * tileMask;
            tRough = mix(tRough, 0.22, arrowAA);
          }

          boardCol = mix(boardCol, tileCol, tileMask);
          boardNorm = normalize(mix(boardNorm, tNorm, tileMask));
          boardRough = mix(boardRough, tRough, tileMask);
          boardMet = mix(boardMet, tMet, tileMask);
        }
      }

      if (blockerFlashT > 0.01) {
        let a = scene.blockerFX.xy;
        let b = scene.blockerFX.zw;
        if (length(b - a) > 0.05) {
          let dSeg = sdSegment2D(p.xz, a, b);
          if (dSeg < 0.12) {
            let core = smoothstep(0.055, 0.012, dSeg) * blockerFlashT;
            let beam = exp(-pow(dSeg / 0.036, 2.0)) * blockerFlashT;
            boardCol = mix(boardCol, vec3<f32>(0.9, 0.05, 0.02), core * 0.75);
            emissive += vec3<f32>(1.8, 0.10, 0.04) * beam;
          }
        }
      }

        albedo = mix(albedo, boardCol, frameMask);
        normal = normalize(mix(normal, boardNorm, frameMask));
        metallic = mix(metallic, boardMet, frameMask);
        roughness = mix(roughness, boardRough, frameMask);
      }
    }
  }

  let inShadowZone =
    hpDist < hoopR + 0.32 ||
    abs(p.z - trayZ) < 0.42 ||
    (abs(p.x - boardC.x) < boardHalf.x + 0.42 && abs(p.z - boardC.y) < boardHalf.y + 0.42) ||
    u32(scene.countsInfo.z) > 0u;
  let shadow = select(1.0, computeDeskShadow(p, sunDir), inShadowZone);
  let ndotl = max(dot(normal, sunDir), 0.0);
  let sunTint = toLinear(scene.sunColor.rgb);
  let direct = sunTint * ndotl * (0.45 + 0.72 * scene.sunDir.w) * shadow;

  let v = -rd;
  let hVec = normalize(sunDir + v);
  let shininess = mix(96.0, 20.0, clamp(roughness, 0.0, 1.0));
  let spec = pow(max(dot(normal, hVec), 0.0), shininess) * shadow * scene.sunDir.w * mix(0.03, 1.05, metallic);

  let candlePos = vec3<f32>(2.3, 2.4, -2.5);
  let toCandle = candlePos - p;
  let candleDistSq = max(dot(toCandle, toCandle), 1.5);
  let candleDir = normalize(toCandle);
  let candleAtten = scene.sunColor.w * (11.0 / (1.0 + candleDistSq * 0.22));
  let candleDiff = max(dot(normal, candleDir), 0.0) * candleAtten * shadow;
  let candleHalf = normalize(candleDir + v);
  let candleSpec = pow(max(dot(normal, candleHalf), 0.0), shininess) * candleAtten * shadow * mix(0.10, 0.92, metallic);
  let candleCol = toLinear(vec3<f32>(1.0, 0.72, 0.36));

  let ambBase = toLinear(scene.ambientSky.rgb);
  let ambient = (ambBase * 0.85 + vec3<f32>(0.05, 0.05, 0.06) * (0.35 + 0.65 * daylight)) * (0.68 + 0.32 * normal.y);

  var color = albedo * (ambient + direct + candleCol * candleDiff * 0.58);
  color += mix(sunTint, albedo, metallic * 0.65) * spec;
  color += candleCol * candleSpec;
  if (metallic > 0.30) {
    color = mix(color, skyReflection(reflect(rd, normal), theme) * albedo, metallic * 0.34);
  }
  color += emissive;
  return color;
}

fn acesToneMap(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let res = max(renderU.resolution, vec2<f32>(1.0, 1.0));
  let aspect = res.x / res.y;
  let ndc = vec2<f32>(in.uv.x * 2.0 - 1.0, in.uv.y * 2.0 - 1.0);

  let camPos = scene.cameraPos.xyz;
  let camTarget = scene.cameraTarget.xyz;
  let fovY = scene.cameraTarget.w;

  let forward = normalize(camTarget - camPos);
  let right = normalize(cross(forward, vec3<f32>(0.0, 1.0, 0.0)));
  let up = cross(right, forward);
  let tanHalfFov = tan(fovY * 0.5);
  let pixelScale = (tanHalfFov * 2.0) / res.y;

  let ro = camPos;
  let rd = normalize(forward + right * (ndc.x * aspect * tanHalfFov) + up * (ndc.y * tanHalfFov));

  var tDesk = MAX_DIST;
  var pDesk = vec3<f32>(0.0);
  if (rd.y < -0.001) {
    tDesk = -ro.y / rd.y;
    pDesk = ro + rd * tDesk;
  }
  let deskAA = clamp(tDesk * pixelScale * 0.60, 0.002, 0.022);

  // Track nearest anti-aliased pearl hit (with exact subpixel silhouette coverage!)
  var bestT = tDesk;
  var bestCov: f32 = 0.0;
  var hitPos = vec3<f32>(0.0);
  var hitNormal = vec3<f32>(0.0, 1.0, 0.0);
  var hitColorLin = vec3<f32>(1.0);
  var hitIrid: f32 = 0.5;
  var hitSpark: f32 = 0.0;
  var hitBlocker = false;
  var hitInteriorGlow: f32 = 0.0;
  var hitIsBoard = false;
  // hitSpecialKind: 0=normal, 1=3D Heart, 2=Rainbow Wild, 3=Hidden Concealed, 4=Locked
  var hitSpecialKind: u32 = 0u;
  var hitLockDirBits: u32 = 0u;
  var hitCenter = vec3<f32>(0.0);
  var hitRad: f32 = 0.2;

  let hoopC = scene.hoopBounds.xy;
  let hoopR = scene.hoopBounds.z;
  let trayZ = scene.hoopBounds.w;
  let boardC = scene.boardBounds.xy;
  let boardHalf = scene.boardBounds.zw;
  let celebrate = scene.deskTint.w;

  // Mutually exclusive spatial zone partitioning for resting pearls
  if (length(pDesk.xz - hoopC) < hoopR + 0.32) {
    let hCount = min(u32(scene.countsInfo.x), 64u);
    for (var i: u32 = 0u; i < hCount; i = i + 1u) {
      let hp = scene.hoopPearls[i];
      let bloom = hp.props.y;
      if (bloom <= 0.02) {
        continue;
      }
      if (abs(pDesk.x - hp.posRad.x) > 0.34 || abs(pDesk.z - hp.posRad.z) > 0.34) {
        continue;
      }
      let r = hp.posRad.w * (0.25 + 0.75 * bloom);
      let hit = intersectSphereAA(ro, rd, hp.posRad.xyz, r, pixelScale);
      if (hit.cov > 0.002 && hit.t < bestT) {
        bestT = hit.t;
        bestCov = hit.cov;
        hitPos = hit.pos;
        hitNormal = hit.normal;
        let pal = getPaletteLinear(hp.props.x);
        hitColorLin = pal.rgb;
        hitIrid = pal.w;
        hitSpark = max(hp.props.z, celebrate * (0.5 + 0.5 * sin(renderU.time * 5.5 + f32(i))));
        hitBlocker = false;
        hitInteriorGlow = 0.0;
        hitIsBoard = false;
        hitSpecialKind = 0u;
        hitLockDirBits = 0u;
      }
    }
  } else if (abs(pDesk.z - trayZ) < 0.36) {
    for (var i: u32 = 0u; i < 5u; i = i + 1u) {
      let tp = scene.trayPearls[i];
      if (tp.props.y < 0.5) {
        continue;
      }
      let hit = intersectSphereAA(ro, rd, tp.posRad.xyz, tp.posRad.w, pixelScale);
      if (hit.cov > 0.002 && hit.t < bestT) {
        bestT = hit.t;
        bestCov = hit.cov;
        hitPos = hit.pos;
        hitNormal = hit.normal;
        let pal = getPaletteLinear(tp.props.x);
        hitColorLin = pal.rgb;
        hitIrid = pal.w;
        hitSpark = tp.props.z * 0.55;
        hitBlocker = false;
        hitInteriorGlow = 0.0;
        hitIsBoard = false;
        hitSpecialKind = 0u;
        hitLockDirBits = 0u;
      }
    }
  } else if (abs(pDesk.x - boardC.x) < boardHalf.x + 0.42 && abs(pDesk.z - boardC.y) < boardHalf.y + 0.42) {
    let tCount = min(u32(scene.boardInfo.w), 64u);
    let pitch = scene.boardInfo.z;
    for (var i: u32 = 0u; i < tCount; i = i + 1u) {
      let tl = scene.tiles[i];
      let flags = u32(tl.props.z);
      if ((flags & 1u) == 0u) {
        continue;
      }
      if (abs(pDesk.x - tl.posRad.x) > pitch * 0.72 || abs(pDesk.z - tl.posRad.z) > pitch * 0.72) {
        continue;
      }
      let spCenter = boardPearlCenter(tl, pitch);
      let isHeart = (flags & 32u) != 0u;
      var hit: SphereAA;
      if (isHeart) {
        // Real 3D sculpted heart-shaped pearl (raymarched SDF with analytic AA!)
        hit = intersectHeartPearlAA(ro, rd, spCenter, tl.posRad.w, pixelScale);
      } else {
        hit = intersectSphereAA(ro, rd, spCenter, tl.posRad.w, pixelScale);
      }
      if (hit.cov > 0.002 && hit.t < bestT) {
        bestT = hit.t;
        bestCov = hit.cov;
        hitPos = hit.pos;
        hitNormal = hit.normal;
        let pal = getPaletteLinear(tl.props.x);
        hitColorLin = pal.rgb;
        hitIrid = pal.w;
        let hinted = (flags & 4u) != 0u;
        hitSpark = select(0.0, 0.42 + 0.28 * sin(renderU.time * 5.0), hinted);
        hitBlocker = (flags & 8u) != 0u;
        hitInteriorGlow = tl.props.w;
        hitIsBoard = true;
        hitCenter = spCenter;
        hitRad = tl.posRad.w;
        hitLockDirBits = (flags >> 10u) & 15u;
        if (isHeart) {
          hitSpecialKind = 1u;
        } else if ((flags & 64u) != 0u) {
          hitSpecialKind = 2u;
        } else if ((flags & 128u) != 0u) {
          hitSpecialKind = 3u;
        } else if ((flags & 256u) != 0u) {
          hitSpecialKind = 4u;
        } else {
          hitSpecialKind = 0u;
        }
      }
    }
  }

  // Zone 4: Flying Pearls (arcing above the desk)
  if (u32(scene.countsInfo.z) > 0u) {
    for (var i: u32 = 0u; i < 12u; i = i + 1u) {
      let fp = scene.flyingPearls[i];
      if (fp.props.y < 0.5) {
        continue;
      }
      let flySpecial = u32(max(fp.props.w + 0.5, 0.0));
      var hit: SphereAA;
      if (flySpecial == 1u) {
        hit = intersectHeartPearlAA(ro, rd, fp.posRad.xyz, fp.posRad.w, pixelScale);
      } else {
        hit = intersectSphereAA(ro, rd, fp.posRad.xyz, fp.posRad.w, pixelScale);
      }
      if (hit.cov > 0.002 && hit.t < bestT) {
        bestT = hit.t;
        bestCov = hit.cov;
        hitPos = hit.pos;
        hitNormal = hit.normal;
        let pal = getPaletteLinear(fp.props.x);
        hitColorLin = pal.rgb;
        hitIrid = pal.w;
        hitSpark = 0.50;
        hitBlocker = false;
        hitInteriorGlow = 0.45;
        hitIsBoard = false;
        hitSpecialKind = select(0u, flySpecial, flySpecial <= 2u);
        hitLockDirBits = 0u;
        hitCenter = fp.posRad.xyz;
        hitRad = fp.posRad.w;
      }
    }
  }

  let theme = getTheme();
  var finalCol = vec3<f32>(0.0);
  if (bestCov > 0.002) {
    var shadeColorLin = hitColorLin;
    var shadeIrid = hitIrid;
    var shadeSpark = hitSpark;
    if (hitSpecialKind == 2u) {
      // Swirling Prismatic Rainbow Wild Pearl!
      shadeColorLin = rainbowSpectrumLinear(hitNormal, renderU.time);
      shadeIrid = 1.0;
      shadeSpark = max(shadeSpark, 0.25 + 0.20 * sin(renderU.time * 4.2 + hitPos.x * 5.0));
    } else if (hitSpecialKind == 3u) {
      // Glossy Deep Obsidian-Black Hidden Pearl (zero color leak!)
      shadeColorLin = vec3<f32>(0.009, 0.011, 0.018);
      shadeIrid = 0.15;
    }

    var pearlCol = shadePearl(hitPos, hitNormal, rd, shadeColorLin, shadeIrid, shadeSpark, hitBlocker, hitInteriorGlow, hitIsBoard);

    if (hitSpecialKind == 2u) {
      // Subtle prismatic star-glint highlight on Rainbow Wild Pearls
      let ndv = clamp(dot(normalize(hitNormal), -rd), 0.0, 1.0);
      pearlCol += shadeColorLin * (0.28 + 0.35 * pow(1.0 - ndv, 2.5));
    } else if (hitSpecialKind == 3u) {
      // Moonlight-silver Fresnel rim + crisp engraved silver '?' mystery crest on Hidden Pearls
      let ndv = clamp(dot(normalize(hitNormal), -rd), 0.0, 1.0);
      let silver = toLinear(vec3<f32>(0.84, 0.88, 0.98));
      pearlCol += silver * pow(1.0 - ndv, 3.0) * 0.48;
      let mp = vec2<f32>((hitPos.x - hitCenter.x) / hitRad, -(hitPos.z - hitCenter.z) / hitRad);
      let dHookRing = abs(length(mp - vec2<f32>(0.0, 0.17)) - 0.19);
      let inHookArc = !(mp.y < 0.14 && mp.x < -0.02);
      var dQ = select(1.0, dHookRing - 0.068, inHookArc);
      dQ = min(dQ, sdSegment2D(mp, vec2<f32>(0.0, -0.02), vec2<f32>(0.0, -0.14)) - 0.065);
      dQ = min(dQ, length(mp - vec2<f32>(0.0, -0.34)) - 0.082);
      let qMask = smoothstep(0.04, -0.04, dQ);
      pearlCol = mix(pearlCol, silver * 1.15, qMask * 0.92);
    } else if (hitSpecialKind == 4u) {
      // Brushed-gold metallic lock clasp straps hugging ONLY the active locked axes (N/S and/or E/W) + center rivet!
      let lp = vec2<f32>((hitPos.x - hitCenter.x) / hitRad, (hitPos.z - hitCenter.z) / hitRad);
      var strapMask: f32 = 0.0;
      if ((hitLockDirBits & 1u) != 0u) {
        // N lock strap (-Z)
        let dS = sdSegment2D(lp, vec2<f32>(0.0, 0.0), vec2<f32>(0.0, -1.05)) - 0.13;
        strapMask = max(strapMask, smoothstep(0.05, -0.04, dS));
      }
      if ((hitLockDirBits & 2u) != 0u) {
        // E lock strap (+X)
        let dS = sdSegment2D(lp, vec2<f32>(0.0, 0.0), vec2<f32>(1.05, 0.0)) - 0.13;
        strapMask = max(strapMask, smoothstep(0.05, -0.04, dS));
      }
      if ((hitLockDirBits & 4u) != 0u) {
        // S lock strap (+Z)
        let dS = sdSegment2D(lp, vec2<f32>(0.0, 0.0), vec2<f32>(0.0, 1.05)) - 0.13;
        strapMask = max(strapMask, smoothstep(0.05, -0.04, dS));
      }
      if ((hitLockDirBits & 8u) != 0u) {
        // W lock strap (-X)
        let dS = sdSegment2D(lp, vec2<f32>(0.0, 0.0), vec2<f32>(-1.05, 0.0)) - 0.13;
        strapMask = max(strapMask, smoothstep(0.05, -0.04, dS));
      }
      let bossR = length(lp);
      let bossRing = smoothstep(0.28, 0.22, bossR);
      let keyhole = smoothstep(0.11, 0.06, bossR);
      let goldBand = toLinear(vec3<f32>(0.96, 0.78, 0.28)) * (0.65 + 0.55 * max(dot(normalize(hitNormal), normalize(vec3<f32>(-0.4, 0.8, -0.4))), 0.0));
      let darkIron = vec3<f32>(0.02, 0.02, 0.028);
      pearlCol = mix(pearlCol, goldBand, clamp(max(strapMask * 0.90, bossRing * 0.94), 0.0, 1.0));
      pearlCol = mix(pearlCol, darkIron, keyhole * 0.90);
    }

    if (bestCov >= 0.995) {
      finalCol = pearlCol;
    } else {
      let bgCol = select(skyReflection(rd, theme), shadeAtelierDesk(pDesk, rd, deskAA), tDesk < MAX_DIST);
      finalCol = mix(bgCol, pearlCol, bestCov);
    }
  } else if (tDesk < MAX_DIST) {
    finalCol = shadeAtelierDesk(pDesk, rd, deskAA);
  } else {
    finalCol = skyReflection(rd, theme);
  }

  let mapped = acesToneMap(finalCol * 1.18);
  let gamma = sqrt(mapped);
  return vec4<f32>(gamma, 1.0);
}
