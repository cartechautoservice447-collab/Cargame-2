import React, { useRef, useState } from 'react';
import {
  DrivingInput,
  LightingMode,
  TOTAL_CHECKPOINTS,
  TRACK_TOTAL_LENGTH,
  WiperSpeed,
} from '../game/drivingPhysics';
import { TelemetrySnapshot } from '../game/SceneCanvas';

interface DrivingHudAndTouchControlsProps {
  telemetry: TelemetrySnapshot;
  lightingMode: LightingMode;
  wiperSpeed: WiperSpeed;
  isMuted: boolean;
  touchInputRef: React.MutableRefObject<DrivingInput>;
  onToggleLightingMode: () => void;
  onCycleWipers: () => void;
  onToggleMute: () => void;
  onOpenPause: () => void;
  onOpenUnityModal: () => void;
}

export const DrivingHudAndTouchControls: React.FC<DrivingHudAndTouchControlsProps> = ({
  telemetry,
  lightingMode,
  wiperSpeed,
  isMuted,
  touchInputRef,
  onToggleLightingMode,
  onCycleWipers,
  onToggleMute,
  onOpenPause,
  onOpenUnityModal,
}) => {
  const [steerMode, setSteerMode] = useState<'wheel' | 'paddles'>('wheel');
  const [sportModeToggle, setSportModeToggle] = useState<boolean>(false);

  // Direct horizontal-drag steering wheel state (ultra-responsive, zero slip!)
  const wheelDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const [wheelNormSteer, setWheelNormSteer] = useState(0);

  // Multi-touch paddle steering state
  const leftPaddleHeldRef = useRef(false);
  const rightPaddleHeldRef = useRef(false);
  const [leftPaddleVisual, setLeftPaddleVisual] = useState(false);
  const [rightPaddleVisual, setRightPaddleVisual] = useState(false);

  // Proportional pressure pedal states
  const [throttlePressure, setThrottlePressure] = useState(0);
  const [brakePressure, setBrakePressure] = useState(0);

  const handleToggleSport = () => {
    setSportModeToggle((prev) => {
      const next = !prev;
      touchInputRef.current.sportMode = next;
      return next;
    });
  };

  const handleSwitchSteerMode = (mode: 'wheel' | 'paddles') => {
    setSteerMode(mode);
    wheelDraggingRef.current = false;
    leftPaddleHeldRef.current = false;
    rightPaddleHeldRef.current = false;
    setLeftPaddleVisual(false);
    setRightPaddleVisual(false);
    setWheelNormSteer(0);
    touchInputRef.current.steerTarget = 0;
  };

  // --- DIRECT HORIZONTAL SLIDE STEERING WHEEL ---
  const handleWheelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    wheelDraggingRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    dragStartXRef.current = cx;
    const initial = Math.max(-1, Math.min(1, (e.clientX - cx) / 56));
    const norm = Math.abs(initial) < 0.12 ? 0 : initial;
    setWheelNormSteer(norm);
    touchInputRef.current.steerTarget = norm;
  };

  const handleWheelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!wheelDraggingRef.current) return;
    const norm = Math.max(-1, Math.min(1, (e.clientX - dragStartXRef.current) / 58));
    setWheelNormSteer(norm);
    touchInputRef.current.steerTarget = norm;
  };

  const handleWheelPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    wheelDraggingRef.current = false;
    setWheelNormSteer(0);
    touchInputRef.current.steerTarget = 0;
  };

  // --- MULTI-TOUCH PADDLE BUTTONS ---
  const syncPaddleSteer = () => {
    const val = (rightPaddleHeldRef.current ? 1 : 0) - (leftPaddleHeldRef.current ? 1 : 0);
    touchInputRef.current.steerTarget = val;
  };

  const handleLeftPaddleDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    leftPaddleHeldRef.current = true;
    setLeftPaddleVisual(true);
    syncPaddleSteer();
  };

  const handleLeftPaddleUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    leftPaddleHeldRef.current = false;
    setLeftPaddleVisual(false);
    syncPaddleSteer();
  };

  const handleRightPaddleDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    rightPaddleHeldRef.current = true;
    setRightPaddleVisual(true);
    syncPaddleSteer();
  };

  const handleRightPaddleUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    rightPaddleHeldRef.current = false;
    setRightPaddleVisual(false);
    syncPaddleSteer();
  };

  // --- PROPORTIONAL PRESSURE PEDALS (Press for full power, slide vertically to modulate!) ---
  const computePedalPressure = (e: React.PointerEvent<HTMLButtonElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Higher touch position on the tall pedal = deeper throttle/brake (0.45 at bottom -> 1.0 upper half)
    const relFromBottom = 1 - (e.clientY - rect.top) / Math.max(1, rect.height);
    return Math.max(0.45, Math.min(1, 0.42 + relFromBottom * 0.72));
  };

  const handleThrottleDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = Math.max(0.9, computePedalPressure(e));
    touchInputRef.current.throttle = p;
    setThrottlePressure(p);
  };

  const handleThrottleMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const p = computePedalPressure(e);
    touchInputRef.current.throttle = p;
    setThrottlePressure(p);
  };

  const handleThrottleUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    touchInputRef.current.throttle = 0;
    setThrottlePressure(0);
  };

  const handleBrakeDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = Math.max(0.9, computePedalPressure(e));
    touchInputRef.current.brake = p;
    setBrakePressure(p);
  };

  const handleBrakeMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const p = computePedalPressure(e);
    touchInputRef.current.brake = p;
    setBrakePressure(p);
  };

  const handleBrakeUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    touchInputRef.current.brake = 0;
    setBrakePressure(0);
  };

  const effectiveSteer = wheelDraggingRef.current ? wheelNormSteer : telemetry.steerAngle;
  const displayWheelDeg = Math.round(effectiveSteer * 135);
  const activeThrottle = Math.max(throttlePressure, telemetry.throttle);
  const activeBrake = Math.max(brakePressure, telemetry.brake);
  const isSportActive = sportModeToggle || telemetry.sportMode;
  const routeKm = (TRACK_TOTAL_LENGTH / 1000).toFixed(2);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between px-4 py-3 md:px-6 md:py-4">
      {/* TOP ROW: Reference-Matched Minimal Floating Telemetry (Left) + Action Controls (Right) */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Crisp Unboxed Telemetry matching reference screenshot ('356 △ 23:05' style) */}
        <div className="flex items-center gap-4 md:gap-5 text-white hud-stroke">
          <div className="flex items-baseline gap-1.5">
            <span
              data-testid="hud-speed"
              className="font-display font-mono-tabular text-2xl md:text-3xl font-bold leading-none"
            >
              {Math.round(telemetry.speedKmh)}
            </span>
            <span className="text-[11px] font-mono-tabular text-slate-200">KM/H</span>
          </div>

          <div className="flex items-center gap-1.5 font-mono-tabular text-sm font-semibold">
            <span
              data-testid="hud-gear"
              className={isSportActive ? 'text-rose-400' : 'text-amber-300'}
            >
              {isSportActive ? `S${telemetry.gear}` : `D${telemetry.gear}`}
            </span>
            <span aria-hidden="true" className="opacity-60">
              ·
            </span>
            <span>{lightingMode === 'night' ? '23:05' : '14:20'}</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 font-mono-tabular text-xs font-medium text-slate-100">
            <span>
              {telemetry.checkpointsPassed}/{TOTAL_CHECKPOINTS} CP
            </span>
            <span aria-hidden="true" className="opacity-60">
              ·
            </span>
            <span>
              {(telemetry.distanceMeters / 1000).toFixed(2)} / {routeKm} KM
            </span>
            <span aria-hidden="true" className="opacity-60">
              ·
            </span>
            <span className={telemetry.integrity > 50 ? 'text-emerald-300' : 'text-red-300'}>
              {telemetry.integrity}%
            </span>
          </div>
        </div>

        {/* Top-Right Circular Translucent Outlined Controls (Zero Camera Switch — Interior Only!) */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            tabIndex={-1}
            data-testid="sport-mode-toggle"
            onClick={(e) => {
              e.currentTarget.blur();
              handleToggleSport();
            }}
            title="Toggle Comfort (240 km/h) vs Sport+ (260 km/h) [Hold Shift]"
            aria-label={`Drive Mode: ${isSportActive ? 'Sport Plus' : 'Comfort'}`}
            aria-pressed={isSportActive}
            className={`h-10 px-3 rounded-full border-2 text-[11px] font-mono-tabular font-bold flex items-center justify-center transition-colors shadow-md whitespace-nowrap ${
              isSportActive
                ? 'bg-rose-950/85 border-rose-400 text-rose-200'
                : 'bg-[rgba(10,14,22,0.52)] hover:bg-[rgba(15,23,42,0.85)] border-white/75 text-white'
            }`}
          >
            {isSportActive ? 'SPORT+' : 'COMFORT'}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleLightingMode();
            }}
            title={lightingMode === 'night' ? 'Switch to Day Mode [N]' : 'Switch to Night Rain [N]'}
            aria-label={`Switch Day or Night Mode (Current: ${lightingMode})`}
            className="w-10 h-10 rounded-full bg-[rgba(10,14,22,0.48)] hover:bg-[rgba(15,23,42,0.8)] border-2 border-white/80 text-white flex items-center justify-center transition-colors shadow-md"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              {lightingMode === 'day' ? (
                <path d="M12 7a5 5 0 100 10 5 5 0 000-10zm0-5a1 1 0 011 1v2a1 1 0 11-2 0V3a1 1 0 011-1zm0 16a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1zm9-7a1 1 0 110 2h-2a1 1 0 110-2h2zM5 11a1 1 0 110 2H3a1 1 0 110-2h2z" />
              ) : (
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              )}
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onCycleWipers();
            }}
            title={`Wipers: ${wiperSpeed} [F]`}
            aria-label={`Cycle Windshield Wipers (Current: ${wiperSpeed})`}
            className={`w-10 h-10 rounded-full bg-[rgba(10,14,22,0.48)] hover:bg-[rgba(15,23,42,0.8)] border-2 flex items-center justify-center transition-colors shadow-md ${
              wiperSpeed !== 'off' ? 'border-sky-300 text-sky-200' : 'border-white/80 text-white'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
              <path d="M3 7c5-4 13-4 18 0L17 19c-3-2-7-2-10 0L3 7z" />
              <path d="M12 18L15 8" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenUnityModal();
            }}
            title="Unity 6.3 LTS C# & HONOR X9b Package [U]"
            aria-label="Open Unity 6.3 LTS C# Scripts and HONOR X9b Setup"
            className="h-10 px-3 rounded-full bg-[rgba(10,14,22,0.55)] hover:bg-[rgba(15,23,42,0.85)] border-2 border-sky-300/85 text-[11px] font-mono-tabular font-semibold text-sky-200 flex items-center justify-center transition-colors shadow-md whitespace-nowrap"
          >
            UNITY 6.3
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            title={isMuted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
            aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            className="w-10 h-10 rounded-full bg-[rgba(10,14,22,0.48)] hover:bg-[rgba(15,23,42,0.8)] border-2 border-white/80 text-white flex items-center justify-center transition-colors shadow-md"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
              {isMuted ? (
                <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
              ) : (
                <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
              )}
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenPause();
            }}
            title="Pause Simulation [Esc]"
            aria-label="Pause Simulation"
            className="w-10 h-10 rounded-full bg-[rgba(10,14,22,0.48)] hover:bg-[rgba(15,23,42,0.8)] border-2 border-white/80 text-white flex items-center justify-center transition-colors shadow-md"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          </button>
        </div>
      </div>

      {/* BOTTOM ROW: Responsive Dual-Mode Steering Controller (Left) & Proportional Metallic Pedals (Right) */}
      <div className="flex items-end justify-between gap-4">
        {/* Left Controller Stack: Compact WHEEL / PADDLES Mode Switch + Active Steering Surface */}
        <div className="pointer-events-auto flex flex-col items-start gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-[rgba(8,12,20,0.62)] border border-white/25 p-0.5">
            <button
              type="button"
              tabIndex={-1}
              data-testid="steer-mode-wheel"
              onClick={(e) => {
                e.currentTarget.blur();
                handleSwitchSteerMode('wheel');
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-mono-tabular font-semibold transition-colors ${
                steerMode === 'wheel'
                  ? 'bg-sky-500/85 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              WHEEL
            </button>
            <button
              type="button"
              tabIndex={-1}
              data-testid="steer-mode-paddles"
              onClick={(e) => {
                e.currentTarget.blur();
                handleSwitchSteerMode('paddles');
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-mono-tabular font-semibold transition-colors ${
                steerMode === 'paddles'
                  ? 'bg-sky-500/85 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              PADDLES
            </button>
          </div>

          {steerMode === 'wheel' ? (
            <div
              ref={undefined}
              onPointerDown={handleWheelPointerDown}
              onPointerMove={handleWheelPointerMove}
              onPointerUp={handleWheelPointerUp}
              onPointerCancel={handleWheelPointerUp}
              role="slider"
              aria-label="Touch Steering Wheel (Slide Left or Right)"
              aria-valuemin={-135}
              aria-valuemax={135}
              aria-valuenow={displayWheelDeg}
              className={`relative w-28 h-28 md:w-32 md:h-32 rounded-full bg-[rgba(8,12,20,0.42)] border-2 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none transition-colors shadow-lg ${
                Math.abs(effectiveSteer) > 0.05
                  ? 'border-sky-300/90 opacity-100'
                  : 'border-white/45 opacity-85 hover:opacity-100'
              }`}
            >
              <svg
                viewBox="0 0 120 120"
                className="w-24 h-24 md:w-28 md:h-28 transition-transform duration-75"
                style={{ transform: `rotate(${displayWheelDeg}deg)` }}
              >
                {/* Outer leather rim */}
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="rgba(255,255,255,0.82)"
                  strokeWidth="9"
                />
                {/* Sport 12-o'clock top center marker */}
                <line
                  x1="60"
                  y1="8"
                  x2="60"
                  y2="17"
                  stroke="#f43f5e"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                {/* 3-spoke brushed alloy arms */}
                <path
                  d="M17 58 H45 M75 58 H103 M60 72 V103"
                  stroke="rgba(226,232,240,0.78)"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
                {/* Central horn crest */}
                <circle
                  cx="60"
                  cy="60"
                  r="14"
                  fill="rgba(10,14,22,0.78)"
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth="2.5"
                />
                <circle cx="60" cy="60" r="4" fill="#38bdf8" />
              </svg>
              <span className="absolute -bottom-1 px-1.5 py-0.5 rounded bg-[rgba(8,12,20,0.82)] text-[9px] font-mono-tabular text-sky-200 tracking-wider">
                SLIDE ◄ ►
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                tabIndex={-1}
                data-testid="steer-paddle-left"
                aria-label="Steer Left"
                onPointerDown={handleLeftPaddleDown}
                onPointerUp={handleLeftPaddleUp}
                onPointerCancel={handleLeftPaddleUp}
                className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl border-2 flex flex-col items-center justify-center touch-none transition-transform duration-75 shadow-lg ${
                  leftPaddleVisual || telemetry.steerAngle < -0.15
                    ? 'bg-sky-600/80 border-sky-200 scale-95 text-white'
                    : 'bg-[rgba(8,12,20,0.48)] border-white/50 text-white/90 hover:bg-[rgba(15,23,42,0.75)]'
                }`}
              >
                <span className="text-xl leading-none font-bold">◄</span>
                <span className="text-[9px] font-mono-tabular mt-1 opacity-80">LEFT</span>
              </button>
              <button
                type="button"
                tabIndex={-1}
                data-testid="steer-paddle-right"
                aria-label="Steer Right"
                onPointerDown={handleRightPaddleDown}
                onPointerUp={handleRightPaddleUp}
                onPointerCancel={handleRightPaddleUp}
                className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl border-2 flex flex-col items-center justify-center touch-none transition-transform duration-75 shadow-lg ${
                  rightPaddleVisual || telemetry.steerAngle > 0.15
                    ? 'bg-sky-600/80 border-sky-200 scale-95 text-white'
                    : 'bg-[rgba(8,12,20,0.48)] border-white/50 text-white/90 hover:bg-[rgba(15,23,42,0.75)]'
                }`}
              >
                <span className="text-xl leading-none font-bold">►</span>
                <span className="text-[9px] font-mono-tabular mt-1 opacity-80">RIGHT</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Controller: Ergonomic Proportional Metallic BRAKE & ACCEL Pedals */}
        <div className="pointer-events-auto flex items-end gap-3">
          <button
            type="button"
            tabIndex={-1}
            data-testid="pedal-brake"
            aria-label="Brake Pedal (Proportional Touch)"
            onPointerDown={handleBrakeDown}
            onPointerMove={handleBrakeMove}
            onPointerUp={handleBrakeUp}
            onPointerCancel={handleBrakeUp}
            className={`relative overflow-hidden w-16 h-20 md:w-20 md:h-24 rounded-2xl border-2 flex flex-col items-center justify-between py-2.5 transition-transform duration-75 touch-none shadow-lg ${
              activeBrake > 0.08
                ? 'bg-red-950/85 border-red-300 scale-95 text-white'
                : 'bg-[rgba(8,12,20,0.46)] border-white/50 text-white/90 hover:bg-[rgba(15,23,42,0.72)]'
            }`}
          >
            {/* Proportional live pressure fill bar */}
            <div
              className="absolute inset-x-0 bottom-0 bg-red-500/45 transition-all duration-75 pointer-events-none"
              style={{ height: `${Math.round(activeBrake * 100)}%` }}
            />
            <span className="relative z-10 text-[10px] font-display font-bold tracking-wider">
              BRAKE
            </span>
            {/* Ribbed metallic grip bars */}
            <div className="relative z-10 flex flex-col gap-1 w-9 opacity-65">
              <div className="h-1 rounded bg-white/80" />
              <div className="h-1 rounded bg-white/80" />
              <div className="h-1 rounded bg-white/80" />
            </div>
            <span className="relative z-10 text-[8px] font-mono-tabular opacity-80">SPACE</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            data-testid="pedal-accel"
            aria-label="Accelerator Pedal (Proportional Touch)"
            onPointerDown={handleThrottleDown}
            onPointerMove={handleThrottleMove}
            onPointerUp={handleThrottleUp}
            onPointerCancel={handleThrottleUp}
            className={`relative overflow-hidden w-16 h-24 md:w-20 md:h-28 rounded-2xl border-2 flex flex-col items-center justify-between py-2.5 transition-transform duration-75 touch-none shadow-lg ${
              activeThrottle > 0.08
                ? isSportActive
                  ? 'bg-rose-950/85 border-rose-300 scale-95 text-white'
                  : 'bg-sky-950/85 border-sky-300 scale-95 text-white'
                : 'bg-[rgba(8,12,20,0.46)] border-white/50 text-white/90 hover:bg-[rgba(15,23,42,0.72)]'
            }`}
          >
            {/* Proportional live pressure fill bar */}
            <div
              className={`absolute inset-x-0 bottom-0 transition-all duration-75 pointer-events-none ${
                isSportActive ? 'bg-rose-500/45' : 'bg-sky-400/45'
              }`}
              style={{ height: `${Math.round(activeThrottle * 100)}%` }}
            />
            <span className="relative z-10 text-[10px] font-display font-bold tracking-wider">
              ACCEL
            </span>
            {/* Ribbed sport pedal tread */}
            <div className="relative z-10 flex flex-col gap-1.5 w-8 opacity-65">
              <div className="h-1 rounded bg-white/85" />
              <div className="h-1 rounded bg-white/85" />
              <div className="h-1 rounded bg-white/85" />
              <div className="h-1 rounded bg-white/85" />
            </div>
            <span className="relative z-10 text-[8px] font-mono-tabular opacity-80">W / ↑</span>
          </button>
        </div>
      </div>
    </div>
  );
};
