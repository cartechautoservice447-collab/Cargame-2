import * as THREE from 'three';
import {
  LightingMode,
  TRACK_ROAD_HALF_WIDTH,
  TRACK_TOTAL_LENGTH,
  TrafficVehicle,
  sampleTrackByDistance,
} from './drivingPhysics';
import { ProceduralMaterialPack } from './proceduralMaterials';

export interface TrafficVisualRig {
  group: THREE.Group;
  wheels: THREE.Group[];
  tailMat: THREE.MeshStandardMaterial;
  leftIndicatorMat: THREE.MeshStandardMaterial;
  rightIndicatorMat: THREE.MeshStandardMaterial;
  headlightFlares: THREE.Sprite[];
  wetRefMeshes: THREE.Mesh[];
}

export interface PedestrianAgent {
  group: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  s: number;
  side: -1 | 1;
  dir: -1 | 1;
  speed: number;
  phase: number;
}

export interface CityEnvironmentRig {
  roadMat: THREE.MeshPhysicalMaterial;
  skyDomeMesh: THREE.Mesh;
  trafficVisuals: TrafficVisualRig[];
  pedestrians: PedestrianAgent[];
  setModeVisuals: (mode: LightingMode) => void;
  updateDynamicLights: (playerX: number, playerZ: number, mode: LightingMode) => void;
  updatePedestrians: (dt: number) => void;
}

const _up = new THREE.Vector3(0, 1, 0);
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

function buildRibbonGeometry(
  innerOffset: number,
  outerOffset: number,
  yOffset: number,
  segments = 420,
  uvVRepeat = 1
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const s = (i / segments) * TRACK_TOTAL_LENGTH;
    const sample = sampleTrackByDistance(s);
    const ix = sample.x + sample.normalX * innerOffset;
    const iz = sample.z + sample.normalZ * innerOffset;
    const ox = sample.x + sample.normalX * outerOffset;
    const oz = sample.z + sample.normalZ * outerOffset;

    positions.push(ix, yOffset, iz, ox, yOffset, oz);
    normals.push(0, 1, 0, 0, 1, 0);
    const vCoord = (i / segments) * uvVRepeat;
    uvs.push(0, vCoord, 1, vCoord);

    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function buildCurbWallGeometry(offset: number, height: number, segments = 420): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const sign = offset >= 0 ? -1 : 1;

  for (let i = 0; i <= segments; i++) {
    const s = (i / segments) * TRACK_TOTAL_LENGTH;
    const sample = sampleTrackByDistance(s);
    const x = sample.x + sample.normalX * offset;
    const z = sample.z + sample.normalZ * offset;

    positions.push(x, 0.01, z, x, height, z);
    normals.push(sample.normalX * sign, 0, sample.normalZ * sign, sample.normalX * sign, 0, sample.normalZ * sign);
    uvs.push(i / 20, 0, i / 20, 1);

    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * Aerodynamic Sculpted European Automobile Chassis (ExtrudeGeometry side silhouette with soft bevels).
 */
function createSculptedCarBodyGeometry(bodyType: 'sedan' | 'suv' | 'coupe'): THREE.BufferGeometry {
  const shape = new THREE.Shape();

  if (bodyType === 'coupe') {
    shape.moveTo(-2.12, 0.28);
    shape.lineTo(2.14, 0.28);
    shape.quadraticCurveTo(2.24, 0.42, 2.15, 0.65);
    shape.quadraticCurveTo(1.85, 0.78, 1.05, 0.85);
    shape.lineTo(0.28, 1.28);
    shape.quadraticCurveTo(-0.35, 1.35, -0.96, 1.24);
    shape.lineTo(-1.82, 0.89);
    shape.quadraticCurveTo(-2.17, 0.82, -2.18, 0.56);
    shape.closePath();
  } else if (bodyType === 'suv') {
    shape.moveTo(-2.22, 0.34);
    shape.lineTo(2.22, 0.34);
    shape.quadraticCurveTo(2.31, 0.54, 2.22, 0.82);
    shape.lineTo(1.12, 0.96);
    shape.lineTo(0.42, 1.56);
    shape.lineTo(-1.58, 1.56);
    shape.lineTo(-2.16, 1.04);
    shape.quadraticCurveTo(-2.26, 0.78, -2.24, 0.52);
    shape.closePath();
  } else {
    shape.moveTo(-2.24, 0.30);
    shape.lineTo(2.24, 0.30);
    shape.quadraticCurveTo(2.33, 0.46, 2.24, 0.68);
    shape.quadraticCurveTo(1.86, 0.82, 1.08, 0.87);
    shape.lineTo(0.32, 1.36);
    shape.quadraticCurveTo(-0.35, 1.41, -0.98, 1.34);
    shape.lineTo(-1.62, 0.92);
    shape.lineTo(-2.20, 0.85);
    shape.quadraticCurveTo(-2.28, 0.64, -2.26, 0.46);
    shape.closePath();
  }

  const width = bodyType === 'suv' ? 1.84 : 1.76;
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.065,
    bevelSegments: 3,
  });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function createSculptedGreenhouseGeometry(bodyType: 'sedan' | 'suv' | 'coupe'): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  if (bodyType === 'coupe') {
    shape.moveTo(-1.70, 0.87);
    shape.lineTo(0.96, 0.84);
    shape.lineTo(0.24, 1.24);
    shape.quadraticCurveTo(-0.35, 1.30, -0.90, 1.20);
    shape.closePath();
  } else if (bodyType === 'suv') {
    shape.moveTo(-2.06, 1.01);
    shape.lineTo(1.04, 0.96);
    shape.lineTo(0.38, 1.50);
    shape.lineTo(-1.52, 1.50);
    shape.closePath();
  } else {
    shape.moveTo(-1.54, 0.90);
    shape.lineTo(1.00, 0.86);
    shape.lineTo(0.28, 1.31);
    shape.quadraticCurveTo(-0.35, 1.35, -0.92, 1.29);
    shape.closePath();
  }
  const width = bodyType === 'suv' ? 1.72 : 1.64;
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

interface SharedCarParts {
  bodyGeos: Record<'sedan' | 'suv' | 'coupe', THREE.BufferGeometry>;
  glassGeos: Record<'sedan' | 'suv' | 'coupe', THREE.BufferGeometry>;
  tireGeo: THREE.CylinderGeometry;
  rimGeo: THREE.CylinderGeometry;
  spokeGeo: THREE.BoxGeometry;
  tireMat: THREE.MeshStandardMaterial;
  rimMat: THREE.MeshPhysicalMaterial;
  glassMat: THREE.MeshPhysicalMaterial;
  trimMat: THREE.MeshStandardMaterial;
  chromeMat: THREE.MeshPhysicalMaterial;
  headlightMat: THREE.MeshStandardMaterial;
}

function createSpinningAlloyWheel(parts: SharedCarParts): THREE.Group {
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(parts.tireGeo, parts.tireMat));
  wheel.add(new THREE.Mesh(parts.rimGeo, parts.rimMat));
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(parts.spokeGeo, parts.chromeMat);
    sp.rotation.x = (i / 5) * Math.PI * 2;
    wheel.add(sp);
  }
  return wheel;
}

