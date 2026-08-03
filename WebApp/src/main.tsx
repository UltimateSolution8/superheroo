import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams, useLocation } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BriefcaseBusiness,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Home,
  Image as ImageIcon,
  Inbox,
  Languages,
  LifeBuoy,
  LocateFixed,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  Mic,
  Navigation,
  Phone,
  Pin,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  User,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { ApiError, WEB_DEMO_MODE, api, demoAuthForRole, isDemoToken, searchLocations, resolveLocationCoords, reverseGeocode, toUserMessage, verifyIfscCode, type IfscLookupResult, type LocationSuggestion } from './api';
import type { AuthResponse, AuthUser, ChatMessage, CreateTaskPayload, HelperProfile, SavedAddress, SupportTicket, SupportTicketCategory, Task, TaskSelfieStage, TaskStatus, TaskUrgency, UserRole } from './types';
import './styles.css';
import logo from "../public/superlogo.png";
import superhero from "../public/hero.jpeg"

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || 'https://realtime.mysuperhero.xyz').replace(/\/+$/, '');
const showDevOtp = String(import.meta.env.VITE_DEV_SHOW_OTP || 'true').toLowerCase() === 'true';
const legacyAuthKey = 'superherooo_web_auth';
const authKeyPrefix = 'superherooo_web_auth_';
const authNoticeKey = 'superherooo_auth_notice';
const savedAddressesKey = 'superherooo_saved_addresses';
const staticRedirectKey = 'superherooo_app_redirect';
const installIntentKey = 'superherooo_pwa_install_intent';
const activeStatuses: TaskStatus[] = ['AI_PENDING', 'AI_APPROVED', 'ADMIN_REVIEW', 'ADMIN_APPROVED', 'PAYMENT_PENDING', 'SCHEDULED_PENDING', 'SEARCHING', 'ASSIGNED', 'ARRIVED', 'STARTED'];
const partnerOnlineKey = 'superherooo_partner_online';
const partnerLastLocationKey = 'superherooo_partner_last_location';
const languageKey = 'superherooo_language';

const bannedPasswords = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', 'qwerty123',
  'superheroo', 'superherooo', 'admin@123', 'admin@12345', 'welcome1', 'iloveyou',
  'letmein1', 'abcd1234', 'test1234', 'changeme',
]);

function normalizeIndianMobile(raw: string) {
  const digits = (raw || '').replace(/\D+/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits.slice(-10);
}

function isValidIndianMobile(raw: string) {
  return /^[6-9]\d{9}$/.test(normalizeIndianMobile(raw));
}

function passwordProblem(raw: string) {
  const password = raw || '';
  if (password.length < 8) return 'Use a password with at least 8 characters.';
  if (password.length > 128) return 'Use a password with at most 128 characters.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Use a password with at least one letter and one number.';
  if (bannedPasswords.has(password.toLowerCase())) return 'Choose a stronger password.';
  return null;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type AuthState = { accessToken: string | null; refreshToken: string | null; user: AuthUser | null; loading: boolean };
type AuthContextValue = AuthState & {
  applyAuth: (auth: AuthResponse) => void;
  logout: () => void;
  setUser: (user: AuthUser) => void;
};

function authKeyForRole(role: UserRole) {
  return `${authKeyPrefix}${role}`;
}

function roleIntentFromPath(pathname = window.location.pathname): 'BUYER' | 'HELPER' {
  return pathname.includes('/partner') ? 'HELPER' : 'BUYER';
}

function storedAuthForRole(role: UserRole): AuthResponse | null {
  try {
    const raw = localStorage.getItem(authKeyForRole(role));
    if (!raw) return null;
    const auth = JSON.parse(raw) as AuthResponse;
    if (auth.user?.role !== role) return null;
    return auth;
  } catch {
    localStorage.removeItem(authKeyForRole(role));
    return null;
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

/* Toast Notification System */
type ToastItem = { id: string; message: string; type: 'success' | 'error' | 'info' };
type ToastContextValue = { showToast: (message: string, type?: 'success' | 'error' | 'info') => void };
const ToastContext = createContext<ToastContextValue | null>(null);

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = String(Date.now() + Math.random());
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span className="toast-icon">{t.type === 'success' ? <CheckCircle2 size={18} /> : t.type === 'error' ? <AlertTriangle size={18} /> : <Bell size={18} />}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { showToast: (msg: string) => console.log(msg) };
  return ctx;
}

/* Offline Connection Banner */
function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="offline-banner" role="alert">
      <AlertTriangle size={16} /> Internet connection lost. Reconnecting to Superherooo...
    </div>
  );
}

function loadStoredAuth(): Omit<AuthState, 'loading'> {
  if (WEB_DEMO_MODE) {
    const role = roleIntentFromPath();
    const auth = demoAuthForRole(role);
    return { accessToken: auth.accessToken, refreshToken: auth.refreshToken, user: auth.user };
  }
  const auth = storedAuthForRole(roleIntentFromPath());
  return auth
    ? { accessToken: auth.accessToken, refreshToken: auth.refreshToken, user: auth.user }
    : { accessToken: null, refreshToken: null, user: null };
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({ ...loadStoredAuth(), loading: true }));
  const refreshRef = useRef<Promise<AuthResponse> | null>(null);

  const applyAuth = useCallback((auth: AuthResponse) => {
    localStorage.setItem(authKeyForRole(auth.user.role), JSON.stringify(auth));
    localStorage.removeItem(legacyAuthKey);
    setState({ accessToken: auth.accessToken, refreshToken: auth.refreshToken, user: auth.user, loading: false });
  }, []);

  const setUser = useCallback((user: AuthUser) => {
    setState((current) => {
      if (!current.accessToken || !current.refreshToken) return current;
      const next = { accessToken: current.accessToken, refreshToken: current.refreshToken, user };
      localStorage.setItem(authKeyForRole(user.role), JSON.stringify(next));
      return { ...next, loading: false };
    });
  }, []);

  const clearAuth = useCallback((notice?: string) => {
    if (notice) sessionStorage.setItem(authNoticeKey, notice);
    const role = state.user?.role || roleIntentFromPath();
    localStorage.removeItem(authKeyForRole(role));
    localStorage.removeItem(legacyAuthKey);
    setState({ accessToken: null, refreshToken: null, user: null, loading: false });
  }, [state.user?.role]);

  const logout = useCallback(() => {
    if (WEB_DEMO_MODE) {
      const auth = demoAuthForRole(roleIntentFromPath());
      setState({ accessToken: auth.accessToken, refreshToken: auth.refreshToken, user: auth.user, loading: false });
      return;
    }
    const refreshToken = state.refreshToken;
    if (refreshToken) api.logout(refreshToken).catch(() => undefined);
    clearAuth();
  }, [clearAuth, state.refreshToken]);

  useEffect(() => {
    if (WEB_DEMO_MODE) {
      const role = roleIntentFromPath();
      applyAuth(demoAuthForRole(role));
      return;
    }
    const stored = loadStoredAuth();
    if (!stored.refreshToken) {
      setState({ ...stored, loading: false });
      return;
    }
    refreshRef.current = api.refresh(stored.refreshToken);
    refreshRef.current.then(applyAuth).catch((err) => {
      if (err instanceof ApiError && [400, 401, 403].includes(err.status)) {
        clearAuth('Please sign in again.');
        return;
      }
      setState({ ...stored, loading: false });
    });
  }, [applyAuth, clearAuth]);

  const value = useMemo(() => ({ ...state, applyAuth, logout, setUser }), [state, applyAuth, logout, setUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider missing');
  return ctx;
}

function useSocket() {
  const { accessToken, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (isDemoToken(accessToken)) {
      setSocket(null);
      return;
    }
    if (!accessToken || !user) {
      setSocket(null);
      return;
    }
    const s = io(SOCKET_URL, { auth: { token: accessToken }, transports: ['websocket', 'polling'] });
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [accessToken, user?.id]);

  return socket;
}

function requestNotificationPermission() {
  if (!('Notification' in window)) return Promise.resolve('unsupported');
  if (Notification.permission === 'granted') return Promise.resolve('granted');
  if (Notification.permission === 'denied') return Promise.resolve('denied');
  return Notification.requestPermission();
}

function registerPwaServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const canRegister = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  if (!canRegister) return;
  const register = () => {
    navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch((error) => {
      console.warn('Superherooo PWA registration failed:', error);
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

function installIntentFromPath(pathname: string): 'citizen' | 'partner' | null {
  if (pathname.includes('/partner')) return 'partner';
  if (pathname.includes('/citizen')) return 'citizen';
  return null;
}

function usePwaInstall() {
  const location = useLocation();
  const { user } = useAuth();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifest) return;
    const installRequested = new URLSearchParams(location.search).get('install') === '1';
    const routeIntent = installIntentFromPath(location.pathname);
    if (installRequested && routeIntent) sessionStorage.setItem(installIntentKey, routeIntent);
    const storedIntent = sessionStorage.getItem(installIntentKey);
    const wantsPartner = routeIntent === 'partner' || (!routeIntent && storedIntent === 'partner') || user?.role === 'HELPER';
    manifest.href = wantsPartner ? '/app/manifest.partner.webmanifest' : '/app/manifest.citizen.webmanifest';
  }, [location.pathname, user?.role]);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installEvent) return false;
    await installEvent.prompt();
    const choice = await installEvent.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') {
      setInstalled(true);
      setInstallEvent(null);
      return true;
    }
    return false;
  }, [installEvent]);

  return { canInstall: Boolean(installEvent), installed, install };
}

function PwaInstallPrompt() {
  const location = useLocation();
  const { canInstall, installed, install } = usePwaInstall();
  const { showToast } = useToast();
  const [storedIntent, setStoredIntent] = useState<'citizen' | 'partner' | null>(() => {
    const value = sessionStorage.getItem(installIntentKey);
    return value === 'citizen' || value === 'partner' ? value : null;
  });
  const installRequested = new URLSearchParams(location.search).get('install') === '1';
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const routeIntent = installIntentFromPath(location.pathname);
  const isPartner = routeIntent === 'partner' || (!routeIntent && storedIntent === 'partner');
  const appName = isPartner ? 'Partner' : 'Superherooo';

  useEffect(() => {
    const intent = installIntentFromPath(location.pathname);
    if (installRequested && intent) {
      sessionStorage.setItem(installIntentKey, intent);
      setStoredIntent(intent);
      return;
    }
    const value = sessionStorage.getItem(installIntentKey);
    setStoredIntent(value === 'citizen' || value === 'partner' ? value : null);
  }, [installRequested, location.pathname]);

  if ((!installRequested && !storedIntent) || installed) return null;

  return (
    <div className="install-banner">
      <div>
        <strong>Install {appName}</strong>
        <span>
          {canInstall
            ? 'Tap Install to add it to your phone home screen.'
            : isIos
              ? 'On iPhone, tap Share in Safari, then Add to Home Screen.'
              : 'On Android Chrome, use the browser menu and choose Install app or Add to Home screen.'}
        </span>
      </div>
      {canInstall ? (
        <button
          className="primary"
          onClick={async () => {
            const ok = await install();
            showToast(ok ? 'App install started.' : 'Install was dismissed.', ok ? 'success' : 'info');
          }}
        >
          Install App
        </button>
      ) : (
        <Link className="secondary" to={location.pathname}>{isPartner ? 'Open Partner' : 'Open Superherooo'}</Link>
      )}
    </div>
  );
}

function NotificationPermissionCard() {
  const { showToast } = useToast();
  const [permission, setPermission] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));

  if (permission === 'granted' || permission === 'unsupported') return null;

  return (
    <div className="notice notification-card">
      <Bell size={18} />
      <span>Enable notifications for job offers, assignment updates, chat, and task status changes.</span>
      <button
        className="secondary"
        type="button"
        onClick={async () => {
          const result = await requestNotificationPermission();
          setPermission(result);
          showToast(result === 'granted' ? 'Notifications enabled.' : 'Notifications were not enabled.', result === 'granted' ? 'success' : 'info');
        }}
      >
        Enable
      </button>
    </div>
  );
}

/* Audio Chime Synthesizer */
function playChimeSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.warn("Audio chime failed:", e);
  }
}

/* Web Push Notification Helper */
function showWebPushNotification(title: string, options?: NotificationOptions) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { icon: '/assets/finallogo.png', ...options });
  }
}

function money(paise: number) {
  return `₹${Math.round((paise || 0) / 100).toLocaleString('en-IN')}`;
}

function suggestedBudget(minutes: number) {
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
  const standard = Math.round(safeMinutes * 6.5);
  const suggested = Math.max(99, Math.round(standard * 0.5));
  return { standard, suggested };
}

function formatWhen(value?: string | null) {
  if (!value) return 'Instant';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusText(status: TaskStatus) {
  const labels: Record<TaskStatus, string> = {
    AI_PENDING: 'Reviewing request',
    AI_APPROVED: 'Approved',
    ADMIN_REVIEW: 'Manual review',
    ADMIN_APPROVED: 'Approved',
    ADMIN_REJECTED: 'Rejected',
    PAYMENT_PENDING: 'Payment pending',
    SCHEDULED_PENDING: 'Scheduled',
    SEARCHING: 'Finding nearby partners',
    ASSIGNED: 'Partner assigned',
    ARRIVED: 'Partner arrived',
    STARTED: 'Work in progress',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  return labels[status] || status;
}

function getLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error('Please allow location access or enter latitude and longitude manually.')),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

/* Voice Dictation Mic Component */
function VoiceMicInput({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false);

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported by your browser. Please type manually.');
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-IN';
      recognition.onstart = () => setListening(true);
      recognition.onend = () => setListening(false);
      recognition.onerror = () => setListening(false);
      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        if (text) onTranscript(text);
      };
      recognition.start();
    } catch (e) {
      console.error(e);
      setListening(false);
    }
  };

  return (
    <button
      type="button"
      className={`mic-btn ${listening ? 'listening' : ''}`}
      onClick={startListening}
      title="Dictate with Voice"
      aria-label="Dictate text with voice"
    >
      <Mic size={18} />
    </button>
  );
}

/* Particle Confetti Canvas Component */
function ConfettiCanvas({ durationMs = 3500 }: { durationMs?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const particles = Array.from({ length: 90 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      size: Math.random() * 8 + 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 4 + 3,
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 6,
    }));

    let animId: number;
    const startTime = Date.now();

    const render = () => {
      if (Date.now() - startTime > durationMs) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.vRot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [durationMs]);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 999 }} />;
}

/* Celebration Modal Component */
function CelebrationModal({ task, onClose }: { task: Task; onClose: () => void }) {
  return (
    <>
      <ConfettiCanvas />
      <div className="celebration-modal-overlay">
        <div className="celebration-modal" role="dialog" aria-labelledby="celebration-title">
          <div className="celebration-icon-box">🎉</div>
          <h2 id="celebration-title">Task Completed!</h2>
          <p>Superb work! The task has been completed and verified successfully.</p>
          <div className="celebration-stats">
            <div className="celebration-stat-item">
              <span>Task</span>
              <strong>{task.title}</strong>
            </div>
            <div className="celebration-stat-item">
              <span>Amount</span>
              <strong>{money(task.budgetPaise)}</strong>
            </div>
          </div>
          <button className="accent-btn" style={{ width: '100%' }} onClick={onClose}>
            Back to Workspace
          </button>
        </div>
      </div>
    </>
  );
}

