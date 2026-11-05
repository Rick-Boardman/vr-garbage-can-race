const PRESETS = {
  dawn: {
    skyTop: 0x6e7eb8,
    skyHorizon: 0xf3b59a,
    skyBottom: 0xe7c2b0,
    hemiSky: 0xffc2a8,
    hemiGround: 0x6a5348,
    hemi: 0.72,
    sun: 0xffb07a,
    sunIntensity: 1.15,
    sunDir: [70, 18, 24],
    ambient: 0.22,
    fog: 0xf0b8a4,
    fogFar: 160,
    exposure: 1.05,
    night: 0.25,
  },
  day: {
    skyTop: 0x6eb6ef,
    skyHorizon: 0xd7ecff,
    skyBottom: 0xc5d6b0,
    hemiSky: 0xd5ebff,
    hemiGround: 0x6a8a52,
    hemi: 0.78,
    sun: 0xfff4dd,
    sunIntensity: 1.35,
    sunDir: [40, 70, 24],
    ambient: 0.18,
    fog: 0xd5e6f5,
    fogFar: 185,
    exposure: 1.08,
    night: 0,
  },
  dusk: {
    skyTop: 0x2a3458,
    skyHorizon: 0xe48a6a,
    skyBottom: 0x6a4a62,
    hemiSky: 0xf0a090,
    hemiGround: 0x3a3040,
    hemi: 0.55,
    sun: 0xff8a5a,
    sunIntensity: 0.85,
    sunDir: [-60, 14, -20],
    ambient: 0.16,
    fog: 0xc48474,
    fogFar: 140,
    exposure: 0.98,
    night: 0.45,
  },
  night: {
    skyTop: 0x070b16,
    skyHorizon: 0x1a2744,
    skyBottom: 0x10131a,
    hemiSky: 0x31425e,
    hemiGround: 0x1a1c22,
    hemi: 0.85,
    sun: 0xc9d6ff,
    sunIntensity: 0.38,
    sunDir: [-20, 50, -30],
    ambient: 0.28,
    fog: 0x1a2740,
    fogFar: 120,
    exposure: 0.92,
    night: 1,
  },
};

function lerpNum(a, b, t) {
  return a + (b - a) * t;
}

export function createDaylight(THREE, scene) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x667755, 0.75);
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  const ambient = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(hemi, sun, ambient);

  const uniforms = {
    topColor: { value: new THREE.Color(PRESETS.day.skyTop) },
    horizonColor: { value: new THREE.Color(PRESETS.day.skyHorizon) },
    bottomColor: { value: new THREE.Color(PRESETS.day.skyBottom) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        void main() {
          float h = normalize(vDir).y;
          vec3 col = mix(horizonColor, topColor, smoothstep(0.0, 0.62, h));
          col = mix(bottomColor, col, smoothstep(-0.35, 0.08, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  sky.scale.setScalar(420);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(7, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff3cf, fog: false }),
  );
  scene.add(sunBall);

  scene.fog = new THREE.Fog(PRESETS.day.fog, 45, 185);
  scene.background = new THREE.Color(PRESETS.day.skyHorizon);

  const scratch = {
    skyTop: new THREE.Color(),
    skyHorizon: new THREE.Color(),
    skyBottom: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    sun: new THREE.Color(),
    fog: new THREE.Color(),
    sunDir: new THREE.Vector3(),
  };

  function mixPreset(out, a, b, t) {
    out.skyTop.set(a.skyTop).lerp(scratch.skyTop.set(b.skyTop), t);
    out.skyHorizon.set(a.skyHorizon).lerp(scratch.skyHorizon.set(b.skyHorizon), t);
    out.skyBottom.set(a.skyBottom).lerp(scratch.skyBottom.set(b.skyBottom), t);
    out.hemiSky.set(a.hemiSky).lerp(scratch.hemiSky.set(b.hemiSky), t);
    out.hemiGround.set(a.hemiGround).lerp(scratch.hemiGround.set(b.hemiGround), t);
    out.sun.set(a.sun).lerp(scratch.sun.set(b.sun), t);
    out.fog.set(a.fog).lerp(scratch.fog.set(b.fog), t);
  }

  const mixed = {
    skyTop: new THREE.Color(),
    skyHorizon: new THREE.Color(),
    skyBottom: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    sun: new THREE.Color(),
    fog: new THREE.Color(),
  };

  function apply(course, s, anchor) {
    const index = Math.max(0, Math.floor(s / 180));
    const current = course.districts[Math.min(index, course.districts.length - 1)];
    const next = course.districts[Math.min(index + 1, course.districts.length - 1)];
    const local = Math.max(0, s) - index * 180;
    const t = local > 160 ? (local - 160) / 20 : 0;
    const a = PRESETS[current.time] || PRESETS.day;
    const b = PRESETS[next.time] || a;
    mixPreset(mixed, a, b, t);
    const night = lerpNum(a.night, b.night, t);
    hemi.color.copy(mixed.hemiSky);
    hemi.groundColor.copy(mixed.hemiGround);
    hemi.intensity = lerpNum(a.hemi, b.hemi, t);
    sun.color.copy(mixed.sun);
    sun.intensity = lerpNum(a.sunIntensity, b.sunIntensity, t);
    scratch.sunDir.set(
      lerpNum(a.sunDir[0], b.sunDir[0], t),
      Math.max(12, lerpNum(a.sunDir[1], b.sunDir[1], t)),
      lerpNum(a.sunDir[2], b.sunDir[2], t),
    ).normalize();
    sun.position.copy(scratch.sunDir).multiplyScalar(80);
    ambient.intensity = lerpNum(a.ambient, b.ambient, t);
    uniforms.topColor.value.copy(mixed.skyTop);
    uniforms.horizonColor.value.copy(mixed.skyHorizon);
    uniforms.bottomColor.value.copy(mixed.skyBottom);
    scene.fog.color.copy(mixed.fog);
    scene.fog.far = lerpNum(a.fogFar, b.fogFar, t);
    scene.background.copy(mixed.skyHorizon);
    if (anchor) {
      sky.position.copy(anchor);
      sunBall.position.copy(anchor).addScaledVector(scratch.sunDir, 260);
    }
    sunBall.material.color.copy(mixed.sun);
    return { night };
  }

  return { apply, sky };
}
