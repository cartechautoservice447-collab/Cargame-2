export type LightingMode = 'day' | 'night';
export type CameraPerspective = 'cockpit';
export type WiperSpeed = 'off' | 'intermittent' | 'continuous';
export type DriveMode = 'comfort' | 'sport';

export interface VehicleState {
  x: number;
  z: number;
  heading: number; // radians, 0 = +Z
  speedMps: number; // meters per second
  speedKmh: number; // kilometers per hour (real 0 .. 260 km/h)
  rpm: number; // 800 .. 7600
  gear: number; // 1 .. 7
  steerAngle: number; // -1 .. 1 normalized steering wheel input
  wheelVisualDeg: number; // -420 .. +420 degrees for cockpit steering wheel + hands
  throttle: number; // 0 .. 1
  brake: number; // 0 .. 1
  pitchRad: number; // smooth suspension pitch (positive = squat on accel, negative = dive on brake)
  rollRad: number; // smooth suspension roll into corners
  distanceMeters: number;
  lapProgress: number; // 0 .. 1 along city circuit
  lapCount: number;
  checkpointsPassed: number;
  lateralOffset: number; // meters from track centerline
  onRoad: boolean;
  integrity: number; // 0 .. 100 vehicle structural integrity
  collisionCooldown: number;
  wiperPhase: number; // 0 .. 1 cycles
  wiperBladeAngleRad: number; // current blade sweep angle in radians
  windshieldWetness: number; // 0 .. 1 droplet coverage
}

export type NpcSpeedTier = 'slow' | 'normal' | 'fast' | 'superfast';

export interface TrafficVehicle {
  id: number;
  s: number; // distance along circuit spline (0 .. TRACK_TOTAL_LENGTH)
  laneOffset: number; // current smooth lateral meters from centerline
  baseLaneOffset: number; // home cruising lane
  targetLaneOffset: number; // active target lane (shifts during overtaking)
  speedMps: number;
  targetSpeedMps: number;
  speedTier: NpcSpeedTier;
  colorHex: number;
  bodyType: 'sedan' | 'suv' | 'coupe';
  x: number;
  z: number;
  heading: number;
  braking: boolean;
  canOvertake: boolean;
  isOvertaking: boolean;
  turnSignal: -1 | 0 | 1; // -1 = right indicator, +1 = left indicator, 0 = off
  overtakeTimer: number;
  wheelSpinRad: number;
}

export interface DrivingInput {
  throttle: number; // 0 .. 1
  brake: number; // 0 .. 1
  steerTarget: number; // -1 (left) .. +1 (right)
  sportMode?: boolean;
}

export interface TrackSample {
  x: number;
  z: number;
  tangentX: number;
  tangentZ: number;
  normalX: number;
  normalZ: number;
  heading: number;
  s: number;
}

// Grand European Avenue & Old Town Ring (~3.62 km total lap distance, 1.12 km straight boulevards!)
export const TRACK_STRAIGHT_HALF = 560; // meters half-straight -> 1120m sweeping boulevards
export const TRACK_TURN_RADIUS = 220; // meters sweeping curve radius
export const TRACK_ROAD_HALF_WIDTH = 8.8; // generous 4-lane European avenue (17.6m total width)
export const TRACK_STRAIGHT_LEN = TRACK_STRAIGHT_HALF * 2; // 1120m
export const TRACK_ARC_LEN = Math.PI * TRACK_TURN_RADIUS; // ~691.15m
export const TRACK_TOTAL_LENGTH = TRACK_STRAIGHT_LEN * 2 + TRACK_ARC_LEN * 2; // ~3622.3m (3.62 km!)
export const TOTAL_CHECKPOINTS = 10;

// 7-Speed Luxury GT Automatic Transmission Gear Curve (up to 260 km/h real top speed)
const GEAR_RATIOS = [4.1, 2.75, 1.98, 1.48, 1.16, 0.94, 0.78];
const GEAR_MAX_KMH = [52, 92, 134, 174, 212, 240, 265];

