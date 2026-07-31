import type { AuthResponse, CreateTaskPayload, HelperProfile, SupportMessage, SupportTicket, SupportTicketCategory, SupportTicketDetail, Task, TaskSelfieStage, TaskStatus, UserRole } from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://api.mysuperhero.xyz').replace(/\/+$/, '');
export const WEB_DEMO_MODE = String(import.meta.env.VITE_WEBAPP_DEMO_MODE || 'true').toLowerCase() !== 'false';
const DEMO_TOKEN_PREFIX = 'demo-webapp-';
const DEMO_TASKS_KEY = 'superherooo_demo_tasks_v1';
const DEMO_CHAT_KEY = 'superherooo_demo_chat_v1';
const DEMO_SUPPORT_KEY = 'superherooo_demo_support_v1';

const demoBuyer = {
  id: 'demo-buyer',
  role: 'BUYER' as UserRole,
  phone: '9000000001',
  email: 'demo.citizen@superherooo.com',
  emailVerified: true,
  displayName: 'Demo Citizen',
  bulkCsvEnabled: false,
};

const demoHelper = {
  id: 'demo-helper',
  role: 'HELPER' as UserRole,
  phone: '9000000002',
  email: 'demo.partner@superherooo.com',
  emailVerified: true,
  displayName: 'Demo Partner',
  bulkCsvEnabled: false,
};

export function demoAuthForRole(role: 'BUYER' | 'HELPER'): AuthResponse {
  return {
    accessToken: `${DEMO_TOKEN_PREFIX}access-${role.toLowerCase()}`,
    refreshToken: `${DEMO_TOKEN_PREFIX}refresh-${role.toLowerCase()}`,
    user: role === 'HELPER' ? demoHelper : demoBuyer,
  };
}

export function isDemoToken(token?: string | null) {
  return WEB_DEMO_MODE && Boolean(token?.startsWith(DEMO_TOKEN_PREFIX));
}

function demoNow() {
  return new Date().toISOString();
}

function demoId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function demoRoleFromToken(token?: string | null): 'BUYER' | 'HELPER' {
  return token?.includes('helper') ? 'HELPER' : 'BUYER';
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('superherooo-demo-updated', { detail: { key } }));
}

function seedDemoTasks(): Task[] {
  const existing = readJson<Task[] | null>(DEMO_TASKS_KEY, null);
  if (existing) return existing;
  const seeded: Task[] = [{
    id: 'demo-task-seeded',
    buyerId: demoBuyer.id,
    buyerPhone: demoBuyer.phone,
    buyerName: demoBuyer.displayName,
    title: 'Pickup documents',
    description: 'Collect a small envelope from reception and deliver it nearby.',
    urgency: 'NORMAL',
    timeMinutes: 45,
    budgetPaise: 24900,
    lat: 17.385,
    lng: 78.4867,
    addressText: 'Banjara Hills, Hyderabad, Telangana',
    scheduledAt: null,
    status: 'SEARCHING',
    assignedHelperId: null,
    helperPhone: null,
    helperName: null,
    arrivalOtp: '123456',
    completionOtp: '654321',
    createdAt: demoNow(),
    landmark: 'Near main gate',
    paymentCollectionMode: 'PAY_AFTER_SERVICE',
    verificationMode: 'PHOTO_AND_OTP',
  }];
  writeJson(DEMO_TASKS_KEY, seeded);
  return seeded;
}

function getDemoTasks() {
  return seedDemoTasks();
}

function saveDemoTasks(tasks: Task[]) {
  writeJson(DEMO_TASKS_KEY, tasks);
}

function replaceDemoTask(task: Task) {
  const tasks = getDemoTasks().map((item) => item.id === task.id ? task : item);
  saveDemoTasks(tasks);
  return task;
}

function getDemoTask(taskId: string) {
  const task = getDemoTasks().find((item) => item.id === taskId);
  if (!task) throw new ApiError('Demo task not found.', 404);
  return task;
}

