struct RenderUniforms {
  resolution: vec2<f32>,
  time: f32,
  _pad: f32,
};

struct PearlNode {
  posRad: vec4<f32>, // xyz = center, w = radius
  props: vec4<f32>,  // x = colorIdx, y = dir/bloom/occ, z = flags/shimmer/pulse, w = wobble/active/tension
};

// Exact 1008-float (4,032-byte) scene buffer matching sim/engine.go
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
  themeSolar: vec4<f32>,   // [11] x = themeIndex, y = daylightFactor, z = horizonWarmth, w = traySpacing
  juiceFX: vec4<f32>,      // [12] x = colorBurstPulse, y = colorBurstColor, z = layerBurstPulse, w = trayTension
  blockerFX: vec4<f32>,    // [13] x = tappedX, y = tappedZ, z = blockerX, w = blockerZ
  extraFX: vec4<f32>,      // [14] x = blockerFlashT, y = streakFloat, z = layersDoneRatio, w = hintIdx
  queueFX: vec4<f32>,      // [15] x = multiplier, y = nextQueuedColor, z = levelIdx, w = trayCap
  palette: array<vec4<f32>, 6>,
  tiles: array<PearlNode, 49>,
  hoopPearls: array<PearlNode, 49>,
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

// Fast physical linear conversion (gamma 2.0, zero transcendental pow() calls — huge iPhone battery & GPU win!)
fn toLinear(srgb: vec3<f32>) -> vec3<f32> {
  let c = max(srgb, vec3<f32>(0.0));
  return c * c;
}

fn getTheme() -> u32 {
  return min(u32(max(scene.themeSolar.x + 0.5, 0.0)), 4u);
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

// Bold, ultra-legible directional chevron arrowhead pointing toward -Y (screen up = -Z)
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
  if (dir == 1u) {
    return vec2<f32>(localXZ.y, -localXZ.x);
  }
  if (dir == 2u) {
    return vec2<f32>(-localXZ.x, -localXZ.y);
  }
  if (dir == 3u) {
    return vec2<f32>(-localXZ.y, localXZ.x);
  }
  return localXZ;
}

fn dirOffsetXZ(dir: u32) -> vec2<f32> {
  if (dir == 0u) { return vec2<f32>(0.0, -1.0); }
  if (dir == 1u) { return vec2<f32>(1.0, 0.0); }
  if (dir == 2u) { return vec2<f32>(0.0, 1.0); }
  return vec2<f32>(-1.0, 0.0);
}

// Noir Monochrome (Theme 2): true jet-black vs pure alabaster geometric inlays in linear space!
fn applyNoirPatternLinear(n: vec3<f32>, colorIdx: u32) -> vec3<f32> {
  let white = vec3<f32>(0.92, 0.93, 0.96);
  let black = vec3<f32>(0.008, 0.008, 0.011);
  if (colorIdx == 0u) {
    return white; // Solid Alabaster White
  }
  if (colorIdx == 1u) {
    return black; // Solid Piano Black
  }
  if (colorIdx == 2u) {
    // Bright silver-white pearl with jet-black equator band
    let band = smoothstep(0.29, 0.19, abs(n.z));
    return mix(vec3<f32>(0.82, 0.84, 0.88), black, band);
  }
  if (colorIdx == 3u) {
    // Jet-black pearl with crisp white bullseye crown ring
    let rTop = length(n.xz);
    let ring = smoothstep(0.58, 0.48, rTop) - smoothstep(0.32, 0.22, rTop);
    return mix(vec3<f32>(0.014, 0.015, 0.020), white, clamp(ring, 0.0, 1.0));
  }
  if (colorIdx == 4u) {
    // Bright ivory pearl with bold jet-black diagonal sash
    let diag = smoothstep(0.30, 0.20, abs(n.x + n.z) * 0.707);
    return mix(vec3<f32>(0.86, 0.87, 0.90), black, diag);
  }
  // Color 5: Jet-black pearl with crisp bright white cross star
  let cross = max(
    smoothstep(0.21, 0.12, abs(n.x)) * smoothstep(0.66, 0.52, abs(n.z)),
    smoothstep(0.21, 0.12, abs(n.z)) * smoothstep(0.66, 0.52, abs(n.x)),
  );
  return mix(vec3<f32>(0.012, 0.013, 0.018), white, clamp(cross, 0.0, 1.0));
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
  } else if (theme == 2u) {
    let lum = dot(warmSky, vec3<f32>(0.299, 0.587, 0.114));
    warmSky = vec3<f32>(lum * 1.4 + 0.14);
    deepSky = vec3<f32>(lum * 0.35);
  } else if (theme == 4u) {
    warmSky = vec3<f32>(0.20, 0.12, 0.44) + sunLin * 0.22;
    deepSky = vec3<f32>(0.02, 0.03, 0.10);
  }
  var col = mix(warmSky, deepSky, pow(t, 0.7));
  let sunAmt = max(dot(rd, sunDir), 0.0);
  col += sunLin * pow(sunAmt, 24.0) * (1.1 * scene.sunDir.w);
  col += toLinear(vec3<f32>(1.0, 0.76, 0.44)) * scene.sunColor.w * pow(max(dot(rd, normalize(vec3<f32>(0.6, 0.55, -0.55))), 0.0), 12.0) * 1.1;
  return col;
}

