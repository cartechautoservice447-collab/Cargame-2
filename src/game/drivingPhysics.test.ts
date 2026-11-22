import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialVehicleState,
  createInitialTraffic,
  stepVehiclePhysics,
  stepTrafficAndCollisions,
  sampleTrackByDistance,
  projectPointToTrack,
  computeGearAndRpm,
  estimateHonorX9bTelemetry,
  TRACK_TOTAL_LENGTH,
} from './drivingPhysics';

test('initial vehicle state starts on road at idle RPM in gear 1', () => {
  const v = createInitialVehicleState();
  assert.equal(v.speedKmh, 0);
  assert.equal(v.gear, 1);
  assert.equal(v.rpm, 820);
  assert.equal(v.onRoad, true);
  assert.equal(v.integrity, 100);
});

test('vehicle accelerates realistically past 100 km/h under full throttle and shifts gears automatically', () => {
  let v = createInitialVehicleState();
  for (let i = 0; i < 120; i++) {
    v = stepVehiclePhysics(
      v,
      { throttle: 1, brake: 0, steerTarget: 0, sportMode: true },
      0.04,
      'day',
      'off'
    );
  }
  assert.ok(v.speedKmh > 110, `Expected speedKmh > 110 after 4.8s full throttle, got ${v.speedKmh}`);
  assert.ok(v.gear >= 3, `Expected gear >= 3 at ${v.speedKmh} km/h, got ${v.gear}`);
  assert.ok(v.distanceMeters > 70, 'Vehicle should travel substantial real distance');
});

test('braking decelerates moving vehicle back toward zero', () => {
  let v = createInitialVehicleState();
  for (let i = 0; i < 60; i++) {
    v = stepVehiclePhysics(
      v,
      { throttle: 1, brake: 0, steerTarget: 0 },
      0.04,
      'day',
      'off'
    );
  }
  const peakSpeed = v.speedKmh;
  assert.ok(peakSpeed > 50);

  for (let i = 0; i < 55; i++) {
    v = stepVehiclePhysics(
      v,
      { throttle: 0, brake: 1, steerTarget: 0 },
      0.04,
      'day',
      'off'
    );
  }
  assert.ok(v.speedKmh < peakSpeed * 0.2, 'Braking should reduce speed significantly');
});

test('steering input rotates cockpit wheel visual degrees and turns heading when moving', () => {
  let v = createInitialVehicleState();
  const initialHeading = v.heading;
  for (let i = 0; i < 30; i++) {
    v = stepVehiclePhysics(
      v,
      { throttle: 0.8, brake: 0, steerTarget: 0.75 },
      0.04,
      'day',
      'off'
    );
  }
  assert.ok(v.wheelVisualDeg > 200, `Expected wheelVisualDeg > 200, got ${v.wheelVisualDeg}`);
  assert.notEqual(v.heading, initialHeading);
});

test('night mode rain accumulates wetness and continuous wipers reduce wetness', () => {
  let v = createInitialVehicleState();
  v.windshieldWetness = 0.5;
  for (let i = 0; i < 50; i++) {
    v = stepVehiclePhysics(
      v,
      { throttle: 0.4, brake: 0, steerTarget: 0 },
      0.04,
      'night',
      'continuous'
    );
  }
  assert.ok(v.wiperPhase > 0, 'Wiper phase should advance when continuous');
  assert.ok(v.windshieldWetness < 0.5, `Expected wipers to clear wetness below 0.5, got ${v.windshieldWetness}`);
});

test('expanded 3.6km track spline sampling and point projection round-trip accurately', () => {
  const sTest = 420;
  const sample = sampleTrackByDistance(sTest);
  const lateral = 3.2;
  const wx = sample.x + sample.normalX * lateral;
  const wz = sample.z + sample.normalZ * lateral;
  const proj = projectPointToTrack(wx, wz);

  assert.ok(Math.abs(proj.s - sTest) < 1.0, `Expected s ~ ${sTest}, got ${proj.s}`);
  assert.ok(Math.abs(proj.lateralOffset - lateral) < 0.25, `Expected lateral ~ ${lateral}, got ${proj.lateralOffset}`);
  assert.ok(TRACK_TOTAL_LENGTH > 3500, `Expected expanded map > 3500m, got ${TRACK_TOTAL_LENGTH}`);
});

test('AI traffic spawns 24 multi-tier speed cars (slow, normal, fast, superfast) and detects collisions', () => {
  const traffic = createInitialTraffic();
  assert.equal(traffic.length, 24);
  const slowCars = traffic.filter((c) => c.targetSpeedMps * 3.6 <= 50);
  const veryFastCars = traffic.filter((c) => c.targetSpeedMps * 3.6 >= 130);
  assert.ok(slowCars.length >= 4, 'Expected slow cruising NPC cars');
  assert.ok(veryFastCars.length >= 4, 'Expected very fast NPC cars >= 130 km/h');

  const player = createInitialVehicleState();
  const step1 = stepTrafficAndCollisions(traffic, player, 0.04);
  assert.notEqual(step1.traffic[0].s, traffic[0].s);
  assert.equal(step1.collided, false);

  const crashPlayer = {
    ...player,
    x: step1.traffic[0].x + 0.5,
    z: step1.traffic[0].z + 0.5,
    speedMps: 20,
    speedKmh: 72,
  };
  const step2 = stepTrafficAndCollisions(step1.traffic, crashPlayer, 0.04);
  assert.equal(step2.collided, true);
  assert.ok(step2.player.integrity < 100, 'Integrity should decrease on collision');
});

test('fast NPC overtaking cars change lanes smoothly around slower player with turn signals', () => {
  let traffic = createInitialTraffic();
  const stationaryPlayer = createInitialVehicleState();
  const overtakerStart = traffic.find((c) => c.canOvertake && c.id === 5);
  assert.ok(overtakerStart, 'Expected superfast overtaking NPC car behind player');

  let sawOvertaking = false;
  let sawTurnSignal = false;
  let maxLateralDelta = 0;

  for (let i = 0; i < 60; i++) {
    const res = stepTrafficAndCollisions(traffic, stationaryPlayer, 0.04);
    traffic = res.traffic;
    const ov = traffic.find((c) => c.id === 5)!;
    if (ov.isOvertaking) sawOvertaking = true;
    if (ov.turnSignal !== 0) sawTurnSignal = true;
    maxLateralDelta = Math.max(maxLateralDelta, Math.abs(ov.laneOffset - ov.baseLaneOffset));
  }

  assert.equal(sawOvertaking, true, 'Fast NPC should trigger overtaking around slow player');
  assert.equal(sawTurnSignal, true, 'Overtaking NPC should activate turn signal during lane change');
  assert.ok(maxLateralDelta > 1.5, `Expected overtaking lateral lane shift > 1.5m, got ${maxLateralDelta}`);
});

test('computeGearAndRpm and HONOR X9b telemetry budget return valid ranges', () => {
  const g1 = computeGearAndRpm(15, 0.5);
  const g5 = computeGearAndRpm(185, 0.9);
  assert.equal(g1.gear, 1);
  assert.ok(g5.gear >= 5);

  const telemetry = estimateHonorX9bTelemetry('night', 30, 24);
  assert.equal(telemetry.targetFps, 30);
  assert.ok(telemetry.estimatedPssMemoryMb < 500);
});
