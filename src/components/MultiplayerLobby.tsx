import React, { useState } from 'react';
import { Check, Copy, Play, RefreshCw, ShieldAlert, Users, Wifi, WifiOff, X } from 'lucide-react';
import { RoomStatePayload, RoomSummary } from '../game/types.ts';
import { TOTAL_STAGES, getStageDef } from '../game/levels.ts';

interface MultiplayerLobbyProps {
  connected: boolean;
  rttMs: number;
  room: RoomStatePayload | null;
  playerId: string | null;
  roomsList: RoomSummary[];
  errorMessage: string | null;
  defaultStage?: number;
  initialJoinCode?: string;
  onCreateRoom: (name: string, stage: number, friendlyFire: boolean) => void;
  onJoinRoom: (code: string, name: string) => void;
  onLeaveRoom: () => void;
  onRefreshRooms: () => void;
  onUpdateRoom: (stage?: number, friendlyFire?: boolean) => void;
  onStartGame: () => void;
  onClose: () => void;
}

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  connected,
  rttMs,
  room,
  playerId,
  roomsList,
  errorMessage,
  defaultStage = 1,
  initialJoinCode = '',
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onRefreshRooms,
  onUpdateRoom,
  onStartGame,
  onClose,
}) => {
  const [playerName, setPlayerName] = useState(() => {
    try {
      return localStorage.getItem('tanks1990_name') || 'Танкист';
    } catch {
      return 'Танкист';
    }
  });
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [createStage, setCreateStage] = useState(defaultStage);
  const [friendlyFire, setFriendlyFire] = useState(false);
  const [copied, setCopied] = useState(false);

  const saveName = (val: string) => {
    setPlayerName(val);
    try {
      localStorage.setItem('tanks1990_name', val);
    } catch {
      // Ignore storage failures
    }
  };

  const handleCopyInvite = () => {
    if (!room) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const isHost = Boolean(room && playerId && room.hostId === playerId);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6 bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-label="Онлайн-мультиплеер"
    >
      <div className="w-full max-w-2xl max-h-[92vh] bg-[#14171e] border border-zinc-700 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="font-display text-xl tracking-wide text-zinc-100 uppercase">
              Онлайн-кооператив
            </h2>
            <div className="flex items-center gap-3 text-xs font-mono-num text-zinc-400 mt-1">
              <span className="flex items-center gap-1.5">
                {connected ? (
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-red-400" />
                )}
                {connected ? 'Сервер подключён' : 'Подключение...'}
              </span>
              {connected && rttMs > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Пинг: {rttMs} мс (клиентское предсказание)</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (room) onLeaveRoom();
              onClose();
            }}
            aria-label="Закрыть лобби"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-100 border border-zinc-700/70 hover:border-zinc-500 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex flex-col gap-5">
          {errorMessage && (
            <div
              role="alert"
              className="px-4 py-2.5 bg-red-950/70 border border-red-700/70 text-red-200 text-sm flex items-center gap-2"
            >
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!room ? (
            <>
              {/* Player Callsign */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="mp-callsign" className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Позывной игрока
                </label>
                <input
                  id="mp-callsign"
                  type="text"
                  maxLength={16}
                  value={playerName}
                  onChange={(e) => saveName(e.target.value)}
                  placeholder="Введите имя"
                  className="w-full min-h-[44px] px-3.5 bg-[#0d1016] border border-zinc-700 text-zinc-100 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Create Room Panel */}
                <div className="bg-[#0f1218] border border-zinc-800 p-4 flex flex-col gap-3">
                  <h3 className="font-display text-sm uppercase tracking-wider text-amber-400">
                    Создать комнату
                  </h3>

                  <div className="flex flex-col gap-1">
                    <label htmlFor="mp-create-stage" className="text-xs text-zinc-400">
                      Начальный уровень (1–35)
                    </label>
                    <select
                      id="mp-create-stage"
                      value={createStage}
                      onChange={(e) => setCreateStage(Number(e.target.value))}
                      className="min-h-[42px] px-3 bg-[#171b24] border border-zinc-700 text-zinc-100 text-sm focus:outline-none focus:border-amber-400"
                    >
                      {Array.from({ length: TOTAL_STAGES }, (_, i) => i + 1).map((num) => (
                        <option key={num} value={num}>
                          Уровень {num} — {getStageDef(num).name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-2.5 text-sm text-zinc-300 cursor-pointer min-h-[36px]">
                    <input
                      type="checkbox"
                      checked={friendlyFire}
                      onChange={(e) => setFriendlyFire(e.target.checked)}
                      className="w-4 h-4 accent-amber-500"
                    />
                    Огонь по союзнику (оглушение)
                  </label>

                  <button
                    type="button"
                    disabled={!connected}
                    onClick={() => onCreateRoom(playerName.trim() || 'Игрок 1', createStage, friendlyFire)}
                    className="mt-auto w-full min-h-[46px] px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-display text-sm tracking-wider uppercase transition-colors cursor-pointer"
                  >
                    Создать комнату
                  </button>
                </div>

                {/* Join Room by Code Panel */}
                <div className="bg-[#0f1218] border border-zinc-800 p-4 flex flex-col gap-3">
                  <h3 className="font-display text-sm uppercase tracking-wider text-emerald-400">
                    Войти по коду
                  </h3>

                  <div className="flex flex-col gap-1">
                    <label htmlFor="mp-room-code" className="text-xs text-zinc-400">
                      Код комнаты (4 символа)
                    </label>
                    <input
                      id="mp-room-code"
                      type="text"
                      maxLength={6}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="Например: A7K2"
                      className="min-h-[42px] px-3 bg-[#171b24] border border-zinc-700 text-zinc-100 font-mono-num text-base tracking-widest uppercase focus:outline-none focus:border-emerald-400"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={!connected || joinCode.trim().length < 3}
                    onClick={() => onJoinRoom(joinCode, playerName.trim() || 'Игрок 2')}
                    className="mt-auto w-full min-h-[46px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-display text-sm tracking-wider uppercase transition-colors cursor-pointer"
                  >
                    Присоединиться
                  </button>
                </div>
              </div>

              {/* Open Public Rooms */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Открытые комнаты
                  </span>
                  <button
                    type="button"
                    onClick={onRefreshRooms}
                    className="min-h-[36px] px-2.5 text-xs text-zinc-300 hover:text-amber-400 flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Обновить
                  </button>
                </div>

                {roomsList.length === 0 ? (
                  <div className="px-4 py-5 bg-[#0f1218] border border-zinc-800 text-center text-sm text-zinc-500">
                    Пока нет активных комнат — создайте свою и отправьте код другу
                  </div>
                ) : (
                  <div className="flex flex-col divide-y divide-zinc-800 border border-zinc-800 bg-[#0f1218]">
                    {roomsList.map((r) => (
                      <div key={r.code} className="flex items-center justify-between px-4 py-3 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono-num font-bold text-amber-400 tracking-wider">
                            {r.code}
                          </span>
                          <span className="text-xs text-zinc-400 truncate">
                            Уровень {r.stage} · {r.players}/{r.maxPlayers} игроков
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={r.players >= r.maxPlayers || r.status === 'playing'}
                          onClick={() => onJoinRoom(r.code, playerName.trim() || 'Игрок 2')}
                          className="min-h-[38px] px-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-semibold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                        >
                          {r.status === 'playing' ? 'В бою' : r.players >= 2 ? 'Полно' : 'Войти'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Inside Active Room Lobby */
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0f1218] border border-zinc-800 p-4">
                <div>
                  <div className="text-xs text-zinc-400 uppercase tracking-wider">Код комнаты</div>
                  <div className="font-mono-num text-3xl font-bold tracking-[0.25em] text-amber-400 mt-0.5">
                    {room.code}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="min-h-[44px] px-4 py-2 bg-[#1c222e] hover:bg-[#252d3c] border border-zinc-700 text-zinc-100 text-sm font-medium flex items-center gap-2 cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Ссылка скопирована' : 'Скопировать приглашение'}
                </button>
              </div>

              {/* Player Slots */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[1, 2].map((slot) => {
                  const p = room.players.find((pl) => pl.slot === slot);
                  return (
                    <div
                      key={slot}
                      className={`p-4 border flex items-center justify-between ${
                        p
                          ? 'bg-[#171c26] border-zinc-700'
                          : 'bg-[#0f1218] border-dashed border-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 flex items-center justify-center font-mono-num font-bold text-sm ${
                            slot === 1
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                          }`}
                        >
                          {slot}P
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-zinc-100">
                            {p ? p.name : 'Ожидание союзника...'}
                          </div>
                          <div className="text-xs text-zinc-400">
                            {p
                              ? p.id === room.hostId
                                ? 'Командир комнаты'
                                : 'Готов к бою'
                              : 'Можно начать одному или вдвоём'}
                          </div>
                        </div>
                      </div>
                      {p && <Users className="w-4 h-4 text-emerald-400" />}
                    </div>
                  );
                })}
              </div>

              {/* Room Stage Controls (Host editable) */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0f1218] border border-zinc-800 p-4">
                <div className="flex items-center gap-3">
                  <label htmlFor="lobby-stage" className="text-xs uppercase tracking-wider text-zinc-400">
                    Уровень:
                  </label>
                  <select
                    id="lobby-stage"
                    disabled={!isHost}
                    value={room.stage}
                    onChange={(e) => onUpdateRoom(Number(e.target.value), undefined)}
                    className="min-h-[40px] px-3 bg-[#171b24] border border-zinc-700 text-zinc-100 text-sm disabled:opacity-60"
                  >
                    {Array.from({ length: TOTAL_STAGES }, (_, i) => i + 1).map((num) => (
                      <option key={num} value={num}>
                        {num}. {getStageDef(num).name}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    disabled={!isHost}
                    checked={room.friendlyFire}
                    onChange={(e) => onUpdateRoom(undefined, e.target.checked)}
                    className="w-4 h-4 accent-amber-500"
                  />
                  Огонь по союзнику
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={onLeaveRoom}
                  className="min-h-[46px] px-5 bg-[#1b2029] hover:bg-[#252c38] border border-zinc-700 text-zinc-300 text-sm font-medium cursor-pointer"
                >
                  Покинуть комнату
                </button>

                {isHost ? (
                  <button
                    type="button"
                    onClick={onStartGame}
                    className="min-h-[48px] px-7 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display text-base tracking-wider uppercase flex items-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Начать бой
                  </button>
                ) : (
                  <div className="text-sm text-zinc-400 font-mono-num">
                    Ожидание запуска от командира...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