// Physical linear-space 3D raytraced jewel pearl shading across all 5 visual themes + 24h solar light!
fn shadePearl(
  pos: vec3<f32>,
  normal: vec3<f32>,
  rd: vec3<f32>,
  baseColorLin: vec3<f32>,
  colorIdx: u32,
  iridescence: f32,
  sparkle: f32,
  isBlockerFlash: bool,
  isActiveTarget: bool,
) -> vec3<f32> {
  let theme = getTheme();
  let n = normalize(normal);
  let v = -rd;
  let sunDir = normalize(scene.sunDir.xyz);
  let ndotv = clamp(dot(n, v), 0.0, 1.0);
  let daylight = scene.themeSolar.y;

  var albedo = baseColorLin;
  if (theme == 2u) {
    albedo = applyNoirPatternLinear(n, colorIdx);
  }

  // Subtle pearlescent thin-film luster at grazing angles (never washes out hue!)
  if (theme == 0u || theme == 4u) {
    let phase = (1.0 - ndotv) * 4.5 + pos.x * 0.35;
    let irid = toLinear(0.5 + 0.5 * vec3<f32>(sin(phase), sin(phase + 2.094), sin(phase + 4.188)));
    albedo = mix(albedo, mix(albedo, irid, 0.25), pow(1.0 - ndotv, 1.8) * iridescence * 0.5);
  }

  let rawSunLin = toLinear(scene.sunColor.rgb);
  let sunLin = select(rawSunLin, vec3<f32>(dot(rawSunLin, vec3<f32>(0.3, 0.59, 0.11))), theme == 2u);
  let wrapDiffuse = clamp((dot(n, sunDir) + 0.34) / 1.34, 0.0, 1.0);
  let direct = sunLin * wrapDiffuse * (0.55 + 0.70 * scene.sunDir.w);

  // Razor-sharp glossy specular glint
  let hVec = normalize(sunDir + v);
  let specPow = select(96.0, 132.0, theme == 1u || theme == 4u);
  let spec = pow(max(dot(n, hVec), 0.0), specPow) * (0.95 + 0.55 * scene.sunDir.w);

  // Studio rim fill light for unmistakable 3D volume
  let fillDir = normalize(vec3<f32>(-0.55, 0.48, -0.64));
  let fillDiff = max(dot(n, fillDir), 0.0) * 0.32;
  let rimGlow = pow(1.0 - ndotv, 2.6);

  // Warm evening candle light at night
  let candlePos = vec3<f32>(2.3, 2.4, -2.5);
  let toCandle = candlePos - pos;
  let candleDistSq = max(dot(toCandle, toCandle), 1.0);
  let candleDir = normalize(toCandle);
  let candlePulse = 1.0 + 0.03 * sin(renderU.time * 2.4);
  let candleAtten = scene.sunColor.w * candlePulse * (10.5 / (1.0 + candleDistSq * 0.24));
  let candleDiff = max(dot(n, candleDir), 0.0) * candleAtten;
  let candleHalf = normalize(candleDir + v);
  let candleSpec = pow(max(dot(n, candleHalf), 0.0), 64.0) * candleAtten * 1.1;
  let candleTint = select(toLinear(vec3<f32>(1.0, 0.74, 0.38)), vec3<f32>(0.90), theme == 2u);

  let hemiBot = mix(vec3<f32>(0.08), vec3<f32>(0.18), daylight);
  let hemiTop = mix(vec3<f32>(0.22), vec3<f32>(0.42), daylight);
  let hemi = mix(hemiBot, hemiTop, n.y * 0.5 + 0.5);

  let fresnel = 0.05 + 0.38 * pow(1.0 - ndotv, 3.8);
  let envRefl = skyReflection(reflect(rd, n), theme);

  var col = albedo * (hemi + direct + fillDiff + candleTint * candleDiff * 0.65);

  if (theme == 0u) {
    col = mix(col, envRefl, fresnel * 0.28);
    col += albedo * (0.14 + rimGlow * 0.36);
    col += vec3<f32>(1.0, 0.98, 0.94) * spec * 1.35;
    col += candleTint * candleSpec;
  } else if (theme == 1u) {
    col = albedo * (0.48 + 0.62 * ndotv) + col * 0.35;
    col += albedo * rimGlow * 1.35;
    col += vec3<f32>(1.0) * spec * 1.45;
  } else if (theme == 2u) {
    col = mix(col, envRefl, fresnel * 0.24);
    col += vec3<f32>(0.35) * rimGlow * 0.28;
    col += vec3<f32>(1.0) * spec * 1.45;
  } else if (theme == 3u) {
    let cel = 0.65 + 0.50 * smoothstep(0.08, 0.45, dot(n, sunDir));
    col = albedo * cel + candleTint * candleDiff * 0.22;
    let dotSpec = smoothstep(0.85, 0.91, max(dot(n, hVec), 0.0));
    col += vec3<f32>(1.0) * dotSpec * 1.25;
    let inkRim = smoothstep(0.38, 0.25, ndotv);
    col = mix(col, vec3<f32>(0.004, 0.004, 0.006), inkRim);
  } else {
    let innerCore = pow(ndotv, 1.5) * 0.68 + 0.26;
    col = albedo * innerCore + col * 0.48;
    col = mix(col, envRefl, fresnel * 0.38);
    col += albedo * rimGlow * 0.85;
    col += vec3<f32>(1.0, 0.97, 0.92) * spec * 1.55;
  }

  // Active-color target glow (applied equally to blocked & unblocked pearls of active colors — zero spoilers!)
  if (isActiveTarget) {
    let activePulse = 0.65 + 0.35 * sin(renderU.time * 4.2);
    let targetTint = select(mix(albedo, vec3<f32>(1.0, 0.95, 0.78), 0.45), vec3<f32>(0.95), theme == 2u);
    col += targetTint * (0.09 + rimGlow * 0.72) * activePulse;
  }

  col += toLinear(vec3<f32>(1.0, 0.92, 0.72)) * (sparkle * 0.65);

  // Unmistakable crimson-amber impact pulse on tapped & blocking pearls
  if (isBlockerFlash && scene.extraFX.x > 0.01) {
    let flash = scene.extraFX.x * (0.65 + 0.35 * sin(renderU.time * 28.0));
    let warnCol = select(vec3<f32>(1.4, 0.12, 0.05), vec3<f32>(1.2), theme == 2u);
    col += warnCol * (0.28 + rimGlow * 1.4) * flash;
  }

  return col;
}

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

