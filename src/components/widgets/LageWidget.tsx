import React from 'react';
import { formatDistanceToNowStrict, format } from 'date-fns';
import { de } from 'date-fns/locale';
import { ShieldAlert, Plane, Landmark, TrendingUp, Radiation, Siren, RefreshCw, Info, CalendarDays } from 'lucide-react';
import { useLage, LEVEL_STYLES, LageSnapshot, LageIndicator } from '../../hooks/useLage';

const GROUP_ICONS: Record<string, React.ElementType> = {
    luft: Plane,
    politik: Landmark,
    oeffentlichkeit: TrendingUp,
};

const SOURCE_LABELS: Record<string, string> = {
    nina: 'NINA',
    air: 'ADS-B',
    news: 'Tagesschau',
    bundestag: 'Bundestag',
    sitzungswochen: 'Sitzungskalender',
    nato: 'NATO',
    radiation: 'BfS',
    wiki: 'Wikipedia',
};

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });

const Dots: React.FC<{ points: number; max?: number; color: string }> = ({ points, max = 3, color }) => (
    <span className="inline-flex gap-0.5 flex-shrink-0" aria-label={`${fmt(points)} von ${max} Punkten`}>
        {Array.from({ length: max }, (_, i) => {
            const fill = Math.max(0, Math.min(1, points - i));
            return (
                <span key={i} className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700 overflow-hidden relative">
                    <span className="absolute inset-y-0 left-0" style={{ width: `${fill * 100}%`, backgroundColor: color }} />
                </span>
            );
        })}
    </span>
);

const IndicatorRow: React.FC<{ ind: LageIndicator; color: string }> = ({ ind, color }) => (
    <div className="py-1.5 border-b border-slate-300/50 dark:border-slate-700/50 last:border-0">
        <div className="flex items-center gap-2">
            <Dots points={ind.points} color={color} />
            <span className="font-medium text-slate-700 dark:text-slate-200 text-sm">{ind.label}</span>
            {ind.learning && (
                <span className="text-[10px] uppercase tracking-wide text-slate-400 border border-slate-400/40 rounded px-1">Lernphase</span>
            )}
            <span className="ml-auto text-xs tabular-nums text-slate-400">{fmt(ind.points)} P.</span>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 pl-[2.6rem]">
            {ind.detail}
            {typeof ind.z === 'number' && !ind.learning && ind.samples ? ` · ${fmt(ind.z)}σ` : ''}
        </div>
        {ind.events?.length > 0 && (
            <ul className="mt-0.5 pl-[2.6rem] space-y-0.5">
                {ind.events.slice(0, 3).map((e, i) => (
                    <li key={i} className="text-xs text-slate-600 dark:text-slate-300 truncate">
                        {e.breaking && <span className="text-red-500 font-bold mr-1">EIL</span>}
                        <span className="text-slate-400 mr-1">{format(e.ts, 'dd.MM. HH:mm')}</span>
                        {e.source && <span className="text-slate-400 mr-1">[{e.source}]</span>}
                        {e.title}
                        <span className="text-slate-400"> ({fmt(e.decayed)} P.)</span>
                    </li>
                ))}
            </ul>
        )}
    </div>
);

