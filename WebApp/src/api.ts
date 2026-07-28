import type { AuthResponse, CreateTaskPayload, HelperProfile, Task, TaskStatus, UserRole } from './types';

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
  helperProfile: (token: string) => apiFetch<HelperProfile>('/api/v1/helper/profile', {}, token),
  helperOnline: (token: string, online: boolean, lat?: number, lng?: number) =>
    apiFetch<void>('/api/v1/helper/online', { method: 'PUT', body: JSON.stringify({ online, lat, lng }) }, token),
};
