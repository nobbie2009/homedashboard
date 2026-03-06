export const getApiUrl = () => {
    const envUrl = import.meta.env.VITE_API_URL;

    // Check if the configured URL points to localhost but we are accessing from an external IP
    // This happens if the Docker build baked in "http://localhost:3001"
    if (envUrl && envUrl.includes('localhost') && window.location.hostname !== 'localhost') {
        return ''; // Use relative path (Nginx proxy)
    }

    // Default fallback for local development (npm run dev) without .env
    if (!envUrl && window.location.hostname === 'localhost') {
        return 'http://localhost:3001';
    }

    return envUrl || '';
};

const DEFAULT_TIMEOUT = 10000;

/**
 * Fetch wrapper with automatic timeout via AbortController.
 */
export const fetchWithTimeout = (
    input: RequestInfo | URL,
    init?: RequestInit,
    timeoutMs = DEFAULT_TIMEOUT
): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(input, { ...init, signal: controller.signal }).finally(() =>
        clearTimeout(timeout)
    );
};
