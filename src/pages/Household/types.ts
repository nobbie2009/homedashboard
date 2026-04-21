import type { HouseholdMember, HouseholdTask } from '../../contexts/ConfigContext';

export interface HouseholdStateResponse {
    tasks: HouseholdTask[];
    members: HouseholdMember[];
    now: number;
}

export interface CompleteResponse {
    task: HouseholdTask;
    completedAt: number;
}
