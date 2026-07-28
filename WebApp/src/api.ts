import type { AuthResponse, CreateTaskPayload, HelperProfile, Task, TaskSelfieStage, TaskStatus, UserRole } from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://api.mysuperhero.xyz').replace(/\/+$/, '');

type ApiErrorBody = { message?: string; code?: string; details?: { fields?: Record<string, string> } };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  if (!text) return `Request failed (${res.status})`;
  try {
    const body = JSON.parse(text) as ApiErrorBody;
    if (body.details?.fields) return `Please check ${Object.keys(body.details.fields).join(', ')}.`;
    if (body.message) return body.message;
    if (body.code) return body.code;
  } catch {
    return text;
  }
  return `Request failed (${res.status})`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) throw new ApiError(await parseError(res), res.status);
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  signup: (body: { email: string; password: string; phone?: string; displayName?: string; role: UserRole }) =>
    apiFetch<AuthResponse>('/api/v1/auth/password/signup', { method: 'POST', body: JSON.stringify(body) }),
  login: (email: string, password: string) =>
    apiFetch<AuthResponse>('/api/v1/auth/password/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  refresh: (refreshToken: string) =>
    apiFetch<AuthResponse>('/api/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
  startEmailOtp: (email: string) =>
    apiFetch<{ email: string; sent: boolean; devOtp?: string | null }>('/api/v1/auth/email/otp/start', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  verifyEmailOtp: (email: string, otp: string) =>
    apiFetch<AuthResponse>('/api/v1/auth/email/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    }),
  me: (token: string) => apiFetch<AuthResponse['user'] & { createdAt?: string }>('/api/v1/me', {}, token),
  createTask: (token: string, body: CreateTaskPayload) =>
    apiFetch<{ taskId: string; offeredTo: string[] }>('/api/v1/tasks', { method: 'POST', body: JSON.stringify(body) }, token),
  myTasks: (token: string) => apiFetch<Task[]>('/api/v1/tasks/mine', {}, token),
  task: (token: string, taskId: string) => apiFetch<Task>(`/api/v1/tasks/${taskId}`, {}, token),
  availableTasks: (token: string) => apiFetch<Task[]>('/api/v1/tasks/available', {}, token),
  acceptTask: (token: string, taskId: string) =>
    apiFetch<Task>(`/api/v1/tasks/${taskId}/accept`, { method: 'POST' }, token),
  updateTaskStatus: (token: string, taskId: string, status: TaskStatus, otp?: string) =>
    apiFetch<Task>(`/api/v1/tasks/${taskId}/status`, { method: 'POST', body: JSON.stringify({ status, otp: otp || null }) }, token),
  uploadTaskSelfie: (
    token: string,
    taskId: string,
    stage: TaskSelfieStage,
    selfie: File,
    lat: number,
    lng: number,
    addressText?: string | null,
  ) => {
    const body = new FormData();
    body.set('stage', stage);
    body.set('lat', String(lat));
    body.set('lng', String(lng));
    if (addressText) body.set('addressText', addressText);
    body.set('capturedAt', new Date().toISOString());
    body.set('selfie', selfie);
    return apiFetch<Task>(`/api/v1/tasks/${taskId}/selfie`, { method: 'POST', body }, token);
  },
  helperProfile: (token: string) => apiFetch<HelperProfile>('/api/v1/helper/profile', {}, token),
  submitKyc: (
    token: string,
    fullName: string,
    docType: string,
    idNumber: string,
    idFront: File,
    idBack?: File | null,
    selfie?: File | null,
  ) => {
    const body = new FormData();
    body.set('fullName', fullName);
    if (docType) body.set('docType', docType);
    body.set('idNumber', idNumber);
    body.set('idFront', idFront);
    if (idBack) body.set('idBack', idBack);
    if (selfie) body.set('selfie', selfie);
    return apiFetch<HelperProfile>('/api/v1/helper/kyc/submit', { method: 'POST', body }, token);
  },
  helperOnline: (token: string, online: boolean, lat?: number, lng?: number) =>
    apiFetch<void>('/api/v1/helper/online', { method: 'PUT', body: JSON.stringify({ online, lat, lng }) }, token),
};

export interface LocationSuggestion {
  description: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  provider: 'osm' | 'ola' | 'google';
}

const OLA_MAPS_API_KEY = import.meta.env.VITE_OLA_MAPS_API_KEY || '';
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export async function searchLocations(query: string): Promise<LocationSuggestion[]> {
  if (!query || query.trim().length < 2) return [];

  // 1. Try OSM Nominatim first
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=5`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en'
      }
    });
    if (res.ok) {
      const data = await res.json() as any[];
      if (Array.isArray(data) && data.length > 0) {
        return data.map(item => ({
          description: item.display_name,
          lat: Number(item.lat),
          lng: Number(item.lon),
          provider: 'osm'
        }));
      }
    }
  } catch (err) {
    console.warn("OSM Nominatim search failed, trying Ola Maps:", err);
  }

  // 2. Fallback to Ola Maps
  if (OLA_MAPS_API_KEY) {
    try {
      const url = `https://api.olamaps.io/places/v1/autocomplete?input=${encodeURIComponent(query)}&api_key=${OLA_MAPS_API_KEY}`;
      const res = await fetch(url, {
        headers: {
          'X-Request-Id': 'web-mvp-' + Math.random().toString(36).substring(2, 9)
        }
      });
      if (res.ok) {
        const data = await res.json() as any;
        if (data && Array.isArray(data.predictions)) {
          return data.predictions.map((p: any) => ({
            description: p.description,
            placeId: p.place_id,
            provider: 'ola'
          }));
        }
      }
    } catch (err) {
      console.warn("Ola Maps autocomplete failed, trying Google Maps:", err);
    }
  }

  // 3. Fallback to Google Maps
  if (GOOGLE_MAPS_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as any;
        if (data && Array.isArray(data.predictions)) {
          return data.predictions.map((p: any) => ({
            description: p.description,
            placeId: p.place_id,
            provider: 'google'
          }));
        }
      }
    } catch (err) {
      console.error("Google Maps autocomplete failed:", err);
    }
  }

  return [];
}

