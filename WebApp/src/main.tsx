import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams, useLocation } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { api, searchLocations, resolveLocationCoords, reverseGeocode, type LocationSuggestion } from './api';
import type { AuthResponse, AuthUser, ChatMessage, CreateTaskPayload, HelperProfile, SavedAddress, Task, TaskSelfieStage, TaskStatus, TaskUrgency, UserRole } from './types';
import './styles.css';

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || 'https://realtime.mysuperhero.xyz').replace(/\/+$/, '');
const showDevOtp = String(import.meta.env.VITE_DEV_SHOW_OTP || 'false').toLowerCase() === 'true';
const authKey = 'superherooo_web_auth';
const savedAddressesKey = 'superherooo_saved_addresses';
const staticRedirectKey = 'superherooo_app_redirect';

type AuthState = { accessToken: string | null; refreshToken: string | null; user: AuthUser | null; loading: boolean };
type AuthContextValue = AuthState & {
  applyAuth: (auth: AuthResponse) => void;
  logout: () => void;
  setUser: (user: AuthUser) => void;
};

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
            <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '⚠️' : 'ℹ️'}</span>
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
      ⚠️ Internet connection lost. Reconnecting to Superherooo...
    </div>
  );
}

function loadStoredAuth(): Omit<AuthState, 'loading'> {
  try {
    const raw = localStorage.getItem(authKey);
    if (!raw) return { accessToken: null, refreshToken: null, user: null };
    const auth = JSON.parse(raw) as AuthResponse;
    return { accessToken: auth.accessToken, refreshToken: auth.refreshToken, user: auth.user };
  } catch {
    localStorage.removeItem(authKey);
    return { accessToken: null, refreshToken: null, user: null };
  }
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({ ...loadStoredAuth(), loading: true }));
  const refreshRef = useRef<Promise<AuthResponse> | null>(null);

  const applyAuth = useCallback((auth: AuthResponse) => {
    localStorage.setItem(authKey, JSON.stringify(auth));
    setState({ accessToken: auth.accessToken, refreshToken: auth.refreshToken, user: auth.user, loading: false });
  }, []);

  const setUser = useCallback((user: AuthUser) => {
    setState((current) => {
      if (!current.accessToken || !current.refreshToken) return current;
      const next = { accessToken: current.accessToken, refreshToken: current.refreshToken, user };
      localStorage.setItem(authKey, JSON.stringify(next));
      return { ...next, loading: false };
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(authKey);
    setState({ accessToken: null, refreshToken: null, user: null, loading: false });
  }, []);

  useEffect(() => {
    const stored = loadStoredAuth();
    if (!stored.refreshToken) {
      setState({ ...stored, loading: false });
      return;
    }
    refreshRef.current = api.refresh(stored.refreshToken);
    refreshRef.current.then(applyAuth).catch(() => {
      localStorage.removeItem(authKey);
      setState({ accessToken: null, refreshToken: null, user: null, loading: false });
    });
  }, [applyAuth]);

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
      🎙️
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
            ✕
          </button>
        </div>
      ) : (
        <div className="selfie-options-row">
          <button
            type="button"
            className="selfie-btn"
            onClick={() => cameraInputRef.current?.click()}
          >
            📷 Take Camera Photo
          </button>
          <button
            type="button"
            className="selfie-btn"
            onClick={() => galleryInputRef.current?.click()}
          >
            🖼️ Choose from Gallery
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
      showToast(err instanceof Error ? err.message : 'Could not send message.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-modal-overlay">
      <div className="chat-modal" role="dialog" aria-labelledby="chat-title">
        <div className="chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>💬</span>
            <strong id="chat-title">Task Live Chat</strong>
          </div>
          <button style={{ color: 'white', fontSize: '1.2rem', fontWeight: 800 }} onClick={onClose} aria-label="Close chat">✕</button>
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

  const dashboardPath = user.role === 'BUYER' ? '/citizen' : '/partner';
  const profilePath = user.role === 'BUYER' ? '/citizen/profile' : '/partner/profile';

  return (
    <div className="mobile-bottom-nav">
      <Link className={`mobile-nav-item ${location.pathname === dashboardPath ? 'active' : ''}`} to={dashboardPath}>
        <span className="icon">⚡</span>
        <span>Dashboard</span>
      </Link>
      <Link className={`mobile-nav-item ${location.pathname.includes('/profile') ? 'active' : ''}`} to={profilePath}>
        <span className="icon">👤</span>
        <span>Profile</span>
      </Link>
      <a className="mobile-nav-item" href="/">
        <span className="icon">🌐</span>
        <span>Website</span>
      </a>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const getProfileLink = () => {
    if (user?.role === 'BUYER') return '/citizen/profile';
    if (user?.role === 'HELPER') return '/partner/profile';
    return '/profile';
  };

  return (
    <div className="app-shell">
      <OfflineBanner />
      <header className="topbar">
        <Link className="brand" to="/">
          <img src="/assets/finallogo.png" alt="Superherooo" />
          <span>Superherooo</span>
        </Link>
        <nav aria-label="Main Navigation">
          {user?.role === 'BUYER' && (
            <Link className={`nav-link ${location.pathname === '/citizen' ? 'active' : ''}`} to="/citizen">
              Citizen
            </Link>
          )}
          {user?.role === 'HELPER' && (
            <Link className={`nav-link ${location.pathname === '/partner' ? 'active' : ''}`} to="/partner">
              Partner
            </Link>
          )}
          {user && (
            <Link className={`nav-link ${location.pathname.includes('/profile') ? 'active' : ''}`} to={getProfileLink()}>
              👤 Profile
            </Link>
          )}
          <a className="nav-link" href="/">Website</a>
          {user ? (
            <button className="link-button" onClick={logout}>Sign out</button>
          ) : (
            <Link className="nav-link active" to="/login">Sign in</Link>
          )}
        </nav>
      </header>
      {children}
      <MobileBottomNav />
    </div>
  );
}

function RequireRole({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const { loading, user } = useAuth();
  if (loading) return <div className="center-screen">Loading Superherooo...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'BUYER' ? '/citizen' : '/partner'} replace />;
  return <>{children}</>;
}

function LandingRedirect() {
  const { user, loading } = useAuth();
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

function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { applyAuth } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [role, setRole] = useState<UserRole>('BUYER');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const auth = mode === 'signup'
        ? await api.signup({ email, password, phone: phone || undefined, displayName: displayName || undefined, role })
        : await api.login(email, password);
      if (!['BUYER', 'HELPER'].includes(auth.user.role)) throw new Error('This web app supports citizen and partner accounts only.');
      applyAuth(auth);
      showToast(mode === 'signup' ? 'Account created successfully!' : 'Signed in successfully!', 'success');
      navigate(auth.user.role === 'BUYER' ? '/citizen' : '/partner', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to continue.';
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
          <span className="eyebrow">Superherooo Web App</span>
          <h1>{mode === 'signup' ? 'Create your account' : 'Sign in to Superherooo'}</h1>
          <p>Book urgent non-skilled help or accept nearby jobs directly from your browser.</p>
          <div className="trust-row">
            <span>OTP Verified</span>
            <span>Realtime Location</span>
            <span>Pay After Service</span>
          </div>
          <div className="app-visual" aria-hidden="true" style={{ marginTop: '24px' }}>
            <div className="visual-card visual-card-main">
              <span>Live dispatch</span>
              <strong>4 min</strong>
              <p>Nearby partner assigned</p>
            </div>
            <img src="/assets/worker-portrait-transparent.png" alt="" />
            <div className="visual-card visual-card-float">
              <span>Security</span>
              <strong>Photo + OTP</strong>
            </div>
          </div>
        </section>
        <form className="panel auth-panel" onSubmit={submit}>
          <div className="segmented">
            <button type="button" className={role === 'BUYER' ? 'active' : ''} onClick={() => setRole('BUYER')}>Citizen</button>
            <button type="button" className={role === 'HELPER' ? 'active' : ''} onClick={() => setRole('HELPER')}>Partner</button>
          </div>
          {mode === 'signup' && (
            <label>
              Full Name
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your full name" />
            </label>
          )}
          <label>
            Email address
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required placeholder="you@domain.com" />
          </label>
          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required placeholder="••••••••" />
          </label>
          {mode === 'signup' && (
            <label>
              Mobile Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 digit phone number" />
            </label>
          )}
          {error && <div className="notice error">{error}</div>}
          <button className="accent-btn" disabled={busy}>{busy ? 'Please wait...' : mode === 'signup' ? 'Create Account' : 'Sign In'}</button>
          <p className="muted" style={{ textAlign: 'center', marginTop: '8px' }}>
            {mode === 'signup' ? <>Already have an account? <Link to="/login" style={{ color: 'var(--blue)', fontWeight: 700 }}>Sign in</Link></> : <>New to Superherooo? <Link to="/signup" style={{ color: 'var(--blue)', fontWeight: 700 }}>Create account</Link></>}
          </p>
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
      const msg = err instanceof Error ? err.message : 'Could not send OTP.';
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
      const msg = err instanceof Error ? err.message : 'Invalid OTP.';
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
  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const socket = useSocket();
  const navigate = useNavigate();
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
    timeMinutes: 60,
    addressText: '',
    landmark: '',
    lat: '',
    lng: '',
    scheduledAt: '',
  });

  const standardPrice = Math.round(form.timeMinutes * 6.5);
  const discountPrice = Math.max(99, Math.round(standardPrice * 0.5));

  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  const nonSkilledChips = [
    '📦 Package Pickup & Drop',
    '🛒 Grocery & Errands Shopping',
    '📦 House Help & Moving Heavy Items',
    '🧍 Queue Waiting / Spot Holding',
    '🐕 Pet Walking & Care',
    '🎟️ Ticket / Counter Booking',
    '👴 Senior Citizen Assistance',
    '🧹 Basic House & Yard Cleanup',
  ];

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setTasks(await api.myTasks(accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tasks.');
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

  const fillLocation = async () => {
    try {
      const loc = await getLocation();
      setForm((f) => ({ ...f, lat: String(loc.lat.toFixed(6)), lng: String(loc.lng.toFixed(6)) }));
      const address = await reverseGeocode(loc.lat, loc.lng);
      if (address) {
        setForm((f) => ({ ...f, addressText: address }));
      }
      showToast('Current location detected!', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Location failed.');
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
      setError(err instanceof Error ? err.message : 'Could not resolve coordinates.');
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
      const payload: CreateTaskPayload = {
        title: form.title,
        description: form.description,
        urgency: 'NORMAL',
        timeMinutes: Number(form.timeMinutes),
        budgetPaise: discountPrice * 100,
        lat: Number(form.lat),
        lng: Number(form.lng),
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
      const msg = err instanceof Error ? err.message : 'Could not create task.';
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
        <section className="hero-band">
          <div>
            <span className="eyebrow">Citizen Portal</span>
            <h1>Book trusted non-skilled help</h1>
            <p>Verified partners for everyday errands, heavy moving, queue waiting, and house assistance.</p>
            <div className="hero-points">
              <span>⚡ Live Realtime Matching</span>
              <span>📸 Photo & OTP Verified</span>
              <span>💵 Pay After Completion</span>
            </div>
          </div>
          <div className="hero-graphic">
            <img src="/assets/hero-professional.png" alt="" />
            <div className="metric">
              <strong>{tasks.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status)).length}</strong>
              <span>active bookings</span>
            </div>
          </div>
        </section>
        <div className="grid two">
          <form className="panel task-form" onSubmit={create}>
            <h2>Create Task</h2>
            <div className="preset-chips">
              {nonSkilledChips.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`preset-chip ${form.title === t ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, title: t })}
                >
                  {t}
                </button>
              ))}
            </div>

            <label>
              Task Title
              <div className="mic-input-wrapper">
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Package pickup, queue waiting, grocery..."
                  aria-label="Task Title"
                />
                <VoiceMicInput onTranscript={(text) => setForm((f) => ({ ...f, title: f.title ? `${f.title} ${text}` : text }))} />
              </div>
            </label>

            <label>
              Description & Instructions
              <div className="mic-input-wrapper">
                <textarea
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Provide clear instructions for the partner..."
                  aria-label="Task Description"
                />
                <VoiceMicInput onTranscript={(text) => setForm((f) => ({ ...f, description: f.description ? `${f.description} ${text}` : text }))} />
              </div>
            </label>

            <div className="grid two compact">
              <label>
                Duration (minutes)
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={form.timeMinutes}
                  onChange={(e) => setForm({ ...form, timeMinutes: Number(e.target.value) })}
                  aria-label="Duration in minutes"
                />
              </label>

              <label>
                Schedule Later (Optional)
                <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} aria-label="Schedule datetime" />
              </label>
            </div>

            <div className="price-preview-box">
              <div className="price-preview-left">
                <span className="strike-price">₹{standardPrice}</span>
                <span className="discount-badge">50% OFF</span>
              </div>
              <span className="final-price">₹{discountPrice}</span>
            </div>

            {savedAddresses.length > 0 && (
              <div>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                  Saved Addresses:
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
                      {sa.label === 'Home' ? '🏡 Home' : sa.label === 'Work' ? '💼 Work' : '📍 ' + sa.label}: {sa.addressText.substring(0, 24)}...
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ position: 'relative' }}>
              <label>
                Address
                <input
                  required
                  value={form.addressText}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  placeholder="Full address (Search autocomplete)"
                  autoComplete="off"
                  aria-label="Full Address"
                />
              </label>
              {showSuggestions && suggestions.length > 0 && (
                <ul className="suggestions-dropdown">
                  {suggestions.map((sug, idx) => (
                    <li key={idx} onClick={() => selectSuggestion(sug)}>
                      <span className="suggestion-icon">
                        {sug.provider === 'ola' ? '🚖' : sug.provider === 'google' ? '📍' : '🗺️'}
                      </span>
                      {sug.description}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <label>
              Landmark
              <input value={form.landmark} onChange={(e) => setForm({ ...form, landmark: e.target.value })} placeholder="Nearby landmark (optional)" aria-label="Landmark" />
            </label>

            <div className="grid three compact">
              <button type="button" className="secondary" onClick={fillLocation}>📍 Current Location</button>
              <button type="button" className="secondary" onClick={() => saveCurrentAddress('Home')}>Save Home</button>
              <button type="button" className="secondary" onClick={() => saveCurrentAddress('Work')}>Save Work</button>
            </div>

            <div className="notice">Payment Mode: Cash or UPI directly to Partner after completion.</div>
            {error && <div className="notice error">{error}</div>}
            <button className="accent-btn" disabled={busy} style={{ width: '100%', marginTop: '6px' }}>
              {busy ? 'Creating Task...' : 'Create Task'}
            </button>
          </form>

          <TaskList title="Your Bookings" tasks={tasks} basePath="/citizen/tasks" />
        </div>
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
        <p className="muted" style={{ padding: '16px 0' }}>
          {searchTerm ? 'No matching tasks found.' : tab === 'ACTIVE' ? 'No active bookings currently.' : 'No past task records found.'}
        </p>
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
              <span className={`status-pill ${task.status.toLowerCase()}`}>{statusText(task.status)}</span>
            </div>
          </Link>
        ))
      )}
    </section>
  );
}

function CitizenTaskPage() {
  const { taskId = '' } = useParams();
  const { accessToken } = useAuth();
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
      setError(err instanceof Error ? err.message : 'Could not load task.');
    }
  }, [accessToken, taskId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!socket || !taskId) return;
    socket.emit('task.subscribe', { taskId, helperId: task?.assignedHelperId });
    const refresh = () => load();
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
  }, [socket, taskId, task?.assignedHelperId, load]);

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

function KycSection({ profile, onKycUpdated }: { profile: HelperProfile | null; onKycUpdated: () => void }) {
  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [docType, setDocType] = useState('Aadhaar Card');
  const [idNumber, setIdNumber] = useState('');
  const [idFront, setIdFront] = useState<File | null>(null);
  const [idBack, setIdBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    if (!idFront) {
      setError('Please upload ID front document photo.');
      showToast('Please upload ID front document photo.', 'error');
      return;
    }
    if (!selfie) {
      setError('Please upload partner selfie photo.');
      showToast('Please upload partner selfie photo.', 'error');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.submitKyc(accessToken, fullName, docType, idNumber, idFront, idBack, selfie);
      setShowForm(false);
      showToast('KYC submitted for review!', 'success');
      onKycUpdated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'KYC submission failed.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const status = profile?.kycStatus || 'NOT_SUBMITTED';

  return (
    <section className="panel">
      <h2>KYC Verification</h2>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0' }}>
        <span className={`status-pill ${status.toLowerCase()}`}>{status}</span>
        {status !== 'APPROVED' && (
          <button className="secondary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel Form' : status === 'REJECTED' ? 'Re-submit KYC' : 'Upload KYC Documents'}
          </button>
        )}
      </div>

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

      {showForm && (
        <form onSubmit={submitKyc} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px', borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
          <label>
            Full Name (As per ID Document)
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full Legal Name" aria-label="Legal Full Name" />
          </label>
          <div className="grid two compact">
            <label>
              Document Type
              <select value={docType} onChange={(e) => setDocType(e.target.value)} aria-label="Document type">
                <option value="Aadhaar Card">Aadhaar Card</option>
                <option value="PAN Card">PAN Card</option>
                <option value="Driving License">Driving License</option>
                <option value="Voter ID">Voter ID</option>
                <option value="Passport">Passport</option>
              </select>
            </label>
            <label>
              Document / ID Number
              <input required value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="ID Number" aria-label="ID Number" />
            </label>
          </div>

          <div className="grid two compact">
            <SelfiePicker label="ID Document Front" file={idFront} onSelect={setIdFront} required />
            <SelfiePicker label="ID Document Back (Optional)" file={idBack} onSelect={setIdBack} />
          </div>

          <SelfiePicker label="Partner Selfie Photo" file={selfie} onSelect={setSelfie} required />

          {error && <div className="notice error">{error}</div>}
          <button className="accent-btn" disabled={busy}>
            {busy ? 'Submitting KYC...' : 'Submit KYC Documents'}
          </button>
        </form>
      )}
    </section>
  );
}

function PartnerDashboard() {
  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const socket = useSocket();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<HelperProfile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [online, setOnline] = useState(false);
  const [lastLoc, setLastLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'NEARBY' | 'MY_TASKS'>('NEARBY');

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
      setError(err instanceof Error ? err.message : 'Could not load partner workspace.');
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    const handleNewOffer = (payload?: any) => {
      load();
      playChimeSound();
      showToast('⚡ New nearby job offered!', 'info');
      showWebPushNotification('⚡ New Nearby Task Available!', {
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
    const send = () => socket.emit('location.update', lastLoc);
    send();
    const id = window.setInterval(send, 15000);
    return () => window.clearInterval(id);
  }, [online, socket, lastLoc]);

  const toggleOnline = async () => {
    if (!accessToken) return;
    setError(null);
    try {
      if (online) {
        await api.helperOnline(accessToken, false);
        setOnline(false);
        showToast('You are now Offline', 'info');
        return;
      }
      if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
      }
      const loc = await getLocation();
      await api.helperOnline(accessToken, true, loc.lat, loc.lng);
      setLastLoc(loc);
      setOnline(true);
      socket?.emit('location.update', loc);
      showToast('You are now Online and receiving job offers!', 'success');
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update online status.';
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
      const msg = err instanceof Error ? err.message : 'Could not accept task.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  return (
    <Shell>
      <main className="workspace">
        <EmailVerificationCard />
        <section className="hero-band partner">
          <div>
            <span className="eyebrow">Partner Portal</span>
            <h1>Accept nearby jobs & earn instantly</h1>
            <p>Go online to receive live offers in your area. Perform verified service and get paid cash or UPI directly.</p>
            <div className="hero-points">
              <span>📍 Nearby Job Dispatch</span>
              <span>📷 Camera Verification</span>
              <span>💵 Direct Earnings</span>
            </div>
          </div>
          <div className="hero-graphic partner-graphic">
            <img src="/assets/female-hero-transparent.png" alt="" />
            <button className={online ? 'danger' : 'primary'} onClick={toggleOnline}>
              {online ? '🔴 Go Offline' : '🟢 Go Online'}
            </button>
          </div>
        </section>
        {error && <div className="notice error">{error}</div>}

        <div className="grid three">
          <KycSection profile={profile} onKycUpdated={load} />
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
                      🗺️ Directions
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
                    <span className={`status-pill ${task.status.toLowerCase()}`}>{statusText(task.status)}</span>
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
      setError(err instanceof Error ? err.message : 'Could not load task.');
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
      const msg = err instanceof Error ? err.message : 'Could not complete step.';
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
                              setError(err instanceof Error ? err.message : 'Upload failed.');
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

  useEffect(() => {
    if (task.status !== 'STARTED' || !task.workStartedAt) return;
    const startMs = new Date(task.workStartedAt).getTime();
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
      <div className="detail-header">
        <div>
          <span className="eyebrow">{role === 'BUYER' ? 'Citizen Booking' : 'Partner Job'}</span>
          <h1 style={{ marginTop: '4px' }}>{task.title}</h1>
          <p style={{ color: 'var(--muted)' }}>{task.description}</p>
        </div>
        <div className="status-stack" style={{ alignItems: 'flex-end', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span className={`status-pill ${task.status.toLowerCase()}`}>{statusText(task.status)}</span>
          <strong style={{ fontSize: '1.8rem', color: 'var(--navy)' }}>{money(task.budgetPaise)}</strong>
        </div>
      </div>

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
              📞 Call {contactName} ({contactPhone})
            </a>
          )}
          <button className="accent-btn" onClick={onOpenChat}>
            💬 Live In-App Chat
          </button>
          <a className="sos-btn" href="tel:112">
            🆘 Emergency SOS
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
          <span>⏱️ Work In Progress: Timer Running</span>
          <strong style={{ fontSize: '1.3rem', fontFamily: 'monospace' }}>{formatTimer(elapsedSec)}</strong>
        </div>
      )}

      {helperLoc && <div className="notice" style={{ marginTop: '16px' }}>📍 Partner Live Location: {helperLoc.lat.toFixed(5)}, {helperLoc.lng.toFixed(5)}</div>}

      <a className="secondary" style={{ marginTop: '16px', display: 'inline-flex', width: 'fit-content' }} href={`https://www.google.com/maps/dir/?api=1&destination=${task.lat},${task.lng}`} target="_blank" rel="noreferrer">
        🗺️ Open Google Maps Directions
      </a>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info"><span>{label}</span><strong>{value}</strong></div>;
}

function ProfileView() {
  const { user, logout } = useAuth();
  const { accessToken } = useAuth();
  const [helperProfile, setHelperProfile] = useState<HelperProfile | null>(null);
  const [tasksCount, setTasksCount] = useState<number>(0);

  useEffect(() => {
    if (!accessToken) return;
    if (user?.role === 'HELPER') {
      api.helperProfile(accessToken).then(setHelperProfile).catch(() => {});
    }
    api.myTasks(accessToken).then((t) => setTasksCount(t.length)).catch(() => {});
  }, [accessToken, user?.role]);

  if (!user) return <Navigate to="/login" replace />;

  const getInitials = () => {
    if (user.displayName) {
      return user.displayName.split(' ').map((n) => n[0]).join('').toUpperCase();
    }
    return user.role[0];
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
            <KycSection
              profile={helperProfile}
              onKycUpdated={() => {
                if (accessToken) api.helperProfile(accessToken).then(setHelperProfile);
              }}
            />
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
            <button className="danger" onClick={logout}>Sign Out</button>
          </div>
        </div>
      </main>
    </Shell>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter basename="/app">
          <StaticHostRedirectBridge />
          <Routes>
            <Route path="/" element={<LandingRedirect />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/signup" element={<AuthPage mode="signup" />} />
            <Route path="/citizen" element={<RequireRole role="BUYER"><CitizenDashboard /></RequireRole>} />
            <Route path="/citizen/profile" element={<RequireRole role="BUYER"><ProfileView /></RequireRole>} />
            <Route path="/citizen/tasks/:taskId" element={<RequireRole role="BUYER"><CitizenTaskPage /></RequireRole>} />
            <Route path="/partner" element={<RequireRole role="HELPER"><PartnerDashboard /></RequireRole>} />
            <Route path="/partner/profile" element={<RequireRole role="HELPER"><ProfileView /></RequireRole>} />
            <Route path="/partner/tasks/:taskId" element={<RequireRole role="HELPER"><PartnerTaskPage /></RequireRole>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