/* Dual Camera vs Gallery Selfie Picker */
function SelfiePicker({
  label,
  file,
  onSelect,
  existingUrl,
  required,
}: {
  label: string;
  file: File | null;
  onSelect: (file: File | null) => void;
  existingUrl?: string | null;
  required?: boolean;
}) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else if (existingUrl) {
      setPreviewUrl(existingUrl);
    } else {
      setPreviewUrl(null);
    }
  }, [file, existingUrl]);

  return (
    <div className="selfie-picker-box">
      <span style={{ fontWeight: 800, color: 'var(--navy)', fontSize: '0.94rem' }}>
        {label} {required && <span style={{ color: 'var(--red)' }}>*</span>}
      </span>
      {previewUrl ? (
        <div className="selfie-preview">
          <img src={previewUrl} alt={label} />
          <button
            type="button"
            className="selfie-remove-btn"
            onClick={() => {
              onSelect(null);
              setPreviewUrl(null);
            }}
            title="Remove photo"
            aria-label="Remove uploaded photo"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="selfie-options-row">
          <button
            type="button"
            className="selfie-btn"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera size={18} /> Take Camera Photo
          </button>
          <button
            type="button"
            className="selfie-btn"
            onClick={() => galleryInputRef.current?.click()}
          >
            <ImageIcon size={18} /> Choose from Gallery
          </button>
        </div>
      )}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        style={{ display: 'none' }}
        onChange={(e) => onSelect(e.target.files?.[0] || null)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => onSelect(e.target.files?.[0] || null)}
      />
    </div>
  );
}

