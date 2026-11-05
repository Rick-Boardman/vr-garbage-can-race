function cacheKey(kind, hex, extra) {
  return `${kind}:${hex}:${extra}`;
}

export function createMaterials(THREE) {
  const cache = new Map();

  function lambert(hex, { flat = false, opacity = 1, side = THREE.FrontSide, emissive = 0x000000 } = {}) {
    const key = cacheKey("l", hex, `${flat ? 1 : 0}:${opacity}:${side}:${emissive}`);
    let material = cache.get(key);
    if (material) return material;
    material = new THREE.MeshLambertMaterial({
      color: hex,
      flatShading: flat,
      side,
      emissive,
    });
    if (opacity < 1) {
      material.transparent = true;
      material.opacity = opacity;
    }
    cache.set(key, material);
    return material;
  }

  function standard(hex, { flat = false, roughness = 0.55, metalness = 0.1 } = {}) {
    const key = cacheKey("s", hex, `${flat ? 1 : 0}:${roughness}:${metalness}`);
    let material = cache.get(key);
    if (material) return material;
    material = new THREE.MeshStandardMaterial({
      color: hex,
      flatShading: flat,
      roughness,
      metalness,
    });
    cache.set(key, material);
    return material;
  }

  function canvasTexture(draw, key, width, height) {
    let material = cache.get(key);
    if (material) return material;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext("2d"), width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    material = new THREE.MeshLambertMaterial({ map: texture });
    cache.set(key, material);
    return material;
  }

  function facade(base, litChance, salt) {
    const key = cacheKey("facade", base, `${litChance}:${salt}`);
    return canvasTexture((ctx, width, height) => {
      ctx.fillStyle = `#${base.toString(16).padStart(6, "0")}`;
      ctx.fillRect(0, 0, width, height);
      const floors = 8;
      const cols = 4;
      const marginX = 10;
      const marginY = 12;
      const cellW = (width - marginX * 2) / cols;
      const cellH = (height - marginY * 2) / floors;
      for (let floor = 0; floor < floors; floor += 1) {
        for (let col = 0; col < cols; col += 1) {
          const lit = ((salt * 17 + floor * 5 + col * 3) % 100) / 100 < litChance;
          ctx.fillStyle = lit ? "#ffe7a8" : "#243846";
          ctx.fillRect(
            marginX + col * cellW + cellW * 0.18,
            marginY + floor * cellH + cellH * 0.22,
            cellW * 0.64,
            cellH * 0.52,
          );
        }
      }
    }, key, 128, 256);
  }

  function awning(hex) {
    const key = cacheKey("awning", hex, "stripes");
    return canvasTexture((ctx, width, height) => {
      for (let x = 0; x < width; x += 8) {
        ctx.fillStyle = (x / 8) % 2 === 0 ? `#${hex.toString(16).padStart(6, "0")}` : "#fff6ea";
        ctx.fillRect(x, 0, 8, height);
      }
    }, key, 64, 32);
  }

  function sign(text) {
    const key = `sign:${text}`;
    return canvasTexture((ctx, width, height) => {
      ctx.fillStyle = "#1d6b3c";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "#f4f7f2";
      ctx.lineWidth = 4;
      ctx.strokeRect(3, 3, width - 6, height - 6);
      ctx.fillStyle = "#f4f7f2";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, width / 2, height / 2);
    }, key, 256, 64);
  }

  const headlight = new THREE.MeshLambertMaterial({
    color: 0xfff6d4,
    emissive: 0xfff1c2,
    emissiveIntensity: 0.35,
  });
  const taillight = new THREE.MeshLambertMaterial({
    color: 0x8d1d1d,
    emissive: 0xff2a2a,
    emissiveIntensity: 0.4,
  });
  const bulb = new THREE.MeshLambertMaterial({
    color: 0xfff4cc,
    emissive: 0xffe7a0,
    emissiveIntensity: 0.2,
  });
  const shadow = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });

  function syncNight(amount) {
    const night = Math.max(0, Math.min(1, amount));
    headlight.emissiveIntensity = 0.25 + night * 0.9;
    taillight.emissiveIntensity = 0.3 + night * 0.8;
    bulb.emissiveIntensity = 0.15 + night * 1.1;
  }

  return {
    lambert,
    standard,
    facade,
    awning,
    sign,
    headlight,
    taillight,
    bulb,
    shadow,
    syncNight,
  };
}
