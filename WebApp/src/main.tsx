import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { api, ApiError, searchLocations, resolveLocationCoords, reverseGeocode, type LocationSuggestion } from './api';
import type { AuthResponse, AuthUser, CreateTaskPayload, HelperProfile, Task, TaskSelfieStage, TaskStatus, TaskUrgency, UserRole } from './types';
import './styles.css';

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || 'https://realtime.mysuperhero.xyz').replace(/\/+$/, '');
const showDevOtp = String(import.meta.env.VITE_DEV_SHOW_OTP || 'false').toLowerCase() === 'true';
const authKey = 'superherooo_web_auth';
const staticRedirectKey = 'superherooo_app_redirect';

type AuthState = { accessToken: string | null; refreshToken: string | null; user: AuthUser | null; loading: boolean };
type AuthContextValue = AuthState & {
  applyAuth: (auth: AuthResponse) => void;
  logout: () => void;
  setUser: (user: AuthUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

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

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <img src="/assets/finallogo.png" alt="" />
          <span>Superherooo</span>
        </Link>
        <nav>
          {user?.role === 'BUYER' && <Link to="/citizen">Citizen</Link>}
          {user?.role === 'HELPER' && <Link to="/partner">Partner</Link>}
          <a href="/">Website</a>
          {user ? <button className="link-button" onClick={logout}>Sign out</button> : <Link to="/login">Sign in</Link>}
        </nav>
      </header>
      {children}
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
      navigate(auth.user.role === 'BUYER' ? '/citizen' : '/partner', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to continue.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <main className="auth-layout">
        <section className="auth-copy">
          <span className="eyebrow">Launch web access</span>
          <h1>{mode === 'signup' ? 'Create your Superherooo web account' : 'Sign in to Superherooo Web'}</h1>
          <p>Book urgent help or accept nearby jobs from the browser while the Play Store launch is being completed.</p>
          <div className="trust-row">
            <span>OTP verified</span>
            <span>Realtime partner matching</span>
            <span>Cash or UPI</span>
          </div>
          <div className="app-visual" aria-hidden="true">
            <div className="visual-card visual-card-main">
              <span>Live booking</span>
              <strong>4 min</strong>
              <p>Nearest partner notified</p>
            </div>
            <img src="/assets/worker-portrait-transparent.png" alt="" />
            <div className="visual-card visual-card-float">
              <span>Verification</span>
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
              Name
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
            </label>
          )}
          <label>
            Email username
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          </label>
          {mode === 'signup' && (
            <label>
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 digit mobile number" />
            </label>
          )}
          {error && <div className="notice error">{error}</div>}
          <button className="primary" disabled={busy}>{busy ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
          <p className="muted">
            {mode === 'signup' ? <>Already have an account? <Link to="/login">Sign in</Link></> : <>New here? <Link to="/signup">Create account</Link></>}
          </p>
        </form>
      </main>
    </Shell>
  );
}

function EmailVerificationCard() {
  const { user, applyAuth } = useAuth();
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user?.email || user.emailVerified) return null;

  const send = async () => {
    setError(null);
    try {
      const res = await api.startEmailOtp(user.email!);
      setDevOtp(showDevOtp ? res.devOtp || null : null);
      setMessage('Verification code sent to your email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send OTP.');
    }
  };
  const verify = async () => {
    setError(null);
    try {
      const auth = await api.verifyEmailOtp(user.email!, otp);
      applyAuth(auth);
      setMessage('Email verified. You can now use launch bookings.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP.');
    }
  };
  return (
    <div className="panel warning-panel">
      <div>
        <h3>Verify your email to use bookings</h3>
        <p className="muted">We send OTPs to email for the launch MVP. This protects both citizens and partners.</p>
      </div>
      <div className="inline-form">
        <button className="secondary" type="button" onClick={send}>Send email OTP</button>
        <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Enter OTP" />
        <button className="primary" type="button" onClick={verify}>Verify</button>
      </div>
      {devOtp && <div className="notice">Dev OTP: <strong>{devOtp}</strong></div>}
      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}
    </div>
  );
}

