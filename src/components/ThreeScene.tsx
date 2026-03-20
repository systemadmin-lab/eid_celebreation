"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float iGlobalTime;
  uniform vec2 iResolution;

  const int NUM_STEPS = 8;
  const float PI = 3.1415;
  const float EPSILON = 1e-3;
  #define EPSILON_NRM (0.1 / iResolution.x)

  const int ITER_GEOMETRY = 3;
  const int ITER_FRAGMENT = 5;
  const float SEA_HEIGHT = 0.6;
  const float SEA_CHOPPY = 1.0;
  const float SEA_SPEED = 1.0;
  const float SEA_FREQ = 0.16;
  const vec3 SEA_BASE = vec3(0.04, 0.07, 0.14);
  const vec3 SEA_WATER_COLOR = vec3(0.45, 0.6, 0.7);
  #define SEA_TIME (iGlobalTime * SEA_SPEED)
  mat2 octave_m = mat2(1.6, 1.2, -1.2, 1.6);

  mat3 fromEuler(vec3 ang) {
    vec2 a1 = vec2(sin(ang.x), cos(ang.x));
    vec2 a2 = vec2(sin(ang.y), cos(ang.y));
    vec2 a3 = vec2(sin(ang.z), cos(ang.z));
    mat3 m;
    m[0] = vec3(a1.y*a3.y+a1.x*a2.x*a3.x, a1.y*a2.x*a3.x+a3.y*a1.x, -a2.y*a3.x);
    m[1] = vec3(-a2.y*a1.x, a1.y*a2.y, a2.x);
    m[2] = vec3(a3.y*a1.x*a2.x+a1.y*a3.x, a1.x*a3.x-a1.y*a3.y*a2.x, a2.y*a3.y);
    return m;
  }

  float hash(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
  }

  float noise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return -1.0 + 2.0 * mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float diffuse(vec3 n, vec3 l, float p) {
    return pow(dot(n, l) * 0.4 + 0.6, p);
  }

  float specular(vec3 n, vec3 l, vec3 e, float s) {
    float nrm = (s + 8.0) / (3.1415 * 8.0);
    return pow(max(dot(reflect(e, n), l), 0.0), s) * nrm;
  }

  // ── realistic stars ──
  float starHash(vec2 p) {
    return fract(sin(dot(p, vec2(23.14069, 78.233))) * 43758.5453);
  }

  vec3 renderStars(vec3 dir) {
    vec3 col = vec3(0.0);
    // project direction onto a 2D plane for star grid
    vec2 uv = dir.xz / (abs(dir.y) + 0.15);

    // multiple layers for depth: distant tiny + closer brighter
    for(int layer = 0; layer < 3; layer++) {
      float scale = 80.0 + float(layer) * 60.0;
      vec2 grid = floor(uv * scale);
      vec2 f = fract(uv * scale) - 0.5;

      float h = starHash(grid + float(layer) * 100.0);
      if(h > 0.92) {
        // randomize position within cell for natural look
        vec2 offset = vec2(starHash(grid * 1.3) - 0.5, starHash(grid * 2.7) - 0.5) * 0.6;
        float d = length(f - offset);

        // star size varies: brighter stars are slightly larger
        float brightness = (h - 0.92) / 0.08;  // 0 to 1
        float radius = 0.02 + brightness * 0.04;
        float star = 1.0 - smoothstep(0.0, radius, d);
        star *= star; // sharper falloff

        // subtle twinkle
        float twinkle = 0.7 + 0.3 * sin(iGlobalTime * (1.5 + h * 3.0) + h * 100.0);
        star *= twinkle;

        // color temperature: most white, some warm, some blue
        vec3 starCol = vec3(1.0);
        if(h > 0.98) starCol = vec3(0.8, 0.85, 1.0); // blue-white
        else if(h > 0.96) starCol = vec3(1.0, 0.92, 0.8); // warm

        col += starCol * star * brightness * 0.8;
      }
    }
    // fade stars near horizon
    col *= smoothstep(0.0, 0.2, dir.y);
    return col;
  }

  // ── shooting stars ──
  vec3 renderShootingStar(vec3 dir, float seed) {
    // each shooting star has its own timing cycle
    float cycle = 6.0 + seed * 8.0; // 6-14 second cycles
    float t = mod(iGlobalTime + seed * 50.0, cycle);
    float isActive = step(cycle - 1.2, t); // visible for ~1.2 seconds at end of cycle

    if(isActive < 0.5) return vec3(0.0);

    float progress = (t - (cycle - 1.2)) / 1.2; // 0 to 1

    // start and end positions in the sky
    float angle = seed * 6.28;
    vec2 startPos = vec2(cos(angle) * 0.5, 0.4 + seed * 0.3);
    vec2 endPos = startPos + vec2(cos(angle - 0.5) * 0.6, -0.25);
    vec2 currentPos = mix(startPos, endPos, progress);

    // project ray direction to 2D
    vec2 rayUV = dir.xz / (dir.y + 0.2);

    // streak: line from trail to head
    vec2 headPos = currentPos;
    vec2 tailPos = mix(startPos, endPos, max(progress - 0.3, 0.0));
    vec2 lineDir = normalize(headPos - tailPos);
    float lineLen = length(headPos - tailPos);

    // distance from point to line segment
    vec2 toPoint = rayUV - tailPos;
    float along = clamp(dot(toPoint, lineDir), 0.0, lineLen);
    vec2 closest = tailPos + lineDir * along;
    float dist = length(rayUV - closest);

    // thin streak with brighter head
    float streak = exp(-dist * 300.0);
    float headBright = exp(-length(rayUV - headPos) * 150.0);
    float fade = along / max(lineLen, 0.001); // brighter toward head

    // fade out at the end
    float alpha = 1.0 - smoothstep(0.8, 1.0, progress);
    vec3 col = vec3(0.9, 0.95, 1.0) * (streak * fade + headBright * 2.0) * alpha;
    col *= smoothstep(0.0, 0.15, dir.y); // no shooting stars below horizon

    return col;
  }

  vec3 getSkyColor(vec3 e) {
    e.y = max(e.y, 0.0);
    // brighter night gradient
    vec3 nightBase = vec3(0.02, 0.02, 0.06);
    vec3 nightHorizon = vec3(0.05, 0.06, 0.12);
    vec3 ret = mix(nightHorizon, nightBase, pow(e.y, 0.5));

    // realistic stars
    ret += renderStars(e);

    // shooting stars (3 independent streaks with different timings)
    ret += renderShootingStar(e, 0.2);
    ret += renderShootingStar(e, 0.55);
    ret += renderShootingStar(e, 0.85);

    // ── 1-day-old waxing crescent moon (2x larger, white only) ──
    vec3 moonDir = normalize(vec3(-0.3, 0.7, -0.5));
    float moonAngle = acos(dot(normalize(e), moonDir));
    float moonRadius = 0.09;

    // moon disc
    float moonDisc = 1.0 - smoothstep(moonRadius - 0.002, moonRadius + 0.002, moonAngle);

    // shadow disc offset for 1-day moon ~3% illumination
    vec3 moonRight = normalize(cross(moonDir, vec3(0.0, 1.0, 0.0)));
    vec3 shadowDir = normalize(moonDir + moonRight * 0.015);
    float shadowAngle = acos(dot(normalize(e), shadowDir));
    float shadowDisc = 1.0 - smoothstep(moonRadius - 0.002, moonRadius + 0.002, shadowAngle);

    // crescent = moon minus shadow (only white part visible)
    float crescent = clamp(moonDisc - shadowDisc, 0.0, 1.0);
    ret += vec3(1.0, 0.98, 0.92) * crescent;

    // soft halo glow
    float halo = pow(max(dot(normalize(e), moonDir), 0.0), 10.0);
    ret += vec3(0.06, 0.06, 0.1) * halo;

    return ret;
  }

  float sea_octave(vec2 uv, float choppy) {
    uv += noise(uv);
    vec2 wv = 1.0 - abs(sin(uv));
    vec2 swv = abs(cos(uv));
    wv = mix(wv, swv, wv);
    return pow(1.0 - pow(wv.x * wv.y, 0.65), choppy);
  }

  float map(vec3 p) {
    float freq = SEA_FREQ;
    float amp = SEA_HEIGHT;
    float choppy = SEA_CHOPPY;
    vec2 uv = p.xz;
    uv.x *= 0.75;
    float d, h = 0.0;
    for(int i = 0; i < ITER_GEOMETRY; i++) {
      d = sea_octave((uv + SEA_TIME) * freq, choppy);
      d += sea_octave((uv - SEA_TIME) * freq, choppy);
      h += d * amp;
      uv *= octave_m;
      freq *= 1.9;
      amp *= 0.22;
      choppy = mix(choppy, 1.0, 0.2);
    }
    return p.y - h;
  }

  float map_detailed(vec3 p) {
    float freq = SEA_FREQ;
    float amp = SEA_HEIGHT;
    float choppy = SEA_CHOPPY;
    vec2 uv = p.xz;
    uv.x *= 0.75;
    float d, h = 0.0;
    for(int i = 0; i < ITER_FRAGMENT; i++) {
      d = sea_octave((uv + SEA_TIME) * freq, choppy);
      d += sea_octave((uv - SEA_TIME) * freq, choppy);
      h += d * amp;
      uv *= octave_m;
      freq *= 1.9;
      amp *= 0.22;
      choppy = mix(choppy, 1.0, 0.2);
    }
    return p.y - h;
  }

  vec3 getSeaColor(vec3 p, vec3 n, vec3 l, vec3 eye, vec3 dist) {
    float fresnel = 1.0 - max(dot(n, -eye), 0.0);
    fresnel = pow(fresnel, 3.0) * 0.65;
    vec3 reflected = getSkyColor(reflect(eye, n));
    vec3 refracted = SEA_BASE + diffuse(n, l, 80.0) * SEA_WATER_COLOR * 0.12;
    vec3 color = mix(refracted, reflected, fresnel);
    float atten = max(1.0 - dot(dist, dist) * 0.001, 0.0);
    color += SEA_WATER_COLOR * (p.y - SEA_HEIGHT) * 0.18 * atten;
    color += vec3(specular(n, l, eye, 60.0));
    return color;
  }

  vec3 getNormal(vec3 p, float eps) {
    vec3 n;
    n.y = map_detailed(p);
    n.x = map_detailed(vec3(p.x + eps, p.y, p.z)) - n.y;
    n.z = map_detailed(vec3(p.x, p.y, p.z + eps)) - n.y;
    n.y = eps;
    return normalize(n);
  }

  float heightMapTracing(vec3 ori, vec3 dir, out vec3 p) {
    float tm = 0.0;
    float tx = 1000.0;
    float hx = map(ori + dir * tx);
    if(hx > 0.0) return tx;
    float hm = map(ori + dir * tm);
    float tmid = 0.0;
    for(int i = 0; i < NUM_STEPS; i++) {
      tmid = mix(tm, tx, hm / (hm - hx));
      p = ori + dir * tmid;
      float hmid = map(p);
      if(hmid < 0.0) {
        tx = tmid;
        hx = hmid;
      } else {
        tm = tmid;
        hm = hmid;
      }
    }
    return tmid;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    uv = uv * 2.0 - 1.0;
    uv.x *= iResolution.x / iResolution.y;
    float time = iGlobalTime * 0.3;

    vec3 ang = vec3(sin(time * 3.0) * 0.1, sin(time) * 0.2 + 0.3, time);
    vec3 ori = vec3(0.0, 3.5, time * 5.0);
    vec3 dir = normalize(vec3(uv.xy, -2.0));
    dir.z += length(uv) * 0.15;
    dir = normalize(dir);

    vec3 p;
    heightMapTracing(ori, dir, p);
    vec3 dist = p - ori;
    vec3 n = getNormal(p, dot(dist, dist) * EPSILON_NRM);
    vec3 light = normalize(vec3(-0.3, 1.0, 0.8));

    vec3 color = mix(
      getSkyColor(dir),
      getSeaColor(p, n, light, dir, dist),
      pow(smoothstep(0.0, -0.05, dir.y), 0.3)
    );

    gl_FragColor = vec4(pow(color, vec3(0.75)), 1.0);
  }
`;

export default function ThreeScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    const camera = new THREE.Camera();

    const clock = new THREE.Clock();
    const uniforms = {
      iGlobalTime: { value: 0.1 },
      iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    let frameId: number;
    const animate = () => {
      uniforms.iGlobalTime.value += clock.getDelta();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frameId);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100vw", height: "100vh", overflow: "hidden" }} />;
}
