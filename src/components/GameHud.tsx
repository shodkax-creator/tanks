import React from 'react';
import { Flag, Pause, RotateCcw, Shield, Star, Volume2, VolumeX } from 'lucide-react';
import { GameMode } from '../game/types.ts';

export interface HudSnapshot {
  stage: number;
  stageName: string;
  enemiesRemaining: number;
  activeEnemies: number;
  p1Lives: number;
  p1Tier: number;
  p1Score: number;
  p1Boat: boolean;
  p2Present: boolean;
  p2Lives: number;
  p2Tier: number;
  p2Score: number;
  p2Boat: boolean;
  fortressTimer: number;
  freezeTimer: number;
}

interface GameHudProps {
  hud: HudSnapshot;
  mode: GameMode;
  rttMs: number;
  roomCode: string | null;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
}

const EnemyTankMiniIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg
    viewBox="0 0 16 16"
    className={`w-3.5 h-3.5 ${active ? 'text-amber-400' : 'text-zinc-800'}`}
    aria-hidden="true"
  >
    <rect x="2" y="3" width="3" height="11" fill="currentColor" />
    <rect x="11" y="3" width="3" height="11" fill="currentColor" />
    <rect x="5" y="5" width="6" height="8" fill="currentColor" />
    <rect x="7" y="1" width="2" height="5" fill="currentColor" />
  </svg>
);