fn computeDeskShadow(p: vec3<f32>, sunDir: vec3<f32>) -> f32 {
  var shadow: f32 = 1.0;
  let orig = p + vec3<f32>(0.0, 0.004, 0.0);

  let hoopC = scene.hoopBounds.xy;
  let hoopR = scene.hoopBounds.z;
  let trayZ = scene.hoopBounds.w;
  let boardC = scene.boardBounds.xy;
  let boardHalf = scene.boardBounds.zw;

  if (length(p.xz - hoopC) < hoopR + 0.32) {
    let hCount = min(u32(scene.countsInfo.x), 49u);
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
  }

  if (abs(p.z - trayZ) < 0.52) {
    for (var i: u32 = 0u; i < 5u; i = i + 1u) {
      let tp = scene.trayPearls[i];
      if (tp.props.y > 0.5) {
        if (intersectSphere(orig, sunDir, tp.posRad.xyz, tp.posRad.w) > 0.0) {
          shadow *= 0.48;
        }
      }
    }
  }

  if (abs(p.x - boardC.x) < boardHalf.x + 0.42 && abs(p.z - boardC.y) < boardHalf.y + 0.42) {
    let tCount = min(u32(scene.boardInfo.w), 49u);
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
      let dir = u32(tl.props.y);
      let backOff = -dirOffsetXZ(dir) * (pitch * 0.105);
      let spCenter = vec3<f32>(tl.posRad.x + backOff.x, tl.posRad.y, tl.posRad.z + backOff.y);
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

fn shadeAtelierDesk(p: vec3<f32>, rd: vec3<f32>) -> vec3<f32> {
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
  // THEME-SPECIFIC HIGH-CONTRAST LINEAR DESK BACKDROP (All 24h Solar-Synced!)
  // =========================================================================
  let deskDist = length(p.xz * vec2<f32>(0.34, 0.20));
  if (theme == 0u) {
    // Jewel Atelier: rich deep slate-teal / warm walnut table so ivory hoop & jewel pearls POP!
    let grain = 0.90 + 0.10 * sin(p.x * 16.0 + sin(p.z * 3.5) * 1.4);
    let deskNight = toLinear(vec3<f32>(0.10, 0.13, 0.26));
    let deskDay = toLinear(vec3<f32>(0.18, 0.28, 0.36));
    let deskSunset = toLinear(vec3<f32>(0.36, 0.18, 0.24));
    albedo = mix(deskNight, deskDay, daylight);
    albedo = mix(albedo, deskSunset, horizon * 0.65) * grain;
    albedo *= clamp(1.16 - deskDist * 0.36, 0.45, 1.16);
    roughness = 0.52;
  } else if (theme == 1u) {
    // Cyber Neon: TRUE deep obsidian midnight synthwave grid with blazing cyan/magenta lines!
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
    // Noir Monochrome: dramatic deep Art-Deco charcoal radial sunburst floor!
    let ang = atan2(p.z - 0.2, p.x);
    let rays = 0.5 + 0.5 * sin(ang * 16.0);
    let baseLum = mix(0.012, 0.042, daylight);
    albedo = vec3<f32>(baseLum + rays * 0.016);
    albedo *= clamp(1.22 - deskDist * 0.44, 0.35, 1.22);
    metallic = 0.32;
    roughness = 0.34;
  } else if (theme == 3u) {
    // Pop Art: punchy saturated Warhol/Lichtenstein Ben-Day halftone backdrop!
    let bgDay = toLinear(vec3<f32>(0.06, 0.60, 0.98));
    let bgSunset = toLinear(vec3<f32>(0.98, 0.36, 0.16));
    let bgNight = toLinear(vec3<f32>(0.10, 0.14, 0.48));
    var popBg = mix(bgNight, bgDay, daylight);
    popBg = mix(popBg, bgSunset, horizon * 0.72);
    let cell = fract(p.xz * 2.4) - vec2<f32>(0.5);
    let dotMask = smoothstep(0.26, 0.20, length(cell));
    albedo = mix(popBg, popBg * 1.55 + vec3<f32>(0.04), dotMask * 0.55);
    roughness = 0.82;
  } else {
    // Stained Glass (Theme 4): deep luminous cathedral jewel diamond mosaic!
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

  // Balatro / Vampire Survivors dynamic background shockwaves & streak aura!
  let hpLocal = p.xz - hoopC;
  let hpDist = length(hpLocal);
  if (colorBurstT > 0.01) {
    let waveR = (1.0 - colorBurstT) * 6.5;
    let waveRing = exp(-pow((hpDist - waveR) / 0.40, 2.0)) * colorBurstT;
    let burstTint = select(colorBurstCol, vec3<f32>(0.90), theme == 2u);
    emissive += burstTint * (waveRing * 1.45 + colorBurstT * 0.22);
  }
  if (layerBurstT > 0.01) {
    let lWaveR = (1.0 - layerBurstT) * 5.8;
    let lRing = exp(-pow((hpDist - lWaveR) / 0.34, 2.0)) * layerBurstT;
    let goldBurst = select(toLinear(vec3<f32>(1.0, 0.80, 0.22)), vec3<f32>(1.0), theme == 2u);
    emissive += goldBurst * (lRing * 1.65 + layerBurstT * 0.20);
  }
  if (streakAmt > 0.15) {
    let auraGlow = exp(-hpDist * 0.42) * (streakAmt - 0.15) * (0.28 + 0.08 * sin(renderU.time * 3.8));
    let streakCol = select(toLinear(vec3<f32>(1.0, 0.72, 0.18)), toLinear(vec3<f32>(0.06, 0.92, 1.0)), theme == 1u);
    emissive += select(streakCol, vec3<f32>(0.65), theme == 2u) * auraGlow;
  }

  // =========================================================================
  // ZONE 1: Embroidery Hoop + Taut Fabric + High-Visibility Stitch Pinholes
  // =========================================================================
  if (hpDist < hoopR + 0.30) {
    let shadowOffset = hpLocal + sunDir.xz * 0.08;
    let outerShadowD = abs(length(shadowOffset) - hoopR);
    if (outerShadowD < 0.14 && hpDist > hoopR - 0.05) {
      albedo *= mix(0.42, 1.0, smoothstep(0.04, 0.14, outerShadowD));
    }

    if (hpDist < hoopR - 0.055) {
      let aida = 0.95 + 0.05 * (sin(p.x * 74.0) * sin(p.z * 74.0));
      if (theme == 0u) {
        // Warm luminous cream Aida cloth — gorgeous contrast against deep teal-walnut desk!
        let clothDay = toLinear(vec3<f32>(0.96, 0.93, 0.85));
        let clothNight = toLinear(vec3<f32>(0.76, 0.71, 0.65));
        albedo = mix(clothNight, clothDay, daylight) * aida;
      } else if (theme == 1u) {
        albedo = vec3<f32>(0.008, 0.012, 0.032) * aida;
        let mesh = smoothstep(0.92, 0.99, max(abs(cos(p.x * 22.0)), abs(cos(p.z * 22.0))));
        emissive += toLinear(vec3<f32>(0.04, 0.72, 1.0)) * mesh * 0.14;
      } else if (theme == 2u) {
        // Crisp mid-tone silver-grey fabric so BOTH jet-black AND bright-white pearls POP!
        albedo = toLinear(vec3<f32>(0.54, 0.55, 0.58)) * aida;
      } else if (theme == 3u) {
        albedo = toLinear(vec3<f32>(0.98, 0.97, 0.93));
      } else {
        albedo = mix(toLinear(vec3<f32>(0.14, 0.16, 0.30)), toLinear(vec3<f32>(0.26, 0.24, 0.38)), daylight) * aida;
        let spokes = smoothstep(0.96, 0.992, abs(cos(atan2(hpLocal.y, hpLocal.x) * 6.0)));
        albedo = mix(albedo, vec3<f32>(0.012, 0.010, 0.016), spokes * 0.65);
      }

      let innerEdge = smoothstep(hoopR - 0.055, hoopR - 0.18, hpDist);
      albedo *= mix(0.72, 1.0, innerEdge);

      let hCount = min(u32(scene.countsInfo.x), 49u);
      for (var i: u32 = 0u; i < hCount; i = i + 1u) {
        let hp = scene.hoopPearls[i];
        let dDot = length(p.xz - hp.posRad.xz);
        if (dDot > 0.28) {
          continue;
        }
        let bloom = hp.props.y;
        let isActive = hp.props.w;
        let pal = getPaletteLinear(hp.props.x).rgb;
        // Soft grounded contact AO right beneath stitched hoop pearls
        if (bloom > 0.25 && dDot < hp.posRad.w * 1.55) {
          let ao = mix(0.56, 1.0, smoothstep(hp.posRad.w * 0.75, hp.posRad.w * 1.55, dDot));
          albedo *= mix(1.0, ao, bloom);
        }
        if (bloom < 0.95 && dDot < 0.18) {
          if (isActive > 0.5) {
            // HIGH-CLARITY ACTIVE STITCH BEACON: unmistakable luminous pulsing target ring on the hoop!
            let pulse = 0.55 + 0.45 * sin(renderU.time * 4.4 + f32(i) * 0.35);
            let outerRippleR = 0.092 + 0.042 * (0.5 + 0.5 * sin(renderU.time * 3.8 + f32(i) * 0.2));
            let outerBeacon = exp(-pow((dDot - outerRippleR) / 0.022, 2.0)) * (0.65 + 0.45 * pulse);
            let innerRing = smoothstep(0.095, 0.062, dDot) - smoothstep(0.038, 0.020, dDot);
            let centerDot = smoothstep(0.032, 0.012, dDot);
            let beaconTint = select(pal, vec3<f32>(0.96), theme == 2u);
            albedo = mix(albedo, pal, clamp(innerRing * 1.0, 0.0, 1.0));
            albedo = mix(albedo, vec3<f32>(0.02, 0.02, 0.03), centerDot * 0.85);
            emissive += beaconTint * (outerBeacon * 1.25 + innerRing * (0.55 + 0.35 * pulse));
          } else if (dDot < 0.095) {
            // Calm, quiet guide dot for future (non-active) colors
            let ring = smoothstep(0.072, 0.048, dDot) - smoothstep(0.030, 0.016, dDot);
            let centerPin = smoothstep(0.022, 0.008, dDot);
            albedo = mix(albedo, pal, ring * 0.45);
            albedo = mix(albedo, vec3<f32>(0.04, 0.04, 0.05), centerPin * 0.52);
          }
        }
        if (theme == 4u && bloom > 0.3 && dDot < 0.24) {
          emissive += pal * exp(-dDot * 12.0) * bloom * 0.55;
        }
        let spark = max(hp.props.z, celebrate * (0.5 + 0.5 * sin(renderU.time * 6.5 + f32(i))));
        if (spark > 0.02) {
          let ringR = 0.11 + (1.0 - spark) * 0.13;
          let ringMask = exp(-pow((dDot - ringR) / 0.026, 2.0)) * spark;
          emissive += mix(toLinear(vec3<f32>(1.0, 0.92, 0.62)), pal, 0.45) * ringMask * 1.15;
        }
      }
    }

    // 3D curved Hoop Ring
    let rimDist = abs(hpDist - hoopR);
    if (rimDist < 0.080) {
      let profile = clamp((hpDist - hoopR) / 0.080, -1.0, 1.0);
      let radDir = normalize(hpLocal + vec2<f32>(0.0001));
      normal = normalize(vec3<f32>(radDir.x * profile * 0.78, sqrt(max(0.05, 1.0 - profile * profile * 0.60)), radDir.y * profile * 0.78));
      let brush = 0.92 + 0.08 * sin(atan2(hpLocal.y, hpLocal.x) * 44.0);
      if (theme == 0u) {
        albedo = toLinear(vec3<f32>(0.96, 0.76, 0.30)) * brush;
        metallic = 0.88;
        roughness = 0.18;
      } else if (theme == 1u) {
        let neonRim = mix(toLinear(vec3<f32>(0.04, 0.92, 1.0)), toLinear(vec3<f32>(1.0, 0.12, 0.64)), 0.5 + 0.5 * sin(atan2(hpLocal.y, hpLocal.x) * 2.0 + renderU.time));
        albedo = neonRim;
        emissive += neonRim * 1.15;
        metallic = 0.75;
        roughness = 0.14;
      } else if (theme == 2u) {
        albedo = toLinear(vec3<f32>(0.88, 0.89, 0.92)) * brush;
        metallic = 0.92;
        roughness = 0.16;
      } else if (theme == 3u) {
        let isInk = abs(profile) > 0.68;
        albedo = select(toLinear(vec3<f32>(1.0, 0.84, 0.04)), vec3<f32>(0.004), isInk);
        metallic = 0.04;
        roughness = 0.70;
      } else {
        albedo = toLinear(vec3<f32>(0.80, 0.58, 0.28)) * brush;
        metallic = 0.84;
        roughness = 0.24;
      }
      let rimCelebrate = max(celebrate, max(layerBurstT, colorBurstT * 0.85));
      if (rimCelebrate > 0.01) {
        emissive += mix(toLinear(vec3<f32>(1.0, 0.82, 0.30)), colorBurstCol, colorBurstT * 0.7) * rimCelebrate * 0.95;
      }
    }

    // Iconic top hoop tightening clasp screw at 12 o'clock
    let claspP = hpLocal - vec2<f32>(0.0, -(hoopR + 0.105));
    let claspD = sdRoundedBox2D(claspP, vec2<f32>(0.14, 0.068), 0.025);
    if (claspD < 0.0) {
      if (theme == 1u) {
        let mag = toLinear(vec3<f32>(1.0, 0.14, 0.64));
        albedo = mag;
        emissive += mag * 0.75;
      } else if (theme == 2u) {
        albedo = toLinear(vec3<f32>(0.86, 0.87, 0.90));
      } else if (theme == 3u) {
        albedo = select(toLinear(vec3<f32>(0.98, 0.14, 0.18)), vec3<f32>(0.004), claspD > -0.020);
      } else {
        albedo = toLinear(vec3<f32>(0.94, 0.74, 0.32));
      }
      metallic = 0.84;
      roughness = 0.22;
      normal = normalize(vec3<f32>(claspP.x * 2.2, 1.0, claspP.y * 2.2));
    }
  }

  // =========================================================================
  // ZONE 2: 5-Slot Holding Tray + Escalating Balatro/VS Tension Rim Glow!
  // =========================================================================
  let trayLocal = vec2<f32>(p.x, p.z - trayZ);
  let trayHalf = vec2<f32>(1.68, 0.30);
  let dTray = sdRoundedBox2D(trayLocal, trayHalf, 0.16);
  if (dTray < 0.22) {
    if (trayTension > 0.05 && dTray > -0.04) {
      let pulseSpeed = mix(3.4, 9.0, trayTension);
      let tPulse = 0.55 + 0.45 * sin(renderU.time * pulseSpeed);
      let glow = exp(-pow(max(dTray, 0.0) / 0.095, 2.0)) * trayTension * tPulse;
      let tensionCol = mix(toLinear(vec3<f32>(1.0, 0.62, 0.08)), toLinear(vec3<f32>(1.0, 0.10, 0.18)), smoothstep(0.35, 0.95, trayTension));
      emissive += select(tensionCol, vec3<f32>(0.95), theme == 2u) * glow * 1.45;
    }

    let dTrayShad = sdRoundedBox2D(trayLocal + sunDir.xz * 0.055, trayHalf, 0.16);
    if (dTray > 0.0 && dTrayShad < 0.08) {
      albedo *= mix(0.45, 1.0, smoothstep(-0.02, 0.08, dTrayShad));
    }
    if (dTray <= 0.0) {
      let bevel = smoothstep(0.0, -0.055, dTray);
      if (theme == 0u) {
        albedo = mix(toLinear(vec3<f32>(0.16, 0.13, 0.16)), toLinear(vec3<f32>(0.26, 0.22, 0.26)), bevel);
      } else if (theme == 1u) {
        albedo = mix(vec3<f32>(0.008, 0.012, 0.032), vec3<f32>(0.018, 0.024, 0.058), bevel);
      } else if (theme == 2u) {
        albedo = mix(toLinear(vec3<f32>(0.22, 0.23, 0.26)), toLinear(vec3<f32>(0.36, 0.37, 0.40)), bevel);
      } else if (theme == 3u) {
        albedo = toLinear(vec3<f32>(1.0, 0.86, 0.08));
      } else {
        albedo = mix(toLinear(vec3<f32>(0.12, 0.10, 0.22)), toLinear(vec3<f32>(0.22, 0.18, 0.34)), bevel);
      }
      roughness = 0.32;

      if (dTray > -0.028) {
        if (theme == 1u) {
          let cy = toLinear(vec3<f32>(0.04, 0.92, 1.0));
          albedo = cy;
          emissive += cy * 0.78;
        } else if (theme == 2u) {
          albedo = toLinear(vec3<f32>(0.90));
        } else if (theme == 3u) {
          albedo = vec3<f32>(0.004);
        } else {
          albedo = toLinear(vec3<f32>(0.94, 0.75, 0.34));
          metallic = 0.80;
        }
        if (trayTension > 0.25) {
          let tCol = mix(toLinear(vec3<f32>(1.0, 0.62, 0.08)), toLinear(vec3<f32>(1.0, 0.12, 0.18)), trayTension);
          emissive += select(tCol, vec3<f32>(1.0), theme == 2u) * trayTension * 1.15;
        }
      }

      let spacing = scene.themeSolar.w;
      for (var s: i32 = 0; s < 5; s = s + 1) {
        let sx = (f32(s) - 2.0) * spacing;
        let dp = vec2<f32>(p.x - sx, p.z - trayZ);
        let rDimple = length(dp);
        if (rDimple < 0.22) {
          let slope = clamp(rDimple / 0.22, 0.0, 1.0);
          normal = normalize(vec3<f32>(-dp.x * 2.2, 1.0, -dp.y * 2.2));
          albedo *= mix(0.45, 0.96, slope * slope);
          roughness = 0.44;
          if (rDimple > 0.19) {
            albedo = mix(albedo, toLinear(vec3<f32>(0.88, 0.76, 0.48)), 0.45);
          }
        }
      }
    }
  }

  // =========================================================================
  // ZONE 3: Untangle Board (ZERO VISUAL SPOILERS + Unmistakable Causal FX!)
  // =========================================================================
  let bLocal = p.xz - boardC;
  let frameHalf = boardHalf + vec2<f32>(0.15, 0.15);
  let dFrame = sdRoundedBox2D(bLocal, frameHalf, 0.18);
  if (dFrame < 0.15) {
    if (dFrame > 0.0) {
      albedo *= mix(0.55, 1.0, smoothstep(0.0, 0.13, dFrame));
    } else {
      // Deep contrasting recessed board mat
      if (theme == 0u) {
        albedo = mix(toLinear(vec3<f32>(0.10, 0.12, 0.18)), toLinear(vec3<f32>(0.15, 0.18, 0.24)), daylight);
      } else if (theme == 1u) {
        albedo = vec3<f32>(0.005, 0.007, 0.020);
      } else if (theme == 2u) {
        albedo = vec3<f32>(0.012, 0.012, 0.016);
      } else if (theme == 3u) {
        albedo = toLinear(vec3<f32>(0.98, 0.16, 0.44));
      } else {
        albedo = toLinear(vec3<f32>(0.07, 0.08, 0.16));
      }

      if (dFrame > -0.028) {
        if (theme == 1u) {
          let mg = toLinear(vec3<f32>(1.0, 0.12, 0.64));
          albedo = mg;
          emissive += mg * 0.75;
        } else if (theme == 2u) {
          albedo = toLinear(vec3<f32>(0.86));
          metallic = 0.80;
        } else if (theme == 3u) {
          albedo = vec3<f32>(0.004);
        } else {
          albedo = toLinear(vec3<f32>(0.92, 0.74, 0.34));
          metallic = 0.74;
        }
      }

      let tCount = min(u32(scene.boardInfo.w), 49u);
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
        let isActiveTarget = (flags & 16u) != 0u;

        let dTileShad = sdRoundedBox2D(dLocal + sunDir.xz * 0.036, vec2<f32>(tileHalf), pitch * 0.13);
        if (dTile > 0.0 && dTileShad < 0.052) {
          albedo *= mix(0.38, 1.0, smoothstep(-0.01, 0.052, dTileShad));
        }

        if (hinted && dTile > -0.03 && dTile < 0.10) {
          let hPulse = 0.58 + 0.42 * sin(renderU.time * 5.0);
          let aura = exp(-pow(max(dTile, 0.0) / 0.042, 2.0)) * hPulse;
          emissive += toLinear(vec3<f32>(1.0, 0.86, 0.24)) * aura * 1.8;
        }

        if (isBlocker && blockerFlashT > 0.01 && dTile > -0.04 && dTile < 0.10) {
          let bPulse = 0.65 + 0.35 * sin(renderU.time * 24.0);
          let bAura = exp(-pow(max(dTile, 0.0) / 0.04, 2.0)) * blockerFlashT * bPulse;
          let warnCol = select(vec3<f32>(1.6, 0.12, 0.05), vec3<f32>(1.2), theme == 2u);
          emissive += warnCol * bAura * 1.65;
        }

        if (dTile <= 0.0) {
          let pal = getPaletteLinear(tl.props.x).rgb;
          let edgeBevel = smoothstep(0.0, -0.048, dTile);
          // 3D sculpted beveled tile edge normal so tiles catch crisp studio specular highlights!
          if (dTile > -0.052) {
            let bevelAmt = smoothstep(-0.052, 0.0, dTile) * 0.36;
            let edgeDir = normalize(dLocal + vec2<f32>(0.0001));
            normal = normalize(vec3<f32>(edgeDir.x * bevelAmt, 1.0, edgeDir.y * bevelAmt));
          }

          // ZERO VISUAL SPOILERS: blocked & unblocked tiles share identical base styling!
          var tileCol = toLinear(vec3<f32>(0.94, 0.91, 0.85));
          var borderCol = mix(pal, toLinear(vec3<f32>(0.92, 0.78, 0.46)), 0.38);
          var arrowCol = vec3<f32>(0.012, 0.012, 0.018);
          var arrowEmissive = vec3<f32>(0.0);

          if (theme == 0u) {
            let ivory = mix(toLinear(vec3<f32>(0.80, 0.77, 0.72)), toLinear(vec3<f32>(0.96, 0.94, 0.88)), daylight);
            tileCol = mix(ivory, pal, 0.06);
            borderCol = mix(pal, toLinear(vec3<f32>(0.92, 0.76, 0.38)), 0.32);
            arrowCol = vec3<f32>(0.010, 0.010, 0.016);
            roughness = 0.26;
          } else if (theme == 1u) {
            tileCol = vec3<f32>(0.014, 0.020, 0.046);
            borderCol = pal;
            arrowCol = vec3<f32>(0.95, 0.98, 1.0);
            arrowEmissive = mix(toLinear(vec3<f32>(0.25, 0.96, 1.0)), pal, 0.42) * 1.25;
            roughness = 0.18;
          } else if (theme == 2u) {
            tileCol = toLinear(vec3<f32>(0.54, 0.55, 0.58));
            borderCol = toLinear(vec3<f32>(0.92, 0.92, 0.95));
            arrowCol = vec3<f32>(0.005, 0.005, 0.007);
            roughness = 0.28;
          } else if (theme == 3u) {
            tileCol = toLinear(vec3<f32>(0.98, 0.97, 0.93));
            borderCol = vec3<f32>(0.004, 0.004, 0.006);
            arrowCol = vec3<f32>(0.004, 0.004, 0.006);
            roughness = 0.72;
          } else {
            tileCol = toLinear(vec3<f32>(0.12, 0.13, 0.22));
            borderCol = toLinear(vec3<f32>(0.84, 0.64, 0.32));
            arrowCol = toLinear(vec3<f32>(1.0, 0.88, 0.48));
            arrowEmissive = toLinear(vec3<f32>(1.0, 0.80, 0.30)) * 0.55;
            let caustic = exp(-length(dLocal) / (pitch * 0.34));
            emissive += pal * caustic * 0.55;
            roughness = 0.20;
          }

          albedo = mix(tileCol * 0.78, tileCol, edgeBevel);

          // Soft contact ambient occlusion + luminous active-target halo right around the seated pearl!
          let dir = u32(tl.props.y);
          let backOff = -dirOffsetXZ(dir) * (pitch * 0.105);
          let distToPearl = length(dLocal - backOff);
          let pearlAO = mix(0.62, 1.0, smoothstep(tl.posRad.w * 0.72, tl.posRad.w * 1.48, distToPearl));
          albedo *= pearlAO;

          if (isActiveTarget) {
            let aPulse = 0.62 + 0.38 * sin(renderU.time * 4.2);
            let ringR = tl.posRad.w * 1.24;
            let haloRing = exp(-pow((distToPearl - ringR) / (pitch * 0.062), 2.0)) * aPulse;
            let activeTint = select(mix(pal, toLinear(vec3<f32>(1.0, 0.94, 0.70)), 0.28), vec3<f32>(0.95), theme == 2u);
            emissive += activeTint * haloRing * 1.05;
          }

          let rimWidth = select(-0.022, -0.028, theme == 3u);
          if (dTile > rimWidth) {
            albedo = borderCol;
            if (theme == 1u) {
              emissive += pal * 0.78;
            }
            if (isActiveTarget) {
              let rPulse = 0.60 + 0.40 * sin(renderU.time * 4.2);
              let rimGlowCol = select(pal, vec3<f32>(0.95), theme == 2u);
              emissive += rimGlowCol * (0.48 * rPulse);
            }
          }

          if (isBlocker && blockerFlashT > 0.01) {
            let warnTint = select(vec3<f32>(1.3, 0.14, 0.06), vec3<f32>(1.0), theme == 2u);
            emissive += warnTint * blockerFlashT * 0.45;
          }

          // PERMANENT, RAZOR-SHARP DIRECTIONAL CHEVRON ARROW (NEVER disappears or spoils!)
          let rot = rotateForDir(dLocal, dir);
          let arrowCenter = rot - vec2<f32>(0.0, -pitch * 0.285);
          let dArrow = sdChevron(arrowCenter, pitch * 0.145, pitch * 0.040);
          if (dArrow < 0.016) {
            if (dArrow > 0.002 && (theme == 2u || theme == 0u)) {
              let haloAA = smoothstep(0.016, 0.002, dArrow);
              albedo = mix(albedo, vec3<f32>(0.96), haloAA * 0.55);
            }
            if (dArrow < 0.008) {
              let aa = smoothstep(0.008, -0.005, dArrow);
              albedo = mix(albedo, arrowCol, aa);
              emissive += arrowEmissive * aa;
              roughness = mix(roughness, 0.22, aa);
            }
          }
        }
      }

      // CAUSAL BLOCKER IMPACT BEAM: bright laser-red pulse connecting tapped tile -> exact blocking tile!
      if (blockerFlashT > 0.01) {
        let a = scene.blockerFX.xy;
        let b = scene.blockerFX.zw;
        if (length(b - a) > 0.05) {
          let dSeg = sdSegment2D(p.xz, a, b);
          if (dSeg < 0.12) {
            let core = smoothstep(0.055, 0.012, dSeg) * blockerFlashT;
            let beam = exp(-pow(dSeg / 0.036, 2.0)) * blockerFlashT;
            let warnCol = select(vec3<f32>(1.8, 0.10, 0.04), vec3<f32>(1.2), theme == 2u);
            albedo = mix(albedo, vec3<f32>(0.9, 0.05, 0.02), core * 0.75);
            emissive += warnCol * beam;
          }
        }
      }
    }
  }

  // Physically shaded linear desk lighting + crisp shadows
  let inShadowZone =
    hpDist < hoopR + 0.32 ||
    abs(p.z - trayZ) < 0.52 ||
    (abs(p.x - boardC.x) < boardHalf.x + 0.42 && abs(p.z - boardC.y) < boardHalf.y + 0.42) ||
    u32(scene.countsInfo.z) > 0u;
  let shadow = select(1.0, computeDeskShadow(p, sunDir), inShadowZone);
  let ndotl = max(dot(normal, sunDir), 0.0);
  let rawSunLin = toLinear(scene.sunColor.rgb);
  let sunTint = select(rawSunLin, vec3<f32>(dot(rawSunLin, vec3<f32>(0.3, 0.59, 0.11))), theme == 2u);
  let direct = sunTint * ndotl * (0.45 + 0.72 * scene.sunDir.w) * shadow;

  let v = -rd;
  let hVec = normalize(sunDir + v);
  let shininess = mix(96.0, 20.0, clamp(roughness, 0.0, 1.0));
  let spec = pow(max(dot(normal, hVec), 0.0), shininess) * shadow * scene.sunDir.w * mix(0.03, 1.05, metallic);

  // Warm evening candle / bedside lamp light
  let candlePos = vec3<f32>(2.3, 2.4, -2.5);
  let toCandle = candlePos - p;
  let candleDistSq = max(dot(toCandle, toCandle), 1.5);
  let candleDir = normalize(toCandle);
  let candleAtten = scene.sunColor.w * (11.0 / (1.0 + candleDistSq * 0.22));
  let candleDiff = max(dot(normal, candleDir), 0.0) * candleAtten * shadow;
  let candleHalf = normalize(candleDir + v);
  let candleSpec = pow(max(dot(normal, candleHalf), 0.0), shininess) * candleAtten * shadow * mix(0.10, 0.92, metallic);
  let candleCol = select(toLinear(vec3<f32>(1.0, 0.72, 0.36)), vec3<f32>(0.90), theme == 2u);

  let rawAmbLin = toLinear(scene.ambientSky.rgb);
  let ambBase = select(rawAmbLin, vec3<f32>(dot(rawAmbLin, vec3<f32>(0.3, 0.59, 0.11))), theme == 2u);
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

  let ro = camPos;
  let rd = normalize(forward + right * (ndc.x * aspect * tanHalfFov) + up * (ndc.y * tanHalfFov));

  var tDesk = MAX_DIST;
  var pDesk = vec3<f32>(0.0);
  if (rd.y < -0.001) {
    tDesk = -ro.y / rd.y;
    pDesk = ro + rd * tDesk;
  }

  var bestT = tDesk;
  var hitPearl = false;
  var hitPos = vec3<f32>(0.0);
  var hitNormal = vec3<f32>(0.0, 1.0, 0.0);
  var hitColorLin = vec3<f32>(1.0);
  var hitColorIdx: u32 = 0u;
  var hitIrid: f32 = 0.5;
  var hitSpark: f32 = 0.0;
  var hitBlocker = false;
  var hitActiveTarget = false;

  let hoopC = scene.hoopBounds.xy;
  let hoopR = scene.hoopBounds.z;
  let trayZ = scene.hoopBounds.w;
  let boardC = scene.boardBounds.xy;
  let boardHalf = scene.boardBounds.zw;
  let celebrate = scene.deskTint.w;

  // Zone 1: Stitched Embroidery Hoop Pearls (up to 49)
  if (length(pDesk.xz - hoopC) < hoopR + 0.32) {
    let hCount = min(u32(scene.countsInfo.x), 49u);
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
      let tHit = intersectSphere(ro, rd, hp.posRad.xyz, r);
      if (tHit > EPS && tHit < bestT) {
        bestT = tHit;
        hitPearl = true;
        hitPos = ro + rd * tHit;
        hitNormal = normalize(hitPos - hp.posRad.xyz);
        hitColorIdx = min(u32(max(hp.props.x + 0.5, 0.0)), 5u);
        let pal = getPaletteLinear(hp.props.x);
        hitColorLin = pal.rgb;
        hitIrid = pal.w;
        hitSpark = max(hp.props.z, celebrate * (0.5 + 0.5 * sin(renderU.time * 5.5 + f32(i))));
        hitBlocker = false;
        hitActiveTarget = false;
      }
    }
  }

  // Zone 2: 5-Slot Holding Tray Pearls
  if (abs(pDesk.z - trayZ) < 0.52) {
    for (var i: u32 = 0u; i < 5u; i = i + 1u) {
      let tp = scene.trayPearls[i];
      if (tp.props.y < 0.5) {
        continue;
      }
      let tHit = intersectSphere(ro, rd, tp.posRad.xyz, tp.posRad.w);
      if (tHit > EPS && tHit < bestT) {
        bestT = tHit;
        hitPearl = true;
        hitPos = ro + rd * tHit;
        hitNormal = normalize(hitPos - tp.posRad.xyz);
        hitColorIdx = min(u32(max(tp.props.x + 0.5, 0.0)), 5u);
        let pal = getPaletteLinear(tp.props.x);
        hitColorLin = pal.rgb;
        hitIrid = pal.w;
        hitSpark = tp.props.z * 0.55;
        hitBlocker = false;
        hitActiveTarget = false;
      }
    }
  }

  // Zone 3: Untangle Board Pearls (up to 49, zero visual spoilers, active-color target glow!)
  if (abs(pDesk.x - boardC.x) < boardHalf.x + 0.42 && abs(pDesk.z - boardC.y) < boardHalf.y + 0.42) {
    let tCount = min(u32(scene.boardInfo.w), 49u);
    let pitch = scene.boardInfo.z;
    for (var i: u32 = 0u; i < tCount; i = i + 1u) {
      let tl = scene.tiles[i];
      let flags = u32(tl.props.z);
      if ((flags & 1u) == 0u) {
        continue;
      }
      if (abs(pDesk.x - tl.posRad.x) > pitch * 0.70 || abs(pDesk.z - tl.posRad.z) > pitch * 0.70) {
        continue;
      }
      let dir = u32(tl.props.y);
      let backOff = -dirOffsetXZ(dir) * (pitch * 0.105);
      let spCenter = vec3<f32>(tl.posRad.x + backOff.x, tl.posRad.y, tl.posRad.z + backOff.y);
      let tHit = intersectSphere(ro, rd, spCenter, tl.posRad.w);
      if (tHit > EPS && tHit < bestT) {
        bestT = tHit;
        hitPearl = true;
        hitPos = ro + rd * tHit;
        hitNormal = normalize(hitPos - spCenter);
        hitColorIdx = min(u32(max(tl.props.x + 0.5, 0.0)), 5u);
        let pal = getPaletteLinear(tl.props.x);
        hitColorLin = pal.rgb;
        hitIrid = pal.w;
        let hinted = (flags & 4u) != 0u;
        hitSpark = select(0.0, 0.42 + 0.28 * sin(renderU.time * 5.0), hinted);
        hitBlocker = (flags & 8u) != 0u;
        hitActiveTarget = (flags & 16u) != 0u;
      }
    }
  }

  // Zone 4: Flying Pearls (up to 12 for dramatic Balatro staggered cascades!)
  if (u32(scene.countsInfo.z) > 0u) {
    for (var i: u32 = 0u; i < 12u; i = i + 1u) {
      let fp = scene.flyingPearls[i];
      if (fp.props.y < 0.5) {
        continue;
      }
      let tHit = intersectSphere(ro, rd, fp.posRad.xyz, fp.posRad.w);
      if (tHit > EPS && tHit < bestT) {
        bestT = tHit;
        hitPearl = true;
        hitPos = ro + rd * tHit;
        hitNormal = normalize(hitPos - fp.posRad.xyz);
        hitColorIdx = min(u32(max(fp.props.x + 0.5, 0.0)), 5u);
        let pal = getPaletteLinear(fp.props.x);
        hitColorLin = pal.rgb;
        hitIrid = pal.w;
        hitSpark = 0.55;
        hitBlocker = false;
        hitActiveTarget = true;
      }
    }
  }

  let theme = getTheme();
  var finalCol = vec3<f32>(0.0);
  if (hitPearl) {
    finalCol = shadePearl(hitPos, hitNormal, rd, hitColorLin, hitColorIdx, hitIrid, hitSpark, hitBlocker, hitActiveTarget);
  } else if (tDesk < MAX_DIST) {
    finalCol = shadeAtelierDesk(pDesk, rd);
  } else {
    finalCol = skyReflection(rd, theme);
  }

  let mapped = acesToneMap(finalCol * 1.18);
  let gamma = sqrt(mapped);
  return vec4<f32>(gamma, 1.0);
}