/* In-App Realtime Task Chat Modal */
function TaskChatModal({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { accessToken, user } = useAuth();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadMessages = useCallback(async () => {
    if (!accessToken) return;
    try {
      const msgs = await api.getTaskChatMessages(accessToken, taskId);
      setMessages(msgs);
    } catch (e) {
      console.error(e);
    }
  }, [accessToken, taskId]);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !inputMsg.trim()) return;
    setBusy(true);
    try {
      const newMsg = await api.sendTaskChatMessage(accessToken, taskId, inputMsg.trim());
      setMessages((prev) => [...prev, newMsg]);
      setInputMsg('');
    } catch (err) {
      showToast(toUserMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-modal-overlay">
      <div className="chat-modal" role="dialog" aria-labelledby="chat-title">
        <div className="chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageCircle size={20} />
            <strong id="chat-title">Task Live Chat</strong>
          </div>
          <button className="icon-close" onClick={onClose} aria-label="Close chat"><X size={20} /></button>
        </div>
        <div className="quick-replies" aria-label="Quick replies">
          {['I am on my way', 'I have arrived', 'Please share the start OTP', 'Task is completed'].map((reply) => (
            <button key={reply} type="button" onClick={() => setInputMsg(reply)}>{reply}</button>
          ))}
        </div>
        <div ref={scrollRef} className="chat-messages-scroll">
          {messages.length === 0 ? (
            <p className="muted" style={{ textAlign: 'center', margin: 'auto' }}>
              No messages yet. Send a message to coordinate!
            </p>
          ) : (
            messages.map((m) => {
              const isMine = m.senderUserId === user?.id;
              return (
                <div key={m.id} className={`chat-bubble ${isMine ? 'mine' : 'other'}`}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, opacity: 0.85, marginBottom: '2px' }}>
                    {isMine ? 'You' : m.senderName || m.senderRole}
                  </div>
                  <div>{m.message}</div>
                  <div className="chat-bubble-meta">
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <form className="chat-input-bar" onSubmit={send}>
          <input
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            placeholder="Type a message..."
            aria-label="Type a message"
          />
          <button className="accent-btn" disabled={busy || !inputMsg.trim()}>Send</button>
        </form>
      </div>
    </div>
  );
}

/* Mobile Bottom Navigation Bar (< 768px) */
function MobileBottomNav() {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const tabs = user.role === 'BUYER'
    ? [
      { label: 'Home', path: '/citizen', icon: Home },
      { label: 'Tasks', path: '/citizen/tasks', icon: BriefcaseBusiness },
      { label: 'Wallet', path: '/citizen/wallet', icon: Wallet },
      { label: 'Profile', path: '/citizen/profile', icon: User },
    ]
    : [
      { label: 'Home', path: '/partner', icon: Home },
      { label: 'Jobs', path: '/partner/jobs', icon: BriefcaseBusiness },
      { label: 'Earnings', path: '/partner/earnings', icon: Wallet },
      { label: 'Inbox', path: '/partner/inbox', icon: Inbox },
      { label: 'Profile', path: '/partner/profile', icon: User },
    ];

  return (
    <div className={`mobile-bottom-nav ${user.role === 'HELPER' ? 'five-tabs' : ''}`}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = location.pathname === tab.path || (tab.path.endsWith('/tasks') && location.pathname.includes('/citizen/tasks')) || (tab.path.endsWith('/jobs') && location.pathname.includes('/partner/tasks'));
        return (
          <Link key={tab.path} className={`mobile-nav-item ${isActive ? 'active' : ''}`} to={tab.path}>
            <span className="icon"><Icon size={21} strokeWidth={2.35} /></span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function ActiveTaskBubble() {
  const { user, accessToken } = useAuth();
  const [active, setActive] = useState<Task | null>(null);
  const socket = useSocket();

  const load = useCallback(async () => {
    if (!accessToken || !user) return;
    try {
      const tasks = await api.myTasks(accessToken);
      const next = tasks.find((task) => activeStatuses.includes(task.status)) || null;
      setActive(next);
    } catch {
      setActive(null);
    }
  }, [accessToken, user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!socket) return;
    const refresh = () => load();
    socket.on('task_assigned', refresh);
    socket.on('task.assigned', refresh);
    socket.on('task_status_changed', refresh);
    socket.on('task.status.changed', refresh);
    return () => {
      socket.off('task_assigned', refresh);
      socket.off('task.assigned', refresh);
      socket.off('task_status_changed', refresh);
      socket.off('task.status.changed', refresh);
    };
  }, [socket, load]);

  if (!user || !active) return null;
  const path = user.role === 'HELPER' ? `/partner/tasks/${active.id}` : '/citizen/tasks';
  return (
    <Link className="active-task-bubble" to={path}>
      <span><Timer size={18} /></span>
      <strong>{statusText(active.status)}</strong>
      <small>{active.title}</small>
      <ChevronRight size={17} />
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const getProfileLink = () => {
    if (user?.role === 'BUYER') return '/citizen/profile';
    if (user?.role === 'HELPER') return '/partner/profile';
    return '/profile';
  };
  const homePath = user?.role === 'HELPER' ? '/partner' : '/citizen';
  const showDesktopBack = Boolean(user && location.pathname !== homePath);

  return (
    <div className="app-shell">
      <OfflineBanner />
      <header className="topbar">
        <Link className="brand" to="/">
          <img src={logo} alt="Superherooo" />
          <span>Superherooo</span>
        </Link>
        <nav aria-label="Main Navigation">
          {showDesktopBack && (
            <button className="nav-back-button" type="button" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          {user?.role === 'BUYER' && (
            <Link className={`nav-link ${location.pathname === '/citizen' ? 'active' : ''}`} to="/citizen">
              Superherooo
            </Link>
          )}
          {user?.role === 'HELPER' && (
            <Link className={`nav-link ${location.pathname === '/partner' ? 'active' : ''}`} to="/partner">
              Partner
            </Link>
          )}
          {user?.role === 'HELPER' && (
            <Link className={`nav-link kyc-nav-link ${location.pathname.includes('/partner/kyc') ? 'active' : ''}`} to="/partner/kyc">
              <ShieldCheck size={16} /> KYC
            </Link>
          )}
          {user && (
            <Link className={`nav-link ${location.pathname.includes('/profile') ? 'active' : ''}`} to={getProfileLink()}>
              <User size={16} /> Profile
            </Link>
          )}
          <a className="nav-link" href="/">Website</a>
          {user && !WEB_DEMO_MODE ? (
            <button className="link-button" onClick={logout}><LogOut size={16} /> Sign out</button>
          ) : !WEB_DEMO_MODE ? (
            <Link className="nav-link active" to="/login">Sign in</Link>
          ) : null}
        </nav>
      </header>
      <PwaInstallPrompt />
      {user && <NotificationPermissionCard />}
      {children}
      <ActiveTaskBubble />
      <MobileBottomNav />
    </div>
  );
}

function RequireRole({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const { loading, user, applyAuth } = useAuth();
  const location = useLocation();
  const installRequested = new URLSearchParams(location.search).get('install') === '1';
  const routeIntent = installIntentFromPath(location.pathname);
  if (installRequested && routeIntent) sessionStorage.setItem(installIntentKey, routeIntent);
  useEffect(() => {
    if (WEB_DEMO_MODE && (!user || user.role !== role)) {
      applyAuth(demoAuthForRole(role === 'HELPER' ? 'HELPER' : 'BUYER'));
    }
  }, [applyAuth, role, user?.role]);
  useEffect(() => {
    if (WEB_DEMO_MODE || loading || user?.role === role) return;
    const stored = storedAuthForRole(role);
    if (stored) applyAuth(stored);
  }, [applyAuth, loading, role, user?.role]);
  if (WEB_DEMO_MODE) {
    if (!user || user.role !== role) return <div className="center-screen">Loading Superherooo demo...</div>;
    return <>{children}</>;
  }
  const storedForRequestedRole = !loading && user?.role !== role ? storedAuthForRole(role) : null;
  if (loading) return <div className="center-screen">Loading Superherooo...</div>;
  if (storedForRequestedRole) return <div className="center-screen">Switching Superherooo app...</div>;
  if (!user || user.role !== role) {
    const next = `${location.pathname}${location.search}`;
    const params = new URLSearchParams({ role, next });
    if (installRequested) params.set('install', '1');
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }
  return <>{children}</>;
}

function LandingRedirect() {
  const { user, loading } = useAuth();
  if (WEB_DEMO_MODE) return <Navigate to="/citizen" replace />;
  if (loading) return <div className="center-screen">Loading Superherooo...</div>;
  if (user?.role === 'HELPER') return <Navigate to="/partner" replace />;
  if (user?.role === 'BUYER') return <Navigate to="/citizen" replace />;
  return <Navigate to="/login" replace />;
}

function StaticHostRedirectBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    const target = sessionStorage.getItem(staticRedirectKey);
    if (!target) return;
    sessionStorage.removeItem(staticRedirectKey);
    if (target.startsWith('/') && !target.startsWith('//')) {
      navigate(target, { replace: true });
    }
  }, [navigate]);
  return null;
}

function AuthPage({ mode: _mode }: { mode: 'login' | 'signup' }) {
  const { applyAuth } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const initialRole = params.get('role') === 'HELPER' ? 'HELPER' : 'BUYER';
  const nextPath = params.get('next');
  const [role, setRole] = useState<UserRole>(initialRole);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    const notice = sessionStorage.getItem(authNoticeKey);
    if (notice) sessionStorage.removeItem(authNoticeKey);
    return notice;
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const cleanedPhone = normalizeIndianMobile(phone);
      if (!isValidIndianMobile(phone)) throw new Error('Enter a valid 10-digit Indian mobile number.');
      if (!otpSent) {
        const response = await api.startPhoneOtp(cleanedPhone, role);
        setDevOtp(showDevOtp ? response.devOtp || null : null);
        setOtpSent(true);
        showToast('OTP generated. Enter the code to continue.', 'success');
        return;
      }
      if (!/^\d{4,8}$/.test(otp.trim())) throw new Error('Enter the OTP shown above.');
      const auth = await api.verifyPhoneOtp(cleanedPhone, otp.trim(), role);
      if (!['BUYER', 'HELPER'].includes(auth.user.role)) throw new Error('This web app supports citizen and partner accounts only.');
      applyAuth(auth);
      requestNotificationPermission().catch(() => undefined);
      showToast('Signed in successfully!', 'success');
      const fallback = auth.user.role === 'BUYER' ? '/citizen' : '/partner';
      const nextMatchesRole = auth.user.role === 'HELPER'
        ? nextPath?.startsWith('/partner')
        : nextPath?.startsWith('/citizen');
      navigate(nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') && nextMatchesRole ? nextPath : fallback, { replace: true });
    } catch (err) {
      const msg = toUserMessage(err);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <main className="auth-layout">
        <section className="auth-copy">
          <span className="eyebrow">
            <span className="live-pulse" /> Superherooo Web App
          </span>
          <h1>{role === 'HELPER' ? 'Partner login' : 'Superherooo login'}</h1>
          <p>Use your mobile number and the demo OTP to continue. No password or Exotel OTP is required for this web demo.</p>
          <div className="trust-row">
            <span><ShieldCheck size={16} /> Phone OTP</span>
            <span><MapPin size={16} /> Realtime location</span>
            <span><CreditCard size={16} /> Cash/UPI after service</span>
          </div>
          <div className="app-visual" aria-hidden="true" style={{ marginTop: '24px' }}>
            <img
              src={`${import.meta.env.BASE_URL}hero.jpeg`}
              alt="Superherooo Service"
              className="visual-hero-bg"
              onError={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                if (!target.dataset.tried) {
                  target.dataset.tried = 'true';
                  target.src = 'hero.jpeg';
                }
              }}
            />
          </div>
        </section>
        <form className="panel auth-panel" onSubmit={submit}>
          <div className="auth-form-header">
            <h2>{otpSent ? 'Enter OTP' : 'Continue with phone'}</h2>
            <p>{otpSent ? `We generated an OTP for +91 ${normalizeIndianMobile(phone)}.` : 'Choose the app role and enter a 10-digit Indian mobile number.'}</p>
          </div>

          <div className="segmented">
            <button type="button" className={role === 'BUYER' ? 'active' : ''} onClick={() => setRole('BUYER')}>
              <User size={17} /> Superherooo
            </button>
            <button type="button" className={role === 'HELPER' ? 'active' : ''} onClick={() => setRole('HELPER')}>
              <Zap size={17} /> Partner
            </button>
          </div>

          <label className="input-group">
            <span className="label-text">Mobile Number</span>
            <div className="input-icon-wrapper">
              <span className="input-icon"><Phone size={18} /></span>
              <input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, '').slice(0, 12));
                  setOtpSent(false);
                  setDevOtp(null);
                  setOtp('');
                }}
                inputMode="tel"
                autoComplete="tel"
                pattern="(?:91|0)?[6-9][0-9]{9}"
                required
                placeholder="10-digit mobile number"
              />
            </div>
          </label>

          {otpSent && (
            <label className="input-group">
              <span className="label-text">OTP</span>
              <div className="input-icon-wrapper">
                <span className="input-icon"><Lock size={18} /></span>
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder="Enter OTP"
                />
              </div>
            </label>
          )}

          {devOtp && (
            <div className="notice success">
              <ShieldCheck size={18} />
              <span>Demo OTP: <strong>{devOtp}</strong></span>
            </div>
          )}

          {error && <div className="notice error">{error}</div>}

          <button className="accent-btn auth-submit-btn" disabled={busy}>
            {busy ? (
              <>
                <span className="spinner" /> Processing...
              </>
            ) : (
              <>
                {otpSent ? 'Verify & Continue' : 'Get OTP'} <span className="btn-arrow">→</span>
              </>
            )}
          </button>

          <p className="muted" style={{ textAlign: 'center', marginTop: '4px', fontSize: '0.9rem' }}>
            {role === 'HELPER' ? 'Partner KYC is required before going online.' : 'Book Superherooo tasks after OTP login.'}
          </p>
        </form>
      </main>
    </Shell>
  );
}

function ForgotPasswordPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.forgotPassword(email);
      setDevOtp(showDevOtp ? res.devOtp || null : null);
      setMessage('If this email is registered, a reset code has been sent.');
      showToast('Reset code requested.', 'success');
      navigate(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch (err) {
      const msg = toUserMessage(err);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <main className="auth-layout auth-layout-single">
        <form className="panel auth-panel" onSubmit={submit}>
          <BackHeader title="Forgot password" subtitle="Use your email to receive a reset code" />
          <label className="input-group">
            <span className="label-text">Email Address</span>
            <div className="input-icon-wrapper">
              <span className="input-icon"><Inbox size={18} /></span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="you@domain.com" />
            </div>
          </label>
          {message && <div className="notice success">{message}</div>}
          {devOtp && <div className="dev-otp">Dev OTP: <strong>{devOtp}</strong></div>}
          {error && <div className="notice error">{error}</div>}
          <button className="accent-btn auth-submit-btn" disabled={busy}>{busy ? 'Sending...' : 'Send reset code'}</button>
          <Link className="auth-link-centered" to="/login">Back to sign in</Link>
        </form>
      </main>
    </Shell>
  );
}

function ResetPasswordPage() {
  const { applyAuth } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(() => new URLSearchParams(location.search).get('email') || '');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const auth = await api.resetPassword(email, otp, newPassword);
      if (!['BUYER', 'HELPER'].includes(auth.user.role)) throw new Error('This web app supports citizen and partner accounts only.');
      applyAuth(auth);
      showToast('Password reset successfully.', 'success');
      navigate(auth.user.role === 'BUYER' ? '/citizen' : '/partner', { replace: true });
    } catch (err) {
      const msg = toUserMessage(err);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <main className="auth-layout auth-layout-single">
        <form className="panel auth-panel" onSubmit={submit}>
          <BackHeader title="Reset password" subtitle="Enter the code from your email" />
          <label className="input-group">
            <span className="label-text">Email Address</span>
            <div className="input-icon-wrapper">
              <span className="input-icon"><Inbox size={18} /></span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="you@domain.com" />
            </div>
          </label>
          <label className="input-group">
            <span className="label-text">Reset code</span>
            <div className="input-icon-wrapper">
              <span className="input-icon"><Lock size={18} /></span>
              <input value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" required placeholder="Code from email" />
            </div>
          </label>
          <label className="input-group">
            <span className="label-text">New password</span>
            <div className="input-icon-wrapper">
              <span className="input-icon"><Lock size={18} /></span>
              <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" required placeholder="At least 8 characters" />
              <button type="button" className="password-toggle-btn" onClick={() => setShowPassword(!showPassword)} tabIndex={-1} aria-label="Toggle password visibility">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {error && <div className="notice error">{error}</div>}
          <button className="accent-btn auth-submit-btn" disabled={busy}>{busy ? 'Resetting...' : 'Reset password'}</button>
          <Link className="auth-link-centered" to="/forgot-password">Request a new code</Link>
        </form>
      </main>
    </Shell>
  );
}

function EmailVerificationCard() {
  const { user, applyAuth } = useAuth();
  const { showToast } = useToast();
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (!user?.email || user.emailVerified) return null;

  const send = async () => {
    setError(null);
    setSending(true);
    try {
      const res = await api.startEmailOtp(user.email!);
      setDevOtp(showDevOtp ? res.devOtp || null : null);
      setMessage('Verification OTP sent to ' + user.email);
      showToast('Verification OTP sent to ' + user.email, 'info');
    } catch (err) {
      const msg = toUserMessage(err);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    setError(null);
    try {
      const auth = await api.verifyEmailOtp(user.email!, otp);
      applyAuth(auth);
      setMessage('Email successfully verified!');
      showToast('Email verified successfully!', 'success');
    } catch (err) {
      const msg = toUserMessage(err);
      setError(msg);
      showToast(msg, 'error');
    }
  };

  return (
    <div className="panel warning-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '1.4rem' }}>✉️</span>
        <div>
          <h3 style={{ margin: 0 }}>Verify your email address</h3>
          <p className="muted" style={{ margin: '2px 0 0 0', fontSize: '0.88rem' }}>
            Email verification helps secure your bookings and partner payouts.
          </p>
        </div>
      </div>
      <div className="inline-form" style={{ marginTop: '6px' }}>
        <button className="secondary" type="button" disabled={sending} onClick={send}>
          {sending ? 'Sending...' : 'Send OTP'}
        </button>
        <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Enter 6-digit OTP" aria-label="Email verification OTP" />
        <button className="primary" type="button" onClick={verify}>Verify Email</button>
      </div>
      {devOtp && <div className="notice">Dev OTP: <strong>{devOtp}</strong></div>}
      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}
    </div>
  );
}

function CitizenDashboard() {
  const { accessToken, user } = useAuth();
  const { showToast } = useToast();
  const socket = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>(() => {
    try {
      const stored = localStorage.getItem(savedAddressesKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [form, setForm] = useState({
    title: '',
    description: '',
    urgency: 'NORMAL' as TaskUrgency,
    timeMinutes: 60,
    addressText: '',
    landmark: '',
    lat: '',
    lng: '',
    scheduledAt: '',
  });
  const [bookingStep, setBookingStep] = useState<'service' | 'details' | 'location' | 'review'>('service');
  const isCreatePage = location.pathname.includes('/citizen/create');

  const { standard: standardPrice, suggested: discountPrice } = suggestedBudget(form.timeMinutes);
  const activeTask = tasks.find((task) => activeStatuses.includes(task.status));
  const completedTasks = tasks.filter((task) => task.status === 'COMPLETED');
  const currentLocationText = form.addressText || savedAddresses[0]?.addressText || 'Select location';
  const firstName = user?.displayName?.split(' ')[0] || 'Citizen';
  const greeting = new Date().getHours() < 12 ? 'Good Morning' : new Date().getHours() < 17 ? 'Good Afternoon' : 'Good Evening';

  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setTasks(await api.myTasks(accessToken));
    } catch (err) {
      setError(toUserMessage(err));
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!socket) return;
    const refresh = (payload?: any) => {
      load();
      if (payload?.status || payload?.taskId) {
        showToast('Your booking status was updated.', 'info');
        showWebPushNotification('Superherooo booking updated', { body: payload?.status ? statusText(payload.status) : 'Open the app for details.' });
      }
    };
    socket.on('task_assigned', refresh);
    socket.on('task.assigned', refresh);
    socket.on('task_status_changed', refresh);
    socket.on('task.status.changed', refresh);
    return () => {
      socket.off('task_assigned', refresh);
      socket.off('task.assigned', refresh);
      socket.off('task_status_changed', refresh);
      socket.off('task.status.changed', refresh);
    };
  }, [socket, load, showToast]);

  const fillLocation = async () => {
    try {
      const loc = await getLocation().catch((err) => {
        if (WEB_DEMO_MODE) return { lat: 17.385, lng: 78.4867 };
        throw err;
      });
      setForm((f) => ({ ...f, lat: String(loc.lat.toFixed(6)), lng: String(loc.lng.toFixed(6)) }));
      const address = await reverseGeocode(loc.lat, loc.lng);
      if (address) {
        setForm((f) => ({ ...f, addressText: address }));
      }
      showToast('Current location detected!', 'success');
    } catch (err) {
      setError(toUserMessage(err));
      showToast('Location permission denied.', 'error');
    }
  };

  const handleAddressChange = (val: string) => {
    setForm((f) => ({ ...f, addressText: val }));
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (val.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const results = await searchLocations(val);
          setSuggestions(results);
          setShowSuggestions(true);
        } catch (err) {
          console.error(err);
        }
      }, 350);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = async (sug: LocationSuggestion) => {
    setForm((f) => ({ ...f, addressText: sug.description }));
    setSuggestions([]);
    setShowSuggestions(false);
    try {
      const coords = await resolveLocationCoords(sug);
      if (coords) {
        setForm((f) => ({ ...f, lat: String(coords.lat.toFixed(6)), lng: String(coords.lng.toFixed(6)) }));
      }
    } catch (err) {
      setError(toUserMessage(err));
    }
  };

  const saveCurrentAddress = (label: string) => {
    if (!form.addressText || !form.lat || !form.lng) {
      showToast('Please fill location first before saving.', 'error');
      return;
    }
    const newAddr: SavedAddress = {
      id: String(Date.now()),
      label,
      addressText: form.addressText,
      landmark: form.landmark,
      lat: Number(form.lat),
      lng: Number(form.lng),
    };
    const next = [...savedAddresses.filter((a) => a.label !== label), newAddr];
    setSavedAddresses(next);
    localStorage.setItem(savedAddressesKey, JSON.stringify(next));
    showToast(`Saved as ${label}!`, 'success');
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setBusy(true);
    try {
      let lat = Number(form.lat);
      let lng = Number(form.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !form.lat || !form.lng) {
        const matches = await searchLocations(form.addressText);
        const coords = matches[0] ? await resolveLocationCoords(matches[0]) : null;
        if (!coords) throw new Error('Please select an address suggestion or use Current Location before creating the task.');
        lat = coords.lat;
        lng = coords.lng;
        setForm((f) => ({ ...f, lat: String(lat.toFixed(6)), lng: String(lng.toFixed(6)) }));
      }
      const payload: CreateTaskPayload = {
        title: form.title,
        description: form.description,
        urgency: form.urgency,
        timeMinutes: Number(form.timeMinutes),
        budgetPaise: discountPrice * 100,
        lat,
        lng,
        addressText: form.addressText || null,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
        landmark: form.landmark || null,
        paymentCollectionMode: 'PAY_AFTER_SERVICE',
        verificationMode: 'PHOTO_AND_OTP',
      };
      const res = await api.createTask(accessToken, payload);
      showToast('Task created successfully!', 'success');
      navigate(`/citizen/tasks/${res.taskId}`);
    } catch (err) {
      const msg = toUserMessage(err);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <main className="workspace">
        <EmailVerificationCard />
        {!isCreatePage && (
          <section className="rn-citizen-home">
            {/* Top Bar with Location and Notifications */}
            <div className="rn-home-header inverted">
              <button className="rn-location-chip" type="button" onClick={fillLocation}>
                <span className="rn-location-icon-badge">
                  <MapPin size={15} className="rn-pin-icon" />
                </span>
                <div className="rn-location-text">
                  <span className="rn-location-label">Deliver To</span>
                  <strong>{currentLocationText}</strong>
                </div>
              </button>
              <div className="rn-header-actions">
                <button
                  className="rn-round-button"
                  aria-label="Notifications"
                  onClick={() =>
                    requestNotificationPermission().then((permission) =>
                      showToast(
                        permission === 'granted' ? 'Notifications enabled.' : 'Notifications not enabled.',
                        permission === 'granted' ? 'success' : 'info'
                      )
                    )
                  }
                >
                  <Bell size={20} />
                  <span className="rn-bell-badge" />
                </button>
                <div className="rn-logo-wrapper">
                  <img src={logo} alt="Superherooo" />
                </div>
              </div>
            </div>

            {/* Personalized Greeting */}
            <div className="rn-greeting inverted">
              <span className="rn-greeting-sparkle">✨</span>
              <span>{greeting}, {firstName}</span>
            </div>

            {/* Premium Hero Card */}
            <div className="rn-citizen-hero">
              <div className="rn-hero-glow" />
              <div className="rn-hero-copy">
                <span className="rn-hero-badge">
                  <ShieldCheck size={14} /> 100% Verified & Insured
                </span>
                <h1>
                  Everyday tasks<br />
                  handled by<br />
                  <span className="rn-hero-gold-text">Super Heroes.</span>
                </h1>
                <div className="rn-highlight-row">
                  <span>
                    <Zap size={14} /> Instant Dispatch
                  </span>
                  <span>
                    <Wallet size={14} /> Pay After Completion
                  </span>
                  <span>
                    <Clock3 size={14} /> 24/7 Available
                  </span>
                </div>
                <button className="rn-book-button" type="button" onClick={() => navigate('/citizen/create')}>
                  <span>BOOK SUPERHEROOO</span>
                  <ChevronRight size={16} className="rn-btn-arrow" />
                </button>
              </div>
              <div className="rn-hero-img-wrap">
                <img src={superhero} alt="Superherooo partner greeting" />
              </div>
            </div>
          </section>
        )}

        {!isCreatePage && (
          <section className="rn-book-later">
            <div className="section-head">
              <div>
                <h2>Book a Superherooo</h2>
                <p>Choose instant help or schedule for later.</p>
              </div>
              {activeTask && (
                <Link className="status-pill searching active-pulse" to="/citizen/tasks">
                  <span className="pulse-dot" /> Active task
                </Link>
              )}
            </div>
            <div className="rn-book-grid">
              <button
                type="button"
                className="rn-book-card instant"
                onClick={() => {
                  setForm((f) => ({ ...f, scheduledAt: '' }));
                  navigate('/citizen/create');
                }}
              >
                <div className="rn-card-content">
                  <span className="rn-card-tag instant">⚡ FASTEST (5-15 MIN)</span>
                  <strong>Instant Booking</strong>
                  <p>Get a verified partner dispatched immediately to your location.</p>
                  <span className="rn-action-pill instant">START NOW <ChevronRight size={13} /></span>
                </div>
                <div className="rn-icon-wrapper instant">
                  <Zap size={36} />
                </div>
              </button>

              <button
                type="button"
                className="rn-book-card scheduled"
                onClick={() => {
                  setBookingStep('review');
                  navigate('/citizen/create');
                }}
              >
                <div className="rn-card-content">
                  <span className="rn-card-tag scheduled">📅 FLEXIBLE TIME</span>
                  <strong>Schedule Later</strong>
                  <p>Pick any custom date and time for convenient task delivery.</p>
                  <span className="rn-action-pill scheduled">BOOK FOR LATER <ChevronRight size={13} /></span>
                </div>
                <div className="rn-icon-wrapper scheduled">
                  <Clock3 size={36} />
                </div>
              </button>
            </div>
          </section>
        )}

        {!isCreatePage && (
          <section className="rn-suggestions">
            <div className="section-head">
              <h2>
                <Sparkles size={20} className="rn-sparkle-icon" /> Smart Suggestions
              </h2>
              <span className="rn-completed-count">🎉 {completedTasks.length} completed</span>
            </div>
            <div className="rn-suggestion-row">
              {[
                { title: 'Grocery run', sub: 'Store shopping & door delivery', icon: '🛒', badge: 'Popular' },
                { title: 'Need keys fetched?', sub: 'Pick up keys from home or office', icon: '🔑', badge: 'Fast' },
                { title: 'Schedule Later', sub: 'Set date & time for upcoming errands', icon: '⏰', badge: 'Planned' },
                { title: 'Elderly help?', sub: 'Companion & errand assistance', icon: '❤️', badge: 'Care' },
                { title: 'Need a custom task?', sub: 'Setup rates, time & instructions directly', icon: '✨', badge: 'Custom' },
              ].map((item) => (
                <button
                  key={item.title}
                  type="button"
                  className="rn-suggestion-card"
                  onClick={() => {
                    setForm((f) => ({ ...f, title: item.title }));
                    navigate('/citizen/create');
                  }}
                >
                  <div className="rn-sug-header">
                    <span className="rn-sug-icon">{item.icon}</span>
                    <span className="rn-sug-badge">{item.badge}</span>
                  </div>
                  <strong>{item.title}</strong>
                  <small>{item.sub}</small>
                  <div className="rn-sug-footer">
                    <span>From ₹{discountPrice}</span>
                    <ChevronRight size={14} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {isCreatePage && (
          <div className="grid two create-only-grid">
            <form className="panel task-form task-form-sheet premium-form-sheet" onSubmit={create}>
              <div className="section-head">
                <div>
                  <span className="eyebrow mini">Book a Superherooo</span>
                  <h2>Create Task</h2>
                </div>
                <span className={`status-pill ${form.scheduledAt ? 'scheduled_pending' : 'instant_badge'}`}>
                  {form.scheduledAt ? '📅 Scheduled' : '⚡ Instant'}
                </span>
              </div>

              {/* Enhanced Stepper */}
              <div className="stepper-wrap">
                <div className="stepper-progress-bg">
                  <div
                    className="stepper-progress-fill"
                    style={{
                      width: bookingStep === 'service' ? '25%' : bookingStep === 'details' ? '50%' : bookingStep === 'location' ? '75%' : '100%',
                    }}
                  />
                </div>
                <div className="stepper">
                  {(['service', 'details', 'location', 'review'] as const).map((step, idx) => (
                    <button
                      key={step}
                      type="button"
                      className={bookingStep === step ? 'active' : ''}
                      onClick={() => setBookingStep(step)}
                    >
                      <span className="step-num">{idx + 1}</span>
                      <span className="step-text">{step}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="form-label-group">
                <span className="label-title">Task Title <span className="req-star">*</span></span>
                <div className="mic-input-wrapper">
                  <input
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. Grocery pickup, bill payment, queue waiting..."
                    aria-label="Task Title"
                  />
                  <VoiceMicInput onTranscript={(text) => setForm((f) => ({ ...f, title: f.title ? `${f.title} ${text}` : text }))} />
                </div>
              </label>

              <label className="form-label-group">
                <span className="label-title">Description & Instructions <span className="req-star">*</span></span>
                <div className="mic-input-wrapper">
                  <textarea
                    required
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Write pickup/drop details, timing, contact rules, and any safety instructions..."
                    aria-label="Task Description"
                    rows={3}
                  />
                  <VoiceMicInput onTranscript={(text) => setForm((f) => ({ ...f, description: f.description ? `${f.description} ${text}` : text }))} />
                </div>
              </label>

              <div className="grid two compact">
                <label className="form-label-group">
                  <span className="label-title">Duration (minutes)</span>
                  <div className="input-with-icon">
                    <Clock3 size={16} className="field-icon" />
                    <input
                      type="number"
                      min="15"
                      max="1440"
                      step="15"
                      value={form.timeMinutes}
                      onChange={(e) => setForm({ ...form, timeMinutes: Number(e.target.value) })}
                      aria-label="Duration in minutes"
                    />
                  </div>
                </label>

                <label className="form-label-group">
                  <span className="label-title">Schedule Later (Optional)</span>
                  <input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                    aria-label="Schedule datetime"
                  />
                </label>
              </div>

              {/* Price Preview Card */}
              <div className="price-preview-box">
                <div className="price-preview-left">
                  <span className="price-label">Auto Budget Suggestion</span>
                  <div className="price-strike-row">
                    <span className="strike-price">₹{standardPrice}</span>
                    <span className="discount-badge">50% OFF EXCLUSIVE</span>
                  </div>
                  <small className="field-hint">Suggested for {form.timeMinutes || 60} minutes. Confirm this amount for the booking.</small>
                </div>
                <div className="price-preview-right">
                  <span className="final-price">₹{discountPrice}</span>
                  <span className="price-subtext">Pay after completion</span>
                </div>
              </div>

              <div className="payment-choice-box" aria-label="Payment timing options">
                <span className="label-title">Payment Timing</span>
                <div className="payment-choice-grid">
                  <button type="button" className="payment-choice disabled" disabled>
                    <strong>Before Work</strong>
                    <span>Online prepaid coming soon</span>
                  </button>
                  <button type="button" className="payment-choice active">
                    <strong>After Work</strong>
                    <span>Cash or UPI after OTP completion</span>
                  </button>
                </div>
              </div>

              <label className="form-label-group">
                <span className="label-title">Urgency Level</span>
                <div className="urgency-choice-grid">
                  {[
                    { value: 'LOW', label: 'Low' },
                    { value: 'NORMAL', label: 'Normal' },
                    { value: 'HIGH', label: 'High' },
                    { value: 'CRITICAL', label: 'Critical' },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={`urgency-choice ${form.urgency === item.value ? 'active' : ''}`}
                      onClick={() => setForm({ ...form, urgency: item.value as TaskUrgency })}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </label>

              {savedAddresses.length > 0 && (
                <div className="saved-address-section">
                  <span className="saved-addr-title">
                    📍 Saved Addresses
                  </span>
                  <div className="saved-addresses-row">
                    {savedAddresses.map((sa) => (
                      <button
                        key={sa.id}
                        type="button"
                        className="saved-address-chip"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            addressText: sa.addressText,
                            landmark: sa.landmark || '',
                            lat: String(sa.lat),
                            lng: String(sa.lng),
                          }))
                        }
                      >
                        {sa.label === 'Home' ? '🏡 Home' : sa.label === 'Work' ? '💼 Work' : '📍 ' + sa.label}:{' '}
                        {sa.addressText.substring(0, 24)}...
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ position: 'relative' }}>
                <label className="form-label-group">
                  <span className="label-title">Address <span className="req-star">*</span></span>
                  <div className="input-with-icon">
                    <MapPin size={16} className="field-icon" />
                    <input
                      required
                      value={form.addressText}
                      onChange={(e) => handleAddressChange(e.target.value)}
                      placeholder="Search address or location..."
                      autoComplete="off"
                      aria-label="Full Address"
                    />
                  </div>
                </label>
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="suggestions-dropdown">
                    {suggestions.map((sug, idx) => (
                      <li key={idx} onClick={() => selectSuggestion(sug)}>
                        <span className="suggestion-icon">
                          {sug.provider === 'ola' ? '🚖' : sug.provider === 'google' ? '📍' : '🗺️'}
                        </span>
                        <span>{sug.description}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <label className="form-label-group">
                <span className="label-title">Landmark</span>
                <input
                  value={form.landmark}
                  onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                  placeholder="Nearby landmark or building name (optional)"
                  aria-label="Landmark"
                />
              </label>

              <div className="grid three compact quick-loc-actions">
                <button type="button" className="secondary loc-btn" onClick={fillLocation}>
                  <LocateFixed size={16} /> Current Location
                </button>
                <button type="button" className="secondary loc-btn" onClick={() => saveCurrentAddress('Home')}>
                  🏡 Save Home
                </button>
                <button type="button" className="secondary loc-btn" onClick={() => saveCurrentAddress('Work')}>
                  💼 Save Work
                </button>
              </div>

              <div className="notice payment-note">
                <ShieldCheck size={18} className="payment-shield-icon" />
                <div>
                  <strong>After Work Payment Selected</strong>
                  <p>Pay cash or UPI directly to your Superherooo partner only after completion OTP verification. No upfront fee required.</p>
                </div>
              </div>

              {error && <div className="notice error">{error}</div>}

              <button className="accent-btn cta-submit-btn" disabled={busy}>
                {busy ? (
                  <span className="loading-spinner-row">
                    <span className="spinner" /> Creating Task...
                  </span>
                ) : (
                  <>
                    Create Task Now <ChevronRight size={18} />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </main>
    </Shell>
  );
}

function TaskList({ title, tasks, basePath }: { title: string; tasks: Task[]; basePath: string }) {
  const [tab, setTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const isCompletedOrCancelled = (s: TaskStatus) => ['COMPLETED', 'CANCELLED', 'ADMIN_REJECTED'].includes(s);

  const activeTasks = tasks.filter((t) => !isCompletedOrCancelled(t.status));
  const historyTasks = tasks.filter((t) => isCompletedOrCancelled(t.status));

  const currentTabTasks = tab === 'ACTIVE' ? activeTasks : historyTasks;

  const filteredTasks = currentTabTasks.filter((t) => {
    const matchesSearch =
      !searchTerm ||
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.addressText && t.addressText.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <section className="panel list-panel">
      <h2>{title}</h2>
      <div className="tab-switcher">
        <button className={`tab-btn ${tab === 'ACTIVE' ? 'active' : ''}`} onClick={() => setTab('ACTIVE')}>
          Active / Upcoming ({activeTasks.length})
        </button>
        <button className={`tab-btn ${tab === 'HISTORY' ? 'active' : ''}`} onClick={() => setTab('HISTORY')}>
          Past Records ({historyTasks.length})
        </button>
      </div>

      <div className="filter-bar">
        <input
          className="search-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="🔍 Search by title or location..."
          aria-label="Search tasks"
        />
        {tab === 'ACTIVE' && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter status">
            <option value="ALL">All Statuses</option>
            <option value="SEARCHING">Searching</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="ARRIVED">Arrived</option>
            <option value="STARTED">In Progress</option>
          </select>
        )}
      </div>

      {filteredTasks.length === 0 ? (
        <EmptyState
          icon={tab === 'ACTIVE' ? BriefcaseBusiness : CheckCircle2}
          title={searchTerm ? 'No matching tasks found' : tab === 'ACTIVE' ? 'No active bookings currently' : 'No past task records found'}
          body={tab === 'ACTIVE' ? 'Create a task and nearby partners will see it in realtime.' : 'Completed and cancelled bookings will appear here.'}
        />
      ) : (
        filteredTasks.map((task) => (
          <Link key={task.id} className="task-card" to={`${basePath}/${task.id}`}>
            <div>
              <strong>{task.title}</strong>
              <span>{task.addressText || `${task.lat}, ${task.lng}`}</span>
              <span style={{ fontSize: '0.8rem', marginTop: '2px' }}>{formatWhen(task.createdAt)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
              <b style={{ color: 'var(--navy)', fontSize: '1.1rem' }}>{money(task.budgetPaise)}</b>
              <span className={`status-pill ${task.status.toLowerCase()}`}>
                {['SEARCHING', 'ASSIGNED', 'ARRIVED', 'STARTED'].includes(task.status) && <span className="live-pulse" />}
                {statusText(task.status)}
              </span>
            </div>
          </Link>
        ))
      )}
    </section>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: React.ComponentType<{ size?: number }>; title: string; body: string }) {
  return (
    <div className="empty-state">
      <span><Icon size={24} /></span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function BackHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const navigate = useNavigate();
  return (
    <div className="back-header">
      <button className="icon-button" onClick={() => navigate(-1)} aria-label="Go back"><ArrowLeft size={20} /></button>
      <div>
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
    </div>
  );
}

function StatusTimeline({ status }: { status: TaskStatus }) {
  const steps: { key: TaskStatus; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { key: 'SEARCHING', label: 'Searching', icon: Search },
    { key: 'ASSIGNED', label: 'Assigned', icon: ShieldCheck },
    { key: 'ARRIVED', label: 'Arrived', icon: MapPin },
    { key: 'STARTED', label: 'Started', icon: Timer },
    { key: 'COMPLETED', label: 'Done', icon: CheckCircle2 },
  ];
  const order = steps.map((s) => s.key);
  const currentIndex = status === 'CANCELLED' || status === 'ADMIN_REJECTED'
    ? -1
    : Math.max(0, order.findIndex((key) => key === status));

  return (
    <div className="status-timeline">
      {steps.map((step, idx) => {
        const Icon = step.icon;
        const done = currentIndex >= idx || status === 'COMPLETED';
        return (
          <div key={step.key} className={done ? 'done' : ''}>
            <span><Icon size={16} /></span>
            <small>{step.label}</small>
          </div>
        );
      })}
    </div>
  );
}

function CitizenTaskPage() {
  const { taskId = '' } = useParams();
  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const socket = useSocket();
  const [task, setTask] = useState<Task | null>(null);
  const [helperLoc, setHelperLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const previousStatusRef = useRef<TaskStatus | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !taskId) return;
    try {
      const data = await api.task(accessToken, taskId);
      setTask(data);
      if (previousStatusRef.current && previousStatusRef.current !== 'COMPLETED' && data.status === 'COMPLETED') {
        setShowCelebration(true);
      }
      previousStatusRef.current = data.status;
    } catch (err) {
      setError(toUserMessage(err));
    }
  }, [accessToken, taskId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!socket || !taskId) return;
    socket.emit('task.subscribe', { taskId, helperId: task?.assignedHelperId });
    const refresh = (payload?: any) => {
      load();
      showToast('Task status updated.', 'info');
      showWebPushNotification('Task status updated', { body: payload?.status ? statusText(payload.status) : 'Open Superherooo for details.' });
    };
    const loc = (payload: { taskId?: string; lat?: number; lng?: number }) => {
      if (payload.taskId === taskId && Number.isFinite(payload.lat) && Number.isFinite(payload.lng)) {
        setHelperLoc({ lat: Number(payload.lat), lng: Number(payload.lng) });
      }
    };
    socket.on('task_assigned', refresh);
    socket.on('task.status.changed', refresh);
    socket.on('task_status_changed', refresh);
    socket.on('helper.location', loc);
    return () => {
      socket.off('task_assigned', refresh);
      socket.off('task.status.changed', refresh);
      socket.off('task_status_changed', refresh);
      socket.off('helper.location', loc);
    };
  }, [socket, taskId, task?.assignedHelperId, load, showToast]);

  return (
    <Shell>
      <main className="workspace">
        {error && <div className="notice error">{error}</div>}
        {task && <TaskDetail task={task} helperLoc={helperLoc} role="BUYER" onOpenChat={() => setShowChat(true)} />}
        {showChat && taskId && <TaskChatModal taskId={taskId} onClose={() => setShowChat(false)} />}
        {showCelebration && task && <CelebrationModal task={task} onClose={() => setShowCelebration(false)} />}
      </main>
    </Shell>
  );
}

type KycDocType = 'AADHAAR' | 'PASSPORT' | 'DRIVING_LICENSE' | 'PAN' | 'RATION_CARD' | 'OTHER';

const kycDocTypes: Array<{ value: KycDocType; label: string; placeholder: string }> = [
  { value: 'AADHAAR', label: 'Aadhaar', placeholder: '12-digit Aadhaar number' },
  { value: 'PAN', label: 'PAN', placeholder: 'ABCDE1234F' },
  { value: 'PASSPORT', label: 'Passport', placeholder: 'A1234567' },
  { value: 'DRIVING_LICENSE', label: 'Driving License', placeholder: 'TS0120230001234' },
  { value: 'RATION_CARD', label: 'Ration Card', placeholder: 'Ration card number' },
  { value: 'OTHER', label: 'Other', placeholder: 'Document number' },
];

function sanitizeKycIdInput(value: string, docType: KycDocType): string {
  const clean = value.trim();
  if (docType === 'AADHAAR') return clean.replace(/\D/g, '').slice(0, 12);
  if (docType === 'PAN') return clean.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  if (docType === 'PASSPORT') return clean.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (docType === 'DRIVING_LICENSE') return clean.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  if (docType === 'RATION_CARD') return clean.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  return clean.toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 30);
}

function validateKycIdNumber(value: string, docType: KycDocType): boolean {
  const v = value.trim().toUpperCase();
  if (docType === 'AADHAAR') return /^\d{12}$/.test(v);
  if (docType === 'PAN') return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
  if (docType === 'PASSPORT') return /^[A-Z][0-9]{7}$/.test(v);
  if (docType === 'DRIVING_LICENSE') return /^[A-Z]{2}[0-9]{2}[0-9A-Z]{8,14}$/.test(v);
  if (docType === 'RATION_CARD') return /^[A-Z0-9]{8,20}$/.test(v);
  return v.length >= 4 && v.length <= 30;
}

function kycIdValidationText(value: string, docType: KycDocType, otherDocType: string) {
  if (!value.trim()) return null;
  if (docType === 'OTHER' && otherDocType.trim().length > 0 && otherDocType.trim().length < 3) {
    return 'Enter the document name, minimum 3 characters.';
  }
  if (validateKycIdNumber(value, docType)) return null;
  if (docType === 'AADHAAR') return 'Aadhaar must be exactly 12 digits.';
  if (docType === 'PAN') return 'PAN must be in format ABCDE1234F.';
  if (docType === 'PASSPORT') return 'Passport must be 1 letter followed by 7 digits.';
  if (docType === 'DRIVING_LICENSE') return 'Enter a valid driving license number.';
  if (docType === 'RATION_CARD') return 'Ration card must be 8-20 alphanumeric characters.';
  return 'Enter a valid document number.';
}

function validateKycFile(file: File | null, label: string, imageOnly = true) {
  if (!file) return `${label} is required.`;
  const allowed = imageOnly ? /^image\//i.test(file.type) : /^image\//i.test(file.type) || file.type === 'application/pdf';
  if (!allowed) return `${label} must be an image${imageOnly ? '' : ' or PDF'}.`;
  if (file.size > 8 * 1024 * 1024) return `${label} must be smaller than 8 MB.`;
  return null;
}

function KycSection({
  profile,
  onKycUpdated,
  initialOpen = false,
  fullScreen = false,
}: {
  profile: HelperProfile | null;
  onKycUpdated: () => void;
  initialOpen?: boolean;
  fullScreen?: boolean;
}) {
  const { accessToken, user } = useAuth();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(initialOpen);
  const [fullName, setFullName] = useState('');
  const [docType, setDocType] = useState<KycDocType>('AADHAAR');
  const [otherDocType, setOtherDocType] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [idFront, setIdFront] = useState<File | null>(null);
  const [idBack, setIdBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [accountHolderName, setAccountHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [upiId, setUpiId] = useState('');
  const [ifscResult, setIfscResult] = useState<IfscLookupResult | null>(null);
  const [ifscBusy, setIfscBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedReference, setSubmittedReference] = useState<string | null>(null);

  const status = profile?.kycStatus || 'NOT_SUBMITTED';
  const selectedDoc = kycDocTypes.find((item) => item.value === docType) || kycDocTypes[0];
  const requiresBackUpload = docType === 'AADHAAR';
  const idValidationText = kycIdValidationText(idNumber, docType, otherDocType);
  const bankAccountClean = accountNumber.replace(/\s+/g, '');
  const confirmAccountClean = confirmAccountNumber.replace(/\s+/g, '');
  const normalizedIfsc = ifscCode.trim().toUpperCase();
  const upiValid = !upiId.trim() || /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test(upiId.trim());
  const canEdit = status !== 'APPROVED';

  useEffect(() => {
    if (!fullName && user?.displayName) setFullName(user.displayName);
  }, [fullName, user?.displayName]);

  useEffect(() => {
    if (!accountHolderName && fullName.trim()) setAccountHolderName(fullName.trim());
  }, [accountHolderName, fullName]);

  const verifyIfsc = async () => {
    setIfscBusy(true);
    setIfscResult(null);
    setError(null);
    try {
      const result = await verifyIfscCode(normalizedIfsc);
      setIfscResult(result);
      setBankName(result.BANK || bankName);
      showToast(`IFSC verified: ${result.BANK}`, 'success');
    } catch (err) {
      const msg = toUserMessage(err);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIfscBusy(false);
    }
  };

  const validateForm = () => {
    if (fullName.trim().length < 3) return 'Enter full legal name as per document.';
    if (docType === 'OTHER' && otherDocType.trim().length < 3) return 'Enter the other document name.';
    if (!validateKycIdNumber(idNumber, docType)) return idValidationText || 'Enter a valid document number.';
    const frontError = validateKycFile(idFront, 'ID front photo');
    if (frontError) return frontError;
    if (requiresBackUpload) {
      const backError = validateKycFile(idBack, 'Aadhaar back photo');
      if (backError) return backError;
    }
    const selfieError = validateKycFile(selfie, 'Partner selfie');
    if (selfieError) return selfieError;
    if (accountHolderName.trim().length < 3) return 'Enter account holder name.';
    if (bankName.trim().length < 2) return 'Enter bank name or verify IFSC to fill it.';
    if (!/^\d{9,18}$/.test(bankAccountClean)) return 'Enter a valid 9-18 digit bank account number.';
    if (bankAccountClean !== confirmAccountClean) return 'Bank account number and confirmation do not match.';
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalizedIfsc)) return 'Enter a valid 11-character IFSC code.';
    if (!ifscResult || ifscResult.IFSC !== normalizedIfsc) return 'Verify IFSC before submitting KYC.';
    if (!upiValid) return 'Enter a valid UPI ID or leave it blank.';
    return null;
  };

  const submitKyc = async () => {
    const validation = validateForm();
    if (validation || !idFront || !selfie) {
      const msg = validation || 'Complete KYC form before submitting.';
      setError(msg);
      showToast(msg, 'error');
      return;
    }
    if (!accessToken) {
      const msg = 'Sign in with phone OTP before submitting KYC.';
      setError(msg);
      showToast(msg, 'error');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api.submitKyc(
        accessToken,
        fullName.trim(),
        docType === 'OTHER' ? otherDocType.trim() : docType,
        idNumber.trim().toUpperCase(),
        idFront,
        requiresBackUpload ? idBack : null,
        selfie,
        {
          accountHolderName: accountHolderName.trim(),
          bankName: bankName.trim(),
          bankAccountNumber: bankAccountClean,
          ifscCode: normalizedIfsc,
          ifscBank: ifscResult?.BANK || bankName.trim(),
          ifscBranch: ifscResult?.BRANCH || null,
          ifscCity: ifscResult?.CITY || null,
          upiId: upiId.trim() || null,
        },
      );
      setSubmittedReference(response.kycTokenNumber || 'Pending');
      setShowForm(false);
      showToast('KYC submitted for Admin review!', 'success');
      onKycUpdated();
    } catch (err) {
      const msg = toUserMessage(err);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`panel kyc-panel ${fullScreen ? 'kyc-panel-full' : ''}`}>
      <div className="kyc-header">
        <div>
          <span className="eyebrow">Partner verification</span>
          <h2>{fullScreen ? 'Complete Partner KYC' : 'KYC Verification'}</h2>
          <p className="muted">{fullScreen ? 'Submit identity documents and payout details for Admin review from your Partner account.' : 'Upload identity documents and payout bank details for admin review.'}</p>
        </div>
        <span className={`status-pill ${status.toLowerCase().replace('_', '-')}`}>{status.replace('_', ' ')}</span>
      </div>
      {!fullScreen && (
        <div className="kyc-actions">
          {status !== 'APPROVED' && (
          <button className="primary kyc-complete-btn" onClick={() => setShowForm(!showForm)}>
            <ShieldCheck size={18} /> {showForm ? 'Cancel KYC Form' : status === 'REJECTED' ? 'Re-submit KYC' : 'Complete KYC'}
          </button>
          )}
        </div>
      )}

      {profile?.kycRejectionReason && (
        <div className="notice error" style={{ margin: '10px 0' }}>
          Rejection Reason: {profile.kycRejectionReason}
        </div>
      )}

      {status === 'PENDING' && (
        <p className="muted">
          Your KYC is under review. Token: <strong>{profile?.kycTokenNumber || 'Pending'}</strong>
          {profile?.kycQueuePosition && ` (Queue Pos: ${profile.kycQueuePosition})`}
        </p>
      )}

      {status === 'APPROVED' && (
        <p className="muted">Your KYC is fully verified. You can go online to accept nearby tasks!</p>
      )}

      {profile?.bankDetails && (
        <div className="kyc-bank-summary">
          <strong>Bank details saved</strong>
          <span>{profile.bankDetails.bankName || profile.bankDetails.ifscBank || 'Bank'} • Account ending {profile.bankDetails.bankAccountLast4 || '----'}</span>
          <span>{profile.bankDetails.ifscCode}{profile.bankDetails.ifscBranch ? ` • ${profile.bankDetails.ifscBranch}` : ''}</span>
        </div>
      )}

      {submittedReference && (
        <div className="notice success" style={{ marginTop: 12 }}>
          <CheckCircle2 size={18} />
          <span>KYC submitted. Reference ID: <strong>{submittedReference}</strong>. Admin review is pending and our team can contact you by phone or email.</span>
        </div>
      )}

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); void submitKyc(); }} className="kyc-form">
          <div className="notice">
            <FileText size={18} />
            <span>This form submits your logged-in Partner KYC to Admin review. We store your documents, IFSC summary, and only the last 4 digits of your account number.</span>
          </div>
          <label>
            Full Name (As per ID Document)
            <input required disabled={!canEdit} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Name as per ID" aria-label="Legal Full Name" />
          </label>
          <div className="notice compact-contact-note">
            <Phone size={18} />
            <span>Logged in as <strong>{user?.phone ? `+91 ${normalizeIndianMobile(user.phone)}` : 'Partner'}</strong>. Admin will review this helper account.</span>
          </div>
          <div className="grid two compact">
            <label>
              Document Type
              <select disabled={!canEdit} value={docType} onChange={(e) => {
                const next = e.target.value as KycDocType;
                setDocType(next);
                setIdNumber((value) => sanitizeKycIdInput(value, next));
                if (next !== 'AADHAAR') setIdBack(null);
              }} aria-label="Document type">
                {kycDocTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>
              Document / ID Number
              <input required disabled={!canEdit} value={idNumber} onChange={(e) => setIdNumber(sanitizeKycIdInput(e.target.value, docType))} placeholder={selectedDoc.placeholder} aria-label="ID Number" />
            </label>
          </div>
          {docType === 'OTHER' && (
            <label>
              Other document name
              <input required disabled={!canEdit} value={otherDocType} onChange={(e) => setOtherDocType(e.target.value)} placeholder="Enter document name" aria-label="Other document name" />
            </label>
          )}
          {idValidationText && <div className="field-error">{idValidationText}</div>}

          <div className="grid two compact">
            <SelfiePicker label="ID Document Front" file={idFront} onSelect={setIdFront} required />
            <SelfiePicker label={requiresBackUpload ? 'Aadhaar Back' : 'ID Document Back (Optional)'} file={idBack} onSelect={setIdBack} required={requiresBackUpload} />
          </div>

          <SelfiePicker label="Partner Selfie Photo" file={selfie} onSelect={setSelfie} required />

          <div className="kyc-step-box">
            <div className={`kyc-step ${idFront ? 'done' : ''}`}><CheckCircle2 size={18} /> ID front</div>
            {requiresBackUpload && <div className={`kyc-step ${idBack ? 'done' : ''}`}><CheckCircle2 size={18} /> Aadhaar back</div>}
            <div className={`kyc-step ${selfie ? 'done' : ''}`}><CheckCircle2 size={18} /> Selfie</div>
            <div className={`kyc-step ${ifscResult ? 'done' : ''}`}><CheckCircle2 size={18} /> IFSC verified</div>
          </div>

          <div className="kyc-bank-section">
            <div>
              <span className="eyebrow">Payout details</span>
              <h3>Bank Details</h3>
            </div>
            <div className="grid two compact">
              <label>
                Account Holder Name
                <input required value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} placeholder="Name as per bank" aria-label="Account Holder Name" />
              </label>
              <label>
                Bank Name
                <input required value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Auto-filled after IFSC verification" aria-label="Bank Name" />
              </label>
            </div>
            <div className="grid two compact">
              <label>
                Account Number
                <input required inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 18))} placeholder="9-18 digit account number" aria-label="Account Number" />
              </label>
              <label>
                Confirm Account Number
                <input required inputMode="numeric" value={confirmAccountNumber} onChange={(e) => setConfirmAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 18))} placeholder="Re-enter account number" aria-label="Confirm Account Number" />
              </label>
            </div>
            <div className="grid two compact">
              <label>
                IFSC Code
                <input required value={ifscCode} onChange={(e) => {
                  setIfscCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11));
                  setIfscResult(null);
                }} placeholder="HDFC0000001" aria-label="IFSC Code" />
              </label>
              <label>
                UPI ID (Optional)
                <input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="name@upi" aria-label="UPI ID" />
              </label>
            </div>
            <div className="kyc-ifsc-row">
              <button type="button" className="secondary" onClick={verifyIfsc} disabled={ifscBusy || !normalizedIfsc}>
                {ifscBusy ? 'Verifying IFSC...' : 'Verify IFSC'}
              </button>
              {ifscResult && (
                <span className="ifsc-result">
                  <CheckCircle2 size={16} /> {ifscResult.BANK} • {ifscResult.BRANCH}{ifscResult.CITY ? `, ${ifscResult.CITY}` : ''}
                </span>
              )}
            </div>
          </div>

          {error && <div className="notice error">{error}</div>}
          <button className="primary submit-admin-btn" disabled={busy}>
            {busy ? 'Submitting...' : 'Submit KYC for Admin Review'}
          </button>
        </form>
      )}
    </section>
  );
}

function PartnerKycLaunchCard({ profile }: { profile: HelperProfile | null }) {
  const status = profile?.kycStatus || 'NOT_SUBMITTED';
  const isApproved = status === 'APPROVED';
  const isPending = status === 'PENDING';
  return (
    <section className={`panel kyc-launch-card ${isApproved ? 'approved' : ''}`}>
      <div className="kyc-launch-icon">
        <ShieldCheck size={30} />
      </div>
      <div className="kyc-launch-copy">
        <span className="eyebrow">Partner verification</span>
        <h2>{isApproved ? 'KYC approved' : isPending ? 'KYC under review' : 'Complete your KYC'}</h2>
        <p>{isApproved ? 'Your documents are verified. You can go online and accept tasks.' : 'Upload ID, selfie, Aadhaar back where needed, and payout details for Admin review.'}</p>
        {profile?.bankDetails && (
          <small>{profile.bankDetails.bankName || 'Bank'} • Account ending {profile.bankDetails.bankAccountLast4 || '----'}</small>
        )}
      </div>
      <Link className="kyc-launch-button" to="/partner/kyc">
        {isApproved ? 'View KYC' : isPending ? 'Track KYC' : 'Start KYC'}
        <ChevronRight size={18} />
      </Link>
    </section>
  );
}

function PartnerKycPage() {
  const { accessToken } = useAuth();
  const [profile, setProfile] = useState<HelperProfile | null>(null);

  const loadProfile = useCallback(async () => {
    if (!accessToken) return;
    try {
      setProfile(await api.helperProfile(accessToken));
    } catch {
      setProfile(null);
    }
  }, [accessToken]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  return (
    <Shell>
      <main className="workspace kyc-page-workspace">
        <section className="kyc-page-hero">
          <button className="icon-button" type="button" onClick={() => window.history.back()} aria-label="Go back">
            <ArrowLeft size={20} />
          </button>
          <div>
            <span className="eyebrow">Superherooo Partner</span>
            <h1>Verification Center</h1>
            <p>Complete KYC in one secure workspace. Admin approval unlocks online status and live job acceptance.</p>
          </div>
        </section>
        <KycSection profile={profile} onKycUpdated={loadProfile} initialOpen fullScreen />
      </main>
    </Shell>
  );
}

function PartnerDashboard() {
  const { accessToken, user } = useAuth();
  const { showToast } = useToast();
  const socket = useSocket();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<HelperProfile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [online, setOnline] = useState(() => localStorage.getItem(partnerOnlineKey) === 'true');
  const [lastLoc, setLastLoc] = useState<{ lat: number; lng: number } | null>(() => {
    try {
      const raw = localStorage.getItem(partnerLastLocationKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'NEARBY' | 'MY_TASKS'>('NEARBY');
  const completedPartnerTasks = activeTasks.filter((task) => task.status === 'COMPLETED');
  const activeJob = activeTasks.find((task) => ['ASSIGNED', 'ARRIVED', 'STARTED'].includes(task.status));
  const todayStart = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);
  const todayEarnings = completedPartnerTasks
    .filter((task) => task.createdAt && new Date(task.createdAt) >= todayStart)
    .reduce((sum, task) => sum + (task.budgetPaise || 0), 0);
  const weeklyEarnings = completedPartnerTasks
    .filter((task) => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return task.createdAt && new Date(task.createdAt) >= weekAgo;
    })
    .reduce((sum, task) => sum + (task.budgetPaise || 0), 0);
  const firstName = user?.displayName?.split(' ')[0] || 'Hero';
  const greeting = new Date().getHours() < 12 ? 'Good Morning' : new Date().getHours() < 17 ? 'Good Afternoon' : 'Good Evening';
  const rankName = completedPartnerTasks.length >= 15 ? 'Gold Hero' : completedPartnerTasks.length >= 5 ? 'Silver Hero' : 'Bronze Hero';
  const rankProgress = Math.min(100, completedPartnerTasks.length >= 15 ? 100 : completedPartnerTasks.length >= 5 ? ((completedPartnerTasks.length - 5) / 10) * 100 : (completedPartnerTasks.length / 5) * 100);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [profileRes, available, mine] = await Promise.all([
        api.helperProfile(accessToken),
        api.availableTasks(accessToken).catch(() => []),
        api.myTasks(accessToken).catch(() => []),
      ]);
      setProfile(profileRes);
      setTasks(available);
      setActiveTasks(mine);
    } catch (err) {
      setError(toUserMessage(err));
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    const handleNewOffer = (payload?: any) => {
      load();
      playChimeSound();
      showToast('New nearby job offered!', 'info');
      showWebPushNotification('New Nearby Task Available!', {
        body: payload?.title ? `${payload.title} - ${money(payload.budgetPaise)}` : 'A new task was offered near you.',
      });
    };

    socket.on('task.offered', handleNewOffer);
    socket.on('task_created', handleNewOffer);
    socket.on('task_assigned', () => load());
    socket.on('task.assigned', () => load());
    socket.on('task_status_changed', () => load());
    socket.on('task.status.changed', () => load());
    return () => {
      socket.off('task.offered', handleNewOffer);
      socket.off('task_created', handleNewOffer);
      socket.off('task_assigned');
      socket.off('task.assigned');
      socket.off('task_status_changed');
      socket.off('task.status.changed');
    };
  }, [socket, load, showToast]);

  useEffect(() => {
    if (!online || !socket || !lastLoc) return;
    const send = () => socket.emit('location.update', { ...lastLoc, role: 'HELPER' });
    send();
    const id = window.setInterval(send, 15000);
    return () => window.clearInterval(id);
  }, [online, socket, lastLoc]);

  useEffect(() => {
    if (!accessToken || !online) return;
    let cancelled = false;
    const restoreOnline = async () => {
      try {
        const loc = await getLocation().catch(() => WEB_DEMO_MODE ? (lastLoc || { lat: 17.385, lng: 78.4867 }) : lastLoc);
        if (!loc || cancelled) return;
        await api.helperOnline(accessToken, true, loc.lat, loc.lng);
        localStorage.setItem(partnerOnlineKey, 'true');
        localStorage.setItem(partnerLastLocationKey, JSON.stringify(loc));
        setLastLoc(loc);
        socket?.emit('location.update', { ...loc, role: 'HELPER' });
      } catch (err) {
        const msg = toUserMessage(err);
        setError(msg);
      }
    };
    restoreOnline();
    return () => {
      cancelled = true;
    };
  }, [accessToken, online, socket]);

  const toggleOnline = async () => {
    if (!accessToken) return;
    setError(null);
    try {
      if (online) {
        await api.helperOnline(accessToken, false);
        setOnline(false);
        localStorage.removeItem(partnerOnlineKey);
        showToast('You are now Offline', 'info');
        return;
      }
      await requestNotificationPermission();
      const loc = await getLocation().catch((err) => {
        if (WEB_DEMO_MODE) return { lat: 17.385, lng: 78.4867 };
        throw err;
      });
      await api.helperOnline(accessToken, true, loc.lat, loc.lng);
      setLastLoc(loc);
      setOnline(true);
      localStorage.setItem(partnerOnlineKey, 'true');
      localStorage.setItem(partnerLastLocationKey, JSON.stringify(loc));
      socket?.emit('location.update', { ...loc, role: 'HELPER' });
      showToast('You are now Online and receiving job offers!', 'success');
      await load();
    } catch (err) {
      const msg = toUserMessage(err);
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const accept = async (taskId: string) => {
    if (!accessToken) return;
    setError(null);
    try {
      await api.acceptTask(accessToken, taskId);
      showToast('Task accepted!', 'success');
      navigate(`/partner/tasks/${taskId}`);
    } catch (err) {
      const msg = toUserMessage(err);
      setError(msg);
      showToast(msg, 'error');
    }
  };

  return (
    <Shell>
      <main className="workspace">
        <EmailVerificationCard />
        <section className="rn-partner-home">
          <div className="rn-home-header">
            <img src="/assets/finallogo.png" alt="Superherooo" />
            <div className="rn-header-center">
              <strong>{greeting}, Mr. {firstName}</strong>
              <span><MapPin size={13} /> {lastLoc ? `${lastLoc.lat.toFixed(4)}, ${lastLoc.lng.toFixed(4)}` : 'Location ready when online'}</span>
            </div>
            <button
              className="rn-round-button light"
              aria-label="Notifications"
              onClick={() => requestNotificationPermission().then((permission) => showToast(permission === 'granted' ? 'Notifications enabled.' : 'Notifications not enabled.', permission === 'granted' ? 'success' : 'info'))}
            >
              <Bell size={22} />
            </button>
          </div>

          <button
            type="button"
            onClick={toggleOnline}
            disabled={false}
            className={`rn-online-card ${online ? 'online' : 'offline'}`}
          >
            <div>
              <strong>{online ? 'You are online' : 'You are offline'}</strong>
              <span>{online ? 'Nearby jobs can reach you now.' : 'Go online when you are ready to accept jobs.'}</span>
            </div>
            <span className="rn-toggle"><i /></span>
          </button>
        </section>
        {error && <div className="notice error">{error}</div>}

        {(!online || activeJob) && (
          <section className="rn-earnings-card">
            <div className="rn-earning-ring">
              <strong>{money(todayEarnings)}</strong>
              <span>Today</span>
            </div>
            <div className="rn-earning-stats">
              <div><span>Weekly Earnings</span><strong>{money(weeklyEarnings)}</strong></div>
              <div><span>Eligible Task Value</span><strong>{money(completedPartnerTasks.reduce((sum, task) => sum + (task.budgetPaise || 0), 0))}</strong></div>
            </div>
            <Link className="rn-withdraw-btn" to="/partner/earnings">View Payment Status</Link>
          </section>
        )}

        {activeJob && (
          <section className="rn-active-job">
            <div className="section-head">
              <h2>Active Job</h2>
              <span className="live-pulse" />
            </div>
            <div className="job-top-row">
              <div>
                <span className="urgent-pill">{activeJob.urgency === 'HIGH' ? 'URGENT' : 'STANDARD'}</span>
                <h3>{activeJob.title}</h3>
                <p>{activeJob.addressText || 'Customer location'}</p>
              </div>
              <div className="time-wrap">
                <strong>{activeJob.timeMinutes}m</strong>
                <span>Estimate</span>
              </div>
            </div>
            <div className="offer-actions">
              <a className="secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${activeJob.lat},${activeJob.lng}`} target="_blank" rel="noreferrer"><Navigation size={17} /> Navigate</a>
              <Link className="primary" to={`/partner/tasks/${activeJob.id}`}>Active task</Link>
            </div>
          </section>
        )}

        <div className="grid three rn-partner-summary">
          <PartnerKycLaunchCard profile={profile} />
          <section className="panel">
            <h2>Online Dispatch</h2>
            <div className={`status-pill ${online ? 'approved' : ''}`}>{online ? 'Online' : 'Offline'}</div>
            <p className="muted" style={{ marginTop: '10px' }}>
              {lastLoc ? `Lat: ${lastLoc.lat.toFixed(5)}, Lng: ${lastLoc.lng.toFixed(5)}` : 'Location not shared yet.'}
            </p>
          </section>
          <section className="panel">
            <h2>Active Jobs</h2>
            <strong className="big-number">{activeTasks.filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status)).length}</strong>
            <p className="muted" style={{ marginTop: '10px' }}>In-progress assigned tasks</p>
          </section>
        </div>

        <section className="rn-rank-card">
          <div className="rank-top-row">
            <span><ShieldCheck size={24} /></span>
            <div>
              <h2>{rankName}</h2>
              <p>{completedPartnerTasks.length >= 15 ? 'You have reached the highest rank.' : `${completedPartnerTasks.length} completed jobs. Keep going to unlock the next rank.`}</p>
            </div>
          </div>
          <div className="progress-bar-bg"><span style={{ width: `${rankProgress}%` }} /></div>
          <div className="rank-stats-row">
            <div><strong>--</strong><span>Rating</span></div>
            <div><strong>{completedPartnerTasks.length}</strong><span>Tasks</span></div>
            <div><strong>98%</strong><span>Acceptance</span></div>
          </div>
        </section>

        <section className="panel list-panel" style={{ marginTop: '20px' }}>
          <div className="tab-switcher">
            <button className={`tab-btn ${tab === 'NEARBY' ? 'active' : ''}`} onClick={() => setTab('NEARBY')}>
              Nearby Offers ({tasks.length})
            </button>
            <button className={`tab-btn ${tab === 'MY_TASKS' ? 'active' : ''}`} onClick={() => setTab('MY_TASKS')}>
              My Accepted Jobs ({activeTasks.length})
            </button>
          </div>

          {tab === 'NEARBY' ? (
            tasks.length === 0 ? (
              <p className="muted" style={{ padding: '16px 0' }}>No nearby tasks offered right now. Stay online to receive jobs.</p>
            ) : (
              tasks.map((task) => (
                <article key={task.id} className="offer-card">
                  <div>
                    <h3>{task.title}</h3>
                    <p style={{ margin: '4px 0 8px 0', color: 'var(--muted)' }}>{task.description}</p>
                    <div className="meta-row">
                      <span>{money(task.budgetPaise)}</span>
                      <span>{task.timeMinutes} mins</span>
                      <span>{formatWhen(task.scheduledAt)}</span>
                    </div>
                  </div>
                  <div className="offer-actions">
                    <a className="secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${task.lat},${task.lng}`} target="_blank" rel="noreferrer">
                      <Navigation size={17} /> Directions
                    </a>
                    <button className="primary" onClick={() => accept(task.id)}>Accept Job</button>
                  </div>
                </article>
              ))
            )
          ) : (
            activeTasks.length === 0 ? (
              <p className="muted" style={{ padding: '16px 0' }}>You have not accepted any jobs yet.</p>
            ) : (
              activeTasks.map((task) => (
                <Link key={task.id} className="task-card" to={`/partner/tasks/${task.id}`}>
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.addressText || `${task.lat}, ${task.lng}`}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <b style={{ color: 'var(--navy)', fontSize: '1.1rem' }}>{money(task.budgetPaise)}</b>
                    <span className={`status-pill ${task.status.toLowerCase()}`}>
                      {['SEARCHING', 'ASSIGNED', 'ARRIVED', 'STARTED'].includes(task.status) && <span className="live-pulse" />}
                      {statusText(task.status)}
                    </span>
                  </div>
                </Link>
              ))
            )
          )}
        </section>
      </main>
    </Shell>
  );
}

function PartnerTaskPage() {
  const { taskId = '' } = useParams();
  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const socket = useSocket();
  const [task, setTask] = useState<Task | null>(null);
  const [otp, setOtp] = useState('');
  const [selfie, setSelfie] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !taskId) return;
    try {
      setTask(await api.task(accessToken, taskId));
    } catch (err) {
      setError(toUserMessage(err));
    }
  }, [accessToken, taskId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!socket || !taskId) return;
    socket.emit('task.subscribe', { taskId });
    const refresh = () => load();
    socket.on('task_status_changed', refresh);
    socket.on('task.status.changed', refresh);
    return () => {
      socket.off('task_status_changed', refresh);
      socket.off('task.status.changed', refresh);
    };
  }, [socket, taskId, load]);

  const getStepNumber = () => {
    if (!task) return 1;
    if (task.status === 'ASSIGNED') return 1;
    if (task.status === 'ARRIVED') return 2;
    if (task.status === 'STARTED' && !task.completionSelfieUrl) return 3;
    if (task.status === 'STARTED' && task.completionSelfieUrl) return 4;
    return 4;
  };

  const stepNumber = getStepNumber();

  const handleStepAction = async (targetStatus: TaskStatus, stage?: TaskSelfieStage) => {
    if (!accessToken || !task) return;
    setBusy(true);
    setError(null);
    try {
      if (stage) {
        if (!selfie && ((stage === 'ARRIVAL' && !task.arrivalSelfieUrl) || (stage === 'COMPLETION' && !task.completionSelfieUrl))) {
          throw new Error(`Please select or capture ${stage.toLowerCase()} photo first.`);
        }
        if (selfie) {
          const loc = await getLocation().catch(() => ({ lat: task.lat, lng: task.lng }));
          await api.uploadTaskSelfie(accessToken, task.id, stage, selfie, loc.lat, loc.lng, task.addressText);
        }
      }
      const updated = await api.updateTaskStatus(accessToken, task.id, targetStatus, otp || undefined);
      setTask(updated);
      setOtp('');
      setSelfie(null);
      showToast(`Step completed: ${statusText(targetStatus)}`, 'success');
      if (targetStatus === 'COMPLETED') {
        setShowCelebration(true);
      }
    } catch (err) {
      const msg = toUserMessage(err);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <main className="workspace">
        {error && <div className="notice error">{error}</div>}
        {task && (
          <>
            <TaskDetail task={task} role="HELPER" onOpenChat={() => setShowChat(true)} />
            {task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
              <section className="panel step-container" style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h2>Task Execution Steps</h2>
                  <span className={`status-pill ${task.status.toLowerCase()}`}>{statusText(task.status)}</span>
                </div>

                <div className={`step-card ${stepNumber === 1 ? 'active-step' : ''}`}>
                  <div className="step-header">
                    <h3>Step 1: Arrive at Location</h3>
                    <span className={`step-badge ${task.arrivalSelfieUrl || stepNumber > 1 ? 'done' : ''}`}>
                      {task.arrivalSelfieUrl || stepNumber > 1 ? '✓ Completed' : 'Pending'}
                    </span>
                  </div>
                  {stepNumber === 1 && (
                    <>
                      <SelfiePicker
                        label="Arrival Selfie Photo"
                        file={selfie}
                        onSelect={setSelfie}
                        existingUrl={task.arrivalSelfieUrl}
                        required
                      />
                      <button
                        className="accent-btn"
                        disabled={busy}
                        onClick={() => handleStepAction('ARRIVED', 'ARRIVAL')}
                      >
                        {busy ? 'Updating...' : 'Mark Arrived'}
                      </button>
                    </>
                  )}
                </div>

                <div className={`step-card ${stepNumber === 2 ? 'active-step' : ''}`}>
                  <div className="step-header">
                    <h3>Step 2: Start Work (Citizen OTP)</h3>
                    <span className={`step-badge ${stepNumber > 2 ? 'done' : ''}`}>
                      {stepNumber > 2 ? '✓ Completed' : 'Pending'}
                    </span>
                  </div>
                  {stepNumber === 2 && (
                    <>
                      <label>
                        Citizen Arrival OTP
                        <input
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          placeholder="Enter 6-digit OTP from citizen"
                          aria-label="Citizen arrival OTP"
                        />
                      </label>
                      <button
                        className="accent-btn"
                        disabled={busy || !otp}
                        onClick={() => handleStepAction('STARTED')}
                      >
                        {busy ? 'Starting...' : 'Start Task'}
                      </button>
                    </>
                  )}
                </div>

                <div className={`step-card ${stepNumber === 3 ? 'active-step' : ''}`}>
                  <div className="step-header">
                    <h3>Step 3: Completion Selfie Photo</h3>
                    <span className={`step-badge ${task.completionSelfieUrl ? 'done' : ''}`}>
                      {task.completionSelfieUrl ? '✓ Uploaded' : 'Pending'}
                    </span>
                  </div>
                  {stepNumber === 3 && (
                    <>
                      <SelfiePicker
                        label="Work Completion Selfie"
                        file={selfie}
                        onSelect={setSelfie}
                        existingUrl={task.completionSelfieUrl}
                        required
                      />
                      <button
                        className="accent-btn"
                        disabled={busy || (!selfie && !task.completionSelfieUrl)}
                        onClick={async () => {
                          if (selfie && accessToken) {
                            setBusy(true);
                            setError(null);
                            try {
                              const loc = await getLocation().catch(() => ({ lat: task.lat, lng: task.lng }));
                              const updated = await api.uploadTaskSelfie(accessToken, task.id, 'COMPLETION', selfie, loc.lat, loc.lng, task.addressText);
                              setTask(updated);
                              setSelfie(null);
                              showToast('Completion selfie uploaded!', 'success');
                            } catch (err) {
                              setError(toUserMessage(err));
                            } finally {
                              setBusy(false);
                            }
                          }
                        }}
                      >
                        {busy ? 'Uploading...' : 'Upload Completion Selfie'}
                      </button>
                    </>
                  )}
                </div>

                <div className={`step-card ${stepNumber === 4 ? 'active-step' : ''}`}>
                  <div className="step-header">
                    <h3>Step 4: End Task (Citizen Completion OTP)</h3>
                    <span className="step-badge">Pending</span>
                  </div>
                  {stepNumber === 4 && (
                    <>
                      <label>
                        Citizen Completion OTP
                        <input
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          placeholder="Enter 6-digit completion OTP from citizen"
                          aria-label="Citizen completion OTP"
                        />
                      </label>
                      <button
                        className="primary"
                        disabled={busy || !otp}
                        onClick={() => handleStepAction('COMPLETED')}
                      >
                        {busy ? 'Completing Task...' : 'Complete & Finish Task'}
                      </button>
                    </>
                  )}
                </div>
              </section>
            )}
          </>
        )}
        {showChat && taskId && <TaskChatModal taskId={taskId} onClose={() => setShowChat(false)} />}
        {showCelebration && task && <CelebrationModal task={task} onClose={() => setShowCelebration(false)} />}
      </main>
    </Shell>
  );
}

function TaskDetail({
  task,
  role,
  helperLoc,
  onOpenChat,
}: {
  task: Task;
  role: 'BUYER' | 'HELPER';
  helperLoc?: { lat: number; lng: number } | null;
  onOpenChat?: () => void;
}) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const fallbackStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (task.status !== 'STARTED') {
      fallbackStartedAtRef.current = null;
      setElapsedSec(0);
      return;
    }
    const recordedStartMs = task.workStartedAt ? new Date(task.workStartedAt).getTime() : NaN;
    if (!Number.isFinite(recordedStartMs) && !fallbackStartedAtRef.current) {
      fallbackStartedAtRef.current = Date.now();
    }
    const startMs = Number.isFinite(recordedStartMs) ? recordedStartMs : fallbackStartedAtRef.current || Date.now();
    const updateTimer = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [task.status, task.workStartedAt]);

  const formatTimer = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${hrs > 0 ? String(hrs).padStart(2, '0') + ':' : ''}${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const contactPhone = role === 'BUYER' ? task.helperPhone : task.buyerPhone;
  const contactName = role === 'BUYER' ? task.helperName || 'Partner' : task.buyerName || 'Citizen';

  return (
    <section className="panel detail-panel">
      <BackHeader title={role === 'BUYER' ? 'Booking Details' : 'Job Details'} subtitle={`Task ${task.id.slice(0, 8)}`} />
      <div className="detail-header">
        <div>
          <span className="eyebrow">{role === 'BUYER' ? 'Citizen Booking' : 'Partner Job'}</span>
          <h1 style={{ marginTop: '4px' }}>{task.title}</h1>
          <p style={{ color: 'var(--muted)' }}>{task.description}</p>
        </div>
        <div className="status-stack" style={{ alignItems: 'flex-end', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span className={`status-pill ${task.status.toLowerCase()}`}>
            {['SEARCHING', 'ASSIGNED', 'ARRIVED', 'STARTED'].includes(task.status) && <span className="live-pulse" />}
            {statusText(task.status)}
          </span>
          <strong style={{ fontSize: '1.8rem', color: 'var(--navy)' }}>{money(task.budgetPaise)}</strong>
        </div>
      </div>
      <StatusTimeline status={task.status} />

      <div className="grid three" style={{ marginTop: '16px' }}>
        <Info label="When" value={formatWhen(task.scheduledAt)} />
        <Info label="Duration" value={`${task.timeMinutes} minutes`} />
        <Info label="Payment" value="Cash or UPI directly to Partner" />
        <Info label="Address" value={task.addressText || `${task.lat}, ${task.lng}`} />
        <Info label="Landmark" value={task.landmark || 'Not provided'} />
        <Info label="Assigned Partner" value={task.helperName || task.helperPhone || 'Searching...'} />
      </div>

      {['ASSIGNED', 'ARRIVED', 'STARTED'].includes(task.status) && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px', padding: '14px', background: 'var(--soft)', borderRadius: '12px' }}>
          {contactPhone && (
            <a className="secondary" href={`tel:${contactPhone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Phone size={17} /> Call {contactName}
            </a>
          )}
          <button className="accent-btn" onClick={onOpenChat}>
            <MessageCircle size={17} /> Live In-App Chat
          </button>
          <a className="sos-btn" href="tel:112">
            <AlertTriangle size={17} /> Emergency SOS
          </a>
        </div>
      )}

      {role === 'BUYER' && (
        <div className="otp-grid" style={{ marginTop: '16px' }}>
          <div><span>Arrival OTP</span><strong>{task.arrivalOtp || 'Assigned after booking'}</strong></div>
          <div><span>Completion OTP</span><strong>{task.completionOtp || 'Assigned after booking'}</strong></div>
        </div>
      )}

      {task.status === 'STARTED' && (
        <div className="notice success" style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span><Timer size={18} /> Work In Progress: Timer Running</span>
          <strong style={{ fontSize: '1.3rem', fontFamily: 'monospace' }}>{formatTimer(elapsedSec)}</strong>
        </div>
      )}

      {helperLoc && <div className="notice" style={{ marginTop: '16px' }}><MapPin size={18} /> Partner Live Location: {helperLoc.lat.toFixed(5)}, {helperLoc.lng.toFixed(5)}</div>}

      <a className="secondary" style={{ marginTop: '16px', display: 'inline-flex', width: 'fit-content' }} href={`https://www.google.com/maps/dir/?api=1&destination=${task.lat},${task.lng}`} target="_blank" rel="noreferrer">
        <Navigation size={17} /> Open Directions
      </a>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info"><span>{label}</span><strong>{value}</strong></div>;
}

function CitizenTasksPage() {
  const { accessToken } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const socket = useSocket();

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setTasks(await api.myTasks(accessToken));
    } catch (err) {
      setError(toUserMessage(err));
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!socket) return;
    const refresh = () => load();
    socket.on('task_assigned', refresh);
    socket.on('task.assigned', refresh);
    socket.on('task_status_changed', refresh);
    socket.on('task.status.changed', refresh);
    return () => {
      socket.off('task_assigned', refresh);
      socket.off('task.assigned', refresh);
      socket.off('task_status_changed', refresh);
      socket.off('task.status.changed', refresh);
    };
  }, [socket, load]);

  return (
    <Shell>
      <main className="workspace mobile-stack">
        <BackHeader title="My Bookings" subtitle="Active, scheduled and completed tasks" />
        {error && <div className="notice error">{error}</div>}
        <TaskList title="Bookings" tasks={tasks} basePath="/citizen/tasks" />
      </main>
    </Shell>
  );
}

function CitizenWalletPage() {
  const { accessToken } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    api.myTasks(accessToken).then(setTasks).catch(() => setTasks([]));
  }, [accessToken]);

  const completed = tasks.filter((task) => task.status === 'COMPLETED');
  const total = completed.reduce((sum, task) => sum + (task.budgetPaise || 0), 0);

  return (
    <Shell>
      <main className="workspace mobile-stack">
        <BackHeader title="Wallet" subtitle="Cash and UPI settlement only" />
        <section className="panel wallet-hero">
          <span><Wallet size={26} /></span>
          <h1>{money(total)}</h1>
          <p>Total completed cash/UPI bookings tracked on web. No payment gateway is enabled.</p>
        </section>
        <section className="panel">
          <div className="section-head">
            <h2>Payment Records</h2>
            <span className="status-pill approved">{completed.length} completed</span>
          </div>
          {completed.length === 0 ? (
            <EmptyState icon={CreditCard} title="No completed payments yet" body="Completed bookings settled by cash or UPI will appear here." />
          ) : (
            completed.map((task) => (
              <Link key={task.id} className="task-card" to={`/citizen/tasks/${task.id}`}>
                <div>
                  <strong>{task.title}</strong>
                  <span>{formatWhen(task.createdAt)}</span>
                </div>
                <b>{money(task.budgetPaise)}</b>
              </Link>
            ))
          )}
        </section>
      </main>
    </Shell>
  );
}

function PartnerJobsPage() {
  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const socket = useSocket();
  const [available, setAvailable] = useState<Task[]>([]);
  const [mine, setMine] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [availableTasks, myTasks] = await Promise.all([
        api.availableTasks(accessToken).catch(() => []),
        api.myTasks(accessToken).catch(() => []),
      ]);
      setAvailable(availableTasks);
      setMine(myTasks);
    } catch (err) {
      setError(toUserMessage(err));
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!socket) return;
    const refresh = () => load();
    socket.on('task.offered', refresh);
    socket.on('task_created', refresh);
    socket.on('task_assigned', refresh);
    socket.on('task.assigned', refresh);
    socket.on('task_status_changed', refresh);
    socket.on('task.status.changed', refresh);
    return () => {
      socket.off('task.offered', refresh);
      socket.off('task_created', refresh);
      socket.off('task_assigned', refresh);
      socket.off('task.assigned', refresh);
      socket.off('task_status_changed', refresh);
      socket.off('task.status.changed', refresh);
    };
  }, [socket, load]);

  const accept = async (taskId: string) => {
    if (!accessToken) return;
    try {
      await api.acceptTask(accessToken, taskId);
      showToast('Task accepted. Follow the selfie and OTP steps.', 'success');
      navigate(`/partner/tasks/${taskId}`);
    } catch (err) {
      const msg = toUserMessage(err);
      setError(msg);
      showToast(msg, 'error');
    }
  };

  return (
    <Shell>
      <main className="workspace mobile-stack">
        <BackHeader title="Jobs" subtitle="Nearby offers and accepted jobs" />
        {error && <div className="notice error">{error}</div>}
        <section className="panel">
          <div className="section-head">
            <h2>Nearby Offers</h2>
            <span className="status-pill searching">{available.length} live</span>
          </div>
          {available.length === 0 ? (
            <EmptyState icon={BriefcaseBusiness} title="No nearby offers right now" body="Go online from Home and keep this page open for realtime offers." />
          ) : (
            available.map((task) => (
              <article key={task.id} className="offer-card">
                <div>
                  <h3>{task.title}</h3>
                  <p>{task.description}</p>
                  <div className="meta-row">
                    <span>{money(task.budgetPaise)}</span>
                    <span>{task.timeMinutes} mins</span>
                    <span>{formatWhen(task.scheduledAt)}</span>
                  </div>
                </div>
                <div className="offer-actions">
                  <a className="secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${task.lat},${task.lng}`} target="_blank" rel="noreferrer"><Navigation size={17} /> Directions</a>
                  <button className="primary" onClick={() => accept(task.id)}>Accept Job</button>
                </div>
              </article>
            ))
          )}
        </section>
        <TaskList title="My Accepted Jobs" tasks={mine} basePath="/partner/tasks" />
      </main>
    </Shell>
  );
}