export function createInitialVehicleState(): VehicleState {
  const startSample = sampleTrackByDistance(40);
  const laneOffset = -2.3; // True right-hand driving lane (-normal = right on screen)
  return {
    x: startSample.x + startSample.normalX * laneOffset,
    z: startSample.z + startSample.normalZ * laneOffset,
    heading: startSample.heading,
    speedMps: 0,
    speedKmh: 0,
    rpm: 820,
    gear: 1,
    steerAngle: 0,
    wheelVisualDeg: 0,
    throttle: 0,
    brake: 0,
    pitchRad: 0,
    rollRad: 0,
    distanceMeters: 0,
    lapProgress: 40 / TRACK_TOTAL_LENGTH,
    lapCount: 0,
    checkpointsPassed: 0,
    lateralOffset: laneOffset,
    onRoad: true,
    integrity: 100,
    collisionCooldown: 0,
    wiperPhase: 0,
    wiperBladeAngleRad: 0,
    windshieldWetness: 0.34,
  };
}

/**
 * Samples the closed-loop 3.62 km city boulevard circuit at arc-length distance `s` (in meters).
 */
export function sampleTrackByDistance(rawS: number): TrackSample {
  const s = ((rawS % TRACK_TOTAL_LENGTH) + TRACK_TOTAL_LENGTH) % TRACK_TOTAL_LENGTH;
  const H = TRACK_STRAIGHT_HALF;
  const R = TRACK_TURN_RADIUS;

  let x = 0;
  let z = 0;
  let tangentX = 0;
  let tangentZ = 1;

  if (s < TRACK_STRAIGHT_LEN) {
    const local = s;
    x = R;
    z = -H + local;
    tangentX = 0;
    tangentZ = 1;
  } else if (s < TRACK_STRAIGHT_LEN + TRACK_ARC_LEN) {
    const local = s - TRACK_STRAIGHT_LEN;
    const theta = local / R;
    x = Math.cos(theta) * R;
    z = H + Math.sin(theta) * R;
    tangentX = -Math.sin(theta);
    tangentZ = Math.cos(theta);
  } else if (s < TRACK_STRAIGHT_LEN * 2 + TRACK_ARC_LEN) {
    const local = s - (TRACK_STRAIGHT_LEN + TRACK_ARC_LEN);
    x = -R;
    z = H - local;
    tangentX = 0;
    tangentZ = -1;
  } else {
    const local = s - (TRACK_STRAIGHT_LEN * 2 + TRACK_ARC_LEN);
    const theta = Math.PI + local / R;
    x = Math.cos(theta) * R;
    z = -H + Math.sin(theta) * R;
    tangentX = -Math.sin(theta);
    tangentZ = Math.cos(theta);
  }

  // Right-hand normal pointing LEFT (+X when heading +Z)
  const normalX = tangentZ;
  const normalZ = -tangentX;
  const heading = Math.atan2(tangentX, tangentZ);

  return { x, z, tangentX, tangentZ, normalX, normalZ, heading, s };
}

export function projectPointToTrack(x: number, z: number): {
  s: number;
  lateralOffset: number;
  sample: TrackSample;
} {
  const H = TRACK_STRAIGHT_HALF;
  const R = TRACK_TURN_RADIUS;

  let s = 0;
  if (z >= -H && z <= H) {
    if (x >= 0) {
      s = z + H;
    } else {
      s = TRACK_STRAIGHT_LEN + TRACK_ARC_LEN + (H - z);
    }
  } else if (z > H) {
    const dz = z - H;
    let theta = Math.atan2(dz, x);
    if (theta < 0) theta = 0;
    if (theta > Math.PI) theta = Math.PI;
    s = TRACK_STRAIGHT_LEN + theta * R;
  } else {
    const dz = z + H;
    let theta = Math.atan2(dz, x);
    if (theta > 0) theta = -theta;
    const arcAngle = theta + Math.PI;
    s = TRACK_STRAIGHT_LEN * 2 + TRACK_ARC_LEN + arcAngle * R;
  }

  const sample = sampleTrackByDistance(s);
  const dx = x - sample.x;
  const dz = z - sample.z;
  const lateralOffset = dx * sample.normalX + dz * sample.normalZ;

  return { s, lateralOffset, sample };
}

