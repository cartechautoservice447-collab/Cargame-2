import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  DrivingInput,
  LightingMode,
  TrafficVehicle,
  VehicleState,
  WiperSpeed,
  createInitialTraffic,
  createInitialVehicleState,
  stepTrafficAndCollisions,
  stepVehiclePhysics,
} from './drivingPhysics';
import { audioSynth } from './audioSynth';
import { createProceduralMaterialPack } from './proceduralMaterials';
import { COCKPIT_DRIVER_X, buildLuxuryCockpit } from './cockpitBuilder';
import { buildEuropeanCityEnvironment } from './cityBuilder';

export interface TelemetrySnapshot {
  speedKmh: number;
  rpm: number;
  gear: number;
  distanceMeters: number;
  lapCount: number;
  lapProgress: number;
  checkpointsPassed: number;
  integrity: number;
  fps: number;
  onRoad: boolean;
  windshieldWetness: number;
  steerAngle: number;
  throttle: number;
  brake: number;
  sportMode: boolean;
}

interface SceneCanvasProps {
  gameState: 'title' | 'playing' | 'paused' | 'gameover';
  lightingMode: LightingMode;
  wiperSpeed: WiperSpeed;
  touchInputRef: React.MutableRefObject<DrivingInput>;
  resetCounter: number;
  onTelemetryUpdate: (snap: TelemetrySnapshot) => void;
  onGameEnd: (victory: boolean, finalSnap: TelemetrySnapshot) => void;
}

// Pre-allocated scratch math helpers outside render loop (Zero GC)
const _camTargetPos = new THREE.Vector3();
const _camLookAtPos = new THREE.Vector3();
const _forwardVec = new THREE.Vector3();