function buildHyperrealCarGroup(
  colorHex: number,
  bodyType: 'sedan' | 'suv' | 'coupe',
  mats: ProceduralMaterialPack,
  parts: SharedCarParts,
  includeReflectionAndFlares: boolean,
  isOncoming: boolean,
  isSoftwareGl: boolean
): TrafficVisualRig {
  const g = new THREE.Group();

  // Deep grounded contact shadow directly under tires & chassis
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.35, 4.9),
    new THREE.MeshBasicMaterial({
      color: 0x030406,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.025;
  g.add(contactShadow);

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: colorHex,
    roughness: 0.14,
    metalness: 0.68,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });

  const bodyMesh = new THREE.Mesh(parts.bodyGeos[bodyType], paintMat);
  bodyMesh.castShadow = !isSoftwareGl;
  bodyMesh.receiveShadow = !isSoftwareGl;
  g.add(bodyMesh);

  const glassMesh = new THREE.Mesh(parts.glassGeos[bodyType], parts.glassMat);
  g.add(glassMesh);

  const halfLen = bodyType === 'coupe' ? 2.16 : 2.25;
  const frontY = bodyType === 'suv' ? 0.68 : 0.58;
  const rearY = bodyType === 'suv' ? 0.84 : 0.72;

  // Front radiator grille + chrome slats + lower splitter + rear diffuser + dual exhausts
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.24, 0.08), parts.trimMat);
  grille.position.set(0, frontY - 0.02, halfLen + 0.01);
  g.add(grille);

  for (let s = -1; s <= 1; s++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.018, 0.09), parts.chromeMat);
    slat.position.set(0, frontY - 0.02 + s * 0.065, halfLen + 0.015);
    g.add(slat);
  }

  const frontSplitter = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.10, 0.16), parts.trimMat);
  frontSplitter.position.set(0, 0.30, halfLen - 0.02);
  const rearDiffuser = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.16, 0.14), parts.trimMat);
  rearDiffuser.position.set(0, 0.34, -halfLen + 0.02);
  g.add(frontSplitter, rearDiffuser);

  const exGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.14, 10);
  exGeo.rotateX(Math.PI / 2);
  const exL = new THREE.Mesh(exGeo, parts.chromeMat);
  exL.position.set(-0.56, 0.32, -halfLen - 0.03);
  const exR = exL.clone();
  exR.position.x = 0.56;
  g.add(exL, exR);

  const mirrorY = bodyType === 'suv' ? 1.06 : 0.94;
  const mirrorL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.13), paintMat);
  mirrorL.position.set(0.95, mirrorY, 0.62);
  const mirrorR = mirrorL.clone();
  mirrorR.position.x = -0.95;
  g.add(mirrorL, mirrorR);

  const wheels: THREE.Group[] = [];
  const wheelCoords: Array<[number, number, number]> = [
    [-0.90, 0.34, 1.34],
    [0.90, 0.34, 1.34],
    [-0.90, 0.34, -1.34],
    [0.90, 0.34, -1.34],
  ];
  wheelCoords.forEach(([wx, wy, wz]) => {
    const w = createSpinningAlloyWheel(parts);
    w.position.set(wx, wy, wz);
    g.add(w);
    wheels.push(w);
  });

  // Dual LED Headlights
  const hlLeft = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.10), parts.headlightMat);
  hlLeft.position.set(-0.62, frontY + 0.04, halfLen + 0.01);
  const hlRight = hlLeft.clone();
  hlRight.position.x = 0.62;
  g.add(hlLeft, hlRight);

  // Dual-Strip Sculpted OLED Taillights + European License Plate + Chrome Trunk Crest
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff2828,
    emissive: 0xff1e1e,
    emissiveIntensity: 3.0,
    roughness: 0.16,
  });
  const tailLeft = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.13, 0.08), tailMat);
  tailLeft.position.set(-0.58, rearY, -halfLen - 0.01);
  const tailRight = tailLeft.clone();
  tailRight.position.x = 0.58;
  const tailBridge = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.036, 0.06), tailMat);
  tailBridge.position.set(0, rearY + 0.02, -halfLen - 0.01);

  const plateMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.11, 0.03),
    new THREE.MeshBasicMaterial({ color: 0xe2e8f0 })
  );
  plateMesh.position.set(0, rearY - 0.20, -halfLen - 0.03);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.042, 14), parts.chromeMat);
  badge.rotation.y = Math.PI;
  badge.position.set(0, rearY + 0.08, -halfLen - 0.04);
  g.add(tailLeft, tailRight, tailBridge, plateMesh, badge);

  // Active Left/Right Amber Turn Signals
  const leftIndicatorMat = new THREE.MeshStandardMaterial({
    color: 0x523108,
    emissive: 0xff9f1c,
    emissiveIntensity: 0,
    roughness: 0.25,
  });
  const rightIndicatorMat = new THREE.MeshStandardMaterial({
    color: 0x523108,
    emissive: 0xff9f1c,
    emissiveIntensity: 0,
    roughness: 0.25,
  });

  const indRearL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.09), leftIndicatorMat);
  indRearL.position.set(0.82, rearY, -halfLen - 0.01);
  const indFrontL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.09), leftIndicatorMat);
  indFrontL.position.set(0.82, frontY + 0.04, halfLen + 0.01);
  const indRearR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.09), rightIndicatorMat);
  indRearR.position.set(-0.82, rearY, -halfLen - 0.01);
  const indFrontR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.09), rightIndicatorMat);
  indFrontR.position.set(-0.82, frontY + 0.04, halfLen + 0.01);
  g.add(indRearL, indFrontL, indRearR, indFrontR);

  const headlightFlares: THREE.Sprite[] = [];
  const wetRefMeshes: THREE.Mesh[] = [];

  if (includeReflectionAndFlares) {
    const flareMat = new THREE.SpriteMaterial({
      map: mats.glowSpriteMap,
      color: 0xfff8e8,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flL = new THREE.Sprite(flareMat);
    flL.position.set(-0.62, frontY + 0.04, halfLen + 0.24);
    flL.scale.set(3.4, 2.4, 1);
    const flR = new THREE.Sprite(flareMat);
    flR.position.set(0.62, frontY + 0.04, halfLen + 0.24);
    flR.scale.set(3.4, 2.4, 1);
    g.add(flL, flR);
    headlightFlares.push(flL, flR);

    if (isOncoming) {
      // Twin bright vertical wet-asphalt headlight reflection columns (exact signature look of reference!)
      const hlRefMat = new THREE.MeshBasicMaterial({
        map: mats.reflectionStreakMap,
        color: 0xfff7e2,
        transparent: true,
        opacity: 0.96,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const rL = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 24.0), hlRefMat);
      rL.rotation.x = -Math.PI / 2;
      rL.position.set(-0.62, 0.039, 12.6);
      const rR = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 24.0), hlRefMat);
      rR.rotation.x = -Math.PI / 2;
      rR.position.set(0.62, 0.039, 12.6);
      g.add(rL, rR);
      wetRefMeshes.push(rL, rR);
    } else {
      // Rich crimson wet-asphalt taillight reflection ribbon streaming behind same-direction cars!
      const tailRefMat = new THREE.MeshBasicMaterial({
        map: mats.reflectionStreakMap,
        color: 0xff3b2f,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const rTail = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 22.0), tailRefMat);
      rTail.rotation.x = -Math.PI / 2;
      rTail.position.set(0, 0.039, -11.6);
      g.add(rTail);
      wetRefMeshes.push(rTail);
    }
  }

  return {
    group: g,
    wheels,
    tailMat,
    leftIndicatorMat,
    rightIndicatorMat,
    headlightFlares,
    wetRefMeshes,
  };
}

