import { useState, useEffect, useCallback } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import { useSecurity } from '../contexts/SecurityContext';
import { getApiUrl } from '../utils/api';

export interface Lesson {
    id: string;
    startTime: string;
    endTime: string;
    date: string;
    subject: { name: string; short: string };
    classroom: { name: string };
    teacher: { name: string };
    class: { name: string };
}

export interface Homework {
    id: string;
    title: string;
    subject: string;
    date: string;
    done: boolean;
}

export interface Grade {
    subject: string;
    value: string;
    date: string;
}

export interface Message {
    title: string;
    body: string;
    type: string;
    date: string;
}

export interface StudentData {
    name: string;
    timetable: Lesson[];
    homework: Homework[];
    grades: Grade[];
    messages: Message[];
}

export const useEdupage = () => {
    const { config } = useConfig();
    const { deviceId } = useSecurity();
    const [data, setData] = useState<StudentData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const API_URL = getApiUrl();

    const fetchEdupage = useCallback(async () => {
        if (!config.edupage?.username || !config.edupage?.password) {
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${API_URL}/api/edupage`, {
                headers: {
                    'username': config.edupage?.username || '',
                    'password': config.edupage?.password || '',
                    'subdomain': config.edupage?.subdomain || 'login1',
                    'x-device-id': deviceId
                }
            });

            if (res.ok) {
                const json = await res.json();
                setData(json.students || []);
            } else {
                const err = await res.text();
                setError(err || "Failed to fetch Edupage data");
            }
        } catch (e) {
            console.error(e);
            setError("Network Error");
        } finally {
            setLoading(false);
        }
    }, [config.edupage?.username, config.edupage?.password, deviceId]);

    useEffect(() => {
        fetchEdupage();
        // Refresh every 30 minutes
        const interval = setInterval(fetchEdupage, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, [fetchEdupage]);

    return { students: data, loading, error, refresh: fetchEdupage };
};
