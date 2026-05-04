import React, { useCallback, useEffect, useState } from 'react';
import { Star, Plus, Minus, Check, Clock, Sparkles, Trophy, Target, Gift, Save } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { useSecurity } from '../../contexts/SecurityContext';
import { getApiUrl } from '../../utils/api';
import { Sheet } from './Sheet';
import type { CompletionEntry, RewardConfig } from '../../contexts/ConfigContext';

const formatRelative = (ts: number) => {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'gerade eben';
    if (m < 60) return `vor ${m} Min.`;
    const h = Math.floor(m / 60);
    if (h < 24) return `vor ${h} Std.`;
    const d = Math.floor(h / 24);
    return `vor ${d} Tag${d === 1 ? '' : 'en'}`;
};

export const PwaStars: React.FC = () => {
    const { config, updateConfig } = useConfig();
    const { deviceId } = useSecurity();
    const API_URL = getApiUrl();

    const kids = config.chores?.kids || [];
    const rewards = config.rewards;
    const target = rewards?.targetStars || 20;
    const sharedMode = rewards?.mode === 'shared';

    const [selectedKid, setSelectedKid] = useState<string>('');
    const [stars, setStars] = useState<number>(1);
    const [reason, setReason] = useState<string>('');
    const [busy, setBusy] = useState(false);
    const [flash, setFlash] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [history, setHistory] = useState<CompletionEntry[]>([]);
    const [editGoal, setEditGoal] = useState(false);
    const [goalDraft, setGoalDraft] = useState<RewardConfig | null>(null);

    // In individual mode the user must pick a kid explicitly — no auto-select.
    // If they switch modes or remove the previously selected kid, clear it.
    useEffect(() => {
        if (selectedKid && !kids.find(k => k.id === selectedKid)) {
            setSelectedKid('');
        }
    }, [kids, selectedKid]);

    const fetchHistory = useCallback(() => {
        if (!deviceId) return;
        fetch(`${API_URL}/api/rewards/history?limit=15`, { headers: { 'x-device-id': deviceId } })
            .then(r => r.json())
            .then(d => setHistory(d.completions || []))
            .catch(() => {});
    }, [API_URL, deviceId]);

    useEffect(() => { fetchHistory(); }, [fetchHistory]);

    const canGrant = sharedMode || !!selectedKid;

    const grant = async () => {
        if (!canGrant || stars < 1) {
            if (!sharedMode && !selectedKid) {
                setError('Bitte zuerst ein Kind auswählen');
                setTimeout(() => setError(''), 2500);
            }
            return;
        }
        setBusy(true);
        setError('');
        try {
            const body: Record<string, unknown> = { stars, reason: reason.trim() || 'Bonus' };
            if (selectedKid) body.kidId = selectedKid;
            const res = await fetch(`${API_URL}/api/rewards/bonus`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Fehler');
            if (data.rewards) updateConfig({ rewards: data.rewards });
            setFlash(`+${stars} ★ vergeben`);
            setTimeout(() => setFlash(''), 1800);
            setReason('');
            setStars(1);
            fetchHistory();
        } catch (e: any) {
            setError(e.message || 'Fehler');
            setTimeout(() => setError(''), 2500);
        } finally {
            setBusy(false);
        }
    };

    if (kids.length === 0 && !sharedMode) {
        return (
            <div className="p-6 text-center text-slate-500 dark:text-slate-400">
                <p>Keine Kinder konfiguriert.</p>
                <p className="text-sm mt-2">Bitte zuerst im Admin Kinder anlegen.</p>
            </div>
        );
    }

    const openGoal = () => {
        setGoalDraft({
            mode: rewards?.mode || 'individual',
            targetStars: target,
            currentReward: rewards?.currentReward || '',
            rewardImage: rewards?.rewardImage,
            kidStars: rewards?.kidStars || {},
            sharedStars: rewards?.sharedStars || 0
        });
        setEditGoal(true);
    };

    const saveGoal = () => {
        if (!goalDraft) return;
        updateConfig({ rewards: goalDraft });
        setEditGoal(false);
    };

    return (
        <div className="p-4 max-w-xl mx-auto space-y-6">
            {/* Reward & goal banner */}
            <section className="bg-gradient-to-br from-yellow-100 to-amber-50 dark:from-yellow-900/20 dark:to-slate-800/40 rounded-2xl p-4 border border-yellow-300 dark:border-yellow-700/40 flex items-center gap-3">
                <Gift className="w-7 h-7 text-yellow-500 flex-none" />
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-yellow-700/80 dark:text-yellow-500/80 font-bold">
                        Belohnung
                    </div>
                    <div className="font-black truncate">
                        {rewards?.currentReward || <span className="text-slate-400 italic font-normal">Noch nicht gesetzt</span>}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        {target} ★ Ziel · {sharedMode ? 'Gemeinsam' : 'Individuell'}
                    </div>
                </div>
                <button
                    onClick={openGoal}
                    className="flex-none flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg text-sm active:scale-95"
                >
                    <Target className="w-4 h-4" /> Ändern
                </button>
            </section>

            {/* Star balances per kid */}
            <section>
                <h2 className="text-sm uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold mb-3 flex items-center gap-2">
                    <Trophy className="w-4 h-4" /> Aktueller Stand
                </h2>
                <div className="grid grid-cols-1 gap-2">
                    {rewards?.mode === 'shared' ? (
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                            <div>
                                <div className="text-sm text-slate-500 dark:text-slate-400">Gemeinsam</div>
                                <div className="text-2xl font-black">{rewards.sharedStars || 0} ★</div>
                            </div>
                            <div className="text-sm text-slate-400">/ {target}</div>
                        </div>
                    ) : (
                        kids.map(k => {
                            const v = rewards?.kidStars?.[k.id] || 0;
                            const reached = v >= target;
                            return (
                                <div
                                    key={k.id}
                                    className={`rounded-xl p-3 border flex items-center gap-3 ${reached ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 dark:border-yellow-600' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                                >
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-none"
                                        style={{ backgroundColor: k.color }}
                                    >
                                        {k.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold truncate">{k.name}</div>
                                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full mt-1 overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all"
                                                style={{ width: `${Math.min(100, (v / target) * 100)}%`, backgroundColor: k.color }}
                                            />
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-yellow-500 font-bold tabular-nums">{v} ★</div>
                                        <div className="text-[10px] text-slate-400">/ {target}</div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </section>

            {/* Grant manual stars */}
            <section className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 space-y-4">
                <h2 className="text-sm uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Sterne vergeben
                </h2>

                {sharedMode ? (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                        Modus <span className="font-bold">Gemeinsam</span> — Sterne fließen in den Familien-Pool.
                    </div>
                ) : (
                    <div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                            Kind {selectedKid ? '' : <span className="text-red-500">— bitte auswählen</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {kids.map(k => (
                                <button
                                    key={k.id}
                                    onClick={() => setSelectedKid(k.id)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left active:scale-95 transition ${
                                        selectedKid === k.id
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'
                                    }`}
                                >
                                    <span className="w-3 h-3 rounded-full flex-none" style={{ backgroundColor: k.color }} />
                                    <span className="font-semibold truncate">{k.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div>
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Anzahl Sterne</div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setStars(s => Math.max(1, s - 1))}
                            className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center active:scale-95"
                            disabled={stars <= 1}
                        >
                            <Minus className="w-5 h-5" />
                        </button>
                        <div className="flex-1 text-center">
                            <div className="text-4xl font-black tabular-nums text-yellow-500">{stars} ★</div>
                        </div>
                        <button
                            onClick={() => setStars(s => Math.min(5, s + 1))}
                            className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center active:scale-95"
                            disabled={stars >= 5}
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex gap-1 mt-2 justify-center">
                        {[1, 2, 3, 4, 5].map(n => (
                            <button
                                key={n}
                                onClick={() => setStars(n)}
                                className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                                    stars === n
                                        ? 'bg-yellow-400 text-slate-900'
                                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                }`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>

                <input
                    type="text"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Grund (optional)"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
                />

                <button
                    onClick={grant}
                    disabled={busy || !canGrant}
                    className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-slate-900 font-black py-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition"
                >
                    <Star className="w-5 h-5 fill-current" />
                    {busy ? 'Sende…' : `${stars} Stern${stars > 1 ? 'e' : ''} vergeben`}
                </button>

                {error && (
                    <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg px-3 py-2 text-sm text-center">
                        {error}
                    </div>
                )}

                {flash && (
                    <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400 font-bold animate-pulse">
                        <Check className="w-5 h-5" /> {flash}
                    </div>
                )}
            </section>

            {/* Recent history */}
            {history.length > 0 && (
                <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                        <Clock className="w-3 h-3" /> Letzte Aktivitäten
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-700/60 max-h-72 overflow-y-auto">
                        {history.map(e => {
                            const k = kids.find(x => x.id === e.kidId);
                            return (
                                <div key={e.id} className="flex items-center gap-2 px-4 py-2">
                                    <span className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: k?.color || '#94a3b8' }} />
                                    <span className="font-semibold text-sm">{e.kidName}</span>
                                    <span className="text-slate-500 dark:text-slate-400 text-sm flex-1 truncate">{e.taskLabel}</span>
                                    <span className="text-yellow-500 font-bold text-sm tabular-nums">+{e.stars}★</span>
                                    <span className="text-slate-400 text-[10px] w-20 text-right">{formatRelative(e.timestamp)}</span>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {editGoal && goalDraft && (
                <Sheet
                    title="Ziel & Belohnung"
                    onClose={() => setEditGoal(false)}
                    footer={
                        <>
                            <div className="flex-1" />
                            <button onClick={() => setEditGoal(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700">Abbrechen</button>
                            <button onClick={saveGoal} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-1">
                                <Save className="w-4 h-4" /> Speichern
                            </button>
                        </>
                    }
                >
                    <div>
                        <span className="text-xs font-semibold text-slate-500">Modus</span>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                            <button
                                onClick={() => setGoalDraft({ ...goalDraft, mode: 'individual' })}
                                className={`px-3 py-2 rounded-lg border text-sm ${
                                    goalDraft.mode === 'individual'
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-slate-200 dark:border-slate-700'
                                }`}
                            >Individuell</button>
                            <button
                                onClick={() => setGoalDraft({ ...goalDraft, mode: 'shared' })}
                                className={`px-3 py-2 rounded-lg border text-sm ${
                                    goalDraft.mode === 'shared'
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-slate-200 dark:border-slate-700'
                                }`}
                            >Gemeinsam</button>
                        </div>
                    </div>

                    <label className="block">
                        <span className="text-xs font-semibold text-slate-500">Belohnung</span>
                        <input
                            value={goalDraft.currentReward}
                            onChange={e => setGoalDraft({ ...goalDraft, currentReward: e.target.value })}
                            placeholder="z.B. Eis essen gehen"
                            className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
                        />
                    </label>

                    <label className="block">
                        <span className="text-xs font-semibold text-slate-500">Ziel (Sterne)</span>
                        <div className="flex items-center gap-3 mt-1">
                            <button
                                onClick={() => setGoalDraft({ ...goalDraft, targetStars: Math.max(1, goalDraft.targetStars - 5) })}
                                className="w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center active:scale-95"
                            >
                                <Minus className="w-5 h-5" />
                            </button>
                            <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                value={goalDraft.targetStars}
                                onChange={e => setGoalDraft({ ...goalDraft, targetStars: Math.max(1, parseInt(e.target.value) || 1) })}
                                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-center text-2xl font-black tabular-nums"
                            />
                            <button
                                onClick={() => setGoalDraft({ ...goalDraft, targetStars: goalDraft.targetStars + 5 })}
                                className="w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center active:scale-95"
                            >
                                <Plus className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                            {[10, 15, 20, 25, 30, 40, 50].map(n => (
                                <button
                                    key={n}
                                    onClick={() => setGoalDraft({ ...goalDraft, targetStars: n })}
                                    className={`text-xs px-2 py-1 rounded-full ${
                                        goalDraft.targetStars === n
                                            ? 'bg-yellow-400 text-slate-900 font-bold'
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                                    }`}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                    </label>
                </Sheet>
            )}
        </div>
    );
};
