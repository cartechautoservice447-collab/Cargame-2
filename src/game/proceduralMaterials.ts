import * as THREE from 'three';

export interface ProceduralMaterialPack {
  woodMap: THREE.CanvasTexture;
  woodBump: THREE.CanvasTexture;
  leatherMap: THREE.CanvasTexture;
  leatherBump: THREE.CanvasTexture;
  alcantaraMap: THREE.CanvasTexture;
  speakerMeshMap: THREE.CanvasTexture;
  windshieldFritMap: THREE.CanvasTexture;
  asphaltMap: THREE.CanvasTexture;
  asphaltBump: THREE.CanvasTexture;
  asphaltRoughnessMap: THREE.CanvasTexture;
  sidewalkMap: THREE.CanvasTexture;
  buildingMaps: THREE.CanvasTexture[];
  buildingEmissiveMaps: THREE.CanvasTexture[];
  buildingBump: THREE.CanvasTexture;
  glowSpriteMap: THREE.CanvasTexture;
  mistConeMap: THREE.CanvasTexture;
  reflectionStreakMap: THREE.CanvasTexture;
  skyNightMap: THREE.CanvasTexture;
  skyDayMap: THREE.CanvasTexture;
  disposeAll: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export function createProceduralMaterialPack(maxAnisotropy: number): ProceduralMaterialPack {
  const allTextures: THREE.CanvasTexture[] = [];

  const registerTex = (
    canvas: HTMLCanvasElement,
    isColor: boolean,
    repeatX = 1,
    repeatY = 1,
    clamp = false
  ): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = maxAnisotropy;
    allTextures.push(tex);
    return tex;
  };

  // 1. Ultra-Rich Mercedes Open-Pore & High-Gloss Burled Walnut Trim (1024x512)
  const [woodC, woodCtx] = makeCanvas(1024, 512);
  const woodGrad = woodCtx.createLinearGradient(0, 0, 0, 512);
  woodGrad.addColorStop(0, '#2c170c');
  woodGrad.addColorStop(0.28, '#4e2b18');
  woodGrad.addColorStop(0.62, '#3d2011');
  woodGrad.addColorStop(1, '#1b0d06');
  woodCtx.fillStyle = woodGrad;
  woodCtx.fillRect(0, 0, 1024, 512);

  for (let i = 0; i < 320; i++) {
    const yBase = (i / 320) * 512;
    woodCtx.strokeStyle =
      i % 4 === 0
        ? 'rgba(14, 6, 2, 0.50)'
        : i % 2 === 0
        ? 'rgba(145, 92, 48, 0.22)'
        : 'rgba(78, 42, 20, 0.32)';
    woodCtx.lineWidth = 1.0 + (i % 3) * 0.8;
    woodCtx.beginPath();
    for (let x = 0; x <= 1024; x += 16) {
      const wave =
        Math.sin(x * 0.010 + i * 0.24) * 8 +
        Math.cos(x * 0.027 - i * 0.14) * 4 +
        Math.sin(x * 0.0045 + i * 0.08) * 14;
      if (x === 0) woodCtx.moveTo(x, yBase + wave);
      else woodCtx.lineTo(x, yBase + wave);
    }
    woodCtx.stroke();
  }
  for (let k = 0; k < 18; k++) {
    const kx = ((k * 173 + 60) % 940) + 40;
    const ky = ((k * 97 + 40) % 420) + 46;
    const kr = 14 + (k % 5) * 8;
    const kg = woodCtx.createRadialGradient(kx, ky, 2, kx, ky, kr);
    kg.addColorStop(0, 'rgba(16, 7, 3, 0.78)');
    kg.addColorStop(0.55, 'rgba(62, 31, 15, 0.36)');
    kg.addColorStop(1, 'rgba(62, 31, 15, 0)');
    woodCtx.fillStyle = kg;
    woodCtx.beginPath();
    woodCtx.ellipse(kx, ky, kr * 2.1, kr * 0.68, (k % 3) * 0.14, 0, Math.PI * 2);
    woodCtx.fill();
  }
  const woodMap = registerTex(woodC, true, 1, 1);