function demoSelfieUrl(stage: TaskSelfieStage) {
  const color = stage === 'ARRIVAL' ? '#10b981' : '#0f1932';
  const label = stage === 'ARRIVAL' ? 'Arrival selfie uploaded' : 'Completion selfie uploaded';
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" rx="32" fill="${color}"/><circle cx="320" cy="158" r="62" fill="#fff" opacity=".92"/><rect x="178" y="238" width="284" height="92" rx="46" fill="#fff" opacity=".92"/><text x="320" y="374" fill="#fff" font-family="Arial" font-size="28" font-weight="700" text-anchor="middle">${label}</text></svg>`)}`;
}

function getDemoMessages(taskId: string) {
  const all = readJson<Record<string, SupportMessage[] | ChatMessageLike[]>>(DEMO_CHAT_KEY, {});
  return (all[taskId] || []) as ChatMessageLike[];
}

type ChatMessageLike = {
  id: string;
  taskId: string;
  senderUserId: string;
  senderRole: UserRole;
  senderName?: string | null;
  message: string;
  createdAt: string;
};

function saveDemoMessages(taskId: string, messages: ChatMessageLike[]) {
  const all = readJson<Record<string, ChatMessageLike[]>>(DEMO_CHAT_KEY, {});
  all[taskId] = messages;
  writeJson(DEMO_CHAT_KEY, all);
}

