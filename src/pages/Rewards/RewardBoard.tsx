import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, Gift, Star, Sparkles, Clock } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import type { CompletionEntry } from '../../contexts/ConfigContext';
import { useSecurity } from '../../contexts/SecurityContext';
import { getApiUrl } from '../../utils/api';
import { PinConfirmOverlay } from '../../components/overlays/PinConfirmOverlay';

const formatRelativeTime = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins} Min.`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours} Std.`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `vor ${days} Tag${days > 1 ? 'en' : ''}`;
    return `vor ${Math.floor(days / 7)} Woche${Math.floor(days / 7) > 1 ? 'n' : ''}`;
};

const StarTrail: React.FC<{ filled: number; total: number; color?: string }> = ({ filled, total, color }) => {
    const percentage = Math.min((filled / total) * 100, 100);
    return (
        <div className="w-full">
            <div className="relative h-7 rounded-full overflow-hidden bg-slate-200/80 dark:bg-slate-800/80 border border-slate-300/60 dark:border-slate-700/60">
                <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
                    style={{
                        width: `${percentage}%`,
                        background: color
                            ? `linear-gradient(90deg, ${color}88, ${color})`
                            : 'linear-gradient(90deg, #b45309, #eab308, #facc15)',
                    }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-black tracking-wider text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                        {filled} / {total}
                    </span>
                </div>
            </div>
        </div>
    );
};

const FloatingStar: React.FC<{ delay: number; left: string }> = ({ delay, left }) => (
    <div
        className="absolute text-yellow-400/10 dark:text-yellow-400/20 animate-pulse pointer-events-none"
        style={{
            animationDelay: `${delay}s`,
            left,
            top: `${10 + Math.random() * 70}%`,
            fontSize: `${14 + Math.random() * 18}px`,
        }}
    >
        ★
    </div>
);

const RewardBoard: React.FC = () => {
    const { config, updateConfig } = useConfig();
    const { deviceId } = useSecurity();
    const API_URL = getApiUrl();

    const rewards = config.rewards;
    const kids = config.chores?.kids || [];
    const targetStars = rewards?.targetStars || 20;

    const [history, setHistory] = useState<CompletionEntry[]>([]);
    const [claimOverlay, setClaimOverlay] = useState<string | null>(null);
    const [pinError, setPinError] = useState('');
    const [pinLoading, setPinLoading] = useState(false);

    const fetchHistory = useCallback(() => {
        fetch(`${API_URL}/api/rewards/history?limit=20`, {
            headers: { 'x-device-id': deviceId },
        })
            .then(r => r.json())
            .then(data => setHistory(data.completions || []))
            .catch(console.error);
    }, [API_URL, deviceId]);

    useEffect(() => {
        fetchHistory();
        const interval = setInterval(fetchHistory, 30000);
        return () => clearInterval(interval);
    }, [fetchHistory]);

    const refreshConfig = useCallback(() => {
        fetch(`${API_URL}/api/config`, {
            headers: { 'x-device-id': deviceId },
        })
            .then(r => r.json())
            .then(data => {
                if (data.rewards) {
                    updateConfig({ rewards: data.rewards });
                }
            })
            .catch(console.error);
    }, [API_URL, deviceId]);

    // Periodically refresh config to pick up star count changes from other pages
    useEffect(() => {
        const interval = setInterval(refreshConfig, 30000);
        return () => clearInterval(interval);
    }, [refreshConfig]);

    const isGoalReached = (kidId?: string): boolean => {
        if (rewards?.mode === 'shared') {
            return (rewards.sharedStars || 0) >= targetStars;
        }
        if (kidId) {
            return (rewards?.kidStars?.[kidId] || 0) >= targetStars;
        }
        return kids.some(k => (rewards?.kidStars?.[k.id] || 0) >= targetStars);
    };

    const handleClaim = async (pin: string) => {
        setPinLoading(true);
        setPinError('');
        try {
            const res = await fetch(`${API_URL}/api/rewards/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({
                    pin,
                    kidId: claimOverlay !== 'shared' ? claimOverlay : undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setPinError(data.error || 'Fehler');
                return;
            }
            setClaimOverlay(null);
            setPinError('');
            refreshConfig();
            fetchHistory();
        } catch {
            setPinError('Verbindungsfehler');
        } finally {
            setPinLoading(false);
        }
    };

    return (
        <div className="h-full w-full overflow-y-auto relative bg-slate-50 dark:bg-transparent">
            {/* Ambient floating stars */}
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
                <FloatingStar key={i} delay={i * 0.7} left={`${8 + i * 13}%`} />
            ))}

            <div className="relative z-10 max-w-4xl mx-auto px-4 py-6 space-y-6">
                {/* ── Header ── */}
                <header className="text-center">
                    <div className="inline-flex items-center gap-3 mb-1">
                        <Trophy className="w-9 h-9 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]" />
                        <h1
                            className="text-4xl font-black tracking-wide"
                            style={{
                                background: 'linear-gradient(135deg, #fbbf24, #f97316, #ef4444)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}
                        >
                            Belohnungen
                        </h1>
                        <Trophy className="w-9 h-9 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]" />
                    </div>
                </header>

                {/* ── Current Reward Banner ── */}
                <div className="relative rounded-2xl overflow-hidden border border-yellow-500/30 dark:border-yellow-600/30 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-yellow-900/20 dark:to-slate-800/40">
                    <div className="absolute inset-0 opacity-[0.03]"
                        style={{
                            backgroundImage: `repeating-linear-gradient(
                                45deg,
                                transparent,
                                transparent 20px,
                                rgba(250,204,21,1) 20px,
                                rgba(250,204,21,1) 21px
                            )`,
                        }}
                    />
                    <div className="relative flex items-center gap-5 p-5">
                        {rewards?.rewardImage ? (
                            <img
                                src={rewards.rewardImage}
                                alt="Belohnung"
                                className="w-20 h-20 rounded-xl object-cover border-2 border-yellow-500/40 dark:border-yellow-600/40 shadow-lg flex-shrink-0"
                            />
                        ) : (
                            <div className="w-20 h-20 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 border-2 border-yellow-300/50 dark:border-yellow-700/30 flex items-center justify-center flex-shrink-0">
                                <Gift className="w-10 h-10 text-yellow-500/60 dark:text-yellow-600/60" />
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold uppercase tracking-widest text-yellow-600/80 dark:text-yellow-600/80 mb-1">
                                Aktuelle Belohnung
                            </p>
                            {rewards?.currentReward ? (
                                <p className="text-2xl font-black text-slate-900 dark:text-white truncate">
                                    {rewards.currentReward}
                                </p>
                            ) : (
                                <p className="text-lg text-slate-400 dark:text-slate-500 italic">
                                    Noch keine Belohnung definiert
                                </p>
                            )}
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                <Star className="w-3.5 h-3.5 inline text-yellow-500 -mt-0.5 mr-1" />
                                {targetStars} Sterne sammeln
                                {rewards?.mode === 'shared' && ' (gemeinsam)'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── Progress Section ── */}
                {rewards?.mode === 'shared' ? (
                    /* ─ Shared Mode ─ */
                    <div className="space-y-3">
                        <div className="bg-white/80 dark:bg-slate-800/50 rounded-2xl border border-slate-200/60 dark:border-slate-700/40 p-6 shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <Sparkles className="w-6 h-6 text-yellow-400" />
                                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Gemeinsamer Fortschritt</h2>
                            </div>
                            <StarTrail
                                filled={rewards.sharedStars || 0}
                                total={targetStars}
                            />
                            <div className="mt-3 flex items-center justify-between text-sm">
                                <span className="text-slate-500 dark:text-slate-400">
                                    {Math.max(0, targetStars - (rewards.sharedStars || 0))} Sterne fehlen noch
                                </span>
                                <span className="text-yellow-500 dark:text-yellow-400 font-bold text-lg">
                                    {rewards.sharedStars || 0} ★
                                </span>
                            </div>

                            {isGoalReached() && (
                                <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-yellow-100 via-amber-50 to-orange-100 dark:from-yellow-600/20 dark:via-amber-500/20 dark:to-orange-600/20 border border-yellow-400/40 dark:border-yellow-500/40 text-center animate-pulse">
                                    <p className="text-2xl font-black text-yellow-600 dark:text-yellow-300 mb-2">
                                        Geschafft! Belohnung verdient!
                                    </p>
                                    <button
                                        onClick={() => setClaimOverlay('shared')}
                                        className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-black rounded-xl text-lg transition active:scale-95 shadow-lg shadow-yellow-500/20"
                                    >
                                        <Gift className="w-5 h-5 inline mr-2 -mt-0.5" />
                                        Belohnung einlösen
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* ─ Individual Mode ─ */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {kids.map(kid => {
                            const kidStars = rewards?.kidStars?.[kid.id] || 0;
                            const reached = kidStars >= targetStars;

                            return (
                                <div
                                    key={kid.id}
                                    className={`rounded-2xl border overflow-hidden transition-all shadow-sm ${
                                        reached
                                            ? 'border-yellow-400/50 dark:border-yellow-500/50 shadow-lg shadow-yellow-500/10'
                                            : 'border-slate-200/60 dark:border-slate-700/40'
                                    }`}
                                    style={{
                                        background: reached
                                            ? undefined
                                            : undefined,
                                    }}
                                >
                                    <div className={`p-5 ${
                                        reached
                                            ? 'bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/10 dark:to-amber-900/10'
                                            : 'bg-white/80 dark:bg-slate-800/40'
                                    }`}>
                                        <div className="flex items-center gap-4 mb-4">
                                            {kid.photo ? (
                                                <img
                                                    src={kid.photo}
                                                    alt={kid.name}
                                                    className="w-14 h-14 rounded-full object-cover border-3 shadow-md"
                                                    style={{ borderColor: kid.color }}
                                                />
                                            ) : (
                                                <div
                                                    className="w-14 h-14 rounded-full flex items-center justify-center text-white font-black text-xl border-3 shadow-md"
                                                    style={{ backgroundColor: kid.color, borderColor: `${kid.color}88` }}
                                                >
                                                    {kid.name.substring(0, 2).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="flex-1">
                                                <h3 className="text-xl font-black text-slate-800 dark:text-white">{kid.name}</h3>
                                                <p className="text-yellow-500 dark:text-yellow-400 font-bold text-lg">
                                                    {kidStars} ★
                                                    <span className="text-slate-400 dark:text-slate-500 text-sm font-normal ml-1">
                                                        / {targetStars}
                                                    </span>
                                                </p>
                                            </div>
                                        </div>

                                        <StarTrail filled={kidStars} total={targetStars} color={kid.color} />

                                        {reached && (
                                            <div className="mt-4 text-center">
                                                <p className="text-lg font-black text-yellow-600 dark:text-yellow-300 mb-2 animate-pulse">
                                                    Geschafft!
                                                </p>
                                                <button
                                                    onClick={() => setClaimOverlay(kid.id)}
                                                    className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold rounded-xl transition active:scale-95 shadow-lg shadow-yellow-500/20"
                                                >
                                                    <Gift className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                                                    Einlösen
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Recent History ── */}
                {history.length > 0 && (
                    <div className="bg-white/80 dark:bg-slate-800/30 rounded-2xl border border-slate-200/60 dark:border-slate-700/30 overflow-hidden shadow-sm">
                        <div className="px-5 py-3 border-b border-slate-200/60 dark:border-slate-700/30 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Letzte Aktivitäten
                            </h3>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-64 overflow-y-auto">
                            {history.map(entry => {
                                const kid = kids.find(k => k.id === entry.kidId);
                                return (
                                    <div
                                        key={entry.id}
                                        className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition"
                                    >
                                        <div
                                            className="w-3 h-3 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: kid?.color || '#64748b' }}
                                        />
                                        <span className="font-bold text-slate-800 dark:text-white text-sm">{entry.kidName}</span>
                                        <span className="text-slate-500 dark:text-slate-400 text-sm flex-1 truncate">{entry.taskLabel}</span>
                                        <span className="text-yellow-500 dark:text-yellow-400 font-bold text-sm flex-shrink-0">
                                            +{entry.stars} ★
                                        </span>
                                        <span className="text-slate-400 dark:text-slate-600 text-xs flex-shrink-0 w-24 text-right">
                                            {formatRelativeTime(entry.timestamp)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* PIN overlay for claiming */}
            <PinConfirmOverlay
                active={!!claimOverlay}
                title="Belohnung einlösen"
                subtitle={`${rewards?.currentReward || 'Belohnung'} wird vergeben`}
                onConfirm={handleClaim}
                onCancel={() => { setClaimOverlay(null); setPinError(''); }}
                error={pinError}
                loading={pinLoading}
            />
        </div>
    );
};

export default RewardBoard;
