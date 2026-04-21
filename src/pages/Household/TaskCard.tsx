import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChoreIcon } from '../../components/ChoreIcon';
import type { HouseholdMember, HouseholdTask } from '../../contexts/ConfigContext';

interface Props {
    task: HouseholdTask;
    member: HouseholdMember | undefined;
    lastMember: HouseholdMember | undefined;
    now: number;
    onComplete: () => void;
}

function formatDue(ms: number, now: number): string {
    const diff = ms - now;
    const rel = formatDistanceToNowStrict(ms, { locale: de });
    return diff < 0 ? `überfällig seit ${rel}` : `in ${rel}`;
}

function formatRecurrence(r: HouseholdTask['recurrence']): string {
    const unitLabel = r.intervalUnit === 'days'
        ? (r.intervalValue === 1 ? 'Tag' : 'Tagen')
        : r.intervalUnit === 'weeks'
        ? (r.intervalValue === 1 ? 'Woche' : 'Wochen')
        : (r.intervalValue === 1 ? 'Monat' : 'Monaten');
    return `alle ${r.intervalValue} ${unitLabel}`;
}

export const TaskCard: React.FC<Props> = ({ task, member, lastMember, now, onComplete }) => {
    const overdue = task.nextDueAt < now;
    const dueSoon = !overdue && task.nextDueAt - now <= 3 * 24 * 3600 * 1000;
    const borderClass = overdue
        ? 'border-red-500 dark:border-red-600'
        : dueSoon
        ? 'border-yellow-500 dark:border-yellow-600'
        : 'border-slate-300 dark:border-slate-700';

    return (
        <div className={`bg-white dark:bg-slate-800 rounded-xl border-2 ${borderClass} p-4 flex items-center gap-4 shadow-sm`}>
            <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                    {overdue && <AlertTriangle className="w-4 h-4 text-red-500 flex-none" />}
                    <span
                        className="w-3 h-3 rounded-full flex-none"
                        style={{ backgroundColor: member?.color || '#94a3b8' }}
                        title={member?.name || 'Unbekannt'}
                    />
                    <ChoreIcon icon={task.icon} className="w-6 h-6 text-slate-700 dark:text-slate-200 flex-none" />
                    <span className="text-lg font-bold text-slate-900 dark:text-white truncate">{task.label}</span>
                </div>
                <div className={`text-sm ${overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-600 dark:text-slate-300'}`}>
                    {formatDue(task.nextDueAt, now)} · {formatRecurrence(task.recurrence)}
                </div>
                {task.lastCompletedAt && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        Zuletzt: {new Date(task.lastCompletedAt).toLocaleDateString('de-DE')}
                        {lastMember ? ` (${lastMember.name})` : task.lastCompletedBy ? ' (Unbekannt)' : ''}
                    </div>
                )}
            </div>
            <button
                onClick={onComplete}
                className="flex-none bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-semibold active:scale-95 transition"
            >
                <CheckCircle2 className="w-5 h-5" />
                Erledigt
            </button>
        </div>
    );
};