const demoApi = {
  createTask: async (_token: string, body: CreateTaskPayload) => {
    const task: Task = {
      id: demoId('demo-task'),
      buyerId: demoBuyer.id,
      buyerPhone: demoBuyer.phone,
      buyerName: demoBuyer.displayName,
      title: body.title,
      description: body.description,
      urgency: body.urgency,
      timeMinutes: body.timeMinutes,
      budgetPaise: body.budgetPaise,
      lat: body.lat,
      lng: body.lng,
      addressText: body.addressText || null,
      scheduledAt: body.scheduledAt || null,
      status: body.scheduledAt ? 'SCHEDULED_PENDING' : 'SEARCHING',
      assignedHelperId: null,
      helperPhone: null,
      helperName: null,
      arrivalOtp: '123456',
      completionOtp: '654321',
      createdAt: demoNow(),
      landmark: body.landmark || null,
      paymentCollectionMode: 'PAY_AFTER_SERVICE',
      verificationMode: 'PHOTO_AND_OTP',
    };
    saveDemoTasks([task, ...getDemoTasks()]);
    return { taskId: task.id, offeredTo: [demoHelper.id] };
  },
  myTasks: async (token: string) => {
    const role = demoRoleFromToken(token);
    const tasks = getDemoTasks();
    if (role === 'HELPER') {
      return tasks.filter((task) => task.assignedHelperId === demoHelper.id || ['ASSIGNED', 'ARRIVED', 'STARTED', 'COMPLETED'].includes(task.status));
    }
    return tasks.filter((task) => task.buyerId === demoBuyer.id);
  },
  task: async (_token: string, taskId: string) => getDemoTask(taskId),
  availableTasks: async () => getDemoTasks().filter((task) => ['SEARCHING', 'SCHEDULED_PENDING'].includes(task.status)),
  acceptTask: async (_token: string, taskId: string) => {
    const task = getDemoTask(taskId);
    if (task.assignedHelperId && task.assignedHelperId !== demoHelper.id) throw new ApiError('Another partner just took this job.', 409);
    return replaceDemoTask({
      ...task,
      status: 'ASSIGNED',
      assignedHelperId: demoHelper.id,
      helperPhone: demoHelper.phone,
      helperName: demoHelper.displayName,
    });
  },
  updateTaskStatus: async (_token: string, taskId: string, status: TaskStatus, otp?: string) => {
    const task = getDemoTask(taskId);
    if (status === 'ARRIVED' && !task.arrivalSelfieUrl) throw new ApiError('Please upload arrival selfie first.', 400);
    if (status === 'STARTED' && otp !== task.arrivalOtp) throw new ApiError('Incorrect OTP.', 400);
    if (status === 'COMPLETED' && !task.completionSelfieUrl) throw new ApiError('Please upload completion selfie first.', 400);
    if (status === 'COMPLETED' && otp !== task.completionOtp) throw new ApiError('Incorrect OTP.', 400);
    return replaceDemoTask({
      ...task,
      status,
      workStartedAt: status === 'STARTED' ? demoNow() : task.workStartedAt,
    });
  },
  uploadTaskSelfie: async (_token: string, taskId: string, stage: TaskSelfieStage, _selfie: File, lat: number, lng: number, addressText?: string | null) => {
    const task = getDemoTask(taskId);
    const capturedAt = demoNow();
    if (stage === 'ARRIVAL') {
      return replaceDemoTask({
        ...task,
        arrivalSelfieUrl: demoSelfieUrl(stage),
        arrivalSelfieLat: lat,
        arrivalSelfieLng: lng,
        arrivalSelfieAddress: addressText || task.addressText || null,
        arrivalSelfieCapturedAt: capturedAt,
      });
    }
    return replaceDemoTask({
      ...task,
      completionSelfieUrl: demoSelfieUrl(stage),
      completionSelfieLat: lat,
      completionSelfieLng: lng,
      completionSelfieAddress: addressText || task.addressText || null,
      completionSelfieCapturedAt: capturedAt,
    });
  },
  helperProfile: async (): Promise<HelperProfile> => ({
    kycStatus: 'APPROVED',
    kycFullName: demoHelper.displayName,
    kycIdNumber: 'DEMO-APPROVED',
    kycTokenNumber: 'DEMO-001',
  }),
  submitKyc: async (): Promise<HelperProfile> => ({
    kycStatus: 'APPROVED',
    kycFullName: demoHelper.displayName,
    kycIdNumber: 'DEMO-APPROVED',
  }),
  helperOnline: async () => undefined,
  getTaskChatMessages: async (_token: string, taskId: string) => getDemoMessages(taskId),
  sendTaskChatMessage: async (token: string, taskId: string, message: string) => {
    const role = demoRoleFromToken(token);
    const msg: ChatMessageLike = {
      id: demoId('demo-chat'),
      taskId,
      senderUserId: role === 'HELPER' ? demoHelper.id : demoBuyer.id,
      senderRole: role,
      senderName: role === 'HELPER' ? demoHelper.displayName : demoBuyer.displayName,
      message,
      createdAt: demoNow(),
    };
    saveDemoMessages(taskId, [...getDemoMessages(taskId), msg]);
    return msg;
  },
  createSupportTicket: async (_token: string, body: { category: SupportTicketCategory; subject?: string | null; message: string; relatedTaskId?: string | null }): Promise<SupportTicketDetail> => {
    const ticketId = demoId('demo-ticket');
    const ticket: SupportTicketDetail = {
      id: ticketId,
      category: body.category,
      subject: body.subject || categoryLabel(body.category),
      status: 'OPEN',
      priority: 'NORMAL',
      relatedTaskId: body.relatedTaskId || null,
      lastMessageAt: demoNow(),
      createdAt: demoNow(),
      messages: [{
        id: demoId('demo-support-message'),
        ticketId,
        authorType: 'USER',
        authorUserId: demoBuyer.id,
        message: body.message,
        createdAt: demoNow(),
      }],
    };
    writeJson(DEMO_SUPPORT_KEY, [ticket, ...readJson<SupportTicketDetail[]>(DEMO_SUPPORT_KEY, [])]);
    return ticket;
  },
  supportTickets: async (): Promise<SupportTicket[]> => readJson<SupportTicketDetail[]>(DEMO_SUPPORT_KEY, []),
  supportTicket: async (_token: string, ticketId: string): Promise<SupportTicketDetail> => {
    const ticket = readJson<SupportTicketDetail[]>(DEMO_SUPPORT_KEY, []).find((item) => item.id === ticketId);
    if (!ticket) throw new ApiError('Support ticket not found.', 404);
    return ticket;
  },
  addSupportMessage: async (_token: string, ticketId: string, message: string): Promise<SupportMessage> => {
    const tickets = readJson<SupportTicketDetail[]>(DEMO_SUPPORT_KEY, []);
    const msg: SupportMessage = { id: demoId('demo-support-message'), ticketId, authorType: 'USER', authorUserId: demoBuyer.id, message, createdAt: demoNow() };
    const next = tickets.map((ticket) => ticket.id === ticketId ? { ...ticket, messages: [...(ticket.messages || []), msg], lastMessageAt: msg.createdAt } : ticket);
    writeJson(DEMO_SUPPORT_KEY, next);
    return msg;
  },
};