function CitizenDashboard() {
  const { accessToken } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    urgency: 'NORMAL' as TaskUrgency,
    timeMinutes: 60,
    budgetRupees: 399,
    addressText: '',
    landmark: '',
    lat: '',
    lng: '',
    scheduledAt: '',
  });

  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Location failed.');
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

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setBusy(true);
    try {
      const payload: CreateTaskPayload = {
        title: form.title,
        description: form.description,
        urgency: form.urgency,
        timeMinutes: Number(form.timeMinutes),
        budgetPaise: Math.max(1, Number(form.budgetRupees)) * 100,
        lat: Number(form.lat),
        lng: Number(form.lng),
        addressText: form.addressText || null,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
        landmark: form.landmark || null,
        paymentCollectionMode: 'PAY_AFTER_SERVICE',
        verificationMode: 'PHOTO_AND_OTP',
      };
      const res = await api.createTask(accessToken, payload);
      navigate(`/citizen/tasks/${res.taskId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create task.');
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
            <span className="eyebrow">Citizen web app</span>
            <h1>Book a Superherooo now or schedule for later</h1>
            <p>Nearby verified partners are notified in realtime. Pay directly with cash or UPI after completion.</p>
            <div className="hero-points">
              <span>Live tracking</span>
              <span>Photo verified work</span>
              <span>Pay after service</span>
            </div>
          </div>
          <div className="hero-graphic">
            <img src="/assets/hero-professional.png" alt="" />
            <div className="metric"><strong>{tasks.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status)).length}</strong><span>active bookings</span></div>
          </div>
        </section>
        <div className="grid two">
          <form className="panel task-form" onSubmit={create}>
            <h2>Create task</h2>
            <label>Task name<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="AC repair, cleaning, pickup..." /></label>
            <label>Description<textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Share clear instructions for the partner" /></label>
            <div className="grid two compact">
              <label>Urgency<select value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value as TaskUrgency })}><option>NORMAL</option><option>HIGH</option><option>CRITICAL</option><option>LOW</option></select></label>
              <label>Duration minutes<input type="number" min="1" max="1440" value={form.timeMinutes} onChange={(e) => setForm({ ...form, timeMinutes: Number(e.target.value) })} /></label>
              <label>Budget ₹<input type="number" min="1" value={form.budgetRupees} onChange={(e) => setForm({ ...form, budgetRupees: Number(e.target.value) })} /></label>
              <label>Schedule later<input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} /></label>
            </div>
            <div style={{ position: 'relative' }}>
              <label>Address
                <input
                  required
                  value={form.addressText}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  placeholder="Full address (Search autocomplete)"
                  autoComplete="off"
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
            <label>Landmark<input value={form.landmark} onChange={(e) => setForm({ ...form, landmark: e.target.value })} placeholder="Nearby landmark" /></label>
            <div className="grid three compact">
              <button type="button" className="secondary" onClick={fillLocation}>Use current location</button>
              <label>Lat<input required value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} /></label>
              <label>Lng<input required value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} /></label>
            </div>
            <div className="notice">Payment: Cash or UPI directly to Partner. No online payment gateway is used for this MVP.</div>
            {error && <div className="notice error">{error}</div>}
            <button className="primary" disabled={busy}>{busy ? 'Creating...' : 'Raise request'}</button>
          </form>
          <TaskList title="Your bookings" tasks={tasks} basePath="/citizen/tasks" />
        </div>
      </main>
    </Shell>
  );
}

function TaskList({ title, tasks, basePath }: { title: string; tasks: Task[]; basePath: string }) {
  return (
    <section className="panel list-panel">
      <h2>{title}</h2>
      {tasks.length === 0 ? <p className="muted">No bookings yet.</p> : tasks.map((task) => (
        <Link key={task.id} className="task-card" to={`${basePath}/${task.id}`}>
          <div>
            <strong>{task.title}</strong>
            <span>{task.addressText || `${task.lat}, ${task.lng}`}</span>
          </div>
          <div>
            <b>{money(task.budgetPaise)}</b>
            <span>{statusText(task.status)}</span>
          </div>
        </Link>
      ))}
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
        {task && <TaskDetail task={task} helperLoc={helperLoc} role="BUYER" />}
      </main>
    </Shell>
  );
}

function PartnerDashboard() {
  const { accessToken } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<HelperProfile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [online, setOnline] = useState(false);
  const [lastLoc, setLastLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setActiveTasks(mine.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load partner workspace.');
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
        return;
      }
      const loc = await getLocation();
      await api.helperOnline(accessToken, true, loc.lat, loc.lng);
      setLastLoc(loc);
      setOnline(true);
      socket?.emit('location.update', loc);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update online status.');
    }
  };

  const accept = async (taskId: string) => {
    if (!accessToken) return;
    setError(null);
    try {
      await api.acceptTask(accessToken, taskId);
      navigate(`/partner/tasks/${taskId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept task.');
    }
  };

  return (
    <Shell>
      <main className="workspace">
        <EmailVerificationCard />
        <section className="hero-band partner">
          <div>
            <span className="eyebrow">Partner web app</span>
            <h1>Go online and accept nearby citizen tasks</h1>
            <p>Offers arrive in realtime when your KYC is approved and your browser location is active.</p>
            <div className="hero-points">
              <span>Nearby offers</span>
              <span>Camera verification</span>
              <span>Instant status updates</span>
            </div>
          </div>
          <div className="hero-graphic partner-graphic">
            <img src="/assets/female-hero-transparent.png" alt="" />
            <button className={online ? 'danger' : 'primary'} onClick={toggleOnline}>{online ? 'Go offline' : 'Go online'}</button>
          </div>
        </section>
        {error && <div className="notice error">{error}</div>}
        <div className="grid three">
          <section className="panel">
            <h2>KYC status</h2>
            <div className={`status-pill ${profile?.kycStatus?.toLowerCase() || ''}`}>{profile?.kycStatus || 'Loading'}</div>
            {profile?.kycRejectionReason && <p className="muted">{profile.kycRejectionReason}</p>}
            <p className="muted">Only approved partners can go online and accept tasks.</p>
          </section>
          <section className="panel">
            <h2>Online status</h2>
            <div className={`status-pill ${online ? 'approved' : ''}`}>{online ? 'Online' : 'Offline'}</div>
            <p className="muted">{lastLoc ? `${lastLoc.lat.toFixed(5)}, ${lastLoc.lng.toFixed(5)}` : 'Location not shared yet.'}</p>
          </section>
          <section className="panel">
            <h2>Active jobs</h2>
            <strong className="big-number">{activeTasks.length}</strong>
            <p className="muted">Finish current jobs before accepting another nearby request.</p>
          </section>
        </div>
        <section className="panel list-panel">
          <h2>Nearby tasks</h2>
          {tasks.length === 0 ? <p className="muted">No nearby tasks yet. Stay online to receive live offers.</p> : tasks.map((task) => (
            <article key={task.id} className="offer-card">
              <div>
                <h3>{task.title}</h3>
                <p>{task.description}</p>
                <div className="meta-row"><span>{money(task.budgetPaise)}</span><span>{task.timeMinutes} min</span><span>{formatWhen(task.scheduledAt)}</span></div>
              </div>
              <div className="offer-actions">
                <a className="secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${task.lat},${task.lng}`} target="_blank" rel="noreferrer">Directions</a>
                <button className="primary" onClick={() => accept(task.id)}>Accept</button>
              </div>
            </article>
          ))}
        </section>
      </main>
    </Shell>
  );
}

