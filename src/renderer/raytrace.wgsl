struct RenderUniforms {
  resolution: vec2<f32>,
  time: f32,
  _pad: f32,
};

struct Sphere {
  centerRadius: vec4<f32>,  // xyz = center, w = radius
  albedoReflect: vec4<f32>, // rgb = albedo, w = reflectivity
  emissiveRough: vec4<f32>, // rgb = emissive, w = roughness
};

struct SceneData {
  cameraPos: vec4<f32>,    // xyz = pos, w = elapsed
  cameraTarget: vec4<f32>, // xyz = target, w = fovY
  lightDir: vec4<f32>,     // xyz = light dir, w = collection pulse
  sceneInfo: vec4<f32>,         // x = sphereCount, y = score, z = arenaHalfW, w = arenaHalfD
  spheres: array<Sphere, 8>,
};

@group(0) @binding(0) var<uniform> renderU: RenderUniforms;
@group(0) @binding(1) var<uniform> scene: SceneData;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  // Full-screen triangle covering clip space [-1, 1]
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

struct Hit {
  t: f32,
  pos: vec3<f32>,
  normal: vec3<f32>,
  albedo: vec3<f32>,
  emissive: vec3<f32>,
  reflectivity: f32,
  roughness: f32,
  hit: bool,
};

const MAX_DIST: f32 = 100.0;
const EPS: f32 = 0.0015;

fn skyColor(rd: vec3<f32>, lightDir: vec3<f32>, pulse: f32) -> vec3<f32> {
  let t = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  let horizon = vec3<f32>(0.11, 0.16, 0.28) + vec3<f32>(0.08, 0.18, 0.24) * pulse;
  let zenith = vec3<f32>(0.02, 0.04, 0.10);
  var col = mix(horizon, zenith, pow(t, 0.65));
  let sunAmt = max(dot(rd, lightDir), 0.0);
  col += vec3<f32>(1.0, 0.86, 0.68) * pow(sunAmt, 48.0) * 1.1;
  col += vec3<f32>(0.35, 0.55, 0.95) * pow(sunAmt, 6.0) * 0.18;
  return col;
}

fn intersectScene(ro: vec3<f32>, rd: vec3<f32>) -> Hit {
  var best: Hit;
  best.t = MAX_DIST;
  best.hit = false;

  // Ground plane y = 0
  if (abs(rd.y) > 0.0001) {
    let tPlane = -ro.y / rd.y;
    if (tPlane > EPS && tPlane < best.t) {
      let p = ro + rd * tPlane;
      let halfW = scene.sceneInfo.z;
      let halfD = scene.sceneInfo.w;
      let insideX = abs(p.x) <= halfW;
      let insideZ = abs(p.z) <= halfD;
      let edgeX = abs(abs(p.x) - halfW);
      let edgeZ = abs(abs(p.z) - halfD);
      let onBorder =
        (edgeX < 0.055 && abs(p.z) <= halfD + 0.055) ||
        (edgeZ < 0.055 && abs(p.x) <= halfW + 0.055);

      let checker = (i32(floor(p.x * 1.25)) + i32(floor(p.z * 1.25))) & 1;
      var floorCol = select(vec3<f32>(0.05, 0.07, 0.12), vec3<f32>(0.10, 0.13, 0.21), checker == 0);
      var refl = select(0.32, 0.42, checker == 0);
      var emis = vec3<f32>(0.0);

      if (!insideX || !insideZ) {
        floorCol *= 0.42;
        refl = 0.18;
      }
      if (onBorder) {
        let glow = 0.75 + 0.65 * scene.lightDir.w;
        emis = vec3<f32>(0.16, 0.72, 1.0) * glow;
        floorCol = vec3<f32>(0.25, 0.82, 1.0);
        refl = 0.2;
      }

      best.t = tPlane;
      best.pos = p;
      best.normal = vec3<f32>(0.0, 1.0, 0.0);
      best.albedo = floorCol;
      best.emissive = emis;
      best.reflectivity = refl;
      best.roughness = 0.18;
      best.hit = true;
    }
  }

  let count = min(u32(scene.sceneInfo.x), 8u);
  for (var i: u32 = 0u; i < count; i = i + 1u) {
    let sp = scene.spheres[i];
    let oc = ro - sp.centerRadius.xyz;
    let r = sp.centerRadius.w;
    let b = dot(oc, rd);
    let c = dot(oc, oc) - r * r;
    let disc = b * b - c;
    if (disc > 0.0) {
      let s = sqrt(disc);
      var tHit = -b - s;
      if (tHit <= EPS) {
        tHit = -b + s;
      }
      if (tHit > EPS && tHit < best.t) {
        let p = ro + rd * tHit;
        best.t = tHit;
        best.pos = p;
        best.normal = normalize(p - sp.centerRadius.xyz);
        best.albedo = sp.albedoReflect.rgb;
        best.emissive = sp.emissiveRough.rgb;
        best.reflectivity = sp.albedoReflect.w;
        best.roughness = sp.emissiveRough.w;
        best.hit = true;
      }
    }
  }

  return best;
}