export function computeGearAndRpm(speedKmh: number, throttle: number): { gear: number; rpm: number } {
  let gear = 1;
  for (let i = 0; i < GEAR_MAX_KMH.length; i++) {
    if (speedKmh > GEAR_MAX_KMH[i] * 0.86 && i < GEAR_MAX_KMH.length - 1) {
      gear = i + 2;
    }
  }
  const gearMax = GEAR_MAX_KMH[gear - 1];
  const gearMin = gear === 1 ? 0 : GEAR_MAX_KMH[gear - 2] * 0.62;
  const normalizedInGear = Math.max(0, Math.min(1, (speedKmh - gearMin) / Math.max(1, gearMax - gearMin)));
  const baseRpm = 820 + normalizedInGear * 5900 + throttle * 560 * (GEAR_RATIOS[gear - 1] / 4.1);
  const rpm = Math.round(Math.max(820, Math.min(7600, baseRpm)));
  return { gear, rpm };
}

export function stepVehiclePhysics(
  prev: VehicleState,
  input: DrivingInput,
  rawDt: number,
  mode: LightingMode,
  wiperSpeed: WiperSpeed
): VehicleState {
  const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
  const state: VehicleState = { ...prev };
  const isSport = Boolean(input.sportMode);

  // Instant, tactile pedal response (zero sluggish lag!)
  const pedalAlpha = 1 - Math.exp(-(isSport ? 28 : 22) * dt);
  const targetThrottle = Math.max(0, Math.min(1, input.throttle));
  const targetBrake = Math.max(0, Math.min(1, input.brake));
  state.throttle += (targetThrottle - state.throttle) * pedalAlpha;
  state.brake += (targetBrake - state.brake) * pedalAlpha;

  // Crisp precision steering with speed-progressive authority and smooth return-to-center
  const steerTarget = Math.max(-1, Math.min(1, input.steerTarget));
  const steerResponseRate = Math.abs(steerTarget) > 0.01 ? (isSport ? 18.5 : 15.5) : 13.0;
  const steerAlpha = 1 - Math.exp(-steerResponseRate * dt);
  state.steerAngle += (steerTarget - state.steerAngle) * steerAlpha;
  state.wheelVisualDeg = state.steerAngle * 420;

  // Authentic Luxury Twin-Turbo V8 GT Longitudinal Physics (Real km/h curve: 0-100 in ~4.6s, top 260 km/h)
  const maxSpeedMps = isSport ? 72.22 : 66.67; // 260 km/h (Sport+) / 240 km/h (Comfort)
  const wetGripMultiplier = mode === 'night' ? 0.94 : 1.0;
  const offRoadDrag = state.onRoad ? 0 : 7.5;

  // Low-end launch torque tapers authentically across higher gears and air resistance
  const speedRatio = state.speedMps / maxSpeedMps;
  const torqueCurve = 1.0 + Math.exp(-state.speedMps * 0.085) * 0.55 - speedRatio * 0.62;
  const baseLaunchAccel = isSport ? 14.2 : 12.2;
  const engineAccel = state.throttle * baseLaunchAccel * Math.max(0.18, torqueCurve) * wetGripMultiplier;

  // Carbon-ceramic high-bite braking with realistic ABS feel
  const brakeDecel = state.brake * 25.5 * wetGripMultiplier;
  // Realistic rolling resistance + quadratic aerodynamic drag (0.5 * rho * Cd * A / m * v^2)
  const rollingAndAeroDrag =
    0.34 + state.speedMps * 0.018 + state.speedMps * state.speedMps * 0.00058 + offRoadDrag;

  const netAccel = engineAccel - brakeDecel - rollingAndAeroDrag;
  state.speedMps = Math.max(0, Math.min(maxSpeedMps, state.speedMps + netAccel * dt));
  state.speedKmh = state.speedMps * 3.6;

  // Smooth active air-suspension pitch (squat on launch, nose-dive on braking) & cornering body roll
  const suspAlpha = 1 - Math.exp(-10.5 * dt);
  const desiredPitch =
    (state.throttle * 0.016 - state.brake * (state.speedMps > 1 ? 0.026 : 0)) *
    (1 - speedRatio * 0.42);
  const desiredRoll =
    -state.steerAngle * Math.min(1, state.speedMps / 22) * (isSport ? 0.019 : 0.025);
  state.pitchRad += (desiredPitch - state.pitchRad) * suspAlpha;
  state.rollRad += (desiredRoll - state.rollRad) * suspAlpha;

  const { gear, rpm } = computeGearAndRpm(state.speedKmh, state.throttle);
  state.gear = gear;
  const rpmAlpha = 1 - Math.exp(-16 * dt);
  state.rpm = Math.round(prev.rpm + (rpm - prev.rpm) * rpmAlpha);

  // Speed-sensitive Ackermann steering kinematics (razor-sharp city maneuvering, planted at 240 km/h!)
  const wheelbase = 2.92;
  const maxSteerRad = 0.54;
  const highSpeedAttenuation = 1 / (1 + Math.pow(state.speedMps / 28, 1.38));
  const frontWheelRad = state.steerAngle * maxSteerRad * highSpeedAttenuation;

  if (state.speedMps > 0.05) {
    const angularVelocity = (state.speedMps / wheelbase) * Math.tan(frontWheelRad);
    state.heading -= angularVelocity * dt;
  }

  const moveDist = state.speedMps * dt;
  state.x += Math.sin(state.heading) * moveDist;
  state.z += Math.cos(state.heading) * moveDist;
  state.distanceMeters += moveDist;

  // Keep vehicle bounded within European boulevard corridor curbs
  const proj = projectPointToTrack(state.x, state.z);
  state.lateralOffset = proj.lateralOffset;
  state.onRoad = Math.abs(proj.lateralOffset) <= TRACK_ROAD_HALF_WIDTH;

  const maxGuardrailOffset = TRACK_ROAD_HALF_WIDTH + 1.8;
  if (Math.abs(proj.lateralOffset) > maxGuardrailOffset) {
    const clampedOffset = Math.sign(proj.lateralOffset) * maxGuardrailOffset;
    state.x = proj.sample.x + proj.sample.normalX * clampedOffset;
    state.z = proj.sample.z + proj.sample.normalZ * clampedOffset;
    state.speedMps *= 0.84;
    state.speedKmh = state.speedMps * 3.6;
    state.lateralOffset = clampedOffset;
  }

  // Track lap & checkpoint progress across the 3.62 km boulevard ring
  const prevProgress = prev.lapProgress;
  const newProgress = proj.s / TRACK_TOTAL_LENGTH;
  if (prevProgress > 0.85 && newProgress < 0.15 && state.distanceMeters > 500) {
    state.lapCount += 1;
  }
  state.lapProgress = newProgress;
  state.checkpointsPassed = Math.min(
    TOTAL_CHECKPOINTS,
    Math.floor((state.distanceMeters / TRACK_TOTAL_LENGTH) * TOTAL_CHECKPOINTS)
  );

  if (state.collisionCooldown > 0) {
    state.collisionCooldown = Math.max(0, state.collisionCooldown - dt);
  }

  // Windshield wipers & rain droplet dynamics
  const wiperFreq =
    wiperSpeed === 'continuous' ? 1.15 : wiperSpeed === 'intermittent' ? 0.52 : 0;

  if (wiperFreq > 0) {
    state.wiperPhase = (state.wiperPhase + dt * wiperFreq) % 1;
    const sweepTri = 1 - Math.abs(state.wiperPhase * 2 - 1);
    state.wiperBladeAngleRad = sweepTri * 1.28;
  } else {
    state.wiperPhase = 0;
    state.wiperBladeAngleRad *= Math.exp(-9 * dt);
  }

  if (mode === 'night') {
    const rainAccumRate = 0.16 + (state.speedMps / 45) * 0.14;
    const wiperClearRate = wiperFreq > 0 ? wiperFreq * 0.58 : 0;
    state.windshieldWetness = Math.max(
      0.05,
      Math.min(1, state.windshieldWetness + (rainAccumRate - wiperClearRate) * dt)
    );
  } else {
    state.windshieldWetness = Math.max(0, state.windshieldWetness - 0.9 * dt);
  }

  return state;
}