function PartnerEarningsPage() {
  const { accessToken } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => {
    if (!accessToken) return;
    api.myTasks(accessToken).then(setTasks).catch(() => setTasks([]));
  }, [accessToken]);
  const completed = tasks.filter((task) => task.status === 'COMPLETED');
  const total = completed.reduce((sum, task) => sum + (task.budgetPaise || 0), 0);
  return (
    <Shell>
      <main className="workspace mobile-stack">
        <BackHeader title="Earnings" subtitle="Cash/UPI earnings from completed jobs" />
        <section className="panel wallet-hero partner-wallet">
          <span><Wallet size={26} /></span>
          <h1>{money(total)}</h1>
          <p>Collected directly from citizens by cash or UPI after OTP-verified completion.</p>
        </section>
        <section className="panel">
          <h2>Completed Jobs</h2>
          {completed.length === 0 ? (
            <EmptyState icon={Wallet} title="No earnings yet" body="Accept and complete jobs to see web earnings here." />
          ) : (
            completed.map((task) => (
              <Link key={task.id} className="task-card" to={`/partner/tasks/${task.id}`}>
                <div>
                  <strong>{task.title}</strong>
                  <span>{formatWhen(task.createdAt)}</span>
                </div>
                <b>{money(task.budgetPaise)}</b>
              </Link>
            ))
          )}
        </section>
      </main>
    </Shell>
  );
}