const Calculation: React.FC<{ s: LageSnapshot }> = ({ s }) => {
    const g = s.groups || {};
    const t = s.calc?.thresholds || {};
    const parts = Object.values(g).map(x => `${x.label} ${fmt(x.points)} × ${fmt(x.weight)}`);
    const rules = [
        { lvl: 4, ok: s.indicatorLevel !== undefined && s.indicatorLevel <= 4, text: `ein Indikator (Luft/Politik) ≥ ${t.level4IndicatorMin ?? 2} P.` },
        { lvl: 3, ok: s.indicatorLevel !== undefined && s.indicatorLevel <= 3, text: `Gesamt ≥ ${t.level3Total ?? 5} und ≥ ${t.level3Groups ?? 2} aktive Gruppen` },
        { lvl: 2, ok: s.indicatorLevel !== undefined && s.indicatorLevel <= 2, text: `Gesamt ≥ ${t.level2Total ?? 9} und alle Gruppen aktiv – oder NATO Art. 4` },
        { lvl: 1, ok: s.level === 1, text: 'nur durch amtliche Warnung / Messwert' },
    ];
    return (
        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-2">
            <div className="font-mono bg-slate-300/40 dark:bg-slate-900/50 rounded-lg px-2 py-1.5 leading-relaxed">
                {parts.join(' + ')} = <b className="text-slate-700 dark:text-slate-200">{fmt(s.total)}</b>
                <div>Aktive Gruppen (≥ {t.activeGroupMin ?? 2} P.): {s.activeGroups?.length ? s.activeGroups.map(id => g[id]?.label).join(', ') : 'keine'}</div>
                {s.kontext && s.kontext.length > 0 && (
                    <div>Kontext aktiv ({s.kontext.map(k => k.label).join(', ')}): Luft/Politik × {fmt(t.kontextFactor)}</div>
                )}
            </div>
            <ul className="space-y-0.5">
                {rules.map(r => (
                    <li key={r.lvl} className="flex gap-2">
                        <span className={`w-14 flex-shrink-0 font-bold ${LEVEL_STYLES[r.lvl].text}`}>LAGE {r.lvl}</span>
                        <span className={r.ok ? 'text-slate-700 dark:text-slate-200' : ''}>{r.ok ? '✓ ' : ''}{r.text}</span>
                    </li>
                ))}
            </ul>
            <div>
                Indikatorstufe <b>{s.indicatorLevel}</b>
                {s.floors && s.floors.length > 0 ? <> · amtliche Untergrenze <b>{s.floors[0].level}</b> ({s.floors[0].source})</> : ' · keine amtliche Untergrenze'}
                {' '}→ <b className={LEVEL_STYLES[s.level || 5].text}>LAGE {s.level}</b>
            </div>
            <div>
                Punkte je Indikator 0–3: Abweichung vom 30-Tage-Normalwert ≥ 2σ / 3σ / 4,5σ, Nachrichten
                klingen mit {t.newsHalfLifeHours ?? 24} h Halbwertszeit ab. Verschlechterung sofort,
                Entspannung erst nach {t.improveAfterMinutes ?? 60} min stabil.
            </div>
        </div>
    );
};

