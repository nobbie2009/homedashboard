import type { BathroomItem, BathroomSchedule, Kid } from '../../contexts/ConfigContext';

export type WindowName = 'morning' | 'evening' | 'none';

export interface CompletedEntry {
    timestamp: number;
    window: 'morning' | 'evening';
    linkedChoreCompletionId?: string;
}

export interface BathroomStateResponse {
    currentWindow: WindowName;
    schedule: BathroomSchedule;
    items: BathroomItem[];
    completed: Record<string, CompletedEntry>;
    kids: Kid[];
    nextWindow: { name: 'morning' | 'evening'; startsAt: string } | null;
    completedAt?: number;
    linkedChoreWarning?: boolean;
}
