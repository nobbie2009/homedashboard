import { addDays, setHours, setMinutes } from 'date-fns';

export interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    calendarId: string; // 'family', 'work', 'school'
    color: string;
}

export interface TrashEvent {
    id: string;
    type: 'bio' | 'paper' | 'plastic' | 'rest';
    date: Date;
}

export interface WeatherData {
    temp: number;
    condition: 'sunny' | 'cloudy' | 'rain' | 'snow';
    forecast: { day: string; temp: number; icon: string }[];
}

export interface Note {
    id: string;
    content: string;
    author: string;
    color: string;
    createdAt: Date;
    expiresAt?: Date;
}

export interface Sensor {
    id: string;
    name: string;
    value: string;
    unit?: string;
    icon: 'thermometer' | 'droplet' | 'wind' | 'zap' | 'home' | 'lock' | 'unlock';
    status: 'ok' | 'warning' | 'critical' | 'neutral';
}

export interface SchoolPeriod {
    id: string;
    subject: string;
    room: string;
    time: string;
}

export interface Homework {
    id: string;
    subject: string;
    task: string;
    due: Date;
}

const COLORS = {
    family: 'bg-blue-500',
    work: 'bg-red-500',
    school: 'bg-green-500',
};

// Generate some fake events
const today = new Date();
const tomorrow = addDays(today, 1);

export const mockEvents: CalendarEvent[] = [
    {
        id: '1',
        title: 'Frühstück',
        start: setMinutes(setHours(today, 7), 0),
        end: setMinutes(setHours(today, 7), 30),
        calendarId: 'family',
        color: COLORS.family,
    },
    {
        id: '2',
        title: 'Schule Max',
        start: setMinutes(setHours(today, 8), 0),
        end: setMinutes(setHours(today, 13), 0),
        calendarId: 'school',
        color: COLORS.school,
    },
    {
        id: '3',
        title: 'Meeting',
        start: setMinutes(setHours(today, 10), 0),
        end: setMinutes(setHours(today, 11), 30),
        calendarId: 'work',
        color: COLORS.work,
    },
    {
        id: '4',
        title: 'Fußballtraining',
        start: setMinutes(setHours(today, 17), 0),
        end: setMinutes(setHours(today, 18), 30),
        calendarId: 'family',
        color: COLORS.family,
    },
    {
        id: '5',
        title: 'Zahnarzt',
        start: setMinutes(setHours(tomorrow, 9), 0),
        end: setMinutes(setHours(tomorrow, 10), 0),
        calendarId: 'family',
        color: COLORS.family,
    },
];

export const mockTrash: TrashEvent[] = [
    { id: '1', type: 'bio', date: today },
    { id: '2', type: 'paper', date: addDays(today, 2) },
    { id: '3', type: 'rest', date: addDays(today, 5) },
];

export const mockWeather: WeatherData = {
    temp: 22,
    condition: 'sunny',
    forecast: [
        { day: 'Tomorrow', temp: 24, icon: 'sunny' },
        { day: 'Wed', temp: 20, icon: 'rain' },
    ],
};

export const mockNotes: Note[] = [
    {
        id: '1',
        content: 'Bitte Milch kaufen!',
        author: 'Mama',
        color: 'bg-yellow-200 text-slate-900',
        createdAt: new Date(),
    },
    {
        id: '2',
        content: 'Oma kommt am Sonntag zum Kaffee ☕',
        author: 'Papa',
        color: 'bg-green-200 text-slate-900',
        createdAt: new Date(),
    },
    {
        id: '3',
        content: 'Müll rausbringen nicht vergessen',
        author: 'System',
        color: 'bg-slate-700 text-slate-200',
        createdAt: new Date(),
    },
];

export const mockStatus: Sensor[] = [
    { id: '1', name: 'Wohnzimmer', value: '21.5', unit: '°C', icon: 'thermometer', status: 'ok' },
    { id: '2', name: 'Schlafzimmer', value: '19.0', unit: '°C', icon: 'thermometer', status: 'ok' },
    { id: '3', name: 'Haustür', value: 'Geschlossen', icon: 'lock', status: 'ok' },
    { id: '4', name: 'Fenster Bad', value: 'Offen', icon: 'wind', status: 'warning' },
    { id: '5', name: 'Stromverbrauch', value: '450', unit: 'W', icon: 'zap', status: 'neutral' },
    { id: '6', name: 'Alarmanlage', value: 'Unscharf', icon: 'home', status: 'ok' },
];

export const mockSchool: { timetable: SchoolPeriod[], homework: Homework[] } = {
    timetable: [
        { id: '1', subject: 'Mathe', room: 'R204', time: '08:00 - 09:30' },
        { id: '2', subject: 'Deutsch', room: 'R105', time: '09:50 - 11:20' },
        { id: '3', subject: 'Sport', room: 'Halle', time: '11:40 - 13:10' },
    ],
    homework: [
        { id: '1', subject: 'Mathe', task: 'S. 45 Nr. 3 a-c', due: addDays(today, 1) },
        { id: '2', subject: 'Englisch', task: 'Vokabeln Unit 3', due: addDays(today, 2) },
    ],
};