export const LageWidget: React.FC = () => {
    const { snapshot: s, error, refresh } = useLage();
    const [refreshing, setRefreshing] = React.useState(false);

    const card = 'widget-card flex flex-col p-4 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl backdrop-blur-sm shadow-lg w-full h-full border border-slate-300 dark:border-slate-700 overflow-hidden';

    if (!s || s.loading || !s.level) {
        return (
            <div className={card}>
                <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5" /> Lage-Index
                </h3>
                <div className="flex-1 flex items-center justify-center text-sm text-slate-400 animate-pulse text-center">
                    {s && !s.enabled && !s.loading ? 'Lage-Index ist abgeschaltet.' : error ? `Fehler: ${error}` : 'Lage wird ermittelt…'}
                </div>
            </div>
        );
    }

    const level = s.level;
    const st = LEVEL_STYLES[level];
    const groups = Object.values(s.groups || {});
    const indicators = Object.values(s.indicators || {});
    const ninaLocal = s.official?.ninaLocal || [];
    const rad = s.official?.radiation;

    const doRefresh = async () => {
        setRefreshing(true);
        try { await refresh(); } finally { setRefreshing(false); }
    };

    return (
        <div className={card}>
            <div className="flex items-center mb-3">
                <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5" /> Lage-Index
                </h3>
                <button
                    onClick={doRefresh}
                    className="ml-auto p-1.5 rounded-full hover:bg-slate-300/60 dark:hover:bg-slate-700/60 text-slate-400"
                    title="Jetzt neu abrufen"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Stufe */}
            <div className={`rounded-xl ${st.soft} ring-2 ${st.ring} p-3 flex items-center gap-4`}>
                <div className={`${st.bg} ${level <= 2 ? 'animate-pulse' : ''} text-white rounded-xl w-20 h-20 flex flex-col items-center justify-center flex-shrink-0 shadow`}>
                    <span className="text-[11px] font-bold tracking-widest">LAGE</span>
                    <span className="text-4xl font-black leading-none">{level}</span>
                </div>
                <div className="min-w-0">
                    <div className={`text-2xl font-bold ${st.text}`}>{s.label}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        seit {s.since ? formatDistanceToNowStrict(s.since, { locale: de }) : '–'}
                        {s.updatedAt ? ` · Stand ${format(s.updatedAt, 'HH:mm')}` : ''}
                    </div>
                    {s.reasons && s.reasons.length > 0 && (
                        <div className="text-sm text-slate-700 dark:text-slate-200 mt-1 line-clamp-2">{s.reasons[0]}</div>
                    )}
                </div>
            </div>

            {/* Gruppen */}
            <div className="grid grid-cols-3 gap-2 mt-3">
                {groups.map(g => {
                    const Icon = GROUP_ICONS[g.id] || Info;
                    return (
                        <div key={g.id} className={`rounded-lg px-2 py-1.5 ${g.active ? st.soft : 'bg-slate-300/30 dark:bg-slate-900/30'}`}>
                            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                <Icon className="w-3.5 h-3.5" /> {g.label}
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mt-1 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(g.points / 6) * 100}%`, backgroundColor: st.hex }} />
                            </div>
                            <div className="text-xs tabular-nums text-slate-600 dark:text-slate-300 mt-0.5">{fmt(g.points)} / 6 P.</div>
                        </div>
                    );
                })}
            </div>

            {/* Amtlich */}
            <div className="mt-3 text-sm space-y-1">
                <div className="flex items-start gap-2">
                    <Siren className={`w-4 h-4 mt-0.5 flex-shrink-0 ${ninaLocal.length ? 'text-red-500' : 'text-emerald-500'}`} />
                    <span className="text-slate-600 dark:text-slate-300">
                        {ninaLocal.length === 0
                            ? 'NINA: keine amtliche Warnung für den Landkreis'
                            : ninaLocal.map(w => `${w.provider}: ${w.headline || w.title}`).join(' · ')}
                        {(s.official?.ninaNational?.length || 0) > 0 && (
                            <span className="text-red-500"> · bundesweit: {s.official!.ninaNational.map(w => w.title).join(', ')}</span>
                        )}
                    </span>
                </div>
                {typeof s.official?.sitzungswoche === 'boolean' && (
                    <div className="flex items-start gap-2">
                        <CalendarDays className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-400" />
                        <span className="text-slate-600 dark:text-slate-300">
                            Bundestag: {s.official.sitzungswoche ? 'Sitzungswoche' : 'sitzungsfreie Woche – Sitzungen gelten als außerplanmäßig'}
                        </span>
                    </div>
                )}
                {rad && (
                    <div className="flex items-start gap-2">
                        <Radiation className={`w-4 h-4 mt-0.5 flex-shrink-0 ${rad.level ? 'text-red-500' : 'text-emerald-500'}`} />
                        <span className="text-slate-600 dark:text-slate-300">
                            Strahlung: max. {rad.max ? `${fmt(rad.max.value)} µSv/h (${rad.max.name}, ${rad.max.distanceKm} km)` : '–'} · {rad.count} Sonden im Umkreis
                        </span>
                    </div>
                )}
            </div>

            {/* Details */}
            <div className="flex-1 overflow-y-auto custom-scrollbar mt-3 pr-1 space-y-3">
                {groups.map(g => (
                    <div key={g.id}>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">{g.label} · Gewicht {fmt(g.weight)}</div>
                        {indicators.filter(i => i.group === g.id).map(i => (
                            <IndicatorRow key={i.id} ind={i} color={st.hex} />
                        ))}
                    </div>
                ))}

                <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Berechnung</div>
                    <Calculation s={s} />
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    {Object.entries(s.sources || {}).map(([k, v]) => (
                        <span key={k} className="flex items-center gap-1" title={v.error || undefined}>
                            <span className={`w-1.5 h-1.5 rounded-full ${v.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            {SOURCE_LABELS[k] || k}{v.at ? ` ${format(v.at, 'HH:mm')}` : ''}
                        </span>
                    ))}
                </div>
            </div>

            <div className="text-[11px] text-slate-400 mt-2 border-t border-slate-300/50 dark:border-slate-700/50 pt-1.5">
                Eigene Einschätzung – keine amtliche Warnung. Maßgeblich sind NINA, Sirenen und Cell Broadcast.
            </div>
        </div>
    );
};

export default LageWidget;