function PartnerTaskPage() {
  const { taskId = '' } = useParams();
  const { accessToken } = useAuth();
  const socket = useSocket();
  const [task, setTask] = useState<Task | null>(null);
  const [otp, setOtp] = useState('');
  const [selfie, setSelfie] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const nextAction = task?.status === 'ASSIGNED'
    ? { status: 'ARRIVED' as TaskStatus, label: 'Mark arrived' }
    : task?.status === 'ARRIVED'
      ? { status: 'STARTED' as TaskStatus, label: 'Start with arrival OTP' }
      : task?.status === 'STARTED'
        ? { status: 'COMPLETED' as TaskStatus, label: 'Complete with end OTP' }
        : null;

  const actionStage: TaskSelfieStage | null = nextAction?.status === 'ARRIVED'
    ? 'ARRIVAL'
    : nextAction?.status === 'COMPLETED'
      ? 'COMPLETION'
      : null;
  const actionNeedsOtp = nextAction?.status === 'STARTED' || nextAction?.status === 'COMPLETED';
  const existingSelfieUrl = actionStage === 'ARRIVAL'
    ? task?.arrivalSelfieUrl
    : actionStage === 'COMPLETION'
      ? task?.completionSelfieUrl
      : null;

  const update = async () => {
    if (!accessToken || !task || !nextAction) return;
    setBusy(true);
    setError(null);
    try {
      if (actionStage && !existingSelfieUrl) {
        if (!selfie) throw new Error(actionStage === 'ARRIVAL' ? 'Please capture arrival selfie first.' : 'Please capture completion selfie first.');
        const loc = await getLocation().catch(() => ({ lat: task.lat, lng: task.lng }));
        await api.uploadTaskSelfie(accessToken, task.id, actionStage, selfie, loc.lat, loc.lng, task.addressText);
      }
      const updated = await api.updateTaskStatus(accessToken, task.id, nextAction.status, otp);
      setTask(updated);
      setOtp('');
      setSelfie(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update task.');
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
            <TaskDetail task={task} role="HELPER" />
            {nextAction && (
              <section className="panel action-panel">
                <div className="action-heading">
                  <div>
                    <span className="eyebrow">Next step</span>
                    <h2>{nextAction.label}</h2>
                  </div>
                  <span className={`status-pill ${task.status.toLowerCase()}`}>{statusText(task.status)}</span>
                </div>
                <div className="step-strip">
                  <span className={task.arrivalSelfieUrl ? 'done' : actionStage === 'ARRIVAL' ? 'active' : ''}>Arrival selfie</span>
                  <span className={task.status === 'STARTED' || task.status === 'COMPLETED' ? 'done' : nextAction.status === 'STARTED' ? 'active' : ''}>Start OTP</span>
                  <span className={task.completionSelfieUrl ? 'done' : actionStage === 'COMPLETION' ? 'active' : ''}>Completion selfie</span>
                </div>
                {actionStage && (
                  <div className="selfie-control">
                    <label>{actionStage === 'ARRIVAL' ? 'Arrival selfie' : 'Completion selfie'}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => setSelfie(e.target.files?.[0] || null)}
                      />
                    </label>
                    <span>{existingSelfieUrl ? 'Selfie uploaded.' : selfie ? selfie.name : 'Required before status update.'}</span>
                  </div>
                )}
                {actionNeedsOtp && (
                  <label>Citizen OTP<input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Ask citizen for OTP" /></label>
                )}
                <button className="primary" disabled={busy} onClick={update}>{busy ? 'Updating...' : nextAction.label}</button>
              </section>
            )}
          </>
        )}
      </main>
    </Shell>
  );
}