export const SceneCanvas: React.FC<SceneCanvasProps> = ({
  gameState,
  lightingMode,
  wiperSpeed,
  touchInputRef,
  resetCounter,
  onTelemetryUpdate,
  onGameEnd,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const lightingModeRef = useRef(lightingMode);
  lightingModeRef.current = lightingMode;

  const wiperSpeedRef = useRef(wiperSpeed);
  wiperSpeedRef.current = wiperSpeed;

  const onTelemetryRef = useRef(onTelemetryUpdate);
  onTelemetryRef.current = onTelemetryUpdate;

  const onGameEndRef = useRef(onGameEnd);
  onGameEndRef.current = onGameEnd;

  const vehicleRef = useRef<VehicleState>(createInitialVehicleState());
  const trafficRef = useRef<TrafficVehicle[]>(createInitialTraffic());

  useEffect(() => {
    if (resetCounter > 0) {
      vehicleRef.current = createInitialVehicleState();
      trafficRef.current = createInitialTraffic();
    }
  }, [resetCounter]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software-WebGL Guard
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('data-testid', 'driving-canvas');

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      62,
      (container.clientWidth || window.innerWidth) /
        (container.clientHeight || window.innerHeight),
      0.05,
      920
    );

    // 2. Studio PBR Environment Reflections (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const mats = createProceduralMaterialPack(maxAnisotropy);

    // 3. Lighting Rig (Player-Following High-Res 2048px Shadows + Dual Player LED Headlights)
    const hemiLight = new THREE.HemisphereLight(0x8fa8c8, 0x3b2c20, 0.9);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    dirLight.position.set(65, 115, 55);
    dirLight.castShadow = !isSoftwareGl;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 4;
    dirLight.shadow.camera.far = 260;
    const shadowBound = 78;
    dirLight.shadow.camera.left = -shadowBound;
    dirLight.shadow.camera.right = shadowBound;
    dirLight.shadow.camera.top = shadowBound;
    dirLight.shadow.camera.bottom = -shadowBound;
    dirLight.shadow.bias = -0.0004;
    dirLight.shadow.normalBias = 0.025;
    scene.add(dirLight, dirLight.target);

    // Warm street-spill interior key light + crisp dashboard cluster glow
    const cabinKeyLight = new THREE.PointLight(0xffca85, 1.52, 4.2);
    scene.add(cabinKeyLight);

    const dashGlowLight = new THREE.PointLight(0x93c5fd, 0.68, 2.2);
    scene.add(dashGlowLight);

    // Dual Player LED Headlight SpotLights projecting realistic beams onto wet European asphalt
    const headlightLeft = new THREE.SpotLight(0xfff6e5, 0, 125, Math.PI / 4.0, 0.56, 1.1);
    const headlightRight = new THREE.SpotLight(0xfff6e5, 0, 125, Math.PI / 4.0, 0.56, 1.1);
    const headlightTargetL = new THREE.Object3D();
    const headlightTargetR = new THREE.Object3D();
    scene.add(headlightLeft, headlightRight, headlightTargetL, headlightTargetR);
    headlightLeft.target = headlightTargetL;
    headlightRight.target = headlightTargetR;

    // 4. Build Hyperrealistic 3.62km European Historic City Street, Wet Puddles & Multi-Tier Overtaking NPCs
    const cityRig = buildEuropeanCityEnvironment(scene, mats, trafficRef.current, isSoftwareGl);

    // 5. Velocity-Stretched 3D Rain Streaks (LineSegments — crisp wet rain sheets)
    const rainCount = 720;
    const rainVertices = new Float32Array(rainCount * 6);
    const rainSpeeds = new Float32Array(rainCount);
    for (let i = 0; i < rainCount; i++) {
      const rx = (Math.random() - 0.5) * 48;
      const ry = Math.random() * 20;
      const rz = (Math.random() - 0.5) * 52;
      rainSpeeds[i] = 19 + Math.random() * 11;
      const idx = i * 6;
      rainVertices[idx] = rx;
      rainVertices[idx + 1] = ry;
      rainVertices[idx + 2] = rz;
      rainVertices[idx + 3] = rx - 0.04;
      rainVertices[idx + 4] = ry - 0.68;
      rainVertices[idx + 5] = rz - 0.08;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainVertices, 3));
    const rainMat = new THREE.LineBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
    });
    const rainStreaks = new THREE.LineSegments(rainGeo, rainMat);
    scene.add(rainStreaks);

    // 6. Player Vehicle Anchor -> PERMANENT INTERIOR-ONLY HYPERREALISTIC LUXURY COCKPIT
    const playerAnchor = new THREE.Group();
    scene.add(playerAnchor);

    const cockpitRig = buildLuxuryCockpit(mats, maxAnisotropy);
    playerAnchor.add(cockpitRig.group);

    // 7. Day vs Rainy Night Lighting Synchronizer (Reference-Matched Golden Night Mist)
    let lastAppliedMode: LightingMode | null = null;
    const applyLightingMode = (mode: LightingMode) => {
      if (lastAppliedMode === mode) return;
      lastAppliedMode = mode;

      cityRig.setModeVisuals(mode);
      cockpitRig.setModeVisuals(mode);

      if (mode === 'day') {
        scene.fog = new THREE.FogExp2(0xb8d4f0, 0.0024);
        scene.environmentIntensity = 0.88;

        hemiLight.color.setHex(0xdbeafe);
        hemiLight.groundColor.setHex(0x57534e);
        hemiLight.intensity = 1.26;

        dirLight.color.setHex(0xfff7e6);
        dirLight.intensity = 2.52;

        cabinKeyLight.color.setHex(0xfff6e5);
        cabinKeyLight.intensity = 1.1;
        dashGlowLight.intensity = 0.25;

        headlightLeft.intensity = 0;
        headlightRight.intensity = 0;
        rainStreaks.visible = false;
      } else {
        // Warm golden streetlamp mist & twilight slate haze matching reference screenshot!
        scene.fog = new THREE.FogExp2(0x594a42, 0.0072);
        scene.environmentIntensity = 0.32;

        hemiLight.color.setHex(0x647a9c);
        hemiLight.groundColor.setHex(0x3f2a18);
        hemiLight.intensity = 0.62;

        dirLight.color.setHex(0xffd49e);
        dirLight.intensity = 0.52;

        cabinKeyLight.color.setHex(0xffca85);
        cabinKeyLight.intensity = 1.52;
        dashGlowLight.color.setHex(0x93c5fd);
        dashGlowLight.intensity = 0.68;

        headlightLeft.intensity = 22.0;
        headlightRight.intensity = 22.0;
        rainStreaks.visible = true;
      }
    };

    // 8. Window Keyboard Listeners with Focus-Loss Cleanup
    const keysHeld = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => keysHeld.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => keysHeld.delete(e.code);
    const clearKeys = () => keysHeld.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 9. Smooth Paced Render & Simulation Loop
    let frameId = 0;
    let lastTime = performance.now();
    let hudTimer = 0;
    let screenDrawTimer = 0;
    let smoothedFps = 60;
    let prevGear = 1;
    let prevCheckpoints = 0;
    let activeSportMode = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl && gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      if (gl && gl.flush) gl.flush();
      const poll = () => {
        if (!sync) {
          frameId = window.setTimeout(cb, 70);
          return;
        }
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 70);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const instFps = 1 / Math.max(0.005, rawDt);
      smoothedFps = smoothedFps * 0.9 + instFps * 0.1;

      const currentMode = lightingModeRef.current;
      applyLightingMode(currentMode);

      const currentState = gameStateRef.current;
      const currentWiper = wiperSpeedRef.current;

      if (currentState === 'playing') {
        const kbThrottle = keysHeld.has('KeyW') || keysHeld.has('ArrowUp') ? 1 : 0;
        const kbBrake =
          keysHeld.has('KeyS') || keysHeld.has('ArrowDown') || keysHeld.has('Space') ? 1 : 0;
        const kbLeft = keysHeld.has('KeyA') || keysHeld.has('ArrowLeft') ? -1 : 0;
        const kbRight = keysHeld.has('KeyD') || keysHeld.has('ArrowRight') ? 1 : 0;
        const kbSteer = kbLeft + kbRight;
        const kbSport = keysHeld.has('ShiftLeft') || keysHeld.has('ShiftRight');

        const touch = touchInputRef.current;
        activeSportMode = Boolean(touch.sportMode || kbSport);

        const combinedInput: DrivingInput = {
          throttle: Math.max(kbThrottle, touch.throttle),
          brake: Math.max(kbBrake, touch.brake),
          steerTarget: Math.abs(touch.steerTarget) > 0.01 ? touch.steerTarget : kbSteer,
          sportMode: activeSportMode,
        };

        const steppedPlayer = stepVehiclePhysics(
          vehicleRef.current,
          combinedInput,
          dt,
          currentMode,
          currentWiper
        );

        const trafficResult = stepTrafficAndCollisions(trafficRef.current, steppedPlayer, dt);
        vehicleRef.current = trafficResult.player;
        trafficRef.current = trafficResult.traffic;

        cityRig.updatePedestrians(dt);

        if (vehicleRef.current.gear !== prevGear) {
          prevGear = vehicleRef.current.gear;
          audioSynth.playGearShift();
        }
        if (vehicleRef.current.checkpointsPassed > prevCheckpoints) {
          prevCheckpoints = vehicleRef.current.checkpointsPassed;
          audioSynth.playCheckpointChime();
        }
        if (trafficResult.collided) {
          audioSynth.playCollisionImpact();
        }

        audioSynth.updateEngine(
          vehicleRef.current.rpm,
          vehicleRef.current.throttle,
          currentMode === 'night',
          false
        );

        if (vehicleRef.current.lapCount >= 1 || vehicleRef.current.integrity <= 0) {
          const finalSnap: TelemetrySnapshot = {
            speedKmh: Math.round(vehicleRef.current.speedKmh),
            rpm: vehicleRef.current.rpm,
            gear: vehicleRef.current.gear,
            distanceMeters: Math.round(vehicleRef.current.distanceMeters),
            lapCount: vehicleRef.current.lapCount,
            lapProgress: vehicleRef.current.lapProgress,
            checkpointsPassed: vehicleRef.current.checkpointsPassed,
            integrity: vehicleRef.current.integrity,
            fps: Math.round(smoothedFps),
            onRoad: vehicleRef.current.onRoad,
            windshieldWetness: vehicleRef.current.windshieldWetness,
            steerAngle: vehicleRef.current.steerAngle,
            throttle: vehicleRef.current.throttle,
            brake: vehicleRef.current.brake,
            sportMode: activeSportMode,
          };
          onGameEndRef.current(vehicleRef.current.lapCount >= 1, finalSnap);
        }
      } else if (currentState === 'title') {
        // Live breathing city scene on Title Screen with real multi-tier traffic & pedestrians
        const idlePlayer = stepVehiclePhysics(
          vehicleRef.current,
          { throttle: 0, brake: 0, steerTarget: Math.sin(now * 0.001) * 0.05 },
          dt,
          currentMode,
          currentMode === 'night' ? 'intermittent' : 'off'
        );
        const trafficResult = stepTrafficAndCollisions(trafficRef.current, idlePlayer, dt * 0.45);
        vehicleRef.current = trafficResult.player;
        trafficRef.current = trafficResult.traffic;
        cityRig.updatePedestrians(dt * 0.65);
        audioSynth.updateEngine(820, 0, false, true);
      } else {
        audioSynth.updateEngine(820, 0, false, true);
      }

      const v = vehicleRef.current;

      // Keep atmospheric sky dome centered on player
      cityRig.skyDomeMesh.position.set(v.x, 0, v.z);

      // Keep crisp 2048px real-time shadow frustum centered on player across the entire 3.62km circuit!
      if (currentMode === 'day') {
        dirLight.position.set(v.x + 65, 115, v.z + 55);
      } else {
        dirLight.position.set(v.x - 38, 72, v.z + 48);
      }
      dirLight.target.position.set(v.x, 0, v.z);
      dirLight.target.updateMatrixWorld();

      // Update player vehicle anchor with smooth real-time suspension pitch (squat/dive) & corner roll!
      playerAnchor.position.set(v.x, 0, v.z);
      playerAnchor.rotation.set(0, v.heading, 0, 'YXZ');
      playerAnchor.rotateX(-v.pitchRad);
      playerAnchor.rotateZ(v.rollRad);

      // Update dynamic real Streetlamp PointLights around player!
      cityRig.updateDynamicLights(v.x, v.z, currentMode);

      // Update cockpit steering wheel (realistic highway/city visual turn range so hands grip naturally & never block cluster!)
      const visualWheelDeg = Math.max(-72, Math.min(72, v.wheelVisualDeg * 0.28));
      cockpitRig.steeringWheelPivot.rotation.z = THREE.MathUtils.degToRad(visualWheelDeg);
      cockpitRig.updateDriverHands();
      cockpitRig.accelPedalMesh.rotation.x = v.throttle * 0.35;
      cockpitRig.brakePedalMesh.rotation.x = v.brake * 0.28;

      const wiperParkRad = -1.56;
      const currentWiperRot = wiperParkRad + v.wiperBladeAngleRad * 0.96;
      cockpitRig.leftWiperPivot.rotation.z = currentWiperRot;
      cockpitRig.rightWiperPivot.rotation.z = currentWiperRot;

      // Forward (+Z local) and Left (+X local) vectors in world space
      _forwardVec.set(Math.sin(v.heading), 0, Math.cos(v.heading));
      const leftX = Math.cos(v.heading);
      const leftZ = -Math.sin(v.heading);

      cabinKeyLight.position.set(
        v.x + leftX * 0.35 + _forwardVec.x * 0.05,
        1.34,
        v.z + leftZ * 0.35 + _forwardVec.z * 0.05
      );
      dashGlowLight.position.set(
        v.x + leftX * 0.05 + _forwardVec.x * 0.22,
        1.03,
        v.z + leftZ * 0.05 + _forwardVec.z * 0.22
      );

      // Dual LED Headlight Beam Projection ahead of player car
      headlightLeft.position.set(
        v.x + _forwardVec.x * 2.15 + leftX * 0.68,
        0.74,
        v.z + _forwardVec.z * 2.15 + leftZ * 0.68
      );
      headlightTargetL.position.set(
        v.x + _forwardVec.x * 42 + leftX * 1.4,
        0.05,
        v.z + _forwardVec.z * 42 + leftZ * 1.4
      );
      headlightRight.position.set(
        v.x + _forwardVec.x * 2.15 - leftX * 0.68,
        0.74,
        v.z + _forwardVec.z * 2.15 - leftZ * 0.68
      );
      headlightTargetR.position.set(
        v.x + _forwardVec.x * 42 - leftX * 1.4,
        0.05,
        v.z + _forwardVec.z * 42 - leftZ * 1.4
      );

      // Dynamic Speed-Sense FOV (subtle peripheral speed expansion at highway velocities)
      const targetFov = 62 + Math.min(9, (v.speedKmh / 240) * 9);
      const nextFov = THREE.MathUtils.damp(camera.fov, targetFov, 5.5, dt);
      if (Math.abs(nextFov - camera.fov) > 0.01) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
      }

      // PERMANENT HYPERREALISTIC INTERIOR-ONLY DRIVER EYE CAMERA (with subtle suspension & road feel!)
      const speedVib =
        currentState === 'playing'
          ? (Math.sin(now * 0.045) * 0.65 + Math.cos(now * 0.083) * 0.35) *
            Math.min(1, v.speedMps / 45) *
            0.0025
          : 0;

      const eyeOffsetX = COCKPIT_DRIVER_X - 0.04;
      _camTargetPos.set(
        v.x + leftX * eyeOffsetX - _forwardVec.x * 0.35,
        1.148 + speedVib + v.pitchRad * 0.25,
        v.z + leftZ * eyeOffsetX - _forwardVec.z * 0.35
      );
      camera.position.copy(_camTargetPos);

      const lookSteerOffset = -v.steerAngle * 1.75;
      _camLookAtPos.set(
        v.x + _forwardVec.x * 10 + leftX * (eyeOffsetX - 0.36 + lookSteerOffset),
        0.66 + v.pitchRad * 3.8,
        v.z + _forwardVec.z * 10 + leftZ * (eyeOffsetX - 0.36 + lookSteerOffset)
      );
      camera.lookAt(_camLookAtPos);
      // Subtle horizon banking on tight corners (realistic interior chassis feel)
      camera.rotateZ(v.rollRad * 0.55);

      // Sync Sculpted Multi-Tier NPC Cars: Positions, Yaw Headings, Spinning 5-Spoke Wheels, Brake Lights & Flashing Turn Signals!
      const blinkOn = Math.floor(now / 260) % 2 === 0;
      const currentTraffic = trafficRef.current;
      for (let i = 0; i < currentTraffic.length; i++) {
        const t = currentTraffic[i];
        const vis = cityRig.trafficVisuals[i];
        if (!vis) continue;
        vis.group.position.set(t.x, 0, t.z);
        vis.group.rotation.y = t.heading;
        vis.tailMat.emissiveIntensity = t.braking ? 5.6 : currentMode === 'night' ? 2.8 : 0.75;

        // Spin all 4 alloy wheels smoothly at actual vehicle road speed
        for (let w = 0; w < vis.wheels.length; w++) {
          vis.wheels[w].rotation.x = t.wheelSpinRad;
        }

        // Flash amber left/right turn indicator when NPC changes lanes / overtakes!
        vis.leftIndicatorMat.emissiveIntensity = t.turnSignal === 1 && blinkOn ? 5.8 : 0;
        vis.rightIndicatorMat.emissiveIntensity = t.turnSignal === -1 && blinkOn ? 5.8 : 0;
      }

      // Animate Velocity-Stretched 3D Rain Streaks in Night Mode
      if (currentMode === 'night') {
        rainStreaks.position.set(v.x, 0, v.z);
        const posAttr = rainGeo.getAttribute('position') as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const streakZ = 0.08 + v.speedMps * 0.032;
        const streakLenY = 0.58 + v.speedMps * 0.014;
        for (let i = 0; i < rainCount; i++) {
          const idx = i * 6;
          let ry = arr[idx + 1] - dt * rainSpeeds[i];
          if (ry < 0.2) ry += 20;
          arr[idx + 1] = ry;
          arr[idx + 3] = arr[idx] - 0.04;
          arr[idx + 4] = ry - streakLenY;
          arr[idx + 5] = arr[idx + 2] - streakZ;
        }
        posAttr.needsUpdate = true;
      }

      // Smooth 30 Hz Speedometer/Tachometer/GPS Nav & Rain Droplet Redraws!
      screenDrawTimer += dt;
      if (screenDrawTimer >= 0.033) {
        const stepDraw = screenDrawTimer;
        screenDrawTimer = 0;
        cockpitRig.updateScreens(v, currentTraffic, currentMode);
        cockpitRig.updateRainDroplets(v, currentMode, stepDraw);
      }

      // Smooth React HUD telemetry state updates (~15 Hz)
      hudTimer += dt;
      if (hudTimer >= 0.066) {
        hudTimer = 0;
        onTelemetryRef.current({
          speedKmh: Math.round(v.speedKmh),
          rpm: v.rpm,
          gear: v.gear,
          distanceMeters: Math.round(v.distanceMeters),
          lapCount: v.lapCount,
          lapProgress: v.lapProgress,
          checkpointsPassed: v.checkpointsPassed,
          integrity: v.integrity,
          fps: Math.round(smoothedFps),
          onRoad: v.onRoad,
          windshieldWetness: v.windshieldWetness,
          steerAngle: v.steerAngle,
          throttle: v.throttle,
          brake: v.brake,
          sportMode: activeSportMode,
        });
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    // Initial lighting & gauges sync before first frame
    applyLightingMode(lightingModeRef.current);
    cityRig.updateDynamicLights(vehicleRef.current.x, vehicleRef.current.z, lightingModeRef.current);
    cockpitRig.updateScreens(vehicleRef.current, trafficRef.current, lightingModeRef.current);
    cockpitRig.updateRainDroplets(vehicleRef.current, lightingModeRef.current, 0.016);

    frameId = requestAnimationFrame(tick);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(container);
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObs.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      mats.disposeAll();
      renderer.dispose();
    };
  }, [touchInputRef]);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 w-full h-full overflow-hidden bg-[#0b101d]"
      aria-label="JARVIS DRIVE Hyperrealistic Interior 3D Simulation Viewport"
    />
  );
};