function PartnerInboxPage() {
  const { accessToken } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => {
    if (!accessToken) return;
    api.myTasks(accessToken).then(setTasks).catch(() => setTasks([]));
  }, [accessToken]);
  const chatTasks = tasks.filter((task) => ['ASSIGNED', 'ARRIVED', 'STARTED', 'COMPLETED'].includes(task.status));
  return (
    <Shell>
      <main className="workspace mobile-stack">
        <BackHeader title="Inbox" subtitle="Task chats with citizens" />
        <section className="panel">
          {chatTasks.length === 0 ? (
            <EmptyState icon={Inbox} title="No task chats yet" body="Accepted jobs will open secure in-app chat from their job detail screen." />
          ) : (
            chatTasks.map((task) => (
              <Link key={task.id} className="task-card" to={`/partner/tasks/${task.id}`}>
                <div>
                  <strong>{task.buyerName || 'Citizen'}</strong>
                  <span>{task.title}</span>
                </div>
                <span className={`status-pill ${task.status.toLowerCase()}`}>{statusText(task.status)}</span>
              </Link>
            ))
          )}
        </section>
      </main>
    </Shell>
  );
}

function SupportCenterPage() {
  const { accessToken, user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [category, setCategory] = useState<SupportTicketCategory>('GENERAL');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setTickets(await api.supportTickets(accessToken));
    } catch (err) {
      setError(toUserMessage(err));
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  if (!user) return <Navigate to="/login" replace />;

  const profilePath = user.role === 'BUYER' ? '/citizen/profile' : '/partner/profile';

  const createTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken) return;
    setError(null);
    setBusy(true);
    try {
      await api.createSupportTicket(accessToken, {
        category,
        subject: subject || null,
        message,
      });
      setSubject('');
      setMessage('');
      setCategory('GENERAL');
      showToast('Support request submitted.', 'success');
      await load();
    } catch (err) {
      const msg = toUserMessage(err);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <main className="workspace mobile-stack">
        <BackHeader title="Help Center" subtitle="Message Superherooo support" />
        <section className="panel support-compose-card">
          <form onSubmit={createTicket}>
            <label>
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value as SupportTicketCategory)}>
                <option value="GENERAL">General support</option>
                <option value="TASK">Booking or task</option>
                <option value="PAYMENT">Cash/UPI settlement</option>
                <option value="SAFETY">Safety concern</option>
              </select>
            </label>
            <label>
              Subject
              <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={140} placeholder="Short summary" />
            </label>
            <label>
              Message
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} required maxLength={4000} placeholder="Tell us what happened." rows={5} />
            </label>
            {error && <div className="notice error">{error}</div>}
            <button className="primary" disabled={busy}>{busy ? 'Submitting...' : 'Submit request'}</button>
          </form>
        </section>

        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Your Tickets</h2>
              <p>Account deletion requests and support conversations appear here.</p>
            </div>
            <button className="secondary icon-only" type="button" onClick={load} aria-label="Refresh support tickets"><Search size={17} /></button>
          </div>
          {tickets.length === 0 ? (
            <EmptyState icon={LifeBuoy} title="No support tickets yet" body="Create a support request and our team will reply from Admin support." />
          ) : (
            <div className="support-ticket-list">
              {tickets.map((ticket) => (
                <div className="support-ticket-card" key={ticket.id}>
                  <div>
                    <strong>{ticket.subject || categoryLabel(ticket.category)}</strong>
                    <span>{categoryLabel(ticket.category)} • {formatWhen(ticket.lastMessageAt || ticket.createdAt)}</span>
                  </div>
                  <span className={`status-pill ${String(ticket.status).toLowerCase()}`}>{ticket.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <button className="secondary" type="button" onClick={() => navigate(profilePath)}>Back to profile</button>
      </main>
    </Shell>
  );
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    GENERAL: 'General support',
    TASK: 'Booking or task',
    PAYMENT: 'Payment',
    SAFETY: 'Safety',
    ACCOUNT_DELETION: 'Account deletion',
  };
  return labels[category] || category.replace(/_/g, ' ').toLowerCase();
}

function ProfileView() {
  const { user, logout } = useAuth();
  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const [helperProfile, setHelperProfile] = useState<HelperProfile | null>(null);
  const [tasksCount, setTasksCount] = useState<number>(0);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [language, setLanguage] = useState(() => localStorage.getItem(languageKey) || 'English');
  const [savedAddresses] = useState<SavedAddress[]>(() => {
    try {
      const stored = localStorage.getItem(savedAddressesKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!accessToken) return;
    if (user?.role === 'HELPER') {
      api.helperProfile(accessToken).then(setHelperProfile).catch(() => { });
    }
    api.myTasks(accessToken).then((t) => setTasksCount(t.length)).catch(() => { });
  }, [accessToken, user?.role]);

  if (!user) return <Navigate to="/login" replace />;

  const getInitials = () => {
    if (user.displayName) {
      return user.displayName.split(' ').map((n) => n[0]).join('').toUpperCase();
    }
    return user.role[0];
  };

  const supportPath = user.role === 'BUYER' ? '/citizen/support' : '/partner/support';

  const requestAccountDeletion = async () => {
    if (!accessToken) return;
    const ok = window.confirm(
      'Request account deletion?\n\nAdmin support will verify and process deletion of your account and associated personal data. Active jobs or unresolved payments may need to be completed first.',
    );
    if (!ok) return;
    setDeletionBusy(true);
    try {
      await api.createSupportTicket(accessToken, {
        category: 'ACCOUNT_DELETION',
        subject: 'Account deletion request',
        message: 'I am requesting deletion of my Superherooo account and associated personal data.',
      });
      showToast('Account deletion request sent to Admin support.', 'success');
    } catch (err) {
      showToast(toUserMessage(err), 'error');
    } finally {
      setDeletionBusy(false);
    }
  };

  return (
    <Shell>
      <main className="workspace">
        <div className="panel profile-card">
          <div className="profile-header">
            <div className="profile-avatar">{getInitials()}</div>
            <div className="profile-details">
              <h2>{user.displayName || 'Superherooo User'}</h2>
              <span className="muted">{user.email || user.phone || 'No contact email'}</span>
              <div style={{ marginTop: '6px' }}>
                <span className="status-pill approved">{user.role}</span>
              </div>
            </div>
          </div>

          <EmailVerificationCard />

          {user.role === 'HELPER' && (
            <PartnerKycLaunchCard profile={helperProfile} />
          )}

          <div className="profile-stats-grid">
            <div className="profile-stat-box">
              <span>Total Bookings</span>
              <strong>{tasksCount}</strong>
            </div>
            <div className="profile-stat-box">
              <span>Account Role</span>
              <strong style={{ fontSize: '1.1rem' }}>{user.role}</strong>
            </div>
            <div className="profile-stat-box">
              <span>Email Verified</span>
              <strong style={{ fontSize: '1.1rem', color: user.emailVerified ? 'var(--green)' : 'var(--amber)' }}>
                {user.emailVerified ? '✓ Verified' : 'Pending'}
              </strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
            <Link className="secondary" to={user.role === 'BUYER' ? '/citizen' : '/partner'}>
              Go to Workspace Dashboard
            </Link>
            {!WEB_DEMO_MODE && <button className="danger" onClick={logout}>Sign Out</button>}
          </div>
        </div>

        <section className="profile-menu-grid">
          <div className="panel profile-section-card">
            <div className="profile-section-title"><User size={20} /><h2>Personal Info</h2></div>
            <Info label="Name" value={user.displayName || 'Not provided'} />
            <Info label="Email" value={user.email || 'Not provided'} />
            <Info label="Phone" value={user.phone || 'Optional on web'} />
            <Info label="Role" value={user.role === 'BUYER' ? 'Superherooo' : 'Partner'} />
          </div>

          <div className="panel profile-section-card">
            <div className="profile-section-title"><Languages size={20} /><h2>Language</h2></div>
            <label>
              Preferred language
              <select
                value={language}
                onChange={(event) => {
                  setLanguage(event.target.value);
                  localStorage.setItem(languageKey, event.target.value);
                }}
              >
                <option>English</option>
                <option>Hindi</option>
                <option>Telugu</option>
                <option>Tamil</option>
                <option>Kannada</option>
                <option>Marathi</option>
              </select>
            </label>
          </div>

          <div className="panel profile-section-card">
            <div className="profile-section-title"><Pin size={20} /><h2>Saved Addresses</h2></div>
            {savedAddresses.length === 0 ? (
              <p className="muted">Saved Home and Work addresses from task creation will appear here.</p>
            ) : (
              <div className="saved-address-list">
                {savedAddresses.map((address) => (
                  <div key={address.id} className="saved-address-item">
                    <strong>{address.label}</strong>
                    <span>{address.addressText}</span>
                    {address.landmark && <small>{address.landmark}</small>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel profile-section-card">
            <div className="profile-section-title"><FileText size={20} /><h2>Policies & Support</h2></div>
            <a className="profile-menu-link" href="/privacy.html">Privacy Policy <ChevronRight size={17} /></a>
            <a className="profile-menu-link" href="/terms.html">Terms & Conditions <ChevronRight size={17} /></a>
            <Link className="profile-menu-link" to={supportPath}>Help & Support <ChevronRight size={17} /></Link>
            <a className="profile-menu-link" href="/account-deletion.html">Account deletion policy <ChevronRight size={17} /></a>
            <button className="profile-menu-link danger-link" type="button" disabled={deletionBusy} onClick={requestAccountDeletion}>
              <span><Trash2 size={17} /> {deletionBusy ? 'Submitting request...' : 'Request account deletion'}</span>
              <ChevronRight size={17} />
            </button>
          </div>
        </section>
      </main>
    </Shell>
  );
}

function App() {
  useEffect(() => {
    registerPwaServiceWorker();
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter basename="/app">
          <StaticHostRedirectBridge />
          <Routes>
            <Route path="/" element={<LandingRedirect />} />
            <Route path="/login" element={WEB_DEMO_MODE ? <Navigate to="/citizen" replace /> : <AuthPage mode="login" />} />
            <Route path="/signup" element={<Navigate to="/login" replace />} />
            <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
            <Route path="/reset-password" element={<Navigate to="/login" replace />} />
            <Route path="/citizen" element={<RequireRole role="BUYER"><CitizenDashboard /></RequireRole>} />
            <Route path="/citizen/create" element={<RequireRole role="BUYER"><CitizenDashboard /></RequireRole>} />
            <Route path="/citizen/tasks" element={<RequireRole role="BUYER"><CitizenTasksPage /></RequireRole>} />
            <Route path="/citizen/wallet" element={<RequireRole role="BUYER"><CitizenWalletPage /></RequireRole>} />
            <Route path="/citizen/profile" element={<RequireRole role="BUYER"><ProfileView /></RequireRole>} />
            <Route path="/citizen/support" element={<RequireRole role="BUYER"><SupportCenterPage /></RequireRole>} />
            <Route path="/citizen/tasks/:taskId" element={<RequireRole role="BUYER"><CitizenTaskPage /></RequireRole>} />
            <Route path="/partner" element={<RequireRole role="HELPER"><PartnerDashboard /></RequireRole>} />
            <Route path="/partner/jobs" element={<RequireRole role="HELPER"><PartnerJobsPage /></RequireRole>} />
            <Route path="/partner/earnings" element={<RequireRole role="HELPER"><PartnerEarningsPage /></RequireRole>} />
            <Route path="/partner/inbox" element={<RequireRole role="HELPER"><PartnerInboxPage /></RequireRole>} />
            <Route path="/partner/profile" element={<RequireRole role="HELPER"><ProfileView /></RequireRole>} />
            <Route path="/partner/kyc" element={<RequireRole role="HELPER"><PartnerKycPage /></RequireRole>} />
            <Route path="/partner/support" element={<RequireRole role="HELPER"><SupportCenterPage /></RequireRole>} />
            <Route path="/partner/tasks/:taskId" element={<RequireRole role="HELPER"><PartnerTaskPage /></RequireRole>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