export async function resolveLocationCoords(suggestion: LocationSuggestion): Promise<{ lat: number; lng: number } | null> {
  if (suggestion.provider === 'osm' && suggestion.lat !== undefined && suggestion.lng !== undefined) {
    return { lat: suggestion.lat, lng: suggestion.lng };
  }

  if (suggestion.provider === 'ola' && suggestion.placeId) {
    try {
      const url = `https://api.olamaps.io/places/v1/details?place_id=${encodeURIComponent(suggestion.placeId)}&api_key=${OLA_MAPS_API_KEY}`;
      const res = await fetch(url, {
        headers: {
          'X-Request-Id': 'web-mvp-' + Math.random().toString(36).substring(2, 9)
        }
      });
      if (res.ok) {
        const data = await res.json() as any;
        const location = data?.result?.geometry?.location;
        if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
          return { lat: location.lat, lng: location.lng };
        }
      }
    } catch (err) {
      console.error("Failed to resolve Ola Maps details:", err);
    }
  }

  if (suggestion.provider === 'google' && suggestion.placeId && GOOGLE_MAPS_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(suggestion.placeId)}&fields=geometry&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as any;
        const location = data?.result?.geometry?.location;
        if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
          return { lat: location.lat, lng: location.lng };
        }
      }
    } catch (err) {
      console.error("Failed to resolve Google Maps details:", err);
    }
  }

  return null;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  // 1. Try OSM Nominatim first
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en'
      }
    });
    if (res.ok) {
      const data = await res.json() as any;
      if (data && data.display_name) {
        return data.display_name;
      }
    }
  } catch (err) {
    console.warn("OSM Nominatim reverse geocode failed, trying Ola Maps:", err);
  }

  // 2. Try Ola Maps
  if (OLA_MAPS_API_KEY) {
    try {
      const url = `https://api.olamaps.io/places/v1/reverse-geocode?latlng=${lat},${lng}&api_key=${OLA_MAPS_API_KEY}`;
      const res = await fetch(url, {
        headers: {
          'X-Request-Id': 'web-mvp-' + Math.random().toString(36).substring(2, 9)
        }
      });
      if (res.ok) {
        const data = await res.json() as any;
        const address = data?.results?.[0]?.formatted_address || data?.results?.[0]?.name || data?.results?.[0]?.description;
        if (address) {
          return address;
        }
      }
    } catch (err) {
      console.warn("Ola Maps reverse geocode failed, trying Google Maps:", err);
    }
  }

  // 3. Try Google Maps
  if (GOOGLE_MAPS_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as any;
        const address = data?.results?.[0]?.formatted_address;
        if (address) {
          return address;
        }
      }
    } catch (err) {
      console.error("Google Maps reverse geocode failed:", err);
    }
  }

  return null;
}