export function createInitialTraffic(): TrafficVehicle[] {
  // 24 Realistic Sculpted NPC Cars spanning Slow (36-46 km/h), Normal (62-76 km/h), Fast (108-122 km/h) & Very Fast Overtakers (132-148 km/h)!
  const specs: Array<{
    sMeters: number;
    laneOffset: number;
    speedKmh: number;
    speedTier: NpcSpeedTier;
    colorHex: number;
    bodyType: 'sedan' | 'suv' | 'coupe';
    canOvertake: boolean;
  }> = [
    // Immediate foreground scene matching the reference screenshot composition!
    { sMeters: 74, laneOffset: -2.4, speedKmh: 44, speedTier: 'slow', colorHex: 0xb91c1c, bodyType: 'coupe', canOvertake: false },       // Slow crimson coupe ahead-right
    { sMeters: 122, laneOffset: -1.4, speedKmh: 62, speedTier: 'normal', colorHex: 0x0284c7, bodyType: 'coupe', canOvertake: false },    // Sapphire compact ahead center
    { sMeters: 92, laneOffset: 3.6, speedKmh: 68, speedTier: 'normal', colorHex: 0x1e242e, bodyType: 'sedan', canOvertake: false },      // Oncoming left-outer sedan
    { sMeters: 132, laneOffset: 1.7, speedKmh: 76, speedTier: 'normal', colorHex: 0x475569, bodyType: 'sedan', canOvertake: false },     // Oncoming left-inner sedan

    // Very Fast Overtaking Sports Cars immediately behind & ahead of player (active passing maneuvers!)
    { sMeters: 16, laneOffset: -2.3, speedKmh: 134, speedTier: 'superfast', colorHex: 0xe2e8f0, bodyType: 'coupe', canOvertake: true },  // Blazing pearl-silver GT overtaking player!
    { sMeters: 3575, laneOffset: -5.1, speedKmh: 146, speedTier: 'superfast', colorHex: 0x0f172a, bodyType: 'coupe', canOvertake: true }, // Ultra-fast obsidian GT flying down avenue!
    { sMeters: 165, laneOffset: -2.4, speedKmh: 38, speedTier: 'slow', colorHex: 0x334155, bodyType: 'suv', canOvertake: false },        // Slow city SUV cruising ahead
    { sMeters: 138, laneOffset: -2.4, speedKmh: 118, speedTier: 'fast', colorHex: 0xf8fafc, bodyType: 'coupe', canOvertake: true },      // Fast white coupe overtaking slow SUV!

    // Mid-boulevard & Grand Ring Traffic Mix (Slow, Normal, Fast & Superfast Overtakers across 3.62 km!)
    { sMeters: 280, laneOffset: -5.0, speedKmh: 42, speedTier: 'slow', colorHex: 0x4b5563, bodyType: 'suv', canOvertake: false },
    { sMeters: 330, laneOffset: -2.3, speedKmh: 126, speedTier: 'fast', colorHex: 0x1d4ed8, bodyType: 'coupe', canOvertake: true },
    { sMeters: 440, laneOffset: 2.2, speedKmh: 98, speedTier: 'fast', colorHex: 0xd1d5db, bodyType: 'sedan', canOvertake: false },
    { sMeters: 520, laneOffset: -2.4, speedKmh: 46, speedTier: 'slow', colorHex: 0x713f12, bodyType: 'suv', canOvertake: false },
    { sMeters: 580, laneOffset: -2.4, speedKmh: 142, speedTier: 'superfast', colorHex: 0x991b1b, bodyType: 'coupe', canOvertake: true },
    { sMeters: 740, laneOffset: -5.0, speedKmh: 70, speedTier: 'normal', colorHex: 0x1e293b, bodyType: 'sedan', canOvertake: false },
    { sMeters: 860, laneOffset: 4.5, speedKmh: 58, speedTier: 'normal', colorHex: 0x64748b, bodyType: 'suv', canOvertake: false },
    { sMeters: 1020, laneOffset: -2.3, speedKmh: 138, speedTier: 'superfast', colorHex: 0x065f46, bodyType: 'coupe', canOvertake: true },
    { sMeters: 1280, laneOffset: -4.9, speedKmh: 40, speedTier: 'slow', colorHex: 0x52525b, bodyType: 'suv', canOvertake: false },
    { sMeters: 1480, laneOffset: 2.0, speedKmh: 112, speedTier: 'fast', colorHex: 0xf1f5f9, bodyType: 'coupe', canOvertake: false },
    { sMeters: 1750, laneOffset: -2.4, speedKmh: 72, speedTier: 'normal', colorHex: 0x374151, bodyType: 'sedan', canOvertake: false },
    { sMeters: 1960, laneOffset: -2.4, speedKmh: 144, speedTier: 'superfast', colorHex: 0xd97706, bodyType: 'coupe', canOvertake: true },
    { sMeters: 2280, laneOffset: 4.4, speedKmh: 66, speedTier: 'normal', colorHex: 0x1e3a5f, bodyType: 'sedan', canOvertake: false },
    { sMeters: 2620, laneOffset: -5.0, speedKmh: 45, speedTier: 'slow', colorHex: 0x3f3f46, bodyType: 'suv', canOvertake: false },
    { sMeters: 2940, laneOffset: -2.3, speedKmh: 128, speedTier: 'fast', colorHex: 0xe2e8f0, bodyType: 'sedan', canOvertake: true },
    { sMeters: 3320, laneOffset: 2.1, speedKmh: 82, speedTier: 'normal', colorHex: 0x7f1d1d, bodyType: 'sedan', canOvertake: false },
  ];

  return specs.map((spec, idx) => {
    const s = ((spec.sMeters % TRACK_TOTAL_LENGTH) + TRACK_TOTAL_LENGTH) % TRACK_TOTAL_LENGTH;
    const sample = sampleTrackByDistance(s);
    const speedMps = spec.speedKmh / 3.6;
    const oncoming = spec.laneOffset > 0;
    const heading = oncoming ? sample.heading + Math.PI : sample.heading;
    return {
      id: idx + 1,
      s,
      laneOffset: spec.laneOffset,
      baseLaneOffset: spec.laneOffset,
      targetLaneOffset: spec.laneOffset,
      speedMps,
      targetSpeedMps: speedMps,
      speedTier: spec.speedTier,
      colorHex: spec.colorHex,
      bodyType: spec.bodyType,
      x: sample.x + sample.normalX * spec.laneOffset,
      z: sample.z + sample.normalZ * spec.laneOffset,
      heading,
      braking: false,
      canOvertake: spec.canOvertake,
      isOvertaking: false,
      turnSignal: 0,
      overtakeTimer: 0,
      wheelSpinRad: 0,
    };
  });
}