export function buildEuropeanCityEnvironment(
  scene: THREE.Scene,
  mats: ProceduralMaterialPack,
  initialTraffic: TrafficVehicle[],
  isSoftwareGl: boolean
): CityEnvironmentRig {
  // 1. Expansive Atmospheric Sky Dome (sized cleanly inside camera far plane!)
  const skyDomeMat = new THREE.MeshBasicMaterial({
    map: mats.skyNightMap,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyDomeMesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 20), skyDomeMat);
  scene.add(skyDomeMesh);

  // 2. Extended Urban Ground Plane (covers entire 1.8 km x 1.2 km district)
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 2600),
    new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.95, metalness: 0.04 })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -0.05;
  scene.add(groundMesh);

  // 3. Hyperrealistic Wet/Dry PBR Road Surface with Mirror Rain-Puddle Roughness Map
  const roadMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a1f28,
    map: mats.asphaltMap,
    bumpMap: mats.asphaltBump,
    bumpScale: 0.016,
    roughnessMap: mats.asphaltRoughnessMap,
    roughness: 0.22,
    metalness: 0.48,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });
  const roadMesh = new THREE.Mesh(
    buildRibbonGeometry(-TRACK_ROAD_HALF_WIDTH, TRACK_ROAD_HALF_WIDTH, 0.02, 420, 1),
    roadMat
  );
  roadMesh.receiveShadow = !isSoftwareGl;
  scene.add(roadMesh);

  const sidewalkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: mats.sidewalkMap,
    roughness: 0.42,
    metalness: 0.16,
  });
  const curbMat = new THREE.MeshStandardMaterial({
    color: 0x5c5750,
    roughness: 0.68,
    metalness: 0.08,
  });

  const swOuter = TRACK_ROAD_HALF_WIDTH + 5.6;
  const leftSidewalk = new THREE.Mesh(
    buildRibbonGeometry(TRACK_ROAD_HALF_WIDTH, swOuter, 0.16, 420, 1),
    sidewalkMat
  );
  const rightSidewalk = new THREE.Mesh(
    buildRibbonGeometry(-swOuter, -TRACK_ROAD_HALF_WIDTH, 0.16, 420, 1),
    sidewalkMat
  );
  leftSidewalk.receiveShadow = !isSoftwareGl;
  rightSidewalk.receiveShadow = !isSoftwareGl;
  const leftCurb = new THREE.Mesh(buildCurbWallGeometry(TRACK_ROAD_HALF_WIDTH, 0.16, 420), curbMat);
  const rightCurb = new THREE.Mesh(buildCurbWallGeometry(-TRACK_ROAD_HALF_WIDTH, 0.16, 420), curbMat);
  scene.add(leftSidewalk, rightSidewalk, leftCurb, rightCurb);

  // 4. 192 High-Resolution Multi-Story European Buildings with 3D Stone Cornices & Pitched Roofs!
  const buildingMaterials = mats.buildingMaps.map((albedo, i) => {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: albedo,
      emissive: new THREE.Color(0xffd088),
      emissiveMap: mats.buildingEmissiveMaps[i],
      emissiveIntensity: 1.85,
      bumpMap: mats.buildingBump,
      bumpScale: 0.028,
      roughness: 0.68,
      metalness: 0.06,
    });
  });

  const pitchedRoofMat = new THREE.MeshStandardMaterial({
    color: 0x2d2826,
    roughness: 0.82,
    metalness: 0.08,
  });
  const corniceStoneMat = new THREE.MeshStandardMaterial({
    color: 0x766b5f,
    roughness: 0.72,
    metalness: 0.06,
  });

  const buildingsPerStyle = 64;
  const totalBuildings = buildingsPerStyle * 3; // 192 continuous historic facades across 3.62 km!
  const bBodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.CylinderGeometry(0.72, 0.72, 1, 3);
  roofGeo.rotateZ(Math.PI / 2);
  roofGeo.rotateX(Math.PI / 6);
  const corniceGeo = new THREE.BoxGeometry(1, 0.42, 0.55);

  const buildingMeshes = buildingMaterials.map(
    (mat) => new THREE.InstancedMesh(bBodyGeo, mat, buildingsPerStyle)
  );
  const roofInstanced = new THREE.InstancedMesh(roofGeo, pitchedRoofMat, totalBuildings);
  const corniceInstanced = new THREE.InstancedMesh(corniceGeo, corniceStoneMat, totalBuildings * 2);

  // Subtle warm golden shopfront reflection spill along wet night curbs!
  const shopRefGeo = new THREE.PlaneGeometry(3.2, 12.0);
  shopRefGeo.rotateX(-Math.PI / 2);
  const shopRefMat = new THREE.MeshBasicMaterial({
    map: mats.reflectionStreakMap,
    color: 0xffb85c,
    transparent: true,
    opacity: 0.46,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const shopRefInst = new THREE.InstancedMesh(shopRefGeo, shopRefMat, totalBuildings);

  const styleCounters = [0, 0, 0];

  for (let i = 0; i < totalBuildings; i++) {
    const s = (i / totalBuildings) * TRACK_TOTAL_LENGTH;
    const sample = sampleTrackByDistance(s);
    const side = i % 2 === 0 ? 1 : -1;
    const styleIdx = i % 3;
    const slotIdx = styleCounters[styleIdx]++;

    const widthAlongRoad = 17.5 + ((i * 7) % 5);
    const depth = 12.0;
    const height = 15.0 + ((i * 11) % 10);

    const distFromCenter = TRACK_ROAD_HALF_WIDTH + 3.8 + depth / 2;
    const bx = sample.x + sample.normalX * side * distFromCenter;
    const bz = sample.z + sample.normalZ * side * distFromCenter;
    const rotY = sample.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2);

    _pos.set(bx, height / 2, bz);
    _quat.setFromAxisAngle(_up, rotY);
    _scale.set(widthAlongRoad, height, depth);
    _mat4.compose(_pos, _quat, _scale);
    buildingMeshes[styleIdx].setMatrixAt(slotIdx, _mat4);

    // Pitched slate European roof
    _pos.set(bx, height + 1.8, bz);
    _scale.set(widthAlongRoad + 0.5, 3.7, depth * 0.92);
    _mat4.compose(_pos, _quat, _scale);
    roofInstanced.setMatrixAt(i, _mat4);

    // 3D Protruding Roofline & Ground-Floor Stone Cornice Moldings (real architectural silhouette relief!)
    const wallFaceDist = TRACK_ROAD_HALF_WIDTH + 3.62;
    const cx = sample.x + sample.normalX * side * wallFaceDist;
    const cz = sample.z + sample.normalZ * side * wallFaceDist;
    _pos.set(cx, height - 0.35, cz);
    _scale.set(widthAlongRoad + 0.3, 1.0, 1.0);
    _mat4.compose(_pos, _quat, _scale);
    corniceInstanced.setMatrixAt(i * 2, _mat4);

    _pos.set(cx, 4.35, cz);
    _scale.set(widthAlongRoad + 0.1, 0.72, 0.85);
    _mat4.compose(_pos, _quat, _scale);
    corniceInstanced.setMatrixAt(i * 2 + 1, _mat4);

    // Warm shopfront spill reflected on rain-slicked outer curb
    const rx = sample.x + sample.normalX * side * (TRACK_ROAD_HALF_WIDTH - 1.2);
    const rz = sample.z + sample.normalZ * side * (TRACK_ROAD_HALF_WIDTH - 1.2);
    _pos.set(rx, 0.031, rz);
    _quat.setFromAxisAngle(_up, sample.heading);
    _scale.set(1, 1, 1);
    _mat4.compose(_pos, _quat, _scale);
    shopRefInst.setMatrixAt(i, _mat4);
  }

  buildingMeshes.forEach((m) => {
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.castShadow = !isSoftwareGl;
    m.receiveShadow = !isSoftwareGl;
    scene.add(m);
  });
  roofInstanced.instanceMatrix.needsUpdate = true;
  roofInstanced.computeBoundingSphere();
  corniceInstanced.instanceMatrix.needsUpdate = true;
  corniceInstanced.computeBoundingSphere();
  corniceInstanced.castShadow = !isSoftwareGl;
  shopRefInst.instanceMatrix.needsUpdate = true;
  shopRefInst.computeBoundingSphere();
  scene.add(roofInstanced, corniceInstanced, shopRefInst);

  // 5. 140 Ornate European Streetlamps + Volumetric Mist Cones + Wet Reflections + 8 Dynamic Real PointLights!
  const lampCount = 140;
  const poleGeo = new THREE.CylinderGeometry(0.075, 0.13, 6.5, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x16191f, roughness: 0.36, metalness: 0.84 });
  const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, lampCount);
  poleInst.castShadow = !isSoftwareGl;

  const armGeo = new THREE.BoxGeometry(0.80, 0.08, 0.08);
  const armInst = new THREE.InstancedMesh(armGeo, poleMat, lampCount);

  const lanternGeo = new THREE.CylinderGeometry(0.24, 0.16, 0.50, 6);
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xfff6e0,
    emissive: 0xffba52,
    emissiveIntensity: 3.8,
    roughness: 0.12,
  });
  const lanternInst = new THREE.InstancedMesh(lanternGeo, lanternMat, lampCount);

  // Subtle volumetric misty golden streetlamp light shafts (authentic rainy-night reference atmosphere!)
  const mistConeGeo = new THREE.ConeGeometry(2.9, 6.1, 12, 1, true);
  const mistConeMat = new THREE.MeshBasicMaterial({
    map: mats.mistConeMap,
    color: 0xffcf88,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mistConeInst = new THREE.InstancedMesh(mistConeGeo, mistConeMat, lampCount);

  const lampRefGeo = new THREE.PlaneGeometry(4.4, 24.0);
  lampRefGeo.rotateX(-Math.PI / 2);
  const lampRefMat = new THREE.MeshBasicMaterial({
    map: mats.reflectionStreakMap,
    color: 0xffd28a,
    transparent: true,
    opacity: 0.94,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lampRefInst = new THREE.InstancedMesh(lampRefGeo, lampRefMat, lampCount);

  const streetGlowGroup = new THREE.Group();
  const streetGlowSpriteMat = new THREE.SpriteMaterial({
    map: mats.glowSpriteMap,
    color: 0xffd896,
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const lampPositions: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i < lampCount; i++) {
    const s = (i / lampCount) * TRACK_TOTAL_LENGTH;
    const sample = sampleTrackByDistance(s);
    const side = i % 2 === 0 ? 1 : -1;
    const poleOff = (TRACK_ROAD_HALF_WIDTH + 0.58) * side;
    const px = sample.x + sample.normalX * poleOff;
    const pz = sample.z + sample.normalZ * poleOff;

    _pos.set(px, 3.25, pz);
    _quat.setFromAxisAngle(_up, sample.heading);
    _scale.set(1, 1, 1);
    _mat4.compose(_pos, _quat, _scale);
    poleInst.setMatrixAt(i, _mat4);

    const bx = sample.x + sample.normalX * (poleOff - side * 0.36);
    const bz = sample.z + sample.normalZ * (poleOff - side * 0.36);
    _pos.set(bx, 6.50, bz);
    _mat4.compose(_pos, _quat, _scale);
    armInst.setMatrixAt(i, _mat4);

    const lx = sample.x + sample.normalX * (poleOff - side * 0.68);
    const lz = sample.z + sample.normalZ * (poleOff - side * 0.68);
    _pos.set(lx, 6.32, lz);
    _mat4.compose(_pos, _quat, _scale);
    lanternInst.setMatrixAt(i, _mat4);

    // Volumetric mist shaft hanging beneath lantern
    _pos.set(lx, 3.22, lz);
    _mat4.compose(_pos, _quat, _scale);
    mistConeInst.setMatrixAt(i, _mat4);

    lampPositions.push({ x: lx, y: 6.1, z: lz });

    const glowSprite = new THREE.Sprite(streetGlowSpriteMat);
    glowSprite.position.set(lx, 6.32, lz);
    glowSprite.scale.set(6.8, 6.8, 1);
    streetGlowGroup.add(glowSprite);

    const rx = sample.x + sample.normalX * (side * (TRACK_ROAD_HALF_WIDTH - 1.7));
    const rz = sample.z + sample.normalZ * (side * (TRACK_ROAD_HALF_WIDTH - 1.7));
    _pos.set(rx, 0.034, rz);
    _mat4.compose(_pos, _quat, _scale);
    lampRefInst.setMatrixAt(i, _mat4);
  }

  poleInst.instanceMatrix.needsUpdate = true;
  poleInst.computeBoundingSphere();
  armInst.instanceMatrix.needsUpdate = true;
  armInst.computeBoundingSphere();
  lanternInst.instanceMatrix.needsUpdate = true;
  lanternInst.computeBoundingSphere();
  mistConeInst.instanceMatrix.needsUpdate = true;
  mistConeInst.computeBoundingSphere();
  lampRefInst.instanceMatrix.needsUpdate = true;
  lampRefInst.computeBoundingSphere();
  scene.add(poleInst, armInst, lanternInst, mistConeInst, lampRefInst, streetGlowGroup);

  // Pool of 8 real dynamic warm-amber Streetlamp PointLights leapfrogging around the player!
  const dynamicStreetLights: THREE.PointLight[] = [];
  for (let l = 0; l < 8; l++) {
    const pl = new THREE.PointLight(0xffbd66, 0, 30, 1.48);
    scene.add(pl);
    dynamicStreetLights.push(pl);
  }

  const updateDynamicLights = (playerX: number, playerZ: number, mode: LightingMode) => {
    if (mode !== 'night') {
      for (let i = 0; i < dynamicStreetLights.length; i++) {
        dynamicStreetLights[i].intensity = 0;
      }
      return;
    }

    const nearest: Array<{ idx: number; d2: number }> = [];
    for (let i = 0; i < lampPositions.length; i++) {
      const lp = lampPositions[i];
      const dx = lp.x - playerX;
      const dz = lp.z - playerZ;
      const d2 = dx * dx + dz * dz;
      if (d2 < 6400) {
        nearest.push({ idx: i, d2 });
      }
    }
    nearest.sort((a, b) => a.d2 - b.d2);

    for (let i = 0; i < dynamicStreetLights.length; i++) {
      const light = dynamicStreetLights[i];
      if (i < nearest.length) {
        const lp = lampPositions[nearest[i].idx];
        light.position.set(lp.x, lp.y, lp.z);
        light.intensity = 22.0;
      } else {
        light.intensity = 0;
      }
    }
  };

  // 6. European Street Signs along the 3.62 km corridor
  const signCount = 64;
  const signPoleInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.04, 0.04, 2.7, 6),
    poleMat,
    signCount
  );
  const signBoardInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.04, 14),
    new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35, metalness: 0.2 }),
    signCount
  );
  for (let i = 0; i < signCount; i++) {
    const s = ((i + 0.35) / signCount) * TRACK_TOTAL_LENGTH;
    const sample = sampleTrackByDistance(s);
    const side = i % 2 === 0 ? 1 : -1;
    const off = (TRACK_ROAD_HALF_WIDTH + 0.82) * side;
    const sx = sample.x + sample.normalX * off;
    const sz = sample.z + sample.normalZ * off;

    _pos.set(sx, 1.45, sz);
    _quat.setFromAxisAngle(_up, sample.heading);
    _scale.set(1, 1, 1);
    _mat4.compose(_pos, _quat, _scale);
    signPoleInst.setMatrixAt(i, _mat4);

    _pos.set(sx, 2.75, sz);
    const signQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.PI / 2, sample.heading, 0)
    );
    _mat4.compose(_pos, signQuat, _scale);
    signBoardInst.setMatrixAt(i, _mat4);
  }
  signPoleInst.instanceMatrix.needsUpdate = true;
  signPoleInst.computeBoundingSphere();
  signBoardInst.instanceMatrix.needsUpdate = true;
  signBoardInst.computeBoundingSphere();
  scene.add(signPoleInst, signBoardInst);

  // 7. Shared Sculpted Car Geometries & PBR Materials -> 32 Parked Cars + 24 Multi-Tier Moving/Overtaking NPCs!
  const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 18);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.26, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.27, 0.38, 0.042);

  const sharedCarParts: SharedCarParts = {
    bodyGeos: {
      sedan: createSculptedCarBodyGeometry('sedan'),
      suv: createSculptedCarBodyGeometry('suv'),
      coupe: createSculptedCarBodyGeometry('coupe'),
    },
    glassGeos: {
      sedan: createSculptedGreenhouseGeometry('sedan'),
      suv: createSculptedGreenhouseGeometry('suv'),
      coupe: createSculptedGreenhouseGeometry('coupe'),
    },
    tireGeo,
    rimGeo,
    spokeGeo,
    tireMat: new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.72, metalness: 0.15 }),
    rimMat: new THREE.MeshPhysicalMaterial({ color: 0x262c36, roughness: 0.32, metalness: 0.85 }),
    glassMat: new THREE.MeshPhysicalMaterial({
      color: 0x0a1220,
      roughness: 0.05,
      metalness: 0.94,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
    }),
    trimMat: new THREE.MeshStandardMaterial({ color: 0x12151c, roughness: 0.55, metalness: 0.3 }),
    chromeMat: new THREE.MeshPhysicalMaterial({
      color: 0xdbe2ea,
      roughness: 0.14,
      metalness: 0.96,
      clearcoat: 0.6,
    }),
    headlightMat: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff8e6,
      emissiveIntensity: 3.8,
    }),
  };

  // 32 Sculpted Parked Cars neatly lining outer curbs across the 3.62 km district
  const parkedPalette = [0x1e293b, 0x334155, 0x7f1d1d, 0x1e3a5f, 0xcbd5e1, 0x27272a];
  const parkedHeadlightOffMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.22, metalness: 0.5 });
  const parkedParts: SharedCarParts = { ...sharedCarParts, headlightMat: parkedHeadlightOffMat };

  for (let p = 0; p < 32; p++) {
    const s = ((p * 0.031 + 0.045) % 1) * TRACK_TOTAL_LENGTH;
    const sample = sampleTrackByDistance(s);
    const side = p % 2 === 0 ? 1 : -1;
    const curbOff = (TRACK_ROAD_HALF_WIDTH - 1.15) * side;
    const parkedCar = buildHyperrealCarGroup(
      parkedPalette[p % parkedPalette.length],
      p % 3 === 0 ? 'suv' : p % 2 === 0 ? 'sedan' : 'coupe',
      mats,
      parkedParts,
      false,
      false,
      isSoftwareGl
    );
    parkedCar.tailMat.emissiveIntensity = 0.06;
    parkedCar.group.position.set(
      sample.x + sample.normalX * curbOff,
      0.02,
      sample.z + sample.normalZ * curbOff
    );
    parkedCar.group.rotation.y = side > 0 ? sample.heading : sample.heading + Math.PI;
    scene.add(parkedCar.group);
  }

  // 24 Active Moving & Overtaking Multi-Tier Speed NPC Automobiles
  const trafficVisuals: TrafficVisualRig[] = initialTraffic.map((car) => {
    const isOncoming = car.baseLaneOffset > 0;
    const rig = buildHyperrealCarGroup(
      car.colorHex,
      car.bodyType,
      mats,
      sharedCarParts,
      true,
      isOncoming,
      isSoftwareGl
    );
    scene.add(rig.group);
    return rig;
  });

  // 8. 32 Animated Pedestrians Strolling Along Sidewalks
  const pedestrians: PedestrianAgent[] = [];
  const coatPalette = [0x1e293b, 0x451a03, 0x334155, 0x7c2d12, 0x1e3a8a, 0x3f3f46];
  const pedHeadMat = new THREE.MeshStandardMaterial({ color: 0xd6a384, roughness: 0.65 });
  const pedLegMat = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.8 });

  for (let i = 0; i < 32; i++) {
    const g = new THREE.Group();
    const coatMat = new THREE.MeshStandardMaterial({
      color: coatPalette[i % coatPalette.length],
      roughness: 0.78,
    });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.56, 4, 8), coatMat);
    torso.position.y = 1.12;
    g.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), pedHeadMat);
    head.position.y = 1.62;
    g.add(head);

    const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.72, 6), pedLegMat);
    leftLeg.position.set(-0.08, 0.42, 0);
    const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.72, 6), pedLegMat);
    rightLeg.position.set(0.08, 0.42, 0);
    g.add(leftLeg, rightLeg);

    scene.add(g);
    pedestrians.push({
      group: g,
      leftLeg,
      rightLeg,
      s: ((i * 0.031 + 0.015) % 1) * TRACK_TOTAL_LENGTH,
      side: i % 2 === 0 ? 1 : -1,
      dir: i % 3 === 0 ? -1 : 1,
      speed: 1.25 + (i % 4) * 0.22,
      phase: i * 1.1,
    });
  }

  const updatePedestrians = (dt: number) => {
    for (let i = 0; i < pedestrians.length; i++) {
      const ped = pedestrians[i];
      ped.s = ((ped.s + ped.dir * ped.speed * dt) % TRACK_TOTAL_LENGTH + TRACK_TOTAL_LENGTH) % TRACK_TOTAL_LENGTH;
      ped.phase += dt * ped.speed * 4.2;

      const sample = sampleTrackByDistance(ped.s);
      const swOffset = (TRACK_ROAD_HALF_WIDTH + 1.95) * ped.side;
      ped.group.position.set(
        sample.x + sample.normalX * swOffset,
        0.16,
        sample.z + sample.normalZ * swOffset
      );
      ped.group.rotation.y = ped.dir > 0 ? sample.heading : sample.heading + Math.PI;
      ped.leftLeg.rotation.x = Math.sin(ped.phase) * 0.45;
      ped.rightLeg.rotation.x = -Math.sin(ped.phase) * 0.45;
    }
  };

  const setModeVisuals = (mode: LightingMode) => {
    const isNight = mode === 'night';
    skyDomeMat.map = isNight ? mats.skyNightMap : mats.skyDayMap;
    skyDomeMat.needsUpdate = true;

    roadMat.color.setHex(isNight ? 0x1a1f28 : 0xd4d9e0);
    roadMat.roughness = isNight ? 0.22 : 0.88;
    roadMat.metalness = isNight ? 0.48 : 0.04;
    roadMat.clearcoat = isNight ? 1.0 : 0.0;
    roadMat.needsUpdate = true;

    buildingMaterials.forEach((bm) => {
      bm.emissiveIntensity = isNight ? 1.95 : 0.0;
    });

    lanternMat.emissiveIntensity = isNight ? 3.8 : 0.08;
    streetGlowGroup.visible = isNight;
    mistConeInst.visible = isNight;
    lampRefInst.visible = isNight;
    shopRefInst.visible = isNight;

    trafficVisuals.forEach((tv) => {
      tv.wetRefMeshes.forEach((m) => {
        m.visible = isNight;
      });
      tv.headlightFlares.forEach((sp) => {
        sp.visible = isNight;
      });
    });
  };

  updatePedestrians(0.016);

  return {
    roadMat,
    skyDomeMesh,
    trafficVisuals,
    pedestrians,
    setModeVisuals,
    updateDynamicLights,
    updatePedestrians,
  };
}