export const DesktopSideHud: React.FC<GameHudProps> = ({
  hud,
  mode,
  rttMs,
  roomCode,
  muted,
  onToggleMute,
  onPause,
  onRestart,
}) => {
  const totalUnspawned = Math.max(0, Math.min(20, hud.enemiesRemaining));

  return (
    <aside
      aria-label="Панель боя"
      className="hidden lg:flex flex-col justify-between w-[204px] shrink-0 bg-[#1a1d24] border border-zinc-700/80 p-4 select-none"
    >
      {/* Top: Utility icon strip [M] [P] [R] */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-1.5 pb-3 border-b border-zinc-800">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            title="Звук [M]"
            aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            className="w-10 h-10 flex items-center justify-center bg-[#12151b] border border-zinc-700 text-zinc-300 hover:border-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            title="Пауза [P / Esc]"
            aria-label="Пауза"
            className="w-10 h-10 flex items-center justify-center bg-[#12151b] border border-zinc-700 text-zinc-300 hover:border-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
          >
            <Pause className="w-4 h-4" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            title="Перезапустить уровень [R]"
            aria-label="Перезапустить уровень"
            className="w-10 h-10 flex items-center justify-center bg-[#12151b] border border-zinc-700 text-zinc-300 hover:border-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Classic Battle City 2x10 Remaining Enemy Tank Grid */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-mono-num uppercase tracking-wider text-zinc-400 mb-2">
            <span>Враги в резерве</span>
            <span className="text-zinc-200 font-bold">{hud.enemiesRemaining}</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 bg-[#111319] p-2.5 border border-zinc-800">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="flex items-center justify-center">
                <EnemyTankMiniIcon active={i < totalUnspawned} />
              </div>
            ))}
          </div>
        </div>

        {/* Active Tactical Timers (Fortress / Freeze) */}
        {(hud.fortressTimer > 0 || hud.freezeTimer > 0) && (
          <div className="flex flex-col gap-1.5 text-xs font-mono-num">
            {hud.fortressTimer > 0 && (
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-800/70 border border-slate-600 text-slate-200">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-slate-300" />
                  БАЗА
                </span>
                <span>{Math.ceil(hud.fortressTimer)}с</span>
              </div>
            )}
            {hud.freezeTimer > 0 && (
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-sky-950/70 border border-sky-700 text-sky-200">
                <span>ЗАМОРОЗКА</span>
                <span>{Math.ceil(hud.freezeTimer)}с</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Middle: Player 1 & Player 2 Vital Readouts */}
      <div className="flex flex-col gap-3 my-4">
        <div className="bg-[#111319] border border-zinc-800 p-3">
          <div className="flex items-center justify-between text-xs font-mono-num">
            <span className="text-amber-400 font-bold">1P</span>
            <span className="text-zinc-200 font-bold">{String(hud.p1Score).padStart(6, '0')}</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-400 uppercase">Жизни</span>
              <span className="font-mono-num text-lg font-bold text-zinc-100 leading-none">
                {Math.max(0, hud.p1Lives)}
              </span>
            </div>
            <div className="flex items-center gap-0.5" title={`Уровень пушки: ${hud.p1Tier}/3`}>
              {[0, 1, 2].map((idx) => (
                <Star
                  key={idx}
                  className={`w-3.5 h-3.5 ${
                    idx < hud.p1Tier ? 'text-amber-400 fill-amber-400' : 'text-zinc-700'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {hud.p2Present && (
          <div className="bg-[#111319] border border-zinc-800 p-3">
            <div className="flex items-center justify-between text-xs font-mono-num">
              <span className="text-emerald-400 font-bold">2P</span>
              <span className="text-zinc-200 font-bold">{String(hud.p2Score).padStart(6, '0')}</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-zinc-400 uppercase">Жизни</span>
                <span className="font-mono-num text-lg font-bold text-zinc-100 leading-none">
                  {Math.max(0, hud.p2Lives)}
                </span>
              </div>
              <div className="flex items-center gap-0.5" title={`Уровень пушки: ${hud.p2Tier}/3`}>
                {[0, 1, 2].map((idx) => (
                  <Star
                    key={idx}
                    className={`w-3.5 h-3.5 ${
                      idx < hud.p2Tier ? 'text-emerald-400 fill-emerald-400' : 'text-zinc-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom: Stage Flag + Online Room RTT */}
      <div className="pt-3 border-t border-zinc-800 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-400">
            <Flag className="w-5 h-5 fill-amber-500/30" />
            <span className="text-xs font-mono-num uppercase text-zinc-400">Уровень</span>
          </div>
          <span className="font-display text-2xl text-zinc-100 leading-none font-mono-num">
            {String(hud.stage).padStart(2, '0')}
          </span>
        </div>
        <div className="text-xs text-zinc-400 truncate">{hud.stageName}</div>

        {mode === 'online' && roomCode && (
          <div className="mt-1 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono-num text-zinc-400">
            <span>КОМН. {roomCode}</span>
            <span className="text-emerald-400">{rttMs > 0 ? `${rttMs} мс` : '...'}</span>
          </div>
        )}
      </div>
    </aside>
  );
};

export const MobileTopHud: React.FC<GameHudProps> = ({
  hud,
  mode,
  rttMs,
  muted,
  onToggleMute,
  onPause,
}) => {
  return (
    <div
      aria-label="Статус боя"
      className="flex lg:hidden items-center justify-between w-full px-3 py-1.5 bg-[#151820] border-b border-zinc-800 shrink-0 select-none"
    >
      <div className="flex items-center gap-3 font-mono-num text-xs">
        <div className="flex items-center gap-1 text-amber-400 font-bold">
          <Flag className="w-3.5 h-3.5" />
          <span>УР.{hud.stage}</span>
        </div>
        <span className="text-zinc-500" aria-hidden="true">·</span>
        <div className="text-zinc-200">
          ВРАГИ <strong className="text-amber-300">{hud.enemiesRemaining + hud.activeEnemies}</strong>
        </div>
        <span className="text-zinc-500" aria-hidden="true">·</span>
        <div className="text-zinc-200">
          1P <strong className="text-amber-400">♥{Math.max(0, hud.p1Lives)}</strong>
        </div>
        {hud.p2Present && (
          <div className="text-zinc-200">
            2P <strong className="text-emerald-400">♥{Math.max(0, hud.p2Lives)}</strong>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {mode === 'online' && rttMs > 0 && (
          <span className="text-[11px] font-mono-num text-emerald-400 mr-1">{rttMs}мс</span>
        )}
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          aria-label={muted ? 'Включить звук' : 'Выключить звук'}
          className="min-w-[40px] min-h-[40px] flex items-center justify-center bg-[#1c202a] border border-zinc-700 text-zinc-200"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onPause();
          }}
          aria-label="Пауза"
          className="min-w-[40px] min-h-[40px] flex items-center justify-center bg-[#1c202a] border border-zinc-700 text-zinc-200"
        >
          <Pause className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
