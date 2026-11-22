import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DrivingInput,
  LightingMode,
  TOTAL_CHECKPOINTS,
  WiperSpeed,
} from './game/drivingPhysics';
import { SceneCanvas, TelemetrySnapshot } from './game/SceneCanvas';
import { DrivingHudAndTouchControls } from './components/DrivingHudAndTouchControls';
import { UnityDeliverableModal } from './components/UnityDeliverableModal';
import { audioSynth } from './game/audioSynth';

type GameShellState = 'title' | 'playing' | 'paused' | 'gameover';

const INITIAL_TELEMETRY: TelemetrySnapshot = {
  speedKmh: 0,
  rpm: 850,
  gear: 1,
  distanceMeters: 0,
  lapCount: 0,
  lapProgress: 0,
  checkpointsPassed: 0,
  integrity: 100,
  fps: 30,
  onRoad: true,
  windshieldWetness: 0.35,
  steerAngle: 0,
  throttle: 0,
  brake: 0,
  sportMode: false,
};

export default function App() {
  const [gameState, setGameState] = useState<GameShellState>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        return 'playing';
      }
    }
    return 'title';
  });

  // Default to Rainy Night Mode matching the user's primary visual reference (Interior Cockpit Only)
  const [lightingMode, setLightingMode] = useState<LightingMode>('night');
  const [wiperSpeed, setWiperSpeed] = useState<WiperSpeed>('continuous');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [unityModalOpen, setUnityModalOpen] = useState<boolean>(false);
  const [resetCounter, setResetCounter] = useState<number>(0);

  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(INITIAL_TELEMETRY);
  const [endRunSnapshot, setEndRunSnapshot] = useState<{
    victory: boolean;
    snap: TelemetrySnapshot;
  } | null>(null);

  const touchInputRef = useRef<DrivingInput>({
    throttle: 0,
    brake: 0,
    steerTarget: 0,
  });

  // Mirror game state to document.body.dataset.state for deterministic verification
  useEffect(() => {
    document.body.dataset.state = gameState;
    document.body.dataset.mode = lightingMode;
    document.body.dataset.camera = 'cockpit';
  }, [gameState, lightingMode]);

  const clearTouchInputs = useCallback(() => {
    touchInputRef.current.throttle = 0;
    touchInputRef.current.brake = 0;
    touchInputRef.current.steerTarget = 0;
  }, []);

  const handleStartDrive = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    clearTouchInputs();
    document.body.dataset.state = 'playing';
    audioSynth.startEngine();
    setGameState('playing');
  }, [clearTouchInputs]);

  const handleRestartDrive = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    clearTouchInputs();
    setEndRunSnapshot(null);
    setTelemetry(INITIAL_TELEMETRY);
    setResetCounter((c) => c + 1);
    document.body.dataset.state = 'playing';
    audioSynth.startEngine();
    setGameState('playing');
  }, [clearTouchInputs]);

  const handleReturnToTitle = useCallback(() => {
    clearTouchInputs();
    setEndRunSnapshot(null);
    setResetCounter((c) => c + 1);
    document.body.dataset.state = 'title';
    setGameState('title');
  }, [clearTouchInputs]);

  const handleSelectMode = useCallback((mode: LightingMode) => {
    setLightingMode(mode);
    setWiperSpeed(mode === 'night' ? 'continuous' : 'off');
  }, []);

  const handleToggleLightingMode = useCallback(() => {
    setLightingMode((prev) => {
      const next = prev === 'day' ? 'night' : 'day';
      setWiperSpeed(next === 'night' ? 'continuous' : 'off');
      return next;
    });
  }, []);

  const handleCycleWipers = useCallback(() => {
    audioSynth.playWiperTick();
    setWiperSpeed((prev) =>
      prev === 'off' ? 'intermittent' : prev === 'intermittent' ? 'continuous' : 'off'
    );
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      audioSynth.setMuted(next);
      return next;
    });
  }, []);

  const handleGameEnd = useCallback(
    (victory: boolean, finalSnap: TelemetrySnapshot) => {
      clearTouchInputs();
      setEndRunSnapshot({ victory, snap: finalSnap });
      document.body.dataset.state = 'gameover';
      setGameState('gameover');
    },
    [clearTouchInputs]
  );

  // Global keyboard shortcuts (Enter/Space on Title, Escape/P Pause, V Camera, N Mode, F Wipers, M Mute, U Unity Package)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (unityModalOpen) {
        if (e.code === 'Escape') {
          e.preventDefault();
          setUnityModalOpen(false);
        }
        return;
      }

      if (gameState === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStartDrive();
        } else if (e.code === 'KeyN') {
          handleToggleLightingMode();
        } else if (e.code === 'KeyU') {
          setUnityModalOpen(true);
        }
        return;
      }

      if (gameState === 'playing') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          clearTouchInputs();
          document.body.dataset.state = 'paused';
          setGameState('paused');
        } else if (e.code === 'KeyN') {
          handleToggleLightingMode();
        } else if (e.code === 'KeyF') {
          handleCycleWipers();
        } else if (e.code === 'KeyM') {
          handleToggleMute();
        } else if (e.code === 'KeyR') {
          handleRestartDrive();
        } else if (e.code === 'KeyU') {
          clearTouchInputs();
          setUnityModalOpen(true);
        }
        return;
      }

      if (gameState === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          handleStartDrive();
        } else if (e.code === 'KeyR') {
          handleRestartDrive();
        }
        return;
      }

      if (gameState === 'gameover') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleRestartDrive();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    gameState,
    unityModalOpen,
    handleStartDrive,
    handleRestartDrive,
    handleToggleLightingMode,
    handleCycleWipers,
    handleToggleMute,
    clearTouchInputs,
  ]);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#050811] select-none">
      {/* Isolated Live 3D Interior-Only Hyperrealistic Luxury Cockpit Canvas */}
      <SceneCanvas
        gameState={gameState}
        lightingMode={lightingMode}
        wiperSpeed={wiperSpeed}
        touchInputRef={touchInputRef}
        resetCounter={resetCounter}
        onTelemetryUpdate={setTelemetry}
        onGameEnd={handleGameEnd}
      />

      {/* STATE 1: TITLE SCREEN (Asymmetric Left-Third Negative Space Composition over Live 3D Cockpit Backdrop) */}
      {gameState === 'title' && (
        <section
          aria-label="JARVIS DRIVE Title Screen"
          className="fixed inset-0 z-30 flex flex-col justify-between p-6 md:p-12 bg-gradient-to-r from-[#050811]/90 via-[#050811]/45 to-transparent pointer-events-auto"
        >
          {/* Top Quiet Target Spec Line (No pill boxes, clean unboxed metadata) */}
          <div className="flex items-center justify-between gap-4 text-xs text-slate-300">
            <div className="flex items-center gap-2 font-mono-tabular">
              <span>UNITY 6.3 LTS URP</span>
              <span aria-hidden="true">·</span>
              <span>HONOR X9b 5G (ADRENO 710)</span>
              <span aria-hidden="true">·</span>
              <span>720P / 30 FPS TARGET</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 font-mono-tabular text-slate-300">
              <span>OFFLINE SINGLE-PLAYER</span>
              <span aria-hidden="true">·</span>
              <span>ARM64 BUILD READY</span>
            </div>
          </div>

          {/* Left-Third Hero Emblem & Day/Night Mode Selection */}
          <div className="max-w-lg my-auto space-y-6">
            {/* Bespoke Inline SVG Title Emblem Lockup */}
            <div>
              <svg
                viewBox="0 0 490 112"
                className="w-full max-w-[450px] h-auto"
                role="img"
                aria-label="JARVIS DRIVE Emblem"
              >
                {/* Precision Automotive Crest Shield & Speed Wing */}
                <path
                  d="M12 24 L48 10 L84 24 L74 82 L48 100 L22 82 Z"
                  fill="#0b1222"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                />
                <path
                  d="M48 18 L68 27 L61 74 L48 87 L35 74 L28 27 Z"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  opacity="0.85"
                />
                {/* Steering Wheel & Horizon Vector inside Crest */}
                <circle cx="48" cy="52" r="16" fill="none" stroke="#f8fafc" strokeWidth="3" />
                <path
                  d="M33 52 H43 M53 52 H63 M48 57 V68"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx="48" cy="52" r="4" fill="#f59e0b" />

                {/* Display Lockup Lettering */}
                <text
                  x="104"
                  y="62"
                  fill="#f8fafc"
                  fontFamily="Chakra Petch, sans-serif"
                  fontWeight="700"
                  fontSize="50"
                  letterSpacing="3"
                >
                  JARVIS DRIVE
                </text>
                <line x1="106" y1="74" x2="472" y2="74" stroke="#38bdf8" strokeWidth="2" />
                <text
                  x="106"
                  y="95"
                  fill="#cbd5e1"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                  fontSize="12.5"
                  letterSpacing="1.6"
                >
                  FIRST-PERSON LUXURY COCKPIT SIMULATOR
                </text>
              </svg>
            </div>

            {/* Day / Night Mode Selection Menu */}
            <div className="space-y-2">
              <div className="text-xs font-semibold tracking-wider text-slate-300">
                Select Weather &amp; Lighting Mode (Shared Metro Circuit &amp; GT Cockpit)
              </div>
              <div
                role="group"
                aria-label="Day and Night Mode Selection"
                className="grid grid-cols-2 gap-3 p-1.5 rounded-xl bg-[#090e1a] border border-slate-800"
              >
                <button
                  type="button"
                  onClick={() => handleSelectMode('night')}
                  aria-pressed={lightingMode === 'night'}
                  className={`flex flex-col items-start p-3 rounded-lg border text-left transition-colors ${
                    lightingMode === 'night'
                      ? 'bg-sky-950/90 border-sky-400 text-slate-100'
                      : 'bg-[#070b14] border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-display text-sm font-bold tracking-wide">
                      Night Rain Mode
                    </span>
                    <span className="font-mono-tabular text-[11px] text-sky-400">Primary Ref</span>
                  </div>
                  <span className="text-xs text-slate-400 mt-1">
                    Wet asphalt reflections · Rain droplets · Active wipers &amp; headlights
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectMode('day')}
                  aria-pressed={lightingMode === 'day'}
                  className={`flex flex-col items-start p-3 rounded-lg border text-left transition-colors ${
                    lightingMode === 'day'
                      ? 'bg-amber-950/80 border-amber-400 text-slate-100'
                      : 'bg-[#070b14] border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-display text-sm font-bold tracking-wide">
                      Daylight Mode
                    </span>
                    <span className="font-mono-tabular text-[11px] text-amber-400">Clear Sun</span>
                  </div>
                  <span className="text-xs text-slate-400 mt-1">
                    Natural sunlight · Blue sky &amp; clouds · Dry road materials
                  </span>
                </button>
              </div>
            </div>

            {/* Primary Start CTA + Unity 6.3 Deliverable Action (<= 3 menu actions total) */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                data-start="true"
                onClick={handleStartDrive}
                className="px-7 py-3.5 rounded-xl font-display text-base font-bold tracking-wider text-slate-950 bg-sky-400 hover:bg-sky-300 active:scale-98 transition-all shadow-lg cursor-pointer whitespace-nowrap"
              >
                Start Cockpit Drive
              </button>

              <button
                type="button"
                onClick={() => setUnityModalOpen(true)}
                className="px-5 py-3.5 rounded-xl text-xs font-semibold text-slate-200 bg-[#0b1120] hover:bg-slate-800 border border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                Unity 6.3 LTS C# &amp; HONOR X9b Suite
              </button>
            </div>
          </div>

          {/* Single Flat Borderless Control-Hint Line in Bottom Safe Margin */}
          <div className="text-xs font-mono-tabular text-slate-300">
            WASD / Slide Wheel &amp; Paddles · Shift Sport+ (260 km/h) · Space Brake · F Wipers · N Day/Night · Interior Cockpit Only
          </div>
        </section>
      )}

      {/* STATE 2: PLAYING HUD & MOBILE TOUCH CONTROLS */}
      {gameState === 'playing' && (
        <DrivingHudAndTouchControls
          telemetry={telemetry}
          lightingMode={lightingMode}
          wiperSpeed={wiperSpeed}
          isMuted={isMuted}
          touchInputRef={touchInputRef}
          onToggleLightingMode={handleToggleLightingMode}
          onCycleWipers={handleCycleWipers}
          onToggleMute={handleToggleMute}
          onOpenPause={() => {
            clearTouchInputs();
            document.body.dataset.state = 'paused';
            setGameState('paused');
          }}
          onOpenUnityModal={() => {
            clearTouchInputs();
            setUnityModalOpen(true);
          }}
        />
      )}

      {/* STATE 3: PAUSED MODAL CARD */}
      {gameState === 'paused' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Simulation Paused"
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[rgba(5,8,17,0.86)] pointer-events-auto"
        >
          <div className="w-full max-w-md rounded-xl bg-[#0b101d] border border-slate-800 p-6 shadow-2xl space-y-5">
            <div>
              <div className="text-xs font-mono-tabular text-sky-400">
                SIMULATION PAUSED · HONOR X9b 720P PROFILE
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-100 mt-1">
                Cockpit Standby
              </h2>
            </div>

            {/* 3 Tabular-Nums Stat Tiles */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-[#070b14] border border-slate-800">
                <div className="text-[11px] text-slate-400">Speed</div>
                <div className="font-mono-tabular text-lg font-bold text-slate-100 mt-0.5">
                  {Math.round(telemetry.speedKmh)} KM/H
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#070b14] border border-slate-800">
                <div className="text-[11px] text-slate-400">Distance</div>
                <div className="font-mono-tabular text-lg font-bold text-sky-400 mt-0.5">
                  {(telemetry.distanceMeters / 1000).toFixed(2)} KM
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#070b14] border border-slate-800">
                <div className="text-[11px] text-slate-400">Checkpoints</div>
                <div className="font-mono-tabular text-lg font-bold text-amber-400 mt-0.5">
                  {telemetry.checkpointsPassed} / {TOTAL_CHECKPOINTS}
                </div>
              </div>
            </div>

            {/* Quick Mode Switch inside Pause Modal */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#070b14] border border-slate-800">
              <span className="text-xs font-medium text-slate-300">Active Weather Mode</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectMode('day')}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                    lightingMode === 'day'
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  Day Mode
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectMode('night')}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                    lightingMode === 'night'
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  Night Rain
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleStartDrive}
                className="w-full py-3 rounded-lg font-display text-sm font-bold tracking-wider text-slate-950 bg-sky-400 hover:bg-sky-300 transition-colors"
              >
                Resume Drive
              </button>
              <button
                type="button"
                onClick={() => setUnityModalOpen(true)}
                className="w-full py-2.5 rounded-lg text-xs font-semibold text-sky-300 bg-slate-900 hover:bg-slate-800 border border-sky-500/40 transition-colors"
              >
                Inspect Unity 6.3 LTS C# Scripts &amp; APK Setup
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleRestartDrive}
                  className="py-2.5 rounded-lg text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  Restart Route
                </button>
                <button
                  type="button"
                  onClick={handleReturnToTitle}
                  className="py-2.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
                >
                  Title Screen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STATE 4: VICTORY / GAME OVER MODAL CARD */}
      {gameState === 'gameover' && endRunSnapshot && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={endRunSnapshot.victory ? 'Circuit Complete' : 'Drive Terminated'}
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[rgba(5,8,17,0.88)] pointer-events-auto"
        >
          <div className="w-full max-w-md rounded-xl bg-[#0b101d] border border-slate-800 p-6 shadow-2xl space-y-5">
            <div>
              <div
                className={`text-xs font-mono-tabular font-semibold ${
                  endRunSnapshot.victory ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {endRunSnapshot.victory
                  ? 'METRO CIRCUIT LAP COMPLETED'
                  : 'CHASSIS INTEGRITY DEPLETED'}
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-100 mt-1">
                {endRunSnapshot.victory ? 'First Milestone Route Clear' : 'Collision Stop'}
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-[#070b14] border border-slate-800">
                <div className="text-[11px] text-slate-400">Distance</div>
                <div className="font-mono-tabular text-lg font-bold text-slate-100 mt-0.5">
                  {(endRunSnapshot.snap.distanceMeters / 1000).toFixed(2)} KM
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#070b14] border border-slate-800">
                <div className="text-[11px] text-slate-400">Checkpoints</div>
                <div className="font-mono-tabular text-lg font-bold text-sky-400 mt-0.5">
                  {endRunSnapshot.snap.checkpointsPassed} / {TOTAL_CHECKPOINTS}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#070b14] border border-slate-800">
                <div className="text-[11px] text-slate-400">Integrity</div>
                <div className="font-mono-tabular text-lg font-bold text-emerald-400 mt-0.5">
                  {endRunSnapshot.snap.integrity}%
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={handleRestartDrive}
                className="w-full py-3 rounded-lg font-display text-sm font-bold tracking-wider text-slate-950 bg-sky-400 hover:bg-sky-300 transition-colors"
              >
                {endRunSnapshot.victory ? 'Drive Circuit Again' : 'Try Again'}
              </button>
              <button
                type="button"
                onClick={handleReturnToTitle}
                className="w-full py-2.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
              >
                Return to Title Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNITY 6.3 LTS & HONOR X9b 5G ENGINEERING DELIVERABLE SUITE MODAL */}
      <UnityDeliverableModal
        isOpen={unityModalOpen}
        onClose={() => setUnityModalOpen(false)}
        lightingMode={lightingMode}
        measuredFps={telemetry.fps}
      />
    </main>
  );
}