fn shadowVisibility(origin: vec3<f32>, lightDir: vec3<f32>) -> f32 {
  let count = min(u32(scene.sceneInfo.x), 8u);
  for (var i: u32 = 0u; i < count; i = i + 1u) {
    let sp = scene.spheres[i];
    let oc = origin - sp.centerRadius.xyz;
    let r = sp.centerRadius.w;
    let b = dot(oc, lightDir);
    let c = dot(oc, oc) - r * r;
    let disc = b * b - c;
    if (disc > 0.0) {
      let tHit = -b - sqrt(disc);
      if (tHit > EPS) {
        return 0.22;
      }
    }
  }
  return 1.0;
}

fn shadeHit(h: Hit, rd: vec3<f32>, lightDir: vec3<f32>) -> vec3<f32> {
  let n = h.normal;
  let v = -rd;
  let ndotl = max(dot(n, lightDir), 0.0);
  let vis = select(0.22, shadowVisibility(h.pos + n * 0.004, lightDir), ndotl > 0.0);

  // Key directional sun + Blinn-Phong specular
  let halfVec = normalize(lightDir + v);
  let shininess = mix(96.0, 12.0, clamp(h.roughness, 0.0, 1.0));
  let spec = pow(max(dot(n, halfVec), 0.0), shininess) * vis;

  // Dynamic point light from the radiant collectible gem (sphere 1)
  let gemPos = scene.spheres[1].centerRadius.xyz;
  let toGem = gemPos - h.pos;
  let gemDistSq = max(dot(toGem, toGem), 0.16);
  let gemDir = normalize(toGem);
  let gemAtten = 1.65 / (1.0 + gemDistSq * 0.65);
  let gemNdotL = max(dot(n, gemDir), 0.0);
  let gemLight = vec3<f32>(1.0, 0.56, 0.22) * gemNdotL * gemAtten;

  // Subtle rim cyan bounce from the player orb (sphere 0)
  let playerPos = scene.spheres[0].centerRadius.xyz;
  let toPlayer = playerPos - h.pos;
  let playerDistSq = max(dot(toPlayer, toPlayer), 0.25);
  let playerDir = normalize(toPlayer);
  let playerLight = vec3<f32>(0.24, 0.78, 1.0) * max(dot(n, playerDir), 0.0) * (0.65 / (1.0 + playerDistSq));

  let ambient = vec3<f32>(0.10, 0.13, 0.22) * (0.5 + 0.5 * n.y);
  let direct = vec3<f32>(1.0, 0.96, 0.90) * ndotl * vis * 1.15;

  var color = h.albedo * (ambient + direct + gemLight + playerLight);
  color += vec3<f32>(1.0, 0.97, 0.92) * spec * 0.75;
  color += h.emissive;

  // Atmospheric distance fog so the arena melts smoothly into the horizon
  let fog = 1.0 - exp(-h.t * 0.032);
  let fogCol = vec3<f32>(0.05, 0.08, 0.15);
  return mix(color, fogCol, clamp(fog, 0.0, 0.85));
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
  let lightDir = normalize(scene.lightDir.xyz);
  let pulse = scene.lightDir.w;

  let forward = normalize(camTarget - camPos);
  let right = normalize(cross(forward, vec3<f32>(0.0, 1.0, 0.0)));
  let up = cross(right, forward);

  let tanHalfFov = tan(fovY * 0.5);
  var ro = camPos;
  var rd = normalize(forward + right * (ndc.x * aspect * tanHalfFov) + up * (ndc.y * tanHalfFov));

  var accum = vec3<f32>(0.0);
  var throughput = vec3<f32>(1.0);

  // 3-bounce real-time raytracing loop (primary + 2 mirror reflections)
  for (var bounce: u32 = 0u; bounce < 3u; bounce = bounce + 1u) {
    let hit = intersectScene(ro, rd);
    if (!hit.hit) {
      accum += throughput * skyColor(rd, lightDir, pulse);
      break;
    }

    let cosTheta = clamp(dot(-rd, hit.normal), 0.0, 1.0);
    let fresnel = hit.reflectivity + (1.0 - hit.reflectivity) * pow(1.0 - cosTheta, 5.0) * 0.45;
    let localCol = shadeHit(hit, rd, lightDir);

    accum += throughput * localCol * (1.0 - fresnel * 0.72);
    throughput *= mix(vec3<f32>(1.0), hit.albedo, 0.45) * fresnel;

    if (max(throughput.x, max(throughput.y, throughput.z)) < 0.04) {
      break;
    }

    ro = hit.pos + hit.normal * 0.004;
    rd = reflect(rd, hit.normal);
  }

  let mapped = acesToneMap(accum * 1.15);
  let gamma = pow(mapped, vec3<f32>(1.0 / 2.2));
  return vec4<f32>(gamma, 1.0);
}
