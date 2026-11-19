import React from 'react';
import { ArrowRight, Home, Play, RotateCcw, Trophy } from 'lucide-react';
import { ENEMY_SCORE } from '../game/simulation.ts';
import { EnemyKind, GameMode, PlayerTank } from '../game/types.ts';
import { getEnemyTypeLabel } from '../game/renderer.ts';
import { TOTAL_STAGES } from '../game/levels.ts';

interface PauseModalProps {
  stage: number;
  mode: GameMode;
  onResume: () => void;
  onRestart: () => void;
  onExitToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  stage,
  mode,
  onResume,
  onRestart,
  onExitToTitle,
}) => (
  <div
    className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/75"
    role="dialog"
    aria-modal="true"
    aria-label="Пауза"
  >
    <div className="w-full max-w-sm bg-[#151820] border-2 border-zinc-700 p-6 flex flex-col gap-5 shadow-2xl">
      <div className="text-center">
        <div className="text-xs font-mono-num uppercase tracking-widest text-amber-400">
          Уровень {stage}
        </div>
        <h2 className="font-display text-3xl uppercase tracking-wider text-zinc-100 mt-1">
          Пауза
        </h2>
        {mode === 'online' && (
          <p className="text-xs text-zinc-400 mt-1.5">
            В онлайн-бою мир на сервере продолжает идти
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onResume}
          className="w-full min-h-[48px] px-5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display text-base uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
        >
          <Play className="w-4 h-4 fill-current" />
          Продолжить
        </button>

        <button
          type="button"
          onClick={onRestart}
          className="w-full min-h-[46px] px-5 bg-[#1e232e] hover:bg-[#272e3d] border border-zinc-700 text-zinc-100 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          Начать уровень заново
        </button>

        <button
          type="button"
          onClick={onExitToTitle}
          className="w-full min-h-[46px] px-5 bg-[#12151c] hover:bg-[#1a1f29] border border-zinc-800 text-zinc-400 hover:text-zinc-200 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <Home className="w-4 h-4" />
          Выйти в меню
        </button>
      </div>
    </div>
  </div>
);

interface EndGameModalProps {
  outcome: 'stage_clear' | 'game_over';
  stage: number;
  eagleAlive: boolean;
  players: PlayerTank[];
  highScore: number;
  onNextStage: () => void;
  onRetry: () => void;
  onExitToTitle: () => void;
}

export const EndGameModal: React.FC<EndGameModalProps> = ({
  outcome,
  stage,
  eagleAlive,
  players,
  highScore,
  onNextStage,
  onRetry,
  onExitToTitle,
}) => {
  const isVictory = outcome === 'stage_clear';
  const isFinalStage = stage >= TOTAL_STAGES;
  const totalScore = players.reduce((acc, p) => acc + p.score, 0);
  const enemyKinds: EnemyKind[] = ['basic', 'fast', 'power', 'armor'];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-label={isVictory ? 'Уровень пройден' : 'Игра окончена'}
    >
      <div className="w-full max-w-md bg-[#14171e] border-2 border-zinc-700 p-6 flex flex-col gap-5 shadow-2xl">
        <div className="text-center">
          <div
            className={`text-xs font-mono-num uppercase tracking-widest ${
              isVictory ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            Уровень {stage} / {TOTAL_STAGES}
          </div>
          <h2 className="font-display text-3xl uppercase tracking-wider text-zinc-100 mt-1 flex items-center justify-center gap-2.5">
            {isVictory && <Trophy className="w-7 h-7 text-amber-400" />}
            {isVictory
              ? isFinalStage
                ? 'Победа в кампании!'
                : 'Уровень пройден!'
              : 'Поражение'}
          </h2>
          {!isVictory && (
            <p className="text-xs text-zinc-400 mt-1">
              {eagleAlive ? 'Уничтожены все танки отряда' : 'Штаб-квартира разрушена'}
            </p>
          )}
        </div>

        {/* Classic Battle City Kill Breakdown Table */}
        <div className="bg-[#0e1117] border border-zinc-800 p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] font-mono-num uppercase text-zinc-500 pb-1 border-b border-zinc-800">
            <span>Тип врага</span>
            <span>Подбито × Очки</span>
          </div>
          {enemyKinds.map((kind) => {
            const count = players.reduce((s, p) => s + (p.kills[kind] || 0), 0);
            const pts = count * ENEMY_SCORE[kind];
            return (
              <div
                key={kind}
                className="flex items-center justify-between text-sm font-mono-num text-zinc-200"
              >
                <span className="text-zinc-400">{getEnemyTypeLabel(kind)}</span>
                <span>
                  {count} × {ENEMY_SCORE[kind]} ={' '}
                  <strong className="text-amber-400">{pts}</strong>
                </span>
              </div>
            );
          })}
        </div>

        {/* Summary Stat Tiles */}
        <div className="grid grid-cols-2 gap-3 font-mono-num">
          <div className="bg-[#191d26] border border-zinc-800 p-3 text-center">
            <div className="text-[11px] uppercase text-zinc-400">Счёт</div>
            <div className="text-xl font-bold text-amber-400 mt-0.5">
              {String(totalScore).padStart(6, '0')}
            </div>
          </div>
          <div className="bg-[#191d26] border border-zinc-800 p-3 text-center">
            <div className="text-[11px] uppercase text-zinc-400">Рекорд</div>
            <div className="text-xl font-bold text-zinc-100 mt-0.5">
              {String(Math.max(highScore, totalScore)).padStart(6, '0')}
            </div>
          </div>
        </div>

        {/* Primary CTA */}
        <div className="flex flex-col gap-2.5">
          {isVictory ? (
            <button
              type="button"
              data-start="true"
              onClick={onNextStage}
              className="w-full min-h-[50px] px-5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display text-base uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{isFinalStage ? 'Начать с 1 уровня' : `Уровень ${stage + 1}`}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onRetry}
              className="w-full min-h-[50px] px-5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display text-base uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Попробовать снова
            </button>
          )}

          <button
            type="button"
            onClick={onExitToTitle}
            className="w-full min-h-[44px] px-5 bg-[#191d26] hover:bg-[#232936] border border-zinc-700 text-zinc-300 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            В главное меню
          </button>
        </div>
      </div>
    </div>
  );
};
