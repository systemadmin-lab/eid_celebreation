"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";

export default function ThreeScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    /* ───────── renderer ───────── */
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.15;          // very dark — night
    container.appendChild(renderer.domElement);

    /* ───────── scene & fog ───────── */
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020510); // deep night blue-black
    scene.fog = new THREE.FogExp2(0x020510, 0.00035);

    /* ───────── camera ───────── */
    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      1,
      20000
    );
    camera.position.set(0, 30, 150);
    camera.lookAt(0, 0, 0);

    /* ═══════════════════════════════════════
       1. STARFIELD
    ═══════════════════════════════════════ */
    const starCount = 6000;
    const starPos = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      // hemisphere above the camera
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.48; // stay above horizon
      const r = 4000 + Math.random() * 4000;
      starPos[i3]     = r * Math.sin(phi) * Math.cos(theta);
      starPos[i3 + 1] = r * Math.cos(phi) + 50;          // push up
      starPos[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      // slight blue-white tint variation
      const tint = 0.85 + Math.random() * 0.15;
      starColors[i3]     = tint;
      starColors[i3 + 1] = tint;
      starColors[i3 + 2] = 0.9 + Math.random() * 0.1; // slightly bluer
      starSizes[i] = 0.5 + Math.random() * 2.0;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
    starGeo.setAttribute("size", new THREE.BufferAttribute(starSizes, 1));

    const starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float uTime;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          // twinkle: vary size over time per star
          float twinkle = 0.7 + 0.3 * sin(uTime * 1.5 + position.x * 0.01 + position.z * 0.01);
          gl_PointSize = size * twinkle * (200.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = 1.0 - smoothstep(0.0, 0.5, d);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    /* ═══════════════════════════════════════
       2. CRESCENT MOON (2 % illumination)
    ═══════════════════════════════════════ */
    const moonGroup = new THREE.Group();

    // dark sphere — the moon body
    const moonGeo = new THREE.SphereGeometry(30, 64, 64);
    const moonMat = new THREE.ShaderMaterial({
      uniforms: {
        uLightDir: { value: new THREE.Vector3(-1, 0.2, 0.5).normalize() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uLightDir;
        varying vec3 vNormal;
        void main() {
          float NdotL = dot(vNormal, uLightDir);
          // very thin crescent: only light the extreme edge
          float crescent = smoothstep(-0.02, 0.04, NdotL);
          vec3 dark  = vec3(0.02, 0.02, 0.04);      // dark side
          vec3 lit   = vec3(0.95, 0.92, 0.82);       // warm moonlight
          vec3 color = mix(dark, lit, crescent);
          // soft glow at edge
          float rim = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
          color += vec3(0.08, 0.08, 0.14) * rim;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moonGroup.add(moon);

    // outer glow sprite
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 256;
    glowCanvas.height = 256;
    const gctx = glowCanvas.getContext("2d")!;
    const grad = gctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, "rgba(180,190,220,0.25)");
    grad.addColorStop(0.4, "rgba(120,130,170,0.08)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 256, 256);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.set(200, 200, 1);
    moonGroup.add(glowSprite);

    moonGroup.position.set(-600, 800, -2000);
    scene.add(moonGroup);

    /* ═══════════════════════════════════════
       3. WATER SURFACE
    ═══════════════════════════════════════ */
    // procedural water-normals texture
    const normSize = 512;
    const normCanvas = document.createElement("canvas");
    normCanvas.width = normSize;
    normCanvas.height = normSize;
    const nctx = normCanvas.getContext("2d")!;
    const normImgData = nctx.createImageData(normSize, normSize);
    for (let y = 0; y < normSize; y++) {
      for (let x = 0; x < normSize; x++) {
        const idx = (y * normSize + x) * 4;
        // simple Perlin-ish ripple normal map
        const nx = Math.sin(x * 0.05) * Math.cos(y * 0.08) * 0.5 + 0.5;
        const ny = Math.cos(x * 0.07) * Math.sin(y * 0.06) * 0.5 + 0.5;
        normImgData.data[idx]     = nx * 255;
        normImgData.data[idx + 1] = ny * 255;
        normImgData.data[idx + 2] = 200;       // z points mostly up
        normImgData.data[idx + 3] = 255;
      }
    }
    nctx.putImageData(normImgData, 0, 0);
    const waterNormals = new THREE.CanvasTexture(normCanvas);
    waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;

    const waterGeo = new THREE.PlaneGeometry(10000, 10000);
    const water = new Water(waterGeo, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: waterNormals,
      sunDirection: new THREE.Vector3(-0.5, 0.3, -0.5),
      sunColor: 0x101830,
      waterColor: 0x020510,
      distortionScale: 3.7,
      fog: scene.fog !== undefined,
    });
    water.rotation.x = -Math.PI / 2;
    water.position.y = -5;
    scene.add(water);

    /* ═══════════════════════════════════════
       4. LIGHTING & ATMOSPHERE
    ═══════════════════════════════════════ */
    // very dim ambient
    const ambient = new THREE.AmbientLight(0x0a0a20, 0.15);
    scene.add(ambient);

    // moonlight
    const moonLight = new THREE.DirectionalLight(0x8090b0, 0.35);
    moonLight.position.set(-600, 800, -2000);
    moonLight.target.position.set(0, 0, 0);
    scene.add(moonLight);
    scene.add(moonLight.target);

    // subtle hemisphere fill
    const hemiLight = new THREE.HemisphereLight(0x0a0a30, 0x000000, 0.08);
    scene.add(hemiLight);

    /* ───────── animation ───────── */
    const clock = new THREE.Clock();
    let frameId: number;

    // gentle camera motion
    const cameraRadius = 150;
    let cameraAngle = 0;

    const animate = () => {
      const dt = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // twinkle stars
      starMat.uniforms.uTime.value = elapsed;

      // animate water
      (water.material as THREE.ShaderMaterial).uniforms["time"].value += dt * 0.5;

      // slow camera orbit
      cameraAngle += dt * 0.03;
      camera.position.x = Math.sin(cameraAngle) * cameraRadius;
      camera.position.z = Math.cos(cameraAngle) * cameraRadius;
      camera.position.y = 25 + Math.sin(elapsed * 0.15) * 5;
      camera.lookAt(0, 5, 0);

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    /* ───────── resize ───────── */
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    /* ───────── cleanup ───────── */
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frameId);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      starGeo.dispose();
      starMat.dispose();
      moonGeo.dispose();
      moonMat.dispose();
      glowTex.dispose();
      glowMat.dispose();
      waterGeo.dispose();
      water.material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#020510" }}
    />
  );
}
