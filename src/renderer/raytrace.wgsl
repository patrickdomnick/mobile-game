struct RenderUniforms {
  resolution: vec2<f32>,
  time: f32,
  _pad: f32,
};

struct PearlNode {
  posRad: vec4<f32>, // xyz = center, w = radius
  props: vec4<f32>,  // x = colorIdx, y = dir/bloom/occ, z = flags/shimmer/pulse, w = wobble/active
};

struct SceneData {
  cameraPos: vec4<f32>,    // xyz = pos, w = elapsed
  cameraTarget: vec4<f32>, // xyz = target, w = fovY
  sunDir: vec4<f32>,       // xyz = dir, w = sunIntensity
  sunColor: vec4<f32>,     // rgb = sunColor, w = candleIntensity
  ambientSky: vec4<f32>,   // rgb = ambient, w = timeOfDayHours
  linenTint: vec4<f32>,    // rgb = linenBase, w = celebrateT
  boardMeta: vec4<f32>,    // x = cols, y = rows, z = cellPitch, w = tileCount
  countsMeta: vec4<f32>,   // x = hoopCount, y = trayLen, z = flyingCount, w = phase
  activeColors: vec4<f32>, // x = c0, y = c1, z = rem0, w = rem1
  boardBounds: vec4<f32>,  // x = cx, y = cz, z = halfW, w = halfD
  hoopBounds: vec4<f32>,   // x = cx, y = cz, z = radius, w = trayZ
  hintInfo: vec4<f32>,     // x = hintIdx, y = traySpacing, z = trayCap, w = levelIdx
  palette: array<vec4<f32>, 6>,
  tiles: array<PearlNode, 25>,
  hoopPearls: array<PearlNode, 32>,
  trayPearls: array<PearlNode, 5>,
  flyingPearls: array<PearlNode, 8>,
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

fn getPalette(idxF: f32) -> vec4<f32> {
  let idx = min(u32(max(idxF, 0.0)), 5u);
  return scene.palette[idx];
}

fn sdRoundedBox2D(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let q = abs(p) - b + vec2<f32>(r);
  return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// Crisp directional chevron arrow SDF pointing along +Y in local rotated coordinates
fn sdChevron(p: vec2<f32>, size: f32, thickness: f32) -> f32 {
  let ax = abs(p.x);
  // Two symmetric diagonal arms forming a clean arrowhead pointing toward -Y (screen up = -Z)
  let a = vec2<f32>(0.0, -size * 0.55);
  let b = vec2<f32>(size * 0.85, size * 0.45);
  let pa = vec2<f32>(ax, p.y) - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - thickness;
}

fn rotateForDir(localXZ: vec2<f32>, dir: u32) -> vec2<f32> {
  // Dir: 0=Up (-Z), 1=Right (+X), 2=Down (+Z), 3=Left (-X)
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

fn skyReflection(rd: vec3<f32>) -> vec3<f32> {
  let sunDir = normalize(scene.sunDir.xyz);
  let t = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  let warmSky = scene.ambientSky.rgb * 1.6 + scene.sunColor.rgb * 0.25;
  let deepSky = scene.ambientSky.rgb * 0.7;
  var col = mix(warmSky, deepSky, pow(t, 0.7));
  // Soft studio window reflection rectangle
  let sunAmt = max(dot(rd, sunDir), 0.0);
  col += scene.sunColor.rgb * pow(sunAmt, 24.0) * (0.9 * scene.sunDir.w);
  col += vec3<f32>(1.0, 0.80, 0.52) * scene.sunColor.w * pow(max(dot(rd, normalize(vec3<f32>(0.6, 0.55, -0.55))), 0.0), 12.0) * 0.9;
  return col;
}

// Iridescent thin-film mother-of-pearl shading with real-world solar + candle lighting
fn shadePearl(
  pos: vec3<f32>,
  normal: vec3<f32>,
  rd: vec3<f32>,
  baseColor: vec3<f32>,
  iridescence: f32,
  sparkle: f32,
  isUnblockedBoost: f32,
) -> vec3<f32> {
  let n = normalize(normal);
  let v = -rd;
  let sunDir = normalize(scene.sunDir.xyz);
  let ndotv = clamp(dot(n, v), 0.0, 1.0);
  let ndotl = max(dot(n, sunDir), 0.0);

  // Subtle pearlescent thin-film rainbow tint at grazing angles
  let phase = (1.0 - ndotv) * 4.5 + pos.x * 0.35;
  let irid = 0.5 + 0.5 * vec3<f32>(sin(phase), sin(phase + 2.094), sin(phase + 4.188));
  let pearlAlbedo = mix(baseColor, mix(baseColor, irid, 0.32), (1.0 - ndotv) * iridescence);

  // Wrapped subsurface-like diffuse gives pearls that creamy luminous softness
  let wrapDiffuse = clamp((dot(n, sunDir) + 0.38) / 1.38, 0.0, 1.0);
  let direct = scene.sunColor.rgb * wrapDiffuse * scene.sunDir.w * 0.95;

  // Crisp glossy specular highlight from studio window sun
  let hVec = normalize(sunDir + v);
  let spec = pow(max(dot(n, hVec), 0.0), 72.0) * scene.sunDir.w;

  // Warm bedside candle / evening lamp light
  let candlePos = vec3<f32>(2.3, 2.4, -2.5);
  let toCandle = candlePos - pos;
  let candleDistSq = max(dot(toCandle, toCandle), 1.0);
  let candleDir = normalize(toCandle);
  let candlePulse = 1.0 + 0.03 * sin(renderU.time * 2.4);
  let candleAtten = scene.sunColor.w * candlePulse * (9.5 / (1.0 + candleDistSq * 0.25));
  let candleDiff = max(dot(n, candleDir), 0.0) * candleAtten;
  let candleHalf = normalize(candleDir + v);
  let candleSpec = pow(max(dot(n, candleHalf), 0.0), 48.0) * candleAtten * 0.85;
  let candleTint = vec3<f32>(1.0, 0.76, 0.44);

  // Soft hemispherical ambient + warm linen bounce from underneath
  let hemi = mix(scene.linenTint.rgb * 0.42, scene.ambientSky.rgb * 1.25, n.y * 0.5 + 0.5);

  // Fresnel mirror reflection of studio window / sky
  let fresnel = 0.08 + 0.48 * pow(1.0 - ndotv, 4.0);
  let reflDir = reflect(rd, n);
  let envRefl = skyReflection(reflDir);

  var col = pearlAlbedo * (hemi + direct + candleTint * candleDiff * 0.55);
  col = mix(col, envRefl, fresnel * 0.58);
  col += scene.sunColor.rgb * spec * 0.95;
  col += candleTint * candleSpec;
  col += vec3<f32>(1.0, 0.95, 0.84) * (sparkle * 0.45 + isUnblockedBoost * 0.06);
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

// Soft analytic shadow cast onto the linen/tile desk by nearby spheres in the same zone
fn computeDeskShadow(p: vec3<f32>, sunDir: vec3<f32>) -> f32 {
  var shadow: f32 = 1.0;
  let orig = p + vec3<f32>(0.0, 0.004, 0.0);

  let hoopC = scene.hoopBounds.xy;
  let hoopR = scene.hoopBounds.z;
  let trayZ = scene.hoopBounds.w;
  let boardC = scene.boardBounds.xy;
  let boardHalf = scene.boardBounds.zw;

  // Zone 1: Hoop pearl shadows
  if (length(p.xz - hoopC) < hoopR + 0.35) {
    let hCount = min(u32(scene.countsMeta.x), 32u);
    for (var i: u32 = 0u; i < hCount; i = i + 1u) {
      let hp = scene.hoopPearls[i];
      let bloom = hp.props.y;
      if (bloom > 0.05) {
        let r = hp.posRad.w * (0.25 + 0.75 * bloom);
        if (intersectSphere(orig, sunDir, hp.posRad.xyz, r) > 0.0) {
          shadow *= 0.62;
        }
      }
    }
  }

  // Zone 2: Silk Tray pearl shadows
  if (abs(p.z - trayZ) < 0.55) {
    for (var i: u32 = 0u; i < 5u; i = i + 1u) {
      let tp = scene.trayPearls[i];
      if (tp.props.y > 0.5) {
        if (intersectSphere(orig, sunDir, tp.posRad.xyz, tp.posRad.w) > 0.0) {
          shadow *= 0.62;
        }
      }
    }
  }

  // Zone 3: Board tile pearl shadows
  if (abs(p.x - boardC.x) < boardHalf.x + 0.45 && abs(p.z - boardC.y) < boardHalf.y + 0.45) {
    let tCount = min(u32(scene.boardMeta.w), 25u);
    let pitch = scene.boardMeta.z;
    for (var i: u32 = 0u; i < tCount; i = i + 1u) {
      let tl = scene.tiles[i];
      let flags = u32(tl.props.z);
      if ((flags & 1u) == 0u) {
        continue;
      }
      // Fast local proximity filter
      let dx = abs(p.x - tl.posRad.x);
      let dz = abs(p.z - tl.posRad.z);
      if (dx > pitch * 1.15 || dz > pitch * 1.15) {
        continue;
      }
      let dir = u32(tl.props.y);
      let backOff = -dirOffsetXZ(dir) * (pitch * 0.085);
      let spCenter = vec3<f32>(tl.posRad.x + backOff.x, tl.posRad.y, tl.posRad.z + backOff.y);
      if (intersectSphere(orig, sunDir, spCenter, tl.posRad.w) > 0.0) {
        shadow *= 0.60;
      }
    }
  }

  // Zone 4: Flying pearl shadows
  let fCount = min(u32(scene.countsMeta.z), 8u);
  if (fCount > 0u) {
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
      let fp = scene.flyingPearls[i];
      if (fp.props.y > 0.5) {
        if (intersectSphere(orig, sunDir, fp.posRad.xyz, fp.posRad.w) > 0.0) {
          shadow *= 0.68;
        }
      }
    }
  }

  return max(shadow, 0.44);
}

fn shadeAtelierDesk(p: vec3<f32>, rd: vec3<f32>) -> vec3<f32> {
  let sunDir = normalize(scene.sunDir.xyz);
  let hoopC = scene.hoopBounds.xy;
  let hoopR = scene.hoopBounds.z;
  let trayZ = scene.hoopBounds.w;
  let boardC = scene.boardBounds.xy;
  let boardHalf = scene.boardBounds.zw;
  let celebrate = scene.linenTint.w;

  // Fine woven atelier linen micro-texture
  let weaveX = sin(p.x * 54.0);
  let weaveZ = sin(p.z * 54.0);
  let weave = 0.97 + 0.03 * (weaveX * 0.5 + weaveZ * 0.5);

  var albedo = scene.linenTint.rgb * weave;
  var normal = vec3<f32>(0.0, 1.0, 0.0);
  var metallic: f32 = 0.0;
  var roughness: f32 = 0.85;
  var emissive = vec3<f32>(0.0);

  // Subtle warm radial studio desk vignette
  let deskDist = length(p.xz * vec2<f32>(0.36, 0.21));
  albedo *= clamp(1.04 - deskDist * 0.22, 0.72, 1.05);

  // =========================================================================
  // ZONE 1: Champagne-Brass Embroidery Hoop + Taut Aida Fabric + Stitch Dots
  // =========================================================================
  let hpLocal = p.xz - hoopC;
  let hpDist = length(hpLocal);
  if (hpDist < hoopR + 0.28) {
    // Soft outer hoop cast shadow on linen desk
    let shadowOffset = hpLocal + sunDir.xz * 0.08;
    let outerShadowD = abs(length(shadowOffset) - hoopR);
    if (outerShadowD < 0.14 && hpDist > hoopR - 0.05) {
      albedo *= mix(0.76, 1.0, smoothstep(0.05, 0.14, outerShadowD));
    }

    // Inner taut embroidery aida cloth
    if (hpDist < hoopR - 0.055) {
      let aida = 0.96 + 0.04 * (sin(p.x * 78.0) * sin(p.z * 78.0));
      albedo = (scene.linenTint.rgb * 1.07 + vec3<f32>(0.03, 0.025, 0.015)) * aida;
      // Soft inner shadow right inside brass hoop wall
      let innerEdge = smoothstep(hoopR - 0.055, hoopR - 0.20, hpDist);
      albedo *= mix(0.84, 1.0, innerEdge);

      // Delicate stitch guide pinholes on the hoop
      let hCount = min(u32(scene.countsMeta.x), 32u);
      for (var i: u32 = 0u; i < hCount; i = i + 1u) {
        let hp = scene.hoopPearls[i];
        let dDot = length(p.xz - hp.posRad.xz);
        let bloom = hp.props.y;
        let isActive = hp.props.w;
        let pal = getPalette(hp.props.x).rgb;
        if (bloom < 0.95 && dDot < 0.125) {
          // Crisp colored silk eyelet pinhole with warm metallic bezel
          let ring = smoothstep(0.085, 0.062, dDot) - smoothstep(0.038, 0.022, dDot);
          let centerPin = smoothstep(0.028, 0.012, dDot);
          let pulse = 0.5 + 0.5 * sin(renderU.time * 3.0 + f32(i) * 0.4);
          let boost = mix(0.62, 0.98, isActive);
          albedo = mix(albedo, pal * 0.78, ring * boost);
          albedo = mix(albedo, vec3<f32>(0.32, 0.24, 0.17), centerPin * 0.78);
          if (isActive > 0.5) {
            let glowHalo = smoothstep(0.125, 0.055, dDot) * (0.28 + 0.20 * pulse);
            emissive += pal * glowHalo;
          }
        }
        // Arrival & celebration pearlescent sparkle ring
        let spark = max(hp.props.z, celebrate * (0.5 + 0.5 * sin(renderU.time * 6.0 + f32(i))));
        if (spark > 0.02 && dDot < 0.28) {
          let ringR = 0.13 + (1.0 - spark) * 0.12;
          let ringMask = exp(-pow((dDot - ringR) / 0.028, 2.0)) * spark;
          emissive += mix(vec3<f32>(1.0, 0.92, 0.72), pal, 0.4) * ringMask * 0.75;
        }
      }
    }

    // 3D curved champagne-brass embroidery hoop ring
    let rimDist = abs(hpDist - hoopR);
    if (rimDist < 0.072) {
      let profile = clamp((hpDist - hoopR) / 0.072, -1.0, 1.0);
      let radDir = normalize(hpLocal + vec2<f32>(0.0001));
      normal = normalize(vec3<f32>(radDir.x * profile * 0.75, sqrt(max(0.05, 1.0 - profile * profile * 0.56)), radDir.y * profile * 0.75));
      let brush = 0.94 + 0.06 * sin(atan2(hpLocal.y, hpLocal.x) * 42.0);
      albedo = vec3<f32>(0.86, 0.73, 0.48) * brush;
      metallic = 0.78;
      roughness = 0.24;
      if (celebrate > 0.01) {
        emissive += vec3<f32>(0.95, 0.78, 0.42) * celebrate * 0.35;
      }
    }

    // Iconic top brass tightening clasp screw at 12 o'clock of the hoop
    let claspP = hpLocal - vec2<f32>(0.0, -(hoopR + 0.105));
    let claspD = sdRoundedBox2D(claspP, vec2<f32>(0.13, 0.065), 0.025);
    if (claspD < 0.0) {
      albedo = vec3<f32>(0.84, 0.70, 0.44);
      metallic = 0.84;
      roughness = 0.22;
      normal = normalize(vec3<f32>(claspP.x * 2.2, 1.0, claspP.y * 2.2));
    }
  }

  // =========================================================================
  // ZONE 2: 5-Slot Recessed Porcelain Silk Holding Tray
  // =========================================================================
  let trayLocal = vec2<f32>(p.x, p.z - trayZ);
  let trayHalf = vec2<f32>(1.66, 0.29);
  let dTray = sdRoundedBox2D(trayLocal, trayHalf, 0.16);
  if (dTray < 0.14) {
    // Soft contact drop shadow under tray
    let dTrayShad = sdRoundedBox2D(trayLocal + sunDir.xz * 0.055, trayHalf, 0.16);
    if (dTray > 0.0 && dTrayShad < 0.08) {
      albedo *= mix(0.80, 1.0, smoothstep(-0.02, 0.08, dTrayShad));
    }
    if (dTray <= 0.0) {
      let bevel = smoothstep(0.0, -0.055, dTray);
      albedo = mix(scene.linenTint.rgb * 0.85, scene.linenTint.rgb * 1.06 + vec3<f32>(0.05, 0.04, 0.03), bevel);
      roughness = 0.36;
      // Subtle gold trim line around the porcelain tray
      if (dTray > -0.022) {
        albedo = vec3<f32>(0.84, 0.72, 0.49);
        metallic = 0.68;
        roughness = 0.28;
      }

      // 5 concave recessed silk dimples
      let spacing = scene.hintInfo.y;
      for (var s: i32 = 0; s < 5; s = s + 1) {
        let sx = (f32(s) - 2.0) * spacing;
        let dp = vec2<f32>(p.x - sx, p.z - trayZ);
        let rDimple = length(dp);
        if (rDimple < 0.22) {
          let slope = clamp(rDimple / 0.22, 0.0, 1.0);
          // Concave inward normal!
          normal = normalize(vec3<f32>(-dp.x * 2.1, 1.0, -dp.y * 2.1));
          albedo *= mix(0.84, 0.96, slope * slope);
          roughness = 0.52;
        }
      }
    }
  }

  // =========================================================================
  // ZONE 3: Pearl Untangle Craft Board & Beveled Directional Porcelain Tiles
  // =========================================================================
  let bLocal = p.xz - boardC;
  let frameHalf = boardHalf + vec2<f32>(0.14, 0.14);
  let dFrame = sdRoundedBox2D(bLocal, frameHalf, 0.18);
  if (dFrame < 0.14) {
    if (dFrame > 0.0) {
      albedo *= mix(0.84, 1.0, smoothstep(0.0, 0.12, dFrame));
    } else {
      // Slightly recessed felt/linen board mat
      albedo *= 0.91;
      if (dFrame > -0.024) {
        albedo = mix(albedo, vec3<f32>(0.82, 0.70, 0.48), 0.75);
        metallic = 0.55;
      }

      let tCount = min(u32(scene.boardMeta.w), 25u);
      let pitch = scene.boardMeta.z;
      let tileHalf = pitch * 0.43;

      for (var i: u32 = 0u; i < tCount; i = i + 1u) {
        let tl = scene.tiles[i];
        let flags = u32(tl.props.z);
        if ((flags & 1u) == 0u) {
          continue;
        }
        let dLocal = p.xz - tl.posRad.xz;
        if (abs(dLocal.x) > pitch * 0.54 || abs(dLocal.y) > pitch * 0.54) {
          continue;
        }

        let dTile = sdRoundedBox2D(dLocal, vec2<f32>(tileHalf), pitch * 0.12);
        let unblocked = (flags & 2u) != 0u;
        let hinted = (flags & 4u) != 0u;

        // Soft tile drop shadow
        let dTileShad = sdRoundedBox2D(dLocal + sunDir.xz * 0.04, vec2<f32>(tileHalf), pitch * 0.12);
        if (dTile > 0.0 && dTileShad < 0.055) {
          albedo *= mix(0.74, 1.0, smoothstep(-0.01, 0.055, dTileShad));
        }

        // Calm breathing champagne-gold Hint aura
        if (hinted && dTile > -0.03 && dTile < 0.11) {
          let hPulse = 0.55 + 0.45 * sin(renderU.time * 4.5);
          let aura = exp(-pow(max(dTile, 0.0) / 0.048, 2.0)) * hPulse;
          emissive += vec3<f32>(1.0, 0.84, 0.40) * aura * 1.1;
        }

        if (dTile <= 0.0) {
          let pal = getPalette(tl.props.x).rgb;
          let edgeBevel = smoothstep(0.0, -0.045, dTile);
          // Warm porcelain cushion tile subtly tinted with its pearl family
          var tileCol = mix(scene.linenTint.rgb * 0.96, vec3<f32>(0.97, 0.95, 0.91) * (0.45 + 0.55 * scene.linenTint.r), 0.55);
          tileCol = mix(tileCol, pal, 0.10);
          if (!unblocked) {
            tileCol *= 0.89;
          }
          albedo = mix(tileCol * 0.84, tileCol, edgeBevel);
          roughness = 0.34;

          // Subtle raised luminous rim on unblocked tiles (Nintendo visual affordance!)
          if (unblocked && dTile > -0.022) {
            let rimBreath = 0.72 + 0.28 * sin(renderU.time * 2.2 + f32(i));
            albedo = mix(albedo, vec3<f32>(0.92, 0.80, 0.55), 0.65);
            emissive += vec3<f32>(0.32, 0.26, 0.14) * rimBreath * 0.22;
            metallic = 0.45;
          }

          // Crisp inlaid directional chevron arrow pointing outward in front of the pearl
          let dir = u32(tl.props.y);
          let rot = rotateForDir(dLocal, dir);
          let arrowCenter = rot - vec2<f32>(0.0, -pitch * 0.295);
          let dArrow = sdChevron(arrowCenter, pitch * 0.135, pitch * 0.032);
          if (dArrow < 0.008) {
            let aa = smoothstep(0.008, -0.006, dArrow);
            let arrowCol = select(vec3<f32>(0.32, 0.26, 0.22), vec3<f32>(0.72, 0.46, 0.14), unblocked);
            albedo = mix(albedo, arrowCol, aa);
            metallic = mix(metallic, select(0.25, 0.86, unblocked), aa);
            roughness = mix(roughness, 0.22, aa);
            if (unblocked) {
              emissive += vec3<f32>(0.26, 0.16, 0.04) * aa * 0.38;
            }
          }
        }
      }
    }
  }

  // Compute physically shaded desk lighting + soft cast shadows from pearls
  let shadow = computeDeskShadow(p, sunDir);
  let ndotl = max(dot(normal, sunDir), 0.0);
  let direct = scene.sunColor.rgb * ndotl * scene.sunDir.w * shadow;

  let v = -rd;
  let hVec = normalize(sunDir + v);
  let shininess = mix(72.0, 10.0, clamp(roughness, 0.0, 1.0));
  let spec = pow(max(dot(normal, hVec), 0.0), shininess) * shadow * scene.sunDir.w * mix(0.18, 0.95, metallic);

  // Evening warm candle fill across the desk
  let candlePos = vec3<f32>(2.3, 2.4, -2.5);
  let toCandle = candlePos - p;
  let candleDistSq = max(dot(toCandle, toCandle), 1.5);
  let candleDir = normalize(toCandle);
  let candleAtten = scene.sunColor.w * (8.5 / (1.0 + candleDistSq * 0.22));
  let candleDiff = max(dot(normal, candleDir), 0.0) * candleAtten * shadow;
  let candleHalf = normalize(candleDir + v);
  let candleSpec = pow(max(dot(normal, candleHalf), 0.0), shininess) * candleAtten * shadow * mix(0.12, 0.85, metallic);
  let candleCol = vec3<f32>(1.0, 0.76, 0.44);

  let ambient = scene.ambientSky.rgb * (0.65 + 0.35 * normal.y);
  var color = albedo * (ambient + direct * 0.86 + candleCol * candleDiff * 0.52);
  color += mix(scene.sunColor.rgb, albedo, metallic * 0.65) * spec;
  color += candleCol * candleSpec;
  if (metallic > 0.3) {
    color = mix(color, skyReflection(reflect(rd, normal)) * albedo, metallic * 0.35);
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

  // Primary ray-desk intersection (y = 0) used both as backdrop and spatial early-out guide
  var tDesk = MAX_DIST;
  var pDesk = vec3<f32>(0.0);
  if (rd.y < -0.001) {
    tDesk = -ro.y / rd.y;
    pDesk = ro + rd * tDesk;
  }

  // Test 3D raytraced pearls using spatial zone partitioning (huge GPU & battery win!)
  var bestT = tDesk;
  var hitPearl = false;
  var hitPos = vec3<f32>(0.0);
  var hitNormal = vec3<f32>(0.0, 1.0, 0.0);
  var hitColor = vec3<f32>(1.0);
  var hitIrid: f32 = 0.5;
  var hitSpark: f32 = 0.0;
  var hitBoost: f32 = 0.0;

  let hoopC = scene.hoopBounds.xy;
  let hoopR = scene.hoopBounds.z;
  let trayZ = scene.hoopBounds.w;
  let boardC = scene.boardBounds.xy;
  let boardHalf = scene.boardBounds.zw;
  let celebrate = scene.linenTint.w;

  // Zone 1: Stitched Embroidery Hoop Pearls
  if (length(pDesk.xz - hoopC) < hoopR + 0.35) {
    let hCount = min(u32(scene.countsMeta.x), 32u);
    for (var i: u32 = 0u; i < hCount; i = i + 1u) {
      let hp = scene.hoopPearls[i];
      let bloom = hp.props.y;
      if (bloom <= 0.02) {
        continue;
      }
      let r = hp.posRad.w * (0.25 + 0.75 * bloom);
      let tHit = intersectSphere(ro, rd, hp.posRad.xyz, r);
      if (tHit > EPS && tHit < bestT) {
        bestT = tHit;
        hitPearl = true;
        hitPos = ro + rd * tHit;
        hitNormal = normalize(hitPos - hp.posRad.xyz);
        let pal = getPalette(hp.props.x);
        hitColor = pal.rgb;
        hitIrid = pal.w;
        hitSpark = max(hp.props.z, celebrate * (0.5 + 0.5 * sin(renderU.time * 5.0 + f32(i))));
        hitBoost = 0.15;
      }
    }
  }

  // Zone 2: 5-Slot Silk Holding Tray Pearls
  if (abs(pDesk.z - trayZ) < 0.55) {
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
        let pal = getPalette(tp.props.x);
        hitColor = pal.rgb;
        hitIrid = pal.w;
        hitSpark = tp.props.z * 0.5;
        hitBoost = 0.05;
      }
    }
  }

  // Zone 3: Untangle Board Pearls (local proximity early-out)
  if (abs(pDesk.x - boardC.x) < boardHalf.x + 0.45 && abs(pDesk.z - boardC.y) < boardHalf.y + 0.45) {
    let tCount = min(u32(scene.boardMeta.w), 25u);
    let pitch = scene.boardMeta.z;
    for (var i: u32 = 0u; i < tCount; i = i + 1u) {
      let tl = scene.tiles[i];
      let flags = u32(tl.props.z);
      if ((flags & 1u) == 0u) {
        continue;
      }
      if (abs(pDesk.x - tl.posRad.x) > pitch * 0.72 || abs(pDesk.z - tl.posRad.z) > pitch * 0.72) {
        continue;
      }
      let dir = u32(tl.props.y);
      let backOff = -dirOffsetXZ(dir) * (pitch * 0.085);
      let spCenter = vec3<f32>(tl.posRad.x + backOff.x, tl.posRad.y, tl.posRad.z + backOff.y);
      let tHit = intersectSphere(ro, rd, spCenter, tl.posRad.w);
      if (tHit > EPS && tHit < bestT) {
        bestT = tHit;
        hitPearl = true;
        hitPos = ro + rd * tHit;
        hitNormal = normalize(hitPos - spCenter);
        let pal = getPalette(tl.props.x);
        hitColor = pal.rgb;
        hitIrid = pal.w;
        let hinted = (flags & 4u) != 0u;
        let unblocked = (flags & 2u) != 0u;
        hitSpark = select(0.0, 0.35 + 0.25 * sin(renderU.time * 4.5), hinted);
        hitBoost = select(0.0, 1.0, unblocked);
      }
    }
  }

  // Zone 4: Flying Pearls (arcing above the desk)
  if (u32(scene.countsMeta.z) > 0u) {
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
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
        let pal = getPalette(fp.props.x);
        hitColor = pal.rgb;
        hitIrid = pal.w;
        hitSpark = 0.42;
        hitBoost = 1.0;
      }
    }
  }

  var finalCol = vec3<f32>(0.0);
  if (hitPearl) {
    finalCol = shadePearl(hitPos, hitNormal, rd, hitColor, hitIrid, hitSpark, hitBoost);
  } else if (tDesk < MAX_DIST) {
    finalCol = shadeAtelierDesk(pDesk, rd);
  } else {
    finalCol = skyReflection(rd);
  }

  let mapped = acesToneMap(finalCol * 1.08);
  let gamma = pow(mapped, vec3<f32>(1.0 / 2.2));
  return vec4<f32>(gamma, 1.0);
}
