import React, { useEffect, useRef } from 'react';
import { Play, X } from 'lucide-react';
import { STAGES, buildStageGrid, getStageDef } from '../game/levels.ts';
import { renderStagePreview } from '../game/renderer.ts';

interface StageSelectModalProps {
  selectedStage: number;
  onSelectStage: (stage: number) => void;
  onLaunchStage: (stage: number) => void;
  onClose: () => void;
}

export const StageSelectModal: React.FC<StageSelectModalProps> = ({
  selectedStage,
  onSelectStage,
  onLaunchStage,
  onClose,
}) => {
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const stageDef = getStageDef(selectedStage);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    renderStagePreview(canvas, buildStageGrid(selectedStage));
  }, [selectedStage]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6 bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-label="Выбор уровня"
    >
      <div className="w-full max-w-3xl max-h-[92vh] bg-[#14171e] border border-zinc-700 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="font-display text-xl tracking-wide text-zinc-100 uppercase">
              Выбор уровня (1–35)
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Все 35 классических карт Battle City с уникальным рельефом и составом войск
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть выбор уровня"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-100 border border-zinc-700/70 hover:border-zinc-500 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content: 35-stage grid + live minimap preview */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-5 p-5 overflow-y-auto">
          <div className="grid grid-cols-5 sm:grid-cols-7 gap-2 content-start">
            {STAGES.map((st) => {
              const active = st.stage === selectedStage;
              return (
                <button
                  key={st.stage}
                  type="button"
                  onClick={() => onSelectStage(st.stage)}
                  aria-label={`Уровень ${st.stage} — ${st.name}`}
                  className={`min-h-[44px] font-mono-num text-sm font-bold border transition-colors cursor-pointer ${
                    active
                      ? 'bg-amber-500 text-zinc-950 border-amber-300'
                      : 'bg-[#1c2029] text-zinc-200 border-zinc-700/70 hover:border-amber-500/70 hover:text-amber-300'
                  }`}
                >
                  {String(st.stage).padStart(2, '0')}
                </button>
              );
            })}
          </div>

          {/* Live Map Preview & Enemy Roster */}
          <div className="flex flex-col gap-3 bg-[#0f1218] border border-zinc-800 p-4">
            <div className="flex items-center justify-between text-xs font-mono-num">
              <span className="text-amber-400 font-bold">УРОВЕНЬ {stageDef.stage}</span>
              <span className="text-zinc-400">20 ВРАГОВ</span>
            </div>

            <div className="text-sm font-semibold text-zinc-100 truncate">{stageDef.name}</div>

            <canvas
              ref={previewRef}
              width={208}
              height={208}
              className="w-full max-w-[208px] aspect-square mx-auto border border-zinc-700 pixel-crisp"
            />

            <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs font-mono-num text-zinc-300 pt-1">
              <div className="flex justify-between">
                <span className="text-zinc-400">Обычные</span>
                <span>{stageDef.enemies.basic}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sky-400">Быстрые</span>
                <span>{stageDef.enemies.fast}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-orange-400">Штурм</span>
                <span>{stageDef.enemies.power}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-400">Броня</span>
                <span>{stageDef.enemies.armor}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onLaunchStage(selectedStage)}
              className="mt-auto w-full min-h-[46px] px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display text-sm tracking-wider uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              Играть уровень {selectedStage}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
