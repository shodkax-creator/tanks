import React from 'react';
import { Crosshair, Grid3X3, Users, Volume2, VolumeX } from 'lucide-react';

interface TitleScreenProps {
  selectedStage: number;
  stageName: string;
  highScore: number;
  muted: boolean;
  onStartSingle: () => void;
  onStartLocal2P: () => void;
  onOpenMultiplayer: () => void;
  onOpenStageSelect: () => void;
  onToggleMute: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  selectedStage,
  stageName,
  highScore,
  muted,
  onStartSingle,
  onStartLocal2P,
  onOpenMultiplayer,
  onOpenStageSelect,
  onToggleMute,
}) => {
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-5 sm:p-8 pointer-events-none">
      {/* Top quiet utility strip: High score + Mute button */}
      <div className="flex items-center justify-between w-full max-w-5xl mx-auto pointer-events-auto">
        <div className="flex items-center gap-4 text-xs sm:text-sm font-mono-num tracking-wider text-zinc-400">
          <span>
            РЕКОРД <strong className="text-amber-400 font-bold">{String(highScore).padStart(6, '0')}</strong>
          </span>
          <span aria-hidden="true" className="text-zinc-600">·</span>
          <span>
            УРОВЕНЬ <strong className="text-zinc-100">{String(selectedStage).padStart(2, '0')}</strong> / 35
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          aria-label={muted ? 'Включить звук' : 'Выключить звук'}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-[#181b22] border border-zinc-700/80 text-zinc-200 hover:border-amber-500 hover:text-amber-400 transition-colors cursor-pointer"
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Center hero lockup over calm dark negative space */}
      <div className="flex flex-col items-center justify-center my-auto w-full max-w-xl mx-auto pointer-events-auto">
        {/* Bespoke inline SVG Brick-Built "ТАНКИ 1990" Emblem Lockup */}
        <div className="w-full max-w-[460px] mb-6 sm:mb-8">
          <svg
            viewBox="0 0 460 154"
            className="w-full h-auto drop-shadow-[0_12px_28px_rgba(0,0,0,0.85)]"
            role="img"
            aria-label="ТАНКИ 1990 — Battle City"
          >
            <defs>
              <pattern id="brickTile" width="22" height="12" patternUnits="userSpaceOnUse">
                <rect width="22" height="12" fill="#a83c1c" />
                <rect x="1" y="1" width="9" height="4.5" fill="#d85b2c" />
                <rect x="12" y="1" width="9" height="4.5" fill="#c94c24" />
                <rect x="1" y="7" width="4" height="4.5" fill="#c94c24" />
                <rect x="7" y="7" width="10" height="4.5" fill="#e26d3b" />
                <rect x="19" y="7" width="3" height="4.5" fill="#c94c24" />
                <rect x="0" y="5.5" width="22" height="1.5" fill="#2c150e" />
                <rect x="10" y="0" width="2" height="6" fill="#2c150e" />
                <rect x="5" y="6" width="2" height="6" fill="#2c150e" />
                <rect x="17" y="6" width="2" height="6" fill="#2c150e" />
              </pattern>
            </defs>

            {/* Steel frame accent lines */}
            <rect x="18" y="10" width="424" height="3" fill="#eab308" />
            <rect x="18" y="141" width="424" height="3" fill="#475569" />

            {/* Stylized Battle Tank Crest left & right */}
            <g transform="translate(22, 113)">
              <rect x="0" y="4" width="26" height="14" fill="#eab308" />
              <rect x="4" y="0" width="18" height="4" fill="#fde047" />
              <rect x="26" y="9" width="14" height="4" fill="#fef08a" />
              <rect x="2" y="17" width="22" height="4" fill="#713f12" />
            </g>
            <g transform="translate(438, 113) scale(-1, 1)">
              <rect x="0" y="4" width="26" height="14" fill="#10b981" />
              <rect x="4" y="0" width="18" height="4" fill="#6ee7b7" />
              <rect x="26" y="9" width="14" height="4" fill="#a7f3d0" />
              <rect x="2" y="17" width="22" height="4" fill="#065f46" />
            </g>

            {/* Brick-filled main display title */}
            <text
              x="230"
              y="92"
              textAnchor="middle"
              fill="url(#brickTile)"
              stroke="#1b0d09"
              strokeWidth="5"
              paintOrder="stroke fill"
              style={{
                fontFamily: "'Russo One', sans-serif",
                fontSize: '76px',
                letterSpacing: '5px',
              }}
            >
              ТАНКИ
            </text>

            {/* Year & Subtitle Plaque */}
            <text
              x="230"
              y="130"
              textAnchor="middle"
              fill="#f8fafc"
              stroke="#090b0f"
              strokeWidth="4"
              paintOrder="stroke fill"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                fontSize: '26px',
                letterSpacing: '12px',
              }}
            >
              1990
            </text>
          </svg>
        </div>

        {/* Focused 3-action Tactical Arcade Menu */}
        <div className="w-full max-w-[384px] flex flex-col gap-3">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStartSingle();
            }}
            className="w-full min-h-[52px] px-5 py-3 bg-amber-500 hover:bg-amber-400 active:translate-y-[1px] text-[#0c0e12] font-display text-lg tracking-wider uppercase flex items-center justify-between gap-3 border-2 border-amber-300 shadow-[0_6px_0_#92400e] transition-all cursor-pointer"
          >
            <span className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
              <Crosshair className="w-5 h-5 shrink-0" />
              1 Игрок — В бой
            </span>
            <span className="font-mono-num text-xs font-bold bg-black/20 px-2 py-0.5 whitespace-nowrap shrink-0">
              УР. {selectedStage}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenMultiplayer();
            }}
            className="w-full min-h-[48px] px-5 py-3 bg-[#19202a] hover:bg-[#222b38] active:translate-y-[1px] text-emerald-300 font-display text-base tracking-wider uppercase flex items-center justify-between gap-3 border border-emerald-500/50 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
              <Users className="w-5 h-5 shrink-0" />
              Онлайн мультиплеер
            </span>
            <span className="font-mono-num text-xs text-emerald-400/80 whitespace-nowrap shrink-0">
              2 ИГРОКА
            </span>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenStageSelect();
              }}
              className="min-h-[46px] px-4 py-2.5 bg-[#151820] hover:bg-[#1e232e] text-zinc-200 font-semibold text-sm flex items-center justify-center gap-2 border border-zinc-700/80 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Grid3X3 className="w-4 h-4 text-amber-400 shrink-0" />
              Уровни (35)
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onStartLocal2P();
              }}
              className="min-h-[46px] px-4 py-2.5 bg-[#151820] hover:bg-[#1e232e] text-zinc-200 font-semibold text-sm flex items-center justify-center gap-2 border border-zinc-700/80 transition-colors cursor-pointer whitespace-nowrap"
            >
              2 на 1 ПК
            </button>
          </div>
        </div>

        <p className="mt-4 text-xs text-zinc-400 font-mono-num tracking-wide text-center">
          Выбран уровень {selectedStage}: {stageName}
        </p>
      </div>

      {/* Bottom single-line flat control hint */}
      <div className="w-full text-center text-xs text-zinc-400 font-mono-num tracking-wide pointer-events-none">
        WASD / Стрелки — Движение · Пробел — Огонь · P / Esc — Пауза · На телефоне — сенсорный геймпад
      </div>
    </div>
  );
};
