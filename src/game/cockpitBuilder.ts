import * as THREE from 'three';
import {
  LightingMode,
  TrafficVehicle,
  VehicleState,
  sampleTrackByDistance,
  TRACK_TOTAL_LENGTH,
} from './drivingPhysics';
import { ProceduralMaterialPack } from './proceduralMaterials';

export const COCKPIT_DRIVER_X = 0.34;

export interface CockpitRig {
  group: THREE.Group;
  steeringWheelPivot: THREE.Group;
  leftWiperPivot: THREE.Group;
  rightWiperPivot: THREE.Group;
  accelPedalMesh: THREE.Mesh;
  brakePedalMesh: THREE.Mesh;
  windshieldRainMesh: THREE.Mesh;
  updateDriverHands: () => void;
  updateScreens: (v: VehicleState, traffic: TrafficVehicle[], mode: LightingMode) => void;
  updateRainDroplets: (v: VehicleState, mode: LightingMode, dt: number) => void;
  setModeVisuals: (mode: LightingMode) => void;
}

interface RainDrop2D {
  x: number;
  y: number;
  r: number;
  alpha: number;
  streak: number;
}

/**
 * Exact parametric 3D automotive windshield surface shared by curved glass,
 * slim ceramic frit seal, rain droplets, curved Alcantara A-pillars, and roof canopy —
 * matching the reference screenshot's sleek uninterrupted luxury-sedan sightline!
 */
function sampleWindshieldPoint(u: number, v: number, zOffset = 0): THREE.Vector3 {
  const halfW = 0.855 - 0.145 * Math.pow(v, 1.12);
  const x = u * halfW;
  const roofDip = (1 - u * u) * 0.032 * v;
  const y = 1.005 + v * 0.565 + roofDip;
  const bowZ = (1 - u * u) * 0.08;
  const z = 0.72 - v * 0.44 + bowZ + zOffset;
  return new THREE.Vector3(x, y, z);
}

function createParametricWindshieldGeometry(segU = 28, segV = 12, zOffset = 0): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV;
    for (let iu = 0; iu <= segU; iu++) {
      const uNorm = iu / segU;
      const u = 1 - uNorm * 2;
      const pt = sampleWindshieldPoint(u, v, zOffset);
      positions.push(pt.x, pt.y, pt.z);
      uvs.push(uNorm, v);
    }
  }

  const stride = segU + 1;
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = (iv + 1) * stride + iu;
      const d = c + 1;
      // Faces -Z toward driver eye inside cabin
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Deeply Recessed Luxury Brushed-Chrome Turbine Air Vent (matches reference S-Class vents — dark recess, subtle metallic sheen!).
 */
function buildTurbineAirVent(
  chromeMat: THREE.Material,
  brushedMat: THREE.Material,
  darkHousingMat: THREE.Material,
  radius = 0.044
): THREE.Group {
  const vent = new THREE.Group();

  // Outer sculpted gunmetal/chrome bezel
  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(radius, radius * 0.13, 16, 32),
    brushedMat
  );
  vent.add(outerRing);

  // Deep shadow barrel recess
  const recess = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.90, radius * 0.82, 0.042, 24),
    darkHousingMat
  );
  recess.rotation.x = Math.PI / 2;
  recess.position.z = 0.018;
  vent.add(recess);

  // Subtle inner turbine ring
  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.56, radius * 0.036, 10, 24),
    brushedMat
  );
  innerRing.position.z = 0.002;
  vent.add(innerRing);

  // 4 sculpted radial turbine fins
  const vaneGeo = new THREE.BoxGeometry(radius * 1.62, 0.0036, 0.016);
  for (let i = 0; i < 4; i++) {
    const vane = new THREE.Mesh(vaneGeo, brushedMat);
    vane.rotation.z = (i * Math.PI) / 4;
    vane.position.z = 0.008;
    vent.add(vane);
  }

  // Center metallic directional knob
  const knob = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.18, radius * 0.22, 0.016, 16),
    chromeMat
  );
  knob.rotation.x = Math.PI / 2;
  knob.position.z = -0.003;
  vent.add(knob);

  return vent;
}

/**
 * Smooth Sculpted Curved Leather Dashboard Upper Cowl (ExtrudeGeometry cross-section swept across width —
 * eliminates flat blocky boxes and matches the flowing Mercedes S-Class dashboard wave!).
 */