function TaskDetail({ task, role, helperLoc }: { task: Task; role: 'BUYER' | 'HELPER'; helperLoc?: { lat: number; lng: number } | null }) {
  const elapsed = task.workStartedAt ? Math.max(0, Date.now() - new Date(task.workStartedAt).getTime()) : 0;
  const minutes = Math.floor(elapsed / 60000);
  return (
    <section className="panel detail-panel">
      <div className="detail-header">
        <div>
          <span className="eyebrow">{role === 'BUYER' ? 'Citizen booking' : 'Partner job'}</span>
          <h1>{task.title}</h1>
          <p>{task.description}</p>
        </div>
        <div className="status-stack">
          <span className={`status-pill ${task.status.toLowerCase()}`}>{statusText(task.status)}</span>
          <strong>{money(task.budgetPaise)}</strong>
        </div>
      </div>
      <div className="grid three">
        <Info label="When" value={formatWhen(task.scheduledAt)} />
        <Info label="Duration" value={`${task.timeMinutes} minutes`} />
        <Info label="Payment" value="Cash or UPI directly to Partner" />
        <Info label="Address" value={task.addressText || `${task.lat}, ${task.lng}`} />
        <Info label="Landmark" value={task.landmark || 'Not provided'} />
        <Info label="Partner" value={task.helperName || task.helperPhone || 'Searching'} />
      </div>
      {role === 'BUYER' && (
        <div className="otp-grid">
          <div><span>Arrival OTP</span><strong>{task.arrivalOtp || 'Assigned after booking'}</strong></div>
          <div><span>Completion OTP</span><strong>{task.completionOtp || 'Assigned after booking'}</strong></div>
        </div>
      )}
      {task.status === 'STARTED' && <div className="notice success">Timer running: {minutes} minutes elapsed.</div>}
      {helperLoc && <div className="notice">Partner live location: {helperLoc.lat.toFixed(5)}, {helperLoc.lng.toFixed(5)}</div>}
      <a className="secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${task.lat},${task.lng}`} target="_blank" rel="noreferrer">Open directions</a>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info"><span>{label}</span><strong>{value}</strong></div>;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/app">
        <StaticHostRedirectBridge />
        <Routes>
          <Route path="/" element={<LandingRedirect />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/citizen" element={<RequireRole role="BUYER"><CitizenDashboard /></RequireRole>} />
          <Route path="/citizen/tasks/:taskId" element={<RequireRole role="BUYER"><CitizenTaskPage /></RequireRole>} />
          <Route path="/partner" element={<RequireRole role="HELPER"><PartnerDashboard /></RequireRole>} />
          <Route path="/partner/tasks/:taskId" element={<RequireRole role="HELPER"><PartnerTaskPage /></RequireRole>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