function categoryLabel(category: string) {
  return category.replace(/_/g, ' ').toLowerCase();
}

type ApiErrorBody = { message?: string; code?: string; details?: { fields?: Record<string, string> } };

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function parseError(res: Response): Promise<{ message: string; code?: string }> {
  const text = await res.text().catch(() => '');
  if (!text) return { message: `Request failed (${res.status})` };
  try {
    const body = JSON.parse(text) as ApiErrorBody;
    if (body.details?.fields) return { message: `Please check ${Object.keys(body.details.fields).join(', ')}.`, code: body.code };
    if (body.message) return { message: body.message, code: body.code };
    if (body.code) return { message: body.code, code: body.code };
  } catch {
    return { message: text };
  }
  return { message: `Request failed (${res.status})` };
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const parsed = await parseError(res);
    throw new ApiError(parsed.message, res.status, parsed.code);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

type UserCopy = { title?: string; message: string };

const safeErrorByCode: Record<string, UserCopy> = {
  RATE_LIMIT: { title: 'Too many attempts', message: 'Please wait a minute before trying again.' },
};

const safeErrorByMessage: Array<{ pattern: RegExp; copy: UserCopy }> = [
  { pattern: /invalid credentials/i, copy: { message: 'That email or password is incorrect.' } },
  { pattern: /password login not enabled/i, copy: { message: 'This account needs a password. Use Forgot password to set one.' } },
  { pattern: /email already in use/i, copy: { message: 'An account with this email already exists. Try signing in instead.' } },
  { pattern: /phone already in use/i, copy: { message: 'This mobile number is already registered.' } },
  { pattern: /phone number is required/i, copy: { message: 'Enter your 10-digit mobile number for service coordination.' } },
  { pattern: /valid 10-digit Indian mobile number|valid Indian mobile number/i, copy: { message: 'Enter a valid 10-digit Indian mobile number.' } },
  { pattern: /name is required/i, copy: { message: 'Enter your full name.' } },
  { pattern: /password must be at least/i, copy: { message: 'Use a password with at least 8 characters.' } },
  { pattern: /password must contain at least one letter and one number/i, copy: { message: 'Use a password with at least one letter and one number.' } },
  { pattern: /invalid or expired reset code/i, copy: { message: 'That code is incorrect or has expired. Request a new one.' } },
  { pattern: /incorrect otp|invalid verification code|invalid otp/i, copy: { message: 'That code is incorrect. Please check and try again.' } },
  { pattern: /user is not active/i, copy: { title: 'Account unavailable', message: 'This account is unavailable. Contact support for help.' } },
  { pattern: /must be created by an admin/i, copy: { message: 'This account type is created by our team. Contact support to get access.' } },
  { pattern: /hyderabad only|outside service area/i, copy: { title: 'Outside our service area', message: 'Superherooo is not available at this location yet. Please choose a supported area.' } },
  { pattern: /verify your email/i, copy: { message: 'Please verify your email address before booking.' } },
  { pattern: /already assigned|offer already responded/i, copy: { message: 'Another partner just took this job.' } },
  { pattern: /helper location is not available/i, copy: { message: 'Please go online with location access enabled.' } },
  { pattern: /too far/i, copy: { message: 'This job is outside your current nearby range.' } },
];

export function toUserCopy(error: unknown): UserCopy {
  if (error instanceof ApiError) {
    if (error.code && safeErrorByCode[error.code]) return safeErrorByCode[error.code];
    if (error.status === 429) return safeErrorByCode.RATE_LIMIT;
    if (error.status >= 500) return { message: 'We are having trouble on our end. Please try again in a moment.' };
    const raw = error.message || '';
    for (const { pattern, copy } of safeErrorByMessage) {
      if (pattern.test(raw)) return copy;
    }
    if (error.status >= 400 && error.status < 500 && raw && raw.length < 140 && !/^Request failed/i.test(raw)) {
      return { message: raw };
    }
    return { message: 'Something went wrong. Please try again.' };
  }
  const text = error instanceof Error ? error.message : String(error ?? '');
  if (/abort|timeout/i.test(text)) return { title: 'Taking too long', message: 'The request timed out. Please try again.' };
  if (/network|fetch|connection|failed to fetch/i.test(text)) return { title: 'No connection', message: 'Check your internet connection and try again.' };
  return { message: 'Something went wrong. Please try again.' };
}

export function toUserMessage(error: unknown): string {
  return toUserCopy(error).message;
}

export const api = {
  signup: (body: { email: string; password: string; phone: string; displayName: string; role: UserRole }) =>
    apiFetch<AuthResponse>('/api/v1/auth/password/signup', { method: 'POST', body: JSON.stringify(body) }),
  login: (email: string, password: string) =>
    apiFetch<AuthResponse>('/api/v1/auth/password/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  refresh: (refreshToken: string) =>
    apiFetch<AuthResponse>('/api/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
  forgotPassword: (email: string) =>
    apiFetch<{ email: string; sent: boolean; devOtp?: string | null }>('/api/v1/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (email: string, otp: string, newPassword: string) =>
    apiFetch<AuthResponse>('/api/v1/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ email, otp, newPassword }),
    }),
  logout: (refreshToken: string) =>
    apiFetch<void>('/api/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
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
    isDemoToken(token) ? demoApi.createTask(token, body) : apiFetch<{ taskId: string; offeredTo: string[] }>('/api/v1/tasks', { method: 'POST', body: JSON.stringify(body) }, token),
  myTasks: (token: string) => isDemoToken(token) ? demoApi.myTasks(token) : apiFetch<Task[]>('/api/v1/tasks/mine', {}, token),
  task: (token: string, taskId: string) => isDemoToken(token) ? demoApi.task(token, taskId) : apiFetch<Task>(`/api/v1/tasks/${taskId}`, {}, token),
  availableTasks: (token: string) => isDemoToken(token) ? demoApi.availableTasks() : apiFetch<Task[]>('/api/v1/tasks/available', {}, token),
  acceptTask: (token: string, taskId: string) =>
    isDemoToken(token) ? demoApi.acceptTask(token, taskId) : apiFetch<Task>(`/api/v1/tasks/${taskId}/accept`, { method: 'POST' }, token),
  updateTaskStatus: (token: string, taskId: string, status: TaskStatus, otp?: string) =>
    isDemoToken(token) ? demoApi.updateTaskStatus(token, taskId, status, otp) : apiFetch<Task>(`/api/v1/tasks/${taskId}/status`, { method: 'POST', body: JSON.stringify({ status, otp: otp || null }) }, token),
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
    return isDemoToken(token) ? demoApi.uploadTaskSelfie(token, taskId, stage, selfie, lat, lng, addressText) : apiFetch<Task>(`/api/v1/tasks/${taskId}/selfie`, { method: 'POST', body }, token);
  },
  helperProfile: (token: string) => isDemoToken(token) ? demoApi.helperProfile() : apiFetch<HelperProfile>('/api/v1/helper/profile', {}, token),
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
    return isDemoToken(token) ? demoApi.submitKyc() : apiFetch<HelperProfile>('/api/v1/helper/kyc/submit', { method: 'POST', body }, token);
  },
  helperOnline: (token: string, online: boolean, lat?: number, lng?: number) =>
    isDemoToken(token) ? demoApi.helperOnline() : apiFetch<void>('/api/v1/helper/online', { method: 'PUT', body: JSON.stringify({ online, lat, lng }) }, token),
  getTaskChatMessages: (token: string, taskId: string) =>
    isDemoToken(token) ? demoApi.getTaskChatMessages(token, taskId) : apiFetch<import('./types').ChatMessage[]>(`/api/v1/tasks/${taskId}/chat/messages`, {}, token),
  sendTaskChatMessage: (token: string, taskId: string, message: string) =>
    isDemoToken(token) ? demoApi.sendTaskChatMessage(token, taskId, message) : apiFetch<import('./types').ChatMessage>(`/api/v1/tasks/${taskId}/chat/messages`, { method: 'POST', body: JSON.stringify({ message }) }, token),
  createSupportTicket: (
    token: string,
    body: { category: SupportTicketCategory; subject?: string | null; message: string; relatedTaskId?: string | null },
  ) => isDemoToken(token) ? demoApi.createSupportTicket(token, body) : apiFetch<SupportTicketDetail>('/api/v1/support/tickets', { method: 'POST', body: JSON.stringify(body) }, token),
  supportTickets: (token: string) => isDemoToken(token) ? demoApi.supportTickets() : apiFetch<SupportTicket[]>('/api/v1/support/tickets', {}, token),
  supportTicket: (token: string, ticketId: string) => isDemoToken(token) ? demoApi.supportTicket(token, ticketId) : apiFetch<SupportTicketDetail>(`/api/v1/support/tickets/${ticketId}`, {}, token),
  addSupportMessage: (token: string, ticketId: string, message: string) =>
    isDemoToken(token) ? demoApi.addSupportMessage(token, ticketId, message) : apiFetch<import('./types').SupportMessage>(`/api/v1/support/tickets/${ticketId}/messages`, { method: 'POST', body: JSON.stringify({ message }) }, token),
};

export interface LocationSuggestion {
  description: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  provider: 'osm' | 'photon' | 'ola' | 'google';
}

const OLA_MAPS_API_KEY = import.meta.env.VITE_OLA_MAPS_API_KEY || '';
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export async function searchLocations(query: string): Promise<LocationSuggestion[]> {
  if (!query || query.trim().length < 2) return [];

  // 1. Try browser-safe OSM Nominatim first
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`;
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
    console.warn("OSM Nominatim search failed, trying Photon:", err);
  }

  // 2. Photon is CORS-friendly and returns coordinates directly.
  try {
    const url = `https://photon.komoot.io/api/?limit=6&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json() as any;
      const features = Array.isArray(data?.features) ? data.features : [];
      if (features.length > 0) {
        return features.map((feature: any) => {
          const props = feature.properties || {};
          const coords = feature.geometry?.coordinates || [];
          const label = [props.name, props.street, props.city, props.state, props.country].filter(Boolean).join(', ');
          return {
            description: label || props.name || query,
            lat: Number(coords[1]),
            lng: Number(coords[0]),
            provider: 'photon' as const,
          };
        }).filter((item: LocationSuggestion) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
      }
    }
  } catch (err) {
    console.warn("Photon search failed, trying Ola Maps:", err);
  }

  // 3. Fallback to Ola Maps
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

  // 4. Fallback to Google Maps
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
  if ((suggestion.provider === 'osm' || suggestion.provider === 'photon') && suggestion.lat !== undefined && suggestion.lng !== undefined) {
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
