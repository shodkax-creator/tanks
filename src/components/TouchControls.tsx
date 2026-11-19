import React, { useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Crosshair } from 'lucide-react';
import { Direction } from '../game/types.ts';

interface TouchControlsProps {
  onDirectionChange: (dir: Direction | null) => void;
  onFireChange: (firing: boolean) => void;
}

/**
 * Cross-platform ergonomic mobile/tablet tactile Gamepad Deck:
 * - Left thumb: 4-way D-Pad supporting BOTH tapping individual arrows AND smooth finger sliding
 *   across directions without lifting thumb (via Pointer Capture).
 * - Right thumb: Large 80x80 tactile FIRE trigger with multi-touch isolation.
 */
export const TouchControls: React.FC<TouchControlsProps> = ({
  onDirectionChange,
  onFireChange,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const dpadPointerId = useRef<number | null>(null);
  const firePointerId = useRef<number | null>(null);

  const [activeDir, setActiveDir] = useState<Direction | null>(null);
  const [firing, setFiring] = useState(false);

  const resolveDirection = (clientX: number, clientY: number): Direction | null => {
    const el = padRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    // Small deadzone in exact center
    if (Math.hypot(dx, dy) < 14) return null;
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? Direction.RIGHT : Direction.LEFT;
    }
    return dy > 0 ? Direction.DOWN : Direction.UP;
  };

  const updateDir = (dir: Direction | null) => {
    setActiveDir(dir);
    onDirectionChange(dir);
  };

  const handleDpadDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dpadPointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateDir(resolveDirection(e.clientX, e.clientY));
  };

  const handleDpadMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dpadPointerId.current !== e.pointerId) return;
    e.preventDefault();
    updateDir(resolveDirection(e.clientX, e.clientY));
  };

  const handleDpadUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dpadPointerId.current !== e.pointerId) return;
    e.preventDefault();
    dpadPointerId.current = null;
    updateDir(null);
  };

  const handleFireDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    firePointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFiring(true);
    onFireChange(true);
  };

  const handleFireUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (firePointerId.current !== e.pointerId) return;
    e.preventDefault();
    firePointerId.current = null;
    setFiring(false);
    onFireChange(false);
  };

  const cellClass = (dir: Direction) =>
    `flex items-center justify-center border transition-colors ${
      activeDir === dir
        ? 'bg-amber-500 text-zinc-950 border-amber-300'
        : 'bg-[#1b202b] text-zinc-200 border-zinc-700'
    }`;

  return (
    <div
      data-testid="touch-controls"
      className="flex lg:hidden items-center justify-between w-full max-w-[440px] mx-auto px-5 py-3 shrink-0 touch-none select-none"
      style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
    >
      {/* Left Thumb: Tactile 4-Way D-Pad (156x156) */}
      <div
        ref={padRef}
        role="group"
        aria-label="Крестовина управления"
        onPointerDown={handleDpadDown}
        onPointerMove={handleDpadMove}
        onPointerUp={handleDpadUp}
        onPointerCancel={handleDpadUp}
        className="grid grid-cols-3 grid-rows-3 w-[156px] h-[156px] gap-1 touch-none"
      >
        <div />
        <div className={`${cellClass(Direction.UP)} rounded-t-md`}>
          <ChevronUp className="w-6 h-6" />
        </div>
        <div />

        <div className={`${cellClass(Direction.LEFT)} rounded-l-md`}>
          <ChevronLeft className="w-6 h-6" />
        </div>
        <div className="bg-[#12161e] border border-zinc-800 flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
        </div>
        <div className={`${cellClass(Direction.RIGHT)} rounded-r-md`}>
          <ChevronRight className="w-6 h-6" />
        </div>

        <div />
        <div className={`${cellClass(Direction.DOWN)} rounded-b-md`}>
          <ChevronDown className="w-6 h-6" />
        </div>
        <div />
      </div>

      {/* Right Thumb: Large Ergonomic FIRE Trigger */}
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Огонь"
          onPointerDown={handleFireDown}
          onPointerUp={handleFireUp}
          onPointerCancel={handleFireUp}
          className={`w-[88px] h-[88px] rounded-full border-4 flex flex-col items-center justify-center gap-0.5 font-display text-xs tracking-wider uppercase touch-none transition-transform ${
            firing
              ? 'bg-red-500 border-amber-300 text-white scale-95 shadow-[0_0_0_4px_rgba(239,68,68,0.25)]'
              : 'bg-red-600 border-red-400/80 text-white shadow-[0_6px_0_#7f1d1d]'
          }`}
        >
          <Crosshair className="w-6 h-6" />
          <span>ОГОНЬ</span>
        </button>
      </div>
    </div>
  );
};