function createSculptedDashWingGeometry(width: number): THREE.BufferGeometry {
  const profile = new THREE.Shape();
  // Cross-section in (z, y): z=0.33 (front brow edge) to z=0.84 (windshield base)
  profile.moveTo(0.335, 1.038);
  profile.quadraticCurveTo(0.325, 1.056, 0.365, 1.066); // Rounded soft leather overhang lip
  profile.quadraticCurveTo(0.52, 1.064, 0.78, 1.042);   // Sweeping contoured leather top deck
  profile.lineTo(0.84, 1.010);
  profile.lineTo(0.84, 0.992);
  profile.lineTo(0.46, 1.018);
  profile.lineTo(0.36, 1.032);
  profile.closePath();

  const geo = new THREE.ExtrudeGeometry(profile, {
    steps: 1,
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.012,
    bevelSegments: 3,
  });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

export function buildLuxuryCockpit(
  mats: ProceduralMaterialPack,
  maxAnisotropy: number
): CockpitRig {
  const cockpitGroup = new THREE.Group();

  // Ultra-Hyperrealistic Luxury Interior PBR Materials
  const leatherDashMat = new THREE.MeshPhysicalMaterial({
    color: 0xd8d0c8,
    map: mats.leatherMap,
    bumpMap: mats.leatherBump,
    bumpScale: 0.008,
    roughness: 0.54,
    metalness: 0.04,
    clearcoat: 0.14,
    clearcoatRoughness: 0.45,
  });

  const leatherDarkMat = new THREE.MeshPhysicalMaterial({
    color: 0x161414,
    bumpMap: mats.leatherBump,
    bumpScale: 0.006,
    roughness: 0.46,
    metalness: 0.06,
    clearcoat: 0.18,
    clearcoatRoughness: 0.38,
  });

  const rubberSealMat = new THREE.MeshStandardMaterial({
    color: 0x0a0b0e,
    roughness: 0.80,
    metalness: 0.04,
  });

  const walnutWoodMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: mats.woodMap,
    bumpMap: mats.woodBump,
    bumpScale: 0.004,
    roughness: 0.14,
    metalness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });

  const chromeTrimMat = new THREE.MeshPhysicalMaterial({
    color: 0xd8dfe8,
    roughness: 0.14,
    metalness: 0.96,
    clearcoat: 0.65,
  });

  const brushedAlumMat = new THREE.MeshPhysicalMaterial({
    color: 0x9aa4b2,
    roughness: 0.30,
    metalness: 0.90,
  });

  const darkChromeMat = new THREE.MeshPhysicalMaterial({
    color: 0x525a66,
    roughness: 0.24,
    metalness: 0.92,
  });

  const speakerMeshMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: mats.speakerMeshMap,
    roughness: 0.28,
    metalness: 0.86,
  });

  const pianoBlackMat = new THREE.MeshPhysicalMaterial({
    color: 0x06080c,
    roughness: 0.08,
    metalness: 0.24,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });

  const alcantaraMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: mats.alcantaraMap,
    roughness: 0.88,
    metalness: 0.02,
  });

  // Warm luxury gold/ivory fiber-optic ambient light pipe (matches warm cabin glow in reference!)
  const ambientLedMat = new THREE.MeshStandardMaterial({
    color: 0xffe4b5,
    emissive: 0xffb85c,
    emissiveIntensity: 1.35,
    roughness: 0.16,
  });

  // =========================================================================
  // 1. SCULPTED FLOWING LEATHER DASHBOARD WING & CURVED WALNUT CENTER FASCIA
  // =========================================================================
  const sculptedDashWing = new THREE.Mesh(
    createSculptedDashWingGeometry(1.74),
    leatherDashMat
  );
  sculptedDashWing.position.set(0.02, 0, 0);
  cockpitGroup.add(sculptedDashWing);

  // Subtle recessed defroster grille along windshield cowl
  const defrosterStrip = new THREE.Mesh(
    new THREE.BoxGeometry(1.16, 0.006, 0.042),
    rubberSealMat
  );
  defrosterStrip.position.set(0.02, 1.050, 0.72);
  cockpitGroup.add(defrosterStrip);

  // Deep recessed cabin lower dashboard core
  const dashLowerBase = new THREE.Mesh(
    new THREE.BoxGeometry(1.72, 0.34, 0.46),
    leatherDarkMat
  );
  dashLowerBase.position.set(0.02, 0.70, 0.58);
  cockpitGroup.add(dashLowerBase);

  // Flowing Glossy Burled Walnut Wood Center Fascia beneath widescreen glass
  const centerWoodFascia = new THREE.Mesh(
    new THREE.BoxGeometry(1.30, 0.185, 0.06),
    walnutWoodMat
  );
  centerWoodFascia.position.set(-0.06, 0.785, 0.352);
  centerWoodFascia.rotation.x = -0.10;
  cockpitGroup.add(centerWoodFascia);

  // Sculpted left leather bolster smoothly housing left air vent
  const leftVentBacking = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.24, 0.08),
    leatherDarkMat
  );
  leftVentBacking.position.set(0.65, 0.90, 0.388);
  cockpitGroup.add(leftVentBacking);

  // Sleek slim satin-chrome divider strip & warm ambient light ribbon under display
  const woodChromeStrip = new THREE.Mesh(
    new THREE.BoxGeometry(1.30, 0.008, 0.066),
    darkChromeMat
  );
  woodChromeStrip.position.set(-0.06, 0.696, 0.344);
  cockpitGroup.add(woodChromeStrip);

  const ambientDashStrip = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.0045, 0.009),
    ambientLedMat
  );
  ambientDashStrip.position.set(0.06, 0.878, 0.336);
  cockpitGroup.add(ambientDashStrip);

  // Waterfall glossy burled walnut center console tunnel
  const centerTunnel = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.30, 0.92),
    walnutWoodMat
  );
  centerTunnel.position.set(-0.14, 0.55, 0.14);
  cockpitGroup.add(centerTunnel);

  // =========================================================================
  // 2. CONTINUOUS MERCEDES-STYLE WIDESCREEN DUAL-DISPLAY (SPEEDOMETER + 3D GPS NAV)
  // =========================================================================
  const widescreenBezel = new THREE.Mesh(
    new THREE.BoxGeometry(1.06, 0.174, 0.022),
    pianoBlackMat
  );
  widescreenBezel.position.set(0.08, 0.962, 0.362);
  cockpitGroup.add(widescreenBezel);

  const widescreenLip = new THREE.Mesh(
    new THREE.BoxGeometry(1.06, 0.006, 0.026),
    darkChromeMat
  );
  widescreenLip.position.set(0.08, 0.875, 0.358);
  cockpitGroup.add(widescreenLip);

  // High-Res 1280x480 Integrated Analog Speedometer + Centered Digital Speed Box + Tachometer!
  const clusterCanvas = document.createElement('canvas');
  clusterCanvas.width = 1280;
  clusterCanvas.height = 480;
  const clusterCtx = clusterCanvas.getContext('2d')!;
  const clusterTex = new THREE.CanvasTexture(clusterCanvas);
  clusterTex.colorSpace = THREE.SRGBColorSpace;
  clusterTex.anisotropy = maxAnisotropy;

  const clusterScreenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.156),
    new THREE.MeshBasicMaterial({ map: clusterTex })
  );
  clusterScreenMesh.position.set(COCKPIT_DRIVER_X, 0.963, 0.348);
  clusterScreenMesh.rotation.y = Math.PI;
  cockpitGroup.add(clusterScreenMesh);

  // High-Res 768x384 Live 3D Perspective GPS Navigation & Multi-Speed NPC Traffic Radar!
  const navCanvas = document.createElement('canvas');
  navCanvas.width = 768;
  navCanvas.height = 384;
  const navCtx = navCanvas.getContext('2d')!;
  const navTex = new THREE.CanvasTexture(navCanvas);
  navTex.colorSpace = THREE.SRGBColorSpace;
  navTex.anisotropy = maxAnisotropy;

  const navScreenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.49, 0.156),
    new THREE.MeshBasicMaterial({ map: navTex })
  );
  navScreenMesh.position.set(-0.155, 0.963, 0.348);
  navScreenMesh.rotation.y = Math.PI;
  cockpitGroup.add(navScreenMesh);

  // =========================================================================
  // 3. FOUR RECESSED LUXURY TURBINE AIR VENTS + SLEEK CLIMATE TOGGLE SWITCHES
  // =========================================================================
  const leftVent = buildTurbineAirVent(chromeTrimMat, brushedAlumMat, pianoBlackMat, 0.042);
  leftVent.position.set(0.625, 0.930, 0.342);
  leftVent.rotation.y = -0.22;
  cockpitGroup.add(leftVent);

  const centerVentXs = [-0.02, -0.155, -0.29];
  centerVentXs.forEach((vx) => {
    const cVent = buildTurbineAirVent(chromeTrimMat, brushedAlumMat, pianoBlackMat, 0.043);
    cVent.position.set(vx, 0.802, 0.316);
    cVent.rotation.x = -0.10;
    cockpitGroup.add(cVent);
  });

  const buttonBank = new THREE.Group();
  buttonBank.position.set(-0.155, 0.722, 0.314);
  for (let i = 0; i < 7; i++) {
    const btn = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.014, 0.012),
      i === 3
        ? new THREE.MeshStandardMaterial({
            color: 0xb91c1c,
            emissive: 0x7f1d1d,
            emissiveIntensity: 0.8,
            roughness: 0.25,
          })
        : darkChromeMat
    );
    btn.position.x = (i - 3) * 0.035;
    buttonBank.add(btn);
  }
  cockpitGroup.add(buttonBank);

  // =========================================================================
  // 4. COMPLETE LUXURY DRIVER-SIDE DOOR CARD (WALNUT + SEAT SWITCHES + BURMESTER)
  // =========================================================================
  const doorGroup = new THREE.Group();
  cockpitGroup.add(doorGroup);

  const doorUpperSill = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.095, 1.10),
    leatherDashMat
  );
  doorUpperSill.position.set(0.79, 0.962, 0.05);
  doorUpperSill.rotation.y = 0.05;
  doorGroup.add(doorUpperSill);

  const doorWoodPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.075, 0.26, 1.00),
    walnutWoodMat
  );
  doorWoodPanel.position.set(0.755, 0.795, 0.05);
  doorWoodPanel.rotation.y = 0.05;
  doorGroup.add(doorWoodPanel);

  // Warm ambient fiber-optic light pipe wrapping seamlessly along door trim
  const doorAmbientPipe = new THREE.Mesh(
    new THREE.BoxGeometry(0.007, 0.0055, 0.96),
    ambientLedMat
  );
  doorAmbientPipe.position.set(0.713, 0.916, 0.05);
  doorAmbientPipe.rotation.y = 0.05;
  doorGroup.add(doorAmbientPipe);

  const doorChromeTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.080, 0.009, 1.00),
    darkChromeMat
  );
  doorChromeTop.position.set(0.75, 0.922, 0.05);
  doorChromeTop.rotation.y = 0.05;
  const doorChromeBot = new THREE.Mesh(
    new THREE.BoxGeometry(0.080, 0.009, 1.00),
    darkChromeMat
  );
  doorChromeBot.position.set(0.75, 0.674, 0.05);
  doorChromeBot.rotation.y = 0.05;
  doorGroup.add(doorChromeTop, doorChromeBot);

  const doorArmrest = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.12, 0.86),
    leatherDarkMat
  );
  doorArmrest.position.set(0.735, 0.615, 0.00);
  doorGroup.add(doorArmrest);

  // Authentic Mercedes Brushed-Chrome Seat Adjustment Switch Cluster on Left Door!
  const seatSwitchBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.020, 0.084, 0.16),
    pianoBlackMat
  );
  seatSwitchBase.position.set(0.715, 0.812, -0.02);
  doorGroup.add(seatSwitchBase);

  const seatHead = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.024, 0.020), chromeTrimMat);
  seatHead.position.set(0.703, 0.842, -0.068);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.048, 0.020), chromeTrimMat);
  seatBack.position.set(0.703, 0.814, -0.032);
  seatBack.rotation.x = 0.25;
  const seatCushion = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.020, 0.054), chromeTrimMat);
  seatCushion.position.set(0.703, 0.788, 0.008);
  doorGroup.add(seatHead, seatBack, seatCushion);

  for (let i = 0; i < 3; i++) {
    const memBtn = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.017, 0.024), brushedAlumMat);
    memBtn.position.set(0.710, 0.866, -0.04 + i * 0.032);
    doorGroup.add(memBtn);
  }

  // Perforated Burmester Door Mid-Range Speaker Grille
  const doorSpeakerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.056, 0.006, 12, 28),
    brushedAlumMat
  );
  doorSpeakerRing.rotation.y = Math.PI / 2 + 0.05;
  doorSpeakerRing.position.set(0.712, 0.802, 0.165);
  const doorSpeakerGrille = new THREE.Mesh(
    new THREE.CircleGeometry(0.054, 24),
    speakerMeshMat
  );
  doorSpeakerGrille.rotation.y = -Math.PI / 2 + 0.05;
  doorSpeakerGrille.position.set(0.714, 0.802, 0.165);
  doorGroup.add(doorSpeakerRing, doorSpeakerGrille);

  // =========================================================================
  // 5. SEAMLESS CURVED AUTOMOTIVE WINDSHIELD, SAND-TAN A-PILLARS & ENCLOSED HEADLINER
  // =========================================================================
  const leftPillarPts: THREE.Vector3[] = [];
  const rightPillarPts: THREE.Vector3[] = [];
  const leftSealPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const v = i / 8;
    const lp = sampleWindshieldPoint(1.0, v, -0.025);
    lp.x += 0.015;
    leftPillarPts.push(lp);

    const ls = sampleWindshieldPoint(1.0, v, -0.06);
    ls.x += 0.052;
    leftSealPts.push(ls);

    const rp = sampleWindshieldPoint(-1.0, v, -0.025);
    rp.x -= 0.015;
    rightPillarPts.push(rp);
  }
  const leftTopCorner = sampleWindshieldPoint(1.0, 1.0, -0.06);
  leftSealPts.push(
    new THREE.Vector3(leftTopCorner.x + 0.045, leftTopCorner.y + 0.01, -0.05),
    new THREE.Vector3(leftTopCorner.x + 0.045, leftTopCorner.y + 0.01, -0.64)
  );

  const leftAPillar = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftPillarPts), 24, 0.056, 16, false),
    alcantaraMat
  );
  const rightAPillar = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rightPillarPts), 24, 0.056, 16, false),
    alcantaraMat
  );
  const leftRubberSeal = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftSealPts), 28, 0.026, 12, false),
    rubberSealMat
  );
  cockpitGroup.add(leftAPillar, rightAPillar, leftRubberSeal);

  const upperDoorFrame = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(leftTopCorner.x + 0.015, leftTopCorner.y + 0.015, leftTopCorner.z + 0.05),
        new THREE.Vector3(leftTopCorner.x + 0.025, leftTopCorner.y + 0.025, -0.10),
        new THREE.Vector3(leftTopCorner.x + 0.025, leftTopCorner.y + 0.02, -0.68),
      ]),
      16,
      0.046,
      12,
      false
    ),
    alcantaraMat
  );
  cockpitGroup.add(upperDoorFrame);

  const roofArchPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const u = 1.04 - (i / 10) * 2.08;
    const pt = sampleWindshieldPoint(Math.max(-1, Math.min(1, u)), 1.0, -0.022);
    pt.x = u * 0.725;
    pt.y += 0.028;
    roofArchPts.push(pt);
  }
  const curvedRoofHeader = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(roofArchPts), 28, 0.056, 12, false),
    alcantaraMat
  );
  cockpitGroup.add(curvedRoofHeader);

  // Full Enclosed Alcantara Headliner Canopy (100% watertight roof above driver)
  const roofCanopyPositions: number[] = [];
  const roofCanopyUvs: number[] = [];
  const roofCanopyIndices: number[] = [];
  const roofSegU = 16;
  const roofSegZ = 6;
  for (let iz = 0; iz <= roofSegZ; iz++) {
    const tz = iz / roofSegZ;
    for (let iu = 0; iu <= roofSegU; iu++) {
      const uNorm = iu / roofSegU;
      const u = 1 - uNorm * 2;
      const headerPt = sampleWindshieldPoint(u, 1.0, -0.01);
      const x = headerPt.x * (1.03 + tz * 0.06);
      const y = headerPt.y + 0.032 + Math.sin(tz * Math.PI * 0.5) * 0.055;
      const z = headerPt.z - tz * 1.10;
      roofCanopyPositions.push(x, y, z);
      roofCanopyUvs.push(uNorm * 2, tz * 2);
    }
  }
  const rStride = roofSegU + 1;
  for (let iz = 0; iz < roofSegZ; iz++) {
    for (let iu = 0; iu < roofSegU; iu++) {
      const a = iz * rStride + iu;
      const b = a + 1;
      const c = (iz + 1) * rStride + iu;
      const d = c + 1;
      roofCanopyIndices.push(a, b, c, b, d, c);
    }
  }
  const roofCanopyGeo = new THREE.BufferGeometry();
  roofCanopyGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofCanopyPositions, 3));
  roofCanopyGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roofCanopyUvs, 2));
  roofCanopyGeo.setIndex(roofCanopyIndices);
  roofCanopyGeo.computeVertexNormals();
  const roofCanopyMat = alcantaraMat.clone();
  roofCanopyMat.side = THREE.DoubleSide;
  cockpitGroup.add(new THREE.Mesh(roofCanopyGeo, roofCanopyMat));

  // Sleek Frameless Auto-Dimming Rearview Mirror neatly tucked at top-center
  const topCenterPt = sampleWindshieldPoint(0, 0.96, -0.02);
  const mirrorSensorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.070, 0.062), pianoBlackMat);
  mirrorSensorHousing.position.set(0.0, topCenterPt.y - 0.012, topCenterPt.z - 0.02);
  const mirrorStalk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.010, 0.060, 10), pianoBlackMat);
  mirrorStalk.position.set(0.0, topCenterPt.y - 0.055, topCenterPt.z - 0.042);
  mirrorStalk.rotation.x = 0.42;
  const rearViewMirror = new THREE.Mesh(new THREE.BoxGeometry(0.215, 0.048, 0.018), pianoBlackMat);
  rearViewMirror.position.set(0.0, topCenterPt.y - 0.078, topCenterPt.z - 0.062);
  const rearViewGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.205, 0.040),
    new THREE.MeshPhysicalMaterial({ color: 0x161d28, roughness: 0.04, metalness: 0.95, clearcoat: 1.0 })
  );
  rearViewGlass.position.set(0.0, topCenterPt.y - 0.078, topCenterPt.z - 0.072);
  rearViewGlass.rotation.y = Math.PI;
  cockpitGroup.add(mirrorSensorHousing, mirrorStalk, rearViewMirror, rearViewGlass);

  // Curved Windshield Acoustic Glass + Slim Perimeter Ceramic Seal
  const curvedWindshieldGeo = createParametricWindshieldGeometry(28, 12, 0.0);
  const windshieldFritMesh = new THREE.Mesh(
    curvedWindshieldGeo,
    new THREE.MeshBasicMaterial({
      map: mats.windshieldFritMap,
      transparent: true,
      depthWrite: false,
    })
  );
  cockpitGroup.add(windshieldFritMesh);

  const windshieldSpecularGlass = new THREE.Mesh(
    createParametricWindshieldGeometry(24, 10, 0.004),
    new THREE.MeshPhysicalMaterial({
      color: 0xd8eefc,
      transparent: true,
      opacity: 0.045,
      roughness: 0.03,
      metalness: 0.14,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      depthWrite: false,
    })
  );
  cockpitGroup.add(windshieldSpecularGlass);

  // Subtle Driver-Side Window Glass
  const sideWindowGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.98, 0.56),
    new THREE.MeshPhysicalMaterial({
      color: 0xcbe4f6,
      transparent: true,
      opacity: 0.05,
      roughness: 0.04,
      metalness: 0.15,
      clearcoat: 1.0,
      depthWrite: false,
    })
  );
  sideWindowGlass.position.set(0.835, 1.26, 0.00);
  sideWindowGlass.rotation.y = -Math.PI / 2;
  cockpitGroup.add(sideWindowGlass);

  // Sculpted Curved Gloss-Black Mirror Sail Corner + Metallic Burmester 3D Teardrop Tweeter Pod
  // (Smooth curved triangle tucked neatly into the A-pillar/door corner — exact match to reference!)
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0.28, 0.99);
  sailShape.lineTo(0.66, 0.99);
  sailShape.quadraticCurveTo(0.57, 1.15, 0.50, 1.20);
  sailShape.quadraticCurveTo(0.36, 1.10, 0.28, 0.99);
  const sailGeo = new THREE.ExtrudeGeometry(sailShape, {
    steps: 1,
    depth: 0.032,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 2,
  });
  sailGeo.rotateY(-Math.PI / 2);
  const mirrorSailPanel = new THREE.Mesh(sailGeo, pianoBlackMat);
  mirrorSailPanel.position.set(0.835, 0, 0);
  cockpitGroup.add(mirrorSailPanel);

  // Signature Metallic Teardrop Burmester Tweeter Pod (exact placement & angle as reference!)
  const tweeterPodGroup = new THREE.Group();
  tweeterPodGroup.position.set(0.798, 1.068, 0.42);
  tweeterPodGroup.rotation.y = 0.44;
  tweeterPodGroup.rotation.z = 0.16;

  const tweeterShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.046, 20, 14),
    brushedAlumMat
  );
  tweeterShell.scale.set(0.45, 1.12, 0.88);
  tweeterPodGroup.add(tweeterShell);

  const tweeterMeshDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.036, 24),
    speakerMeshMat
  );
  tweeterMeshDisc.rotation.y = -Math.PI / 2;
  tweeterMeshDisc.position.x = -0.020;
  tweeterPodGroup.add(tweeterMeshDisc);

  const tweeterRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.036, 0.0045, 12, 26),
    chromeTrimMat
  );
  tweeterRing.rotation.y = Math.PI / 2;
  tweeterRing.position.x = -0.021;
  tweeterPodGroup.add(tweeterRing);
  cockpitGroup.add(tweeterPodGroup);

  // Sculpted Exterior Aerodynamic Wing Mirror
  const sideMirrorGroup = new THREE.Group();
  sideMirrorGroup.position.set(0.98, 1.075, 0.28);
  const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.022, 0.040), pianoBlackMat);
  mirrorArm.position.set(-0.075, -0.02, 0.01);
  const mirrorHousing = new THREE.Mesh(new THREE.SphereGeometry(0.088, 20, 14), pianoBlackMat);
  mirrorHousing.scale.set(1.12, 0.68, 0.56);
  const mirrorGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, 0.086),
    new THREE.MeshPhysicalMaterial({ color: 0x3b3532, roughness: 0.04, metalness: 0.96, clearcoat: 1.0 })
  );
  mirrorGlass.position.set(0, 0, -0.046);
  mirrorGlass.rotation.y = Math.PI;
  sideMirrorGroup.add(mirrorArm, mirrorHousing, mirrorGlass);
  cockpitGroup.add(sideMirrorGroup);

  // =========================================================================
  // 6. ULTRA-SCULPTED AMG STEERING WHEEL (100% UNOBSTRUCTED GAUGE SIGHTLINE!) + ANATOMICAL HANDS
  // =========================================================================
  // Sleek hidden dark steering shaft (completely tucked behind hub — never protrudes visually!)
  const steeringColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.030, 0.038, 0.14, 14),
    rubberSealMat
  );
  steeringColumn.rotation.x = Math.PI / 2 - 0.14;
  steeringColumn.position.set(COCKPIT_DRIVER_X, 0.80, 0.27);
  cockpitGroup.add(steeringColumn);

  // Carefully calculated ergonomic wheel center (y=0.778, radius=0.224) so the ENTIRE left Speedometer,
  // center digital KM/H readout, and right Tachometer sit 100% UNOBSTRUCTED inside the open wheel arch!
  const steeringWheelPivot = new THREE.Group();
  steeringWheelPivot.position.set(COCKPIT_DRIVER_X, 0.778, 0.15);
  steeringWheelPivot.rotation.x = -0.14;
  cockpitGroup.add(steeringWheelPivot);

  const wheelRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.224, 0.017, 20, 56),
    leatherDarkMat
  );
  steeringWheelPivot.add(wheelRim);

  // Ergonomic sculpted 9-and-3 thumb bolsters wrapped around the leather rim
  const bolsterGeo = new THREE.SphereGeometry(0.022, 12, 10);
  bolsterGeo.scale(0.85, 1.75, 0.95);
  const bolsterL = new THREE.Mesh(bolsterGeo, leatherDarkMat);
  bolsterL.position.set(0.214, 0.042, 0);
  bolsterL.rotation.z = -0.22;
  const bolsterR = bolsterL.clone();
  bolsterR.position.x = -0.214;
  bolsterR.rotation.z = 0.22;
  steeringWheelPivot.add(bolsterL, bolsterR);

  // Sleek sculpted rounded center airbag boss with crisp circular emblem crest (matches reference!)
  const centerHub = new THREE.Mesh(
    new THREE.SphereGeometry(0.068, 28, 18),
    leatherDarkMat
  );
  centerHub.scale.set(1.02, 1.0, 0.42);
  centerHub.position.z = -0.002;
  steeringWheelPivot.add(centerHub);

  const hubCrestRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.028, 0.0032, 12, 32),
    chromeTrimMat
  );
  hubCrestRing.position.z = -0.030;
  steeringWheelPivot.add(hubCrestRing);

  const triEmblemRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.0145, 0.0024, 6, 3),
    chromeTrimMat
  );
  triEmblemRing.position.set(0, -0.001, -0.031);
  triEmblemRing.rotation.z = Math.PI / 6;
  steeringWheelPivot.add(triEmblemRing);

  // Sculpted Horizontal Multifunction Spokes with Subtle Illuminated Control Clusters
  const buildWheelSpokePod = (side: -1 | 1) => {
    const pod = new THREE.Group();
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.046, 0.018), pianoBlackMat);
    spoke.position.set(side * 0.118, -0.016, -0.002);
    spoke.rotation.z = -side * 0.10;
    pod.add(spoke);

    const spokeTrim = new THREE.Mesh(new THREE.BoxGeometry(0.120, 0.0055, 0.020), darkChromeMat);
    spokeTrim.position.set(side * 0.118, -0.038, -0.002);
    spokeTrim.rotation.z = -side * 0.10;
    pod.add(spokeTrim);

    const btnGlowMat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1 });
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const micro = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.004), btnGlowMat);
        micro.position.set(side * (0.092 + c * 0.019), -0.009 - r * 0.014, -0.013);
        pod.add(micro);
      }
    }
    return pod;
  };
  steeringWheelPivot.add(buildWheelSpokePod(-1), buildWheelSpokePod(1));

  // Twin Bottom Chrome Spokes
  const bottomSpokeL = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.125, 0.014), darkChromeMat);
  bottomSpokeL.position.set(-0.026, -0.124, -0.002);
  bottomSpokeL.rotation.z = -0.14;
  const bottomSpokeR = bottomSpokeL.clone();
  bottomSpokeR.position.x = 0.026;
  bottomSpokeR.rotation.z = 0.14;
  steeringWheelPivot.add(bottomSpokeL, bottomSpokeR);

  // Anatomically Shaded Natural Driver Hands & Seamless Tapered Forearms (matches reference!)
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0x9b6447,
    roughness: 0.72,
    metalness: 0.02,
  });

  const leftWristMarker = new THREE.Object3D();
  const rightWristMarker = new THREE.Object3D();

  const createGripHandOnWheel = (side: -1 | 1, wristMarker: THREE.Object3D) => {
    const handGroup = new THREE.Group();

    // Sculpted back-of-hand & palm wrapping smoothly around 9-and-3 rim bolster
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.030, 16, 12), skinMat);
    palm.scale.set(0.88, 1.38, 0.78);
    palm.position.set(side * 0.218, -0.006, -0.014);
    palm.rotation.z = side * 0.20;
    handGroup.add(palm);

    // Relaxed curved thumb resting inside the wheel rim
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.036, 6, 12), skinMat);
    thumb.position.set(side * 0.184, 0.016, -0.022);
    thumb.rotation.z = side * 1.18;
    thumb.rotation.y = -side * 0.32;
    handGroup.add(thumb);

    // 4 curved fingers gripping outer wheel circumference
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.026, 5, 10), skinMat);
      finger.position.set(side * 0.222, 0.018 - f * 0.015, 0.014);
      finger.rotation.x = Math.PI / 2;
      handGroup.add(finger);
    }

    wristMarker.position.set(side * 0.225, -0.030, -0.024);
    handGroup.add(wristMarker);

    return handGroup;
  };

  steeringWheelPivot.add(
    createGripHandOnWheel(1, leftWristMarker),
    createGripHandOnWheel(-1, rightWristMarker)
  );

  // Seamless Tapered Natural Forearm (LatheGeometry-style smooth taper, zero artificial sleeve seam!)
  const buildForearmAssembly = () => {
    const arm = new THREE.Group();
    const forearmMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.023, 0.037, 1.0, 16),
      skinMat
    );
    arm.add(forearmMesh);
    return arm;
  };

  const leftForearmGroup = buildForearmAssembly();
  const rightForearmGroup = buildForearmAssembly();
  cockpitGroup.add(leftForearmGroup, rightForearmGroup);

  const leftElbowLocal = new THREE.Vector3(COCKPIT_DRIVER_X + 0.30, 0.44, -0.34);
  const rightElbowLocal = new THREE.Vector3(COCKPIT_DRIVER_X - 0.30, 0.44, -0.34);
  const _wristLocal = new THREE.Vector3();
  const _armDir = new THREE.Vector3();
  const _armUp = new THREE.Vector3(0, 1, 0);

  const alignForearm = (
    forearmGroup: THREE.Group,
    elbowPos: THREE.Vector3,
    wristMarker: THREE.Object3D
  ) => {
    _wristLocal.copy(wristMarker.position);
    _wristLocal.applyMatrix4(steeringWheelPivot.matrix);

    forearmGroup.position.lerpVectors(elbowPos, _wristLocal, 0.5);
    _armDir.subVectors(_wristLocal, elbowPos);
    const len = Math.max(0.12, _armDir.length());
    forearmGroup.scale.set(1, len, 1);
    _armDir.divideScalar(len);
    forearmGroup.quaternion.setFromUnitVectors(_armUp, _armDir);
  };

  const updateDriverHands = () => {
    steeringWheelPivot.updateMatrix();
    alignForearm(leftForearmGroup, leftElbowLocal, leftWristMarker);
    alignForearm(rightForearmGroup, rightElbowLocal, rightWristMarker);
  };
  updateDriverHands();

  // Footwell Accelerator & Brake Pedals
  const brakePedalMesh = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.06, 0.02), brushedAlumMat);
  brakePedalMesh.position.set(COCKPIT_DRIVER_X + 0.05, 0.48, 0.44);
  const accelPedalMesh = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.125, 0.02), brushedAlumMat);
  accelPedalMesh.position.set(COCKPIT_DRIVER_X - 0.08, 0.48, 0.46);
  cockpitGroup.add(brakePedalMesh, accelPedalMesh);

  // =========================================================================
  // 7. SLEEK LOW-PROFILE AERO WINDSHIELD WIPERS & CURVED RAIN DROPLETS
  // =========================================================================
  const wiperMat = new THREE.MeshStandardMaterial({
    color: 0x0d1015,
    roughness: 0.40,
    metalness: 0.65,
  });

  const buildWiperPivot = (pivotX: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(pivotX, 0.96, 0.74);
    pivot.rotation.x = -0.38;

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.42, 0.007), wiperMat);
    arm.position.set(0, 0.21, 0);
    pivot.add(arm);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.34, 0.009), wiperMat);
    blade.position.set(-0.006, 0.29, -0.004);
    pivot.add(blade);

    cockpitGroup.add(pivot);
    return pivot;
  };

  const leftWiperPivot = buildWiperPivot(0.45);
  const rightWiperPivot = buildWiperPivot(-0.08);

  const rainGlassCanvas = document.createElement('canvas');
  rainGlassCanvas.width = 512;
  rainGlassCanvas.height = 256;
  const rainGlassCtx = rainGlassCanvas.getContext('2d')!;
  const rainGlassTex = new THREE.CanvasTexture(rainGlassCanvas);
  rainGlassTex.colorSpace = THREE.SRGBColorSpace;

  const windshieldRainMesh = new THREE.Mesh(
    createParametricWindshieldGeometry(24, 10, 0.008),
    new THREE.MeshBasicMaterial({
      map: rainGlassTex,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
    })
  );
  cockpitGroup.add(windshieldRainMesh);

  const rainDrops: RainDrop2D[] = Array.from({ length: 165 }, (_, idx) => ({
    x: ((idx * 97) % 472) + 20,
    y: ((idx * 53) % 210) + 22,
    r: 1.3 + (idx % 4) * 0.8,
    alpha: 0.26 + (idx % 5) * 0.11,
    streak: 2.0 + (idx % 5) * 2.2,
  }));

  // =========================================================================
  // 8. HYPERREALISTIC INTEGRATED SPEEDOMETER (0-260 KM/H) + TACHOMETER + 3D GPS NAV
  // =========================================================================
  const drawHyperrealDial = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    valueNorm: number,
    labels: string[],
    unitLabel: string,
    hasRedline: boolean
  ) => {
    const aura = ctx.createRadialGradient(cx, cy, radius * 0.12, cx, cy, radius * 1.08);
    aura.addColorStop(0, 'rgba(18, 34, 62, 0.96)');
    aura.addColorStop(0.72, 'rgba(32, 70, 118, 0.65)');
    aura.addColorStop(0.95, 'rgba(56, 189, 248, 0.25)');
    aura.addColorStop(1, 'rgba(6, 10, 18, 0.0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#d8e2ee';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 9, 0, Math.PI * 2);
    ctx.stroke();

    const startAng = Math.PI * 0.78;
    const endAng = Math.PI * 2.22;
    const sweep = endAng - startAng;
    const clampedNorm = Math.max(0, Math.min(1, valueNorm));

    ctx.strokeStyle = hasRedline && clampedNorm > 0.78 ? 'rgba(239, 68, 68, 0.55)' : 'rgba(56, 189, 248, 0.42)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 22, startAng, startAng + clampedNorm * sweep);
    ctx.stroke();

    if (hasRedline) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 22, startAng + sweep * 0.78, endAng);
      ctx.stroke();
    }

    const count = labels.length - 1;
    for (let i = 0; i <= count * 5; i++) {
      const t = i / (count * 5);
      const ang = startAng + t * sweep;
      const isMajor = i % 5 === 0;
      const rOuter = radius - 14;
      const rInner = isMajor ? radius - 34 : radius - 23;

      ctx.strokeStyle =
        hasRedline && t >= 0.78 ? '#f87171' : isMajor ? '#ffffff' : 'rgba(203, 213, 225, 0.58)';
      ctx.lineWidth = isMajor ? 3.5 : 1.8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * rInner, cy + Math.sin(ang) * rInner);
      ctx.lineTo(cx + Math.cos(ang) * rOuter, cy + Math.sin(ang) * rOuter);
      ctx.stroke();

      if (isMajor) {
        const lbl = labels[i / 5];
        const rText = radius - 56;
        ctx.fillStyle = hasRedline && t >= 0.78 ? '#fca5a5' : '#f8fafc';
        ctx.font = 'bold 25px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(lbl, cx + Math.cos(ang) * rText, cy + Math.sin(ang) * rText);
      }
    }

    ctx.fillStyle = '#93c5fd';
    ctx.font = '600 18px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(unitLabel, cx, cy + radius * 0.56);

    const needleAng = startAng + clampedNorm * sweep;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(needleAng) * 20 + 2, cy - Math.sin(needleAng) * 20 + 3);
    ctx.lineTo(cx + Math.cos(needleAng) * (radius - 24) + 2, cy + Math.sin(needleAng) * (radius - 24) + 3);
    ctx.stroke();

    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(needleAng) * 20, cy - Math.sin(needleAng) * 20);
    ctx.lineTo(cx + Math.cos(needleAng) * (radius - 22), cy + Math.sin(needleAng) * (radius - 22));
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(needleAng) * (radius - 28), cy + Math.sin(needleAng) * (radius - 28));
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 4;
    ctx.stroke();
  };

  const updateScreens = (v: VehicleState, traffic: TrafficVehicle[], mode: LightingMode) => {
    // 1. Integrated 1280x480 Speedometer (0-260 km/h) + Center Digital Box + Tachometer (0-8000 RPM)
    const bgGrad = clusterCtx.createLinearGradient(0, 0, 0, 480);
    bgGrad.addColorStop(0, '#040810');
    bgGrad.addColorStop(0.5, '#091428');
    bgGrad.addColorStop(1, '#04070d');
    clusterCtx.fillStyle = bgGrad;
    clusterCtx.fillRect(0, 0, 1280, 480);

    drawHyperrealDial(
      clusterCtx,
      292,
      284,
      174,
      v.speedKmh / 260,
      ['0', '40', '80', '120', '160', '200', '260'],
      'km/h',
      false
    );

    drawHyperrealDial(
      clusterCtx,
      988,
      284,
      174,
      v.rpm / 8000,
      ['0', '1', '2', '3', '4', '5', '6', '7', '8'],
      'x1000 RPM',
      true
    );

    // Center Digital Speedometer Readout positioned 100% unobstructed inside the open steering wheel arch!
    clusterCtx.fillStyle = 'rgba(10, 22, 44, 0.96)';
    clusterCtx.fillRect(530, 200, 220, 142);
    clusterCtx.strokeStyle = '#60a5fa';
    clusterCtx.lineWidth = 3.5;
    clusterCtx.strokeRect(530, 200, 220, 142);

    clusterCtx.fillStyle = '#ffffff';
    clusterCtx.font = 'bold 82px "Chakra Petch", monospace';
    clusterCtx.textAlign = 'center';
    clusterCtx.textBaseline = 'middle';
    clusterCtx.fillText(`${Math.round(v.speedKmh)}`, 640, 256);

    clusterCtx.fillStyle = '#93c5fd';
    clusterCtx.font = '600 22px "JetBrains Mono", monospace';
    clusterCtx.fillText('km/h', 640, 314);

    // Live RPM Shift Bar
    const rpmFillW = Math.min(220, (v.rpm / 7600) * 220);
    clusterCtx.fillStyle = '#1e293b';
    clusterCtx.fillRect(530, 354, 220, 10);
    clusterCtx.fillStyle = v.rpm > 6000 ? '#ef4444' : '#38bdf8';
    clusterCtx.fillRect(530, 354, rpmFillW, 10);

    // Gear & Trip Odometer
    clusterCtx.fillStyle = '#fbbf24';
    clusterCtx.font = 'bold 34px "Chakra Petch", sans-serif';
    clusterCtx.fillText(`D${v.gear}`, 572, 404);

    clusterCtx.fillStyle = '#e2e8f0';
    clusterCtx.font = '600 23px "JetBrains Mono", monospace';
    clusterCtx.fillText(`${(v.distanceMeters / 1000).toFixed(2)} km`, 682, 404);

    // Top Status Strip
    clusterCtx.fillStyle = mode === 'night' ? '#38bdf8' : '#fbbf24';
    clusterCtx.font = '600 20px "JetBrains Mono", monospace';
    clusterCtx.fillText(
      mode === 'night' ? '23:05  ·  12°C  ·  AUTO LED  ·  3.6 KM' : '14:20  ·  21°C  ·  DAYLIGHT  ·  3.6 KM',
      640,
      78
    );

    clusterTex.needsUpdate = true;

    // 2. Live 3D Perspective GPS Navigation & Multi-Tier Speed Traffic Radar
    const navGrad = navCtx.createLinearGradient(0, 0, 0, 384);
    navGrad.addColorStop(0, '#071726');
    navGrad.addColorStop(0.55, '#0c273b');
    navGrad.addColorStop(1, '#061826');
    navCtx.fillStyle = navGrad;
    navCtx.fillRect(0, 0, 768, 384);

    navCtx.fillStyle = 'rgba(5, 14, 26, 0.88)';
    navCtx.fillRect(0, 0, 174, 384);
    navCtx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
    navCtx.lineWidth = 2;
    navCtx.beginPath();
    navCtx.moveTo(174, 0);
    navCtx.lineTo(174, 384);
    navCtx.stroke();

    const overtakingCount = traffic.filter((c) => c.isOvertaking).length;
    const sidebarRows = [
      { lbl: 'GRAND BLVD', val: '3.62 KM' },
      { lbl: 'SPEED', val: `${Math.round(v.speedKmh)} KM/H` },
      { lbl: 'GEAR / RPM', val: `D${v.gear} · ${(v.rpm / 1000).toFixed(1)}K` },
      { lbl: 'TRAFFIC AI', val: overtakingCount > 0 ? 'OVERTAKING' : `${traffic.length} CARS` },
    ];
    sidebarRows.forEach((row, idx) => {
      const ry = 46 + idx * 82;
      navCtx.fillStyle = '#38bdf8';
      navCtx.font = '600 15px "JetBrains Mono", monospace';
      navCtx.textAlign = 'left';
      navCtx.fillText(row.lbl, 16, ry);
      navCtx.fillStyle = row.val === 'OVERTAKING' ? '#fbbf24' : '#e2e8f0';
      navCtx.font = 'bold 20px "Chakra Petch", sans-serif';
      navCtx.fillText(row.val, 16, ry + 28);
    });

    const mapCx = 470;
    const horizonY = 76;
    const baseY = 384;

    const scrollOffset = (v.distanceMeters * 2.4) % 70;
    navCtx.strokeStyle = 'rgba(103, 232, 249, 0.24)';
    navCtx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const t = (i * 70 + scrollOffset) / 420;
      const y = horizonY + Math.pow(t, 1.55) * (baseY - horizonY);
      navCtx.beginPath();
      navCtx.moveTo(182, y);
      navCtx.lineTo(760, y);
      navCtx.stroke();
    }

    for (let b = -3; b <= 3; b++) {
      if (b === 0) continue;
      navCtx.strokeStyle = 'rgba(56, 189, 248, 0.24)';
      navCtx.beginPath();
      navCtx.moveTo(mapCx + b * 24, horizonY);
      navCtx.lineTo(mapCx + b * 140, baseY);
      navCtx.stroke();
    }

    navCtx.fillStyle = 'rgba(34, 211, 238, 0.22)';
    navCtx.beginPath();
    navCtx.moveTo(mapCx - 16, horizonY);
    navCtx.lineTo(mapCx + 16, horizonY);
    navCtx.lineTo(mapCx + 76, baseY);
    navCtx.lineTo(mapCx - 76, baseY);
    navCtx.closePath();
    navCtx.fill();

    navCtx.strokeStyle = '#38bdf8';
    navCtx.lineWidth = 6;
    navCtx.beginPath();
    navCtx.moveTo(mapCx, horizonY + 8);
    navCtx.lineTo(mapCx, baseY - 24);
    navCtx.stroke();

    // Plot nearby live multi-speed NPCs & overtaking cars on the 3D GPS Radar
    const fwdX = Math.sin(v.heading);
    const fwdZ = Math.cos(v.heading);
    const rightX = -Math.cos(v.heading);
    const rightZ = Math.sin(v.heading);
    for (let i = 0; i < traffic.length; i++) {
      const car = traffic[i];
      const dx = car.x - v.x;
      const dz = car.z - v.z;
      const fwdDist = dx * fwdX + dz * fwdZ;
      const latDist = dx * rightX + dz * rightZ;
      if (fwdDist > -16 && fwdDist < 160 && Math.abs(latDist) < 18) {
        const depthT = Math.max(0.05, Math.min(1, 1 - fwdDist / 160));
        const sy = horizonY + Math.pow(depthT, 1.35) * (baseY - horizonY - 56);
        const sx = mapCx + latDist * (3.5 + depthT * 8.5);
        navCtx.fillStyle = car.isOvertaking
          ? '#fbbf24'
          : car.speedTier === 'superfast'
          ? '#a855f7'
          : car.baseLaneOffset > 0
          ? '#f87171'
          : '#34d399';
        navCtx.beginPath();
        navCtx.arc(sx, sy, 4 + depthT * 4, 0, Math.PI * 2);
        navCtx.fill();
      }
    }

    // Mini 3.62 km Circuit Overview Inset
    const miniCx = 682;
    const miniCy = 86;
    navCtx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
    navCtx.lineWidth = 3.5;
    navCtx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const s = sampleTrackByDistance((i / 48) * TRACK_TOTAL_LENGTH);
      const px = miniCx + s.x * 0.068;
      const py = miniCy - s.z * 0.068;
      if (i === 0) navCtx.moveTo(px, py);
      else navCtx.lineTo(px, py);
    }
    navCtx.closePath();
    navCtx.stroke();
    navCtx.fillStyle = '#22d3ee';
    navCtx.beginPath();
    navCtx.arc(miniCx + v.x * 0.068, miniCy - v.z * 0.068, 4.5, 0, Math.PI * 2);
    navCtx.fill();

    // Glowing Player Navigation Arrow
    navCtx.fillStyle = '#f8fafc';
    navCtx.beginPath();
    navCtx.moveTo(mapCx, 276);
    navCtx.lineTo(mapCx + 24, 332);
    navCtx.lineTo(mapCx, 318);
    navCtx.lineTo(mapCx - 24, 332);
    navCtx.closePath();
    navCtx.fill();
    navCtx.strokeStyle = '#38bdf8';
    navCtx.lineWidth = 3;
    navCtx.stroke();

    navTex.needsUpdate = true;
  };

  const updateRainDroplets = (v: VehicleState, mode: LightingMode, dt: number) => {
    rainGlassCtx.clearRect(0, 0, 512, 256);
    if (mode !== 'night' || v.windshieldWetness <= 0.02) {
      rainGlassTex.needsUpdate = true;
      return;
    }

    const activeCount = Math.floor(rainDrops.length * Math.min(1, v.windshieldWetness * 1.15));
    const speedDrift = (18 + v.speedKmh * 0.65) * dt;
    const wiperAngleNorm = v.wiperBladeAngleRad / 1.28;
    const wipeEdgeX = 54 + wiperAngleNorm * 400;

    for (let i = 0; i < activeCount; i++) {
      const d = rainDrops[i];
      d.y += speedDrift * (0.45 + (i % 3) * 0.35);
      if (d.y > 246) {
        d.y = 14 + (i % 16);
        d.x = ((d.x + 73) % 468) + 22;
      }

      if (v.wiperPhase > 0.02 && Math.abs(d.x - wipeEdgeX) < 34 && d.y > 70) {
        d.alpha = Math.max(0.05, d.alpha * 0.35);
      } else {
        d.alpha = Math.min(0.70, d.alpha + dt * 0.32);
      }

      // Realistic translucent glass water bead (subtle dark refractive base + crisp pinpoint specular highlight)
      const ry = d.r + d.streak * (0.24 + v.speedKmh / 160);
      rainGlassCtx.fillStyle = `rgba(180, 205, 232, ${(d.alpha * 0.24).toFixed(2)})`;
      rainGlassCtx.strokeStyle = `rgba(255, 240, 210, ${(d.alpha * 0.55).toFixed(2)})`;
      rainGlassCtx.lineWidth = 0.7;
      rainGlassCtx.beginPath();
      rainGlassCtx.ellipse(d.x, d.y, d.r * 0.78, ry * 0.78, 0, 0, Math.PI * 2);
      rainGlassCtx.fill();
      rainGlassCtx.stroke();

      // Tiny bright streetlamp specular pinpoint inside each rain bead
      rainGlassCtx.fillStyle = `rgba(255, 250, 235, ${(d.alpha * 0.85).toFixed(2)})`;
      rainGlassCtx.beginPath();
      rainGlassCtx.arc(d.x - d.r * 0.22, d.y - ry * 0.25, Math.max(0.55, d.r * 0.24), 0, Math.PI * 2);
      rainGlassCtx.fill();
    }

    rainGlassTex.needsUpdate = true;
  };

  const setModeVisuals = (mode: LightingMode) => {
    const isNight = mode === 'night';
    windshieldRainMesh.visible = isNight;
    ambientLedMat.emissiveIntensity = isNight ? 1.45 : 0.25;
  };

  return {
    group: cockpitGroup,
    steeringWheelPivot,
    leftWiperPivot,
    rightWiperPivot,
    accelPedalMesh,
    brakePedalMesh,
    windshieldRainMesh,
    updateDriverHands,
    updateScreens,
    updateRainDroplets,
    setModeVisuals,
  };
}