  const [woodBC, woodBCtx] = makeCanvas(256, 128);
  woodBCtx.fillStyle = '#808080';
  woodBCtx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 110; i++) {
    woodBCtx.strokeStyle = i % 2 === 0 ? 'rgba(155,155,155,0.34)' : 'rgba(102,102,102,0.34)';
    woodBCtx.beginPath();
    woodBCtx.moveTo(0, (i / 110) * 128);
    woodBCtx.lineTo(256, ((i + 1) / 110) * 128 + Math.sin(i) * 2.4);
    woodBCtx.stroke();
  }
  const woodBump = registerTex(woodBC, false, 1, 1);

  // 2. Deep Charcoal-Espresso Nappa Dashboard Leather with Subtle Hand-Stitching (512x512)
  const [leathC, leathCtx] = makeCanvas(512, 512);
  leathCtx.fillStyle = '#181514';
  leathCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 16000; i++) {
    const x = (i * 83) % 512;
    const y = (i * 151) % 512;
    const shade = 18 + (i % 14);
    leathCtx.fillStyle = `rgb(${shade + 3},${shade + 1},${shade})`;
    leathCtx.fillRect(x, y, 2, 2);
  }
  leathCtx.strokeStyle = 'rgba(182, 166, 148, 0.36)';
  leathCtx.lineWidth = 1.6;
  leathCtx.setLineDash([7, 6]);
  leathCtx.beginPath();
  leathCtx.moveTo(0, 448);
  leathCtx.lineTo(512, 448);
  leathCtx.moveTo(0, 462);
  leathCtx.lineTo(512, 462);
  leathCtx.stroke();
  const leatherMap = registerTex(leathC, true, 3, 2);

  const [leathBC, leathBCtx] = makeCanvas(256, 256);
  leathBCtx.fillStyle = '#808080';
  leathBCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8000; i++) {
    const x = (i * 53) % 256;
    const y = (i * 97) % 256;
    const v = 98 + (i % 58);
    leathBCtx.fillStyle = `rgb(${v},${v},${v})`;
    leathBCtx.fillRect(x, y, 2, 2);
  }
  const leatherBump = registerTex(leathBC, false, 8, 5);

  // 3. Warm Sand-Tan Alcantara Suede (matches the exact warm tan A-pillar in reference screenshot!)
  const [alcC, alcCtx] = makeCanvas(256, 256);
  alcCtx.fillStyle = '#b99f84';
  alcCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 11000; i++) {
    const x = (i * 61) % 256;
    const y = (i * 139) % 256;
    const d = (i % 18) - 9;
    alcCtx.fillStyle = `rgb(${185 + d},${158 + d},${131 + d})`;
    alcCtx.fillRect(x, y, 2, 1);
  }
  const alcantaraMap = registerTex(alcC, true, 4, 4);

  // 4. Brushed Aluminum Burmester Acoustic Perforated Speaker Grille
  const [spkC, spkCtx] = makeCanvas(256, 256);
  const spkGrad = spkCtx.createRadialGradient(128, 128, 14, 128, 128, 128);
  spkGrad.addColorStop(0, '#cfd8e2');
  spkGrad.addColorStop(0.70, '#96a1ad');
  spkGrad.addColorStop(1, '#5e6873');
  spkCtx.fillStyle = spkGrad;
  spkCtx.fillRect(0, 0, 256, 256);
  spkCtx.fillStyle = '#181e27';
  for (let r = 14; r < 116; r += 10) {
    const count = Math.floor((2 * Math.PI * r) / 9);
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      spkCtx.beginPath();
      spkCtx.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 2.1, 0, Math.PI * 2);
      spkCtx.fill();
    }
  }
  const speakerMeshMap = registerTex(spkC, true, 1, 1, true);

  // 5. Ultra-Clean Automotive Windshield Ceramic Frit Seal (razor-thin edge, zero intrusive dots!)
  const [fritC, fritCtx] = makeCanvas(1024, 512);
  fritCtx.clearRect(0, 0, 1024, 512);

  const bTop = 14;
  const bBot = 16;
  const bSide = 14;
  fritCtx.fillStyle = '#06070a';
  fritCtx.fillRect(0, 0, 1024, 512);
  fritCtx.globalCompositeOperation = 'destination-out';
  const rx = 28;
  fritCtx.beginPath();
  fritCtx.moveTo(bSide + rx, bTop);
  fritCtx.lineTo(1024 - bSide - rx, bTop);
  fritCtx.quadraticCurveTo(1024 - bSide, bTop, 1024 - bSide, bTop + rx);
  fritCtx.lineTo(1024 - bSide, 512 - bBot - rx);
  fritCtx.quadraticCurveTo(1024 - bSide, 512 - bBot, 1024 - bSide - rx, 512 - bBot);
  fritCtx.lineTo(bSide + rx, 512 - bBot);
  fritCtx.quadraticCurveTo(bSide, 512 - bBot, bSide, 512 - bBot - rx);
  fritCtx.lineTo(bSide, bTop + rx);
  fritCtx.quadraticCurveTo(bSide, bTop, bSide + rx, bTop);
  fritCtx.closePath();
  fritCtx.fill();

  fritCtx.globalCompositeOperation = 'source-over';
  // Subtle top-edge sun tint band (zero coarse dots distracting from the road!)
  const tintGrad = fritCtx.createLinearGradient(0, bTop, 0, 512 - bBot);
  tintGrad.addColorStop(0, 'rgba(12, 22, 34, 0.24)');
  tintGrad.addColorStop(0.12, 'rgba(140, 175, 210, 0.02)');
  tintGrad.addColorStop(1, 'rgba(140, 175, 210, 0.01)');
  fritCtx.fillStyle = tintGrad;
  fritCtx.fillRect(bSide, bTop, 1024 - bSide * 2, 512 - bTop - bBot);
  const windshieldFritMap = registerTex(fritC, true, 1, 1, true);

  // 6. High-Resolution 1024x1024 European Wet/Dry Asphalt (UV repeat scaled for 3.62 km loop!)
  const [roadC, roadCtx] = makeCanvas(1024, 1024);
  roadCtx.fillStyle = '#191c22';
  roadCtx.fillRect(0, 0, 1024, 1024);

  // Detailed Belgian cobblestone gutters along both curbs
  for (let side = 0; side < 2; side++) {
    const gx = side === 0 ? 0 : 936;
    roadCtx.fillStyle = '#262930';
    roadCtx.fillRect(gx, 0, 88, 1024);
    for (let y = 0; y < 1024; y += 22) {
      for (let c = 0; c < 3; c++) {
        const shade = 36 + ((y * 7 + c * 19 + side * 11) % 22);
        roadCtx.fillStyle = `rgb(${shade + 2},${shade + 1},${shade})`;
        roadCtx.fillRect(gx + 3 + c * 28, y + 2, 24, 18);
      }
    }
  }

  // Polished darker wheel-track tire wear bands
  roadCtx.fillStyle = 'rgba(7, 9, 13, 0.42)';
  [180, 290, 410, 520, 620, 730, 810].forEach((tx) => {
    roadCtx.fillRect(tx, 0, 46, 1024);
  });

  // Fine mineral asphalt aggregate grain
  for (let i = 0; i < 32000; i++) {
    const x = 88 + ((i * 113) % 848);
    const y = (i * 227) % 1024;
    const v = 18 + (i % 34);
    roadCtx.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
    roadCtx.fillRect(x, y, 2, 2);
  }

  // Weathered tar repair cracks
  roadCtx.strokeStyle = 'rgba(6, 7, 10, 0.72)';
  roadCtx.lineWidth = 2.5;
  for (let c = 0; c < 8; c++) {
    const sy = c * 128 + 24;
    roadCtx.beginPath();
    roadCtx.moveTo(110 + ((c * 97) % 450), sy);
    roadCtx.quadraticCurveTo(360 + ((c * 61) % 300), sy + 24, 620 + ((c * 83) % 240), sy - 12);
    roadCtx.stroke();
  }

  // Authentic weathered European lane markings
  roadCtx.fillStyle = 'rgba(218, 224, 232, 0.68)';
  roadCtx.fillRect(96, 0, 9, 1024);
  roadCtx.fillRect(919, 0, 9, 1024);

  roadCtx.fillStyle = 'rgba(228, 234, 242, 0.78)';
  for (let y = 24; y < 1024; y += 160) {
    roadCtx.fillRect(504, y, 7, 90);
    roadCtx.fillRect(516, y, 7, 90);
  }
  roadCtx.fillStyle = 'rgba(210, 218, 228, 0.56)';
  for (let y = 40; y < 1024; y += 204) {
    roadCtx.fillRect(306, y, 7, 86);
    roadCtx.fillRect(712, y, 7, 86);
  }
  // Repeat 230 times along 3622m loop (~15.7m per tile) for razor-sharp road grain!
  const asphaltMap = registerTex(roadC, true, 1, 230);

  // Organic Mirror-Gloss Rain Puddle Roughness Map
  const [rghC, rghCtx] = makeCanvas(512, 512);
  rghCtx.fillStyle = '#787878';
  rghCtx.fillRect(0, 0, 512, 512);
  for (let p = 0; p < 42; p++) {
    const px = 42 + ((p * 137) % 428);
    const py = (p * 179) % 512;
    const rxP = 30 + (p % 5) * 18;
    const ryP = 48 + (p % 4) * 26;
    const pg = rghCtx.createRadialGradient(px, py, 6, px, py, Math.max(rxP, ryP));
    pg.addColorStop(0, '#0a0a0a');
    pg.addColorStop(0.58, '#222222');
    pg.addColorStop(1, 'rgba(120, 120, 120, 0)');
    rghCtx.fillStyle = pg;
    rghCtx.beginPath();
    rghCtx.ellipse(px, py, rxP, ryP, (p % 3) * 0.22, 0, Math.PI * 2);
    rghCtx.fill();
  }
  for (let i = 0; i < 6000; i++) {
    const x = (i * 73) % 512;
    const y = (i * 131) % 512;
    rghCtx.fillStyle = i % 2 === 0 ? 'rgba(210,210,210,0.14)' : 'rgba(15,15,15,0.16)';
    rghCtx.fillRect(x, y, 2, 2);
  }
  const asphaltRoughnessMap = registerTex(rghC, false, 1, 180);

  const [roadBC, roadBCtx] = makeCanvas(256, 256);
  roadBCtx.fillStyle = '#808080';
  roadBCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7500; i++) {
    const x = (i * 71) % 256;
    const y = (i * 131) % 256;
    const g = 78 + (i % 98);
    roadBCtx.fillStyle = `rgb(${g},${g},${g})`;
    roadBCtx.fillRect(x, y, 2, 2);
  }
  const asphaltBump = registerTex(roadBC, false, 4, 460);

  // 7. Historic Wet European Cobblestone & Flagstone Sidewalk Paving (512x512)
  const [swC, swCtx] = makeCanvas(512, 512);
  swCtx.fillStyle = '#47423d';
  swCtx.fillRect(0, 0, 512, 512);
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 8; c++) {
      const ox = (r % 2) * 32;
      const shade = 64 + ((r * 13 + c * 29) % 26);
      swCtx.fillStyle = `rgb(${shade + 5},${shade + 1},${shade - 4})`;
      swCtx.fillRect((c * 64 + ox) % 512, r * 32, 60, 29);
      swCtx.fillStyle = 'rgba(0,0,0,0.22)';
      swCtx.fillRect((c * 64 + ox) % 512, r * 32 + 28, 60, 2);
    }
  }
  const sidewalkMap = registerTex(swC, true, 2, 380);

  // 8. ULTRA-HIGH-RESOLUTION 1024x1024 Historic European Architectural Facades (3 Rich Variants!)
  // Photographic weathered plaster/ashlar stone, deep recessed window reveals, subtle warm interior lamps (NOT flat yellow boxes!),
  // stone architraves, wrought-iron balconies, half-timber framing, and warmly lit European bistros/boutiques!
  const createUltraEuropeanFacade = (
    wallLower: string,
    wallUpper: string,
    stoneTrim: string,
    hasHalfTimber: boolean,
    accentTimber: string,
    seed: number
  ): { albedo: THREE.CanvasTexture; emissive: THREE.CanvasTexture } => {
    const W = 1024;
    const H = 1024;
    const [fc, fCtx] = makeCanvas(W, H);
    const [ec, eCtx] = makeCanvas(W, H);

    // Soft vertical gradient weathering (darker damp stone near street, warmer aged stucco above)
    const upperGrad = fCtx.createLinearGradient(0, 0, 0, 720);
    upperGrad.addColorStop(0, wallUpper);
    upperGrad.addColorStop(0.75, wallUpper);
    upperGrad.addColorStop(1, wallLower);
    fCtx.fillStyle = upperGrad;
    fCtx.fillRect(0, 0, W, 720);

    const baseGrad = fCtx.createLinearGradient(0, 720, 0, H);
    baseGrad.addColorStop(0, wallLower);
    baseGrad.addColorStop(1, '#342d27');
    fCtx.fillStyle = baseGrad;
    fCtx.fillRect(0, 720, W, H - 720);

    // Fine stone ashlar courses & photographic plaster mottling
    for (let y = 0; y < H; y += 32) {
      fCtx.fillStyle = y > 720 ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.06)';
      fCtx.fillRect(0, y, W, 2);
    }
    for (let i = 0; i < 14000; i++) {
      const nx = (i * 97 + seed * 43) % W;
      const ny = (i * 173 + seed * 29) % H;
      const w = 4 + (i % 14);
      const h = 2 + (i % 6);
      fCtx.fillStyle = i % 3 === 0 ? 'rgba(0,0,0,0.055)' : 'rgba(255,248,236,0.045)';
      fCtx.fillRect(nx, ny, w, h);
    }

    // Rainwater streaks & ambient-occlusion grime beneath cornices and sills
    eCtx.fillStyle = '#000000';
    eCtx.fillRect(0, 0, W, H);

    // Ornate carved stone floor cornices with deep cast shadows
    const floorYs = [18, 250, 482, 714];
    for (const fy of floorYs) {
      fCtx.fillStyle = stoneTrim;
      fCtx.fillRect(0, fy, W, 22);
      fCtx.fillStyle = 'rgba(255,250,242,0.18)';
      fCtx.fillRect(0, fy, W, 4);
      const shadowG = fCtx.createLinearGradient(0, fy + 22, 0, fy + 48);
      shadowG.addColorStop(0, 'rgba(10,8,6,0.46)');
      shadowG.addColorStop(1, 'rgba(10,8,6,0)');
      fCtx.fillStyle = shadowG;
      fCtx.fillRect(0, fy + 22, W, 26);
    }

    // Vertical stone pilasters dividing bays
    for (const px of [0, 250, 506, 762, 1004]) {
      fCtx.fillStyle = 'rgba(255,248,238,0.08)';
      fCtx.fillRect(px, 18, 18, 696);
      fCtx.fillStyle = 'rgba(0,0,0,0.16)';
      fCtx.fillRect(px + 18, 18, 6, 696);
    }

    // Historic European Half-Timbering (Fachwerk) on selected buildings (matches right building in reference!)
    if (hasHalfTimber) {
      fCtx.strokeStyle = accentTimber;
      fCtx.fillStyle = accentTimber;
      fCtx.lineWidth = 14;
      for (const tx of [22, 260, 512, 764, 1002]) {
        fCtx.fillRect(tx - 8, 24, 16, 690);
      }
      for (let row = 0; row < 2; row++) {
        const yTop = row === 0 ? 274 : 506;
        const yBot = yTop + 206;
        for (let col = 0; col < 4; col++) {
          const xL = 32 + col * 246;
          const xR = xL + 220;
          // St. Andrew's decorative timber X-bracing below windows
          fCtx.beginPath();
          fCtx.moveTo(xL, yBot);
          fCtx.lineTo(xR, yBot - 68);
          fCtx.moveTo(xR, yBot);
          fCtx.lineTo(xL, yBot - 68);
          fCtx.stroke();
        }
      }
    }

    // Upper-Floor Deep-Recessed Mullioned Windows (realistic dark rooms + selective warm interior lamp glows!)
    const windowCols = [74, 326, 578, 830];
    const windowRows = [64, 296, 528];
    for (let r = 0; r < windowRows.length; r++) {
      for (let c = 0; c < windowCols.length; c++) {
        const wx = windowCols[c];
        const wy = windowRows[r];
        const ww = 122;
        const wh = 146;

        // Carved stone architrave frame + protruding sill + cast under-sill shadow
        fCtx.fillStyle = stoneTrim;
        fCtx.fillRect(wx - 14, wy - 14, ww + 28, wh + 26);
        fCtx.fillStyle = 'rgba(12,10,8,0.45)';
        fCtx.fillRect(wx - 18, wy + wh + 14, ww + 36, 14);
        // Deep recessed inner reveal shadow
        fCtx.fillStyle = '#1b1715';
        fCtx.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);

        // Realistic European occupancy: ~45% warmly lit rooms with soft gradient lamps, ~55% dark reflective twilight glass!
        const hash = (r * 13 + c * 17 + seed * 7) % 11;
        const isLit = hash === 1 || hash === 3 || hash === 6 || hash === 8 || hash === 10;

        if (isLit) {
          // Soft warm interior lamp bloom (realistic falloff, NOT flat harsh yellow!)
          const lampCx = wx + ww * (hash % 2 === 0 ? 0.5 : 0.38);
          const lampCy = wy + wh * 0.44;
          const wGrad = fCtx.createRadialGradient(lampCx, lampCy, 8, lampCx, lampCy, ww * 0.95);
          wGrad.addColorStop(0, '#fff2d0');
          wGrad.addColorStop(0.38, '#e3a558');
          wGrad.addColorStop(0.78, '#7a4520');
          wGrad.addColorStop(1, '#2a180d');
          fCtx.fillStyle = wGrad;
          fCtx.fillRect(wx, wy, ww, wh);

          // Interior room drapes & ceiling shadow
          fCtx.fillStyle = 'rgba(28, 16, 10, 0.52)';
          fCtx.fillRect(wx, wy, 20, wh);
          fCtx.fillRect(wx + ww - 20, wy, 20, wh);
          fCtx.fillRect(wx, wy, ww, 18);

          // Subtle matching emissive radial lamp glow
          const eGrad = eCtx.createRadialGradient(lampCx, lampCy, 6, lampCx, lampCy, ww * 0.85);
          eGrad.addColorStop(0, '#ffd89a');
          eGrad.addColorStop(0.45, '#b86c2c');
          eGrad.addColorStop(1, '#1a0c04');
          eCtx.fillStyle = eGrad;
          eCtx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
        } else {
          // Deep reflective night/twilight window glass with subtle sky & interior ceiling hint
          const darkG = fCtx.createLinearGradient(wx, wy, wx, wy + wh);
          darkG.addColorStop(0, '#2a3444');
          darkG.addColorStop(0.45, '#19212d');
          darkG.addColorStop(1, '#0e131b');
          fCtx.fillStyle = darkG;
          fCtx.fillRect(wx, wy, ww, wh);
          // Faint diagonal glass reflection highlight
          fCtx.fillStyle = 'rgba(180, 205, 230, 0.08)';
          fCtx.beginPath();
          fCtx.moveTo(wx, wy + 28);
          fCtx.lineTo(wx + 48, wy);
          fCtx.lineTo(wx + 76, wy);
          fCtx.lineTo(wx, wy + 56);
          fCtx.closePath();
          fCtx.fill();
        }

        // Crisp dark painted wooden muntins / window cross-bars
        fCtx.fillStyle = '#1e1815';
        fCtx.fillRect(wx + ww / 2 - 4, wy, 8, wh);
        fCtx.fillRect(wx, wy + wh * 0.36, ww, 7);
        fCtx.fillRect(wx, wy + wh * 0.68, ww, 5);
        eCtx.fillStyle = '#000000';
        eCtx.fillRect(wx + ww / 2 - 4, wy, 8, wh);
        eCtx.fillRect(wx, wy + wh * 0.36, ww, 7);
        eCtx.fillRect(wx, wy + wh * 0.68, ww, 5);

        // Ornate Wrought-Iron Juliet Balcony Railing on 2nd-floor windows
        if (r === 2) {
          fCtx.fillStyle = '#14161a';
          fCtx.fillRect(wx - 10, wy + wh - 42, ww + 20, 6);
          fCtx.fillRect(wx - 10, wy + wh - 6, ww + 20, 6);
          for (let bx = wx - 6; bx <= wx + ww + 6; bx += 14) {
            fCtx.fillRect(bx, wy + wh - 42, 4, 42);
          }
          eCtx.fillStyle = '#000000';
          eCtx.fillRect(wx - 10, wy + wh - 42, ww + 20, 6);
        }
      }
    }

    // Ground Floor: Photorealistic European Café & Boutique Storefronts (warm amber interior depth!)
    const drawStorefrontBay = (sx: number, sw: number, litShop: boolean) => {
      // Dark iron/mahogany shopfront surround
      fCtx.fillStyle = '#1d1612';
      fCtx.fillRect(sx - 14, 744, sw + 28, 258);
      // Recessed stone plinth under window
      fCtx.fillStyle = '#38302a';
      fCtx.fillRect(sx - 6, 956, sw + 12, 46);

      if (litShop) {
        const sGrad = fCtx.createRadialGradient(sx + sw * 0.5, 815, 18, sx + sw * 0.5, 865, sw * 0.72);
        sGrad.addColorStop(0, '#fff2cf');
        sGrad.addColorStop(0.35, '#e8a248');
        sGrad.addColorStop(0.75, '#7e3e14');
        sGrad.addColorStop(1, '#2b1408');
        fCtx.fillStyle = sGrad;
        fCtx.fillRect(sx, 756, sw, 200);

        // Subtle interior café shelves, pendant globes & patrons silhouettes
        fCtx.fillStyle = 'rgba(32, 16, 8, 0.42)';
        fCtx.fillRect(sx + 16, 886, sw - 32, 70);
        fCtx.fillStyle = '#fff9e6';
        fCtx.beginPath();
        fCtx.arc(sx + sw * 0.32, 794, 12, 0, Math.PI * 2);
        fCtx.arc(sx + sw * 0.68, 794, 12, 0, Math.PI * 2);
        fCtx.fill();

        const esGrad = eCtx.createRadialGradient(sx + sw * 0.5, 815, 12, sx + sw * 0.5, 865, sw * 0.68);
        esGrad.addColorStop(0, '#ffdf9e');
        esGrad.addColorStop(0.45, '#be6e28');
        esGrad.addColorStop(1, '#1e0c04');
        eCtx.fillStyle = esGrad;
        eCtx.fillRect(sx + 2, 758, sw - 4, 196);
        eCtx.fillStyle = 'rgba(0,0,0,0.48)';
        eCtx.fillRect(sx + 16, 886, sw - 32, 70);
      } else {
        const darkS = fCtx.createLinearGradient(sx, 756, sx, 956);
        darkS.addColorStop(0, '#242b36');
        darkS.addColorStop(1, '#10141b');
        fCtx.fillStyle = darkS;
        fCtx.fillRect(sx, 756, sw, 200);
      }

      // Glazing mullions & fascia sign header
      fCtx.fillStyle = '#1b1410';
      fCtx.fillRect(sx + sw * 0.5 - 4, 756, 8, 200);
      fCtx.fillRect(sx, 804, sw, 7);
      eCtx.fillStyle = '#000000';
      eCtx.fillRect(sx + sw * 0.5 - 4, 756, 8, 200);
      eCtx.fillRect(sx, 804, sw, 7);
    };

    drawStorefrontBay(56, 336, true);
    drawStorefrontBay(632, 336, seed !== 2);

    // Center Arched Historic Wooden Entryway with Warm Transom Lantern
    fCtx.fillStyle = '#1f150f';
    fCtx.fillRect(436, 748, 152, 276);
    fCtx.fillStyle = '#3c2518';
    fCtx.fillRect(452, 816, 120, 208);
    fCtx.fillStyle = '#ffd995';
    fCtx.fillRect(454, 762, 116, 44);
    eCtx.fillStyle = '#ffcb74';
    eCtx.fillRect(454, 762, 116, 44);

    return {
      albedo: registerTex(fc, true, 1, 1),
      emissive: registerTex(ec, true, 1, 1),
    };
  };

  const b1 = createUltraEuropeanFacade('#6e6257', '#9f8f7d', '#877969', true, '#3e2d22', 1);
  const b2 = createUltraEuropeanFacade('#5d564f', '#8e8274', '#746a5f', false, '#35271f', 2);
  const b3 = createUltraEuropeanFacade('#67574c', '#a9957f', '#8c7a67', true, '#443124', 3);

  const [bBumpC, bBumpCtx] = makeCanvas(512, 512);
  bBumpCtx.fillStyle = '#808080';
  bBumpCtx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 16) {
    bBumpCtx.fillStyle = '#525252';
    bBumpCtx.fillRect(0, y, 512, 2);
  }
  for (let i = 0; i < 6000; i++) {
    const x = (i * 89) % 512;
    const y = (i * 157) % 512;
    const g = 104 + (i % 48);
    bBumpCtx.fillStyle = `rgb(${g},${g},${g})`;
    bBumpCtx.fillRect(x, y, 3, 2);
  }
  const buildingBump = registerTex(bBumpC, false, 2, 2);

  // 9. Soft Photographic Volumetric Glow Halo (Streetlamps & LED Headlights)
  const [glowC, glowCtx] = makeCanvas(256, 256);
  const glowGrad = glowCtx.createRadialGradient(128, 128, 2, 128, 128, 126);
  glowGrad.addColorStop(0, 'rgba(255, 252, 242, 1.0)');
  glowGrad.addColorStop(0.14, 'rgba(255, 224, 168, 0.85)');
  glowGrad.addColorStop(0.38, 'rgba(255, 184, 102, 0.34)');
  glowGrad.addColorStop(0.70, 'rgba(220, 148, 76, 0.10)');
  glowGrad.addColorStop(1, 'rgba(180, 110, 45, 0.0)');
  glowCtx.fillStyle = glowGrad;
  glowCtx.fillRect(0, 0, 256, 256);
  const glowSpriteMap = registerTex(glowC, true, 1, 1, true);

  // 10. Volumetric Rainy-Mist Streetlamp Light Shaft Cone Texture!
  const [coneC, coneCtx] = makeCanvas(128, 256);
  const coneGrad = coneCtx.createLinearGradient(0, 0, 0, 256);
  coneGrad.addColorStop(0, 'rgba(255, 226, 168, 0.42)');
  coneGrad.addColorStop(0.35, 'rgba(255, 198, 122, 0.16)');
  coneGrad.addColorStop(1, 'rgba(255, 178, 92, 0.0)');
  coneCtx.fillStyle = coneGrad;
  coneCtx.fillRect(0, 0, 128, 256);
  const mistConeMap = registerTex(coneC, true, 1, 1, true);

  // 11. High-Contrast Wet-Road Shimmering Specular Reflection Column (mirrors reference wet asphalt!)
  const [refC, refCtx] = makeCanvas(128, 256);
  const refGrad = refCtx.createLinearGradient(0, 0, 0, 256);
  refGrad.addColorStop(0, 'rgba(255,255,255,0)');
  refGrad.addColorStop(0.12, 'rgba(255,255,255,0.98)');
  refGrad.addColorStop(0.48, 'rgba(255,255,255,0.68)');
  refGrad.addColorStop(0.82, 'rgba(255,255,255,0.22)');
  refGrad.addColorStop(1, 'rgba(255,255,255,0)');
  const hGrad = refCtx.createLinearGradient(0, 0, 128, 0);
  hGrad.addColorStop(0, 'rgba(255,255,255,0)');
  hGrad.addColorStop(0.5, 'rgba(255,255,255,1)');
  hGrad.addColorStop(1, 'rgba(255,255,255,0)');
  refCtx.fillStyle = refGrad;
  refCtx.fillRect(18, 0, 92, 256);
  refCtx.globalCompositeOperation = 'destination-in';
  refCtx.fillStyle = hGrad;
  refCtx.fillRect(0, 0, 128, 256);
  refCtx.globalCompositeOperation = 'source-over';
  // Fine horizontal wet-asphalt micro-ripple shimmer breaks
  for (let y = 0; y < 256; y += 3) {
    refCtx.fillStyle = y % 6 === 0 ? 'rgba(0,0,0,0.34)' : 'rgba(0,0,0,0.12)';
    refCtx.fillRect(0, y, 128, 1.4);
  }
  const reflectionStreakMap = registerTex(refC, true, 1, 1, true);

  // 12. Atmospheric Sky Domes matching reference rainy twilight mist & bright sunlit blue sky
  const [snC, snCtx] = makeCanvas(512, 256);
  const snGrad = snCtx.createLinearGradient(0, 0, 0, 256);
  snGrad.addColorStop(0, '#2d3748'); // Cool slate-blue overcast twilight zenith (matches reference!)
  snGrad.addColorStop(0.32, '#4e586a');
  snGrad.addColorStop(0.47, '#8d7d73'); // Soft misty horizon haze
  snGrad.addColorStop(0.54, '#bda083'); // Warm golden street-mist vanishing glow (exact reference match!)
  snGrad.addColorStop(0.68, '#5f4c3f');
  snGrad.addColorStop(1, '#1c191a');
  snCtx.fillStyle = snGrad;
  snCtx.fillRect(0, 0, 512, 256);
  const skyNightMap = registerTex(snC, true, 1, 1, true);

  const [sdC, sdCtx] = makeCanvas(1024, 512);
  const sdGrad = sdCtx.createLinearGradient(0, 0, 0, 512);
  sdGrad.addColorStop(0, '#1a539e');
  sdGrad.addColorStop(0.30, '#4c93de');
  sdGrad.addColorStop(0.50, '#a6cef2');
  sdGrad.addColorStop(0.58, '#dbeafe');
  sdGrad.addColorStop(1, '#94a3b8');
  sdCtx.fillStyle = sdGrad;
  sdCtx.fillRect(0, 0, 1024, 512);

  const cloudClusters = [
    { x: 140, y: 155, r: 58 },
    { x: 340, y: 132, r: 72 },
    { x: 560, y: 162, r: 64 },
    { x: 770, y: 138, r: 76 },
    { x: 930, y: 165, r: 55 },
    { x: 245, y: 205, r: 46 },
    { x: 670, y: 202, r: 52 },
  ];
  for (const cl of cloudClusters) {
    for (let p = 0; p < 5; p++) {
      const px = cl.x + (p - 2) * cl.r * 0.48;
      const py = cl.y + (p % 2 === 0 ? -8 : 8);
      const pr = cl.r * (0.65 + (p === 2 ? 0.38 : 0.12));
      const cg = sdCtx.createRadialGradient(px, py, pr * 0.12, px, py, pr);
      cg.addColorStop(0, 'rgba(255, 255, 255, 0.88)');
      cg.addColorStop(0.55, 'rgba(241, 248, 255, 0.52)');
      cg.addColorStop(1, 'rgba(220, 238, 255, 0)');
      sdCtx.fillStyle = cg;
      sdCtx.beginPath();
      sdCtx.ellipse(px, py, pr * 1.45, pr * 0.58, 0, 0, Math.PI * 2);
      sdCtx.fill();
    }
  }
  const skyDayMap = registerTex(sdC, true, 1, 1);
  skyDayMap.wrapT = THREE.ClampToEdgeWrapping;

  return {
    woodMap,
    woodBump,
    leatherMap,
    leatherBump,
    alcantaraMap,
    speakerMeshMap,
    windshieldFritMap,
    asphaltMap,
    asphaltBump,
    asphaltRoughnessMap,
    sidewalkMap,
    buildingMaps: [b1.albedo, b2.albedo, b3.albedo],
    buildingEmissiveMaps: [b1.emissive, b2.emissive, b3.emissive],
    buildingBump,
    glowSpriteMap,
    mistConeMap,
    reflectionStreakMap,
    skyNightMap,
    skyDayMap,
    disposeAll: () => {
      allTextures.forEach((t) => t.dispose());
    },
  };
}