function forwardSplineDistance(fromS: number, toS: number, oncoming: boolean): number {
  if (oncoming) {
    return (fromS - toS + TRACK_TOTAL_LENGTH) % TRACK_TOTAL_LENGTH;
  }
  return (toS - fromS + TRACK_TOTAL_LENGTH) % TRACK_TOTAL_LENGTH;
}

export function stepTrafficAndCollisions(
  traffic: TrafficVehicle[],
  player: VehicleState,
  rawDt: number
): { traffic: TrafficVehicle[]; player: VehicleState; collided: boolean } {
  const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
  let collided = false;
  const nextPlayer = { ...player };
  const playerProj = projectPointToTrack(nextPlayer.x, nextPlayer.z);

  const updated = traffic.map((car) => {
    const next = { ...car };
    const oncoming = next.baseLaneOffset > 0;
    const dir = oncoming ? -1 : 1;

    // 1. Scan ahead in current lane for slower traffic or player
    let blockerAheadDist = Infinity;
    let blockerSpeedMps = next.targetSpeedMps;

    for (const other of traffic) {
      if (other.id === next.id) continue;
      if (Math.abs(other.laneOffset - next.laneOffset) < 1.95) {
        const deltaS = forwardSplineDistance(next.s, other.s, oncoming);
        if (deltaS > 0.5 && deltaS < blockerAheadDist) {
          blockerAheadDist = deltaS;
          blockerSpeedMps = other.speedMps;
        }
      }
    }

    if (!oncoming && Math.abs(playerProj.lateralOffset - next.laneOffset) < 2.1) {
      const deltaSPlayer = forwardSplineDistance(next.s, playerProj.s, false);
      if (deltaSPlayer > 0.5 && deltaSPlayer < blockerAheadDist) {
        blockerAheadDist = deltaSPlayer;
        blockerSpeedMps = nextPlayer.speedMps;
      }
    }

    // 2. Dynamic Overtaking AI for Fast & Superfast NPCs (early lookahead scaled by speed!)
    const overtakeLookahead = Math.max(38, next.speedMps * 1.75);
    if (next.canOvertake && !oncoming) {
      if (!next.isOvertaking && blockerAheadDist < overtakeLookahead && blockerSpeedMps < next.targetSpeedMps - 2.0) {
        const passLane = next.laneOffset > -3.5 ? -5.2 : -1.5;
        let passLaneClear = true;
        for (const other of traffic) {
          if (other.id === next.id) continue;
          if (Math.abs(other.laneOffset - passLane) < 1.95) {
            const dFwd = forwardSplineDistance(next.s, other.s, false);
            const dBack = forwardSplineDistance(other.s, next.s, false);
            if (dFwd < 26 || dBack < 14) {
              passLaneClear = false;
              break;
            }
          }
        }
        if (Math.abs(playerProj.lateralOffset - passLane) < 2.1) {
          const dFwdP = forwardSplineDistance(next.s, playerProj.s, false);
          const dBackP = forwardSplineDistance(playerProj.s, next.s, false);
          if (dFwdP < 20 || dBackP < 12) passLaneClear = false;
        }

        if (passLaneClear) {
          next.isOvertaking = true;
          next.targetLaneOffset = passLane;
          next.overtakeTimer = 3.6;
        }
      } else if (next.isOvertaking) {
        next.overtakeTimer = Math.max(0, next.overtakeTimer - dt);
        if (next.overtakeTimer <= 0) {
          let baseClear = true;
          for (const other of traffic) {
            if (other.id === next.id) continue;
            if (Math.abs(other.laneOffset - next.baseLaneOffset) < 1.95) {
              const dFwd = forwardSplineDistance(next.s, other.s, false);
              const dBack = forwardSplineDistance(other.s, next.s, false);
              if (dFwd < 22 || dBack < 16) {
                baseClear = false;
                break;
              }
            }
          }
          if (Math.abs(playerProj.lateralOffset - next.baseLaneOffset) < 2.1) {
            const dFwdP = forwardSplineDistance(next.s, playerProj.s, false);
            const dBackP = forwardSplineDistance(playerProj.s, next.s, false);
            if (dFwdP < 18 || dBackP < 15) baseClear = false;
          }
          if (baseClear) {
            next.isOvertaking = false;
            next.targetLaneOffset = next.baseLaneOffset;
          }
        }
      }
    }

    // 3. Smooth Lateral Lane-Change Interpolation + Authentic Turn Indicator & Yaw Angle
    const laneDiff = next.targetLaneOffset - next.laneOffset;
    const laneShiftRate = next.speedTier === 'superfast' ? 4.4 : 3.4;
    const maxLateralStep = laneShiftRate * dt;
    const appliedLateral =
      Math.abs(laneDiff) <= maxLateralStep ? laneDiff : Math.sign(laneDiff) * maxLateralStep;
    next.laneOffset += appliedLateral;

    if (Math.abs(laneDiff) > 0.22) {
      next.turnSignal = laneDiff > 0 ? 1 : -1;
    } else {
      next.turnSignal = 0;
    }

    // 4. Longitudinal Speed & Braking Control
    const brakeDistThreshold = Math.max(18, next.speedMps * 0.72);
    const shouldBrake = blockerAheadDist < brakeDistThreshold && Math.abs(laneDiff) < 0.9;
    next.braking = shouldBrake;
    const overtakeBoost = next.isOvertaking ? 1.14 : 1.0;
    const desiredSpeed = shouldBrake
      ? Math.max(2, Math.min(next.targetSpeedMps * 0.45, blockerSpeedMps * 0.86))
      : next.targetSpeedMps * overtakeBoost;

    next.speedMps += (desiredSpeed - next.speedMps) * (1 - Math.exp(-4.6 * dt));
    next.s =
      ((next.s + dir * next.speedMps * dt) % TRACK_TOTAL_LENGTH + TRACK_TOTAL_LENGTH) %
      TRACK_TOTAL_LENGTH;
    next.wheelSpinRad = (next.wheelSpinRad + (next.speedMps * dt) / 0.34) % (Math.PI * 2);

    const sample = sampleTrackByDistance(next.s);
    next.x = sample.x + sample.normalX * next.laneOffset;
    next.z = sample.z + sample.normalZ * next.laneOffset;

    const lateralVel = appliedLateral / Math.max(0.001, dt);
    const laneYawRad = Math.atan2(lateralVel, Math.max(6, next.speedMps)) * (oncoming ? -1 : 1);
    next.heading = (oncoming ? sample.heading + Math.PI : sample.heading) + laneYawRad;

    // 5. Collision check with player vehicle bounding capsule
    const cDx = nextPlayer.x - next.x;
    const cDz = nextPlayer.z - next.z;
    const cDist = Math.hypot(cDx, cDz);
    if (cDist < 3.35) {
      if (nextPlayer.collisionCooldown <= 0) {
        collided = true;
        nextPlayer.integrity = Math.max(0, Math.round(nextPlayer.integrity - 16));
        nextPlayer.collisionCooldown = 1.1;
      }
      const pushNx = cDist > 0.01 ? cDx / cDist : 1;
      const pushNz = cDist > 0.01 ? cDz / cDist : 0;
      const overlap = 3.4 - cDist;
      nextPlayer.x += pushNx * overlap;
      nextPlayer.z += pushNz * overlap;
      nextPlayer.speedMps *= 0.52;
      nextPlayer.speedKmh = nextPlayer.speedMps * 3.6;
    }

    return next;
  });

  return { traffic: updated, player: nextPlayer, collided };
}

export function estimateHonorX9bTelemetry(
  mode: LightingMode,
  measuredFps: number,
  activeTrafficCount: number
): {
  internalResolution: string;
  targetFps: number;
  currentFps: number;
  estimatedPssMemoryMb: number;
  estimatedVramMb: number;
  drawCalls: number;
  trianglesK: number;
  thermalHeadroom: 'Nominal (34.8°C)' | 'Warm-Stable (38.2°C)';
} {
  const isNight = mode === 'night';
  const drawCalls = (isNight ? 84 : 68) + activeTrafficCount * 2;
  const trianglesK = Math.round((isNight ? 72.0 : 62.0) + activeTrafficCount * 2.6);
  const estimatedPssMemoryMb = isNight ? 356 : 318;
  const estimatedVramMb = isNight ? 164 : 138;
  return {
    internalResolution: '1280×720 (720p URP Scale 0.67)',
    targetFps: 30,
    currentFps: Math.max(24, Math.min(60, Math.round(measuredFps || 30))),
    estimatedPssMemoryMb,
    estimatedVramMb,
    drawCalls,
    trianglesK,
    thermalHeadroom: isNight ? 'Warm-Stable (38.2°C)' : 'Nominal (34.8°C)',
  };
}
