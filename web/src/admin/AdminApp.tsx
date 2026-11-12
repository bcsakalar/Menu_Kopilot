import { BarChart3, BookOpenCheck, Brain, ChefHat, Cpu, LogOut, MessageSquareHeart, MessagesSquare } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, post } from '../api';
import { Dashboard } from './Dashboard';
import { Feedback } from './Feedback';
import { Conversations, Cuisines, Learning, Models, Templates } from './pages';

const PAGES: { key: string; label: string; icon: ReactNode }[] = [
  { key: 'overview', label: 'Pano', icon: <BarChart3 size={17} /> },
  { key: 'conversations', label: 'Görüşmeler', icon: <MessagesSquare size={17} /> },
  { key: 'feedback', label: 'Geri bildirimler', icon: <MessageSquareHeart size={17} /> },
  { key: 'templates', label: 'Şablon havuzu', icon: <BookOpenCheck size={17} /> },
  { key: 'cuisines', label: 'Mutfak türleri', icon: <ChefHat size={17} /> },
  { key: 'learning', label: 'Öğrenilenler', icon: <Brain size={17} /> },
  { key: 'models', label: 'Modeller', icon: <Cpu size={17} /> },
];

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/auth/login', { email, password });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Giriş yapılamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form onSubmit={(event) => void submit(event)}>
        <h1>Menü Kopilot yönetimi</h1>
        <label>
          E-posta
          <input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Şifre
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </button>
      </form>
    </main>
  );
}

export function AdminApp() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [page, setPage] = useState('overview');
  const [newFeedback, setNewFeedback] = useState(0);

  // The nav badge: how many reps' messages nobody has read yet.
  const refreshFeedback = useCallback(() => {
    void api<{ counts: { new: number } }>('/admin/feedback?limit=1')
      .then((r) => setNewFeedback(r.counts.new))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (signedIn) refreshFeedback();
  }, [signedIn, refreshFeedback]);

  const check = () => {
    void api('/auth/me')
      .then(() => setSignedIn(true))
      .catch(() => setSignedIn(false));
  };
  useEffect(check, []);

  if (signedIn === null) return null;
  if (!signedIn) return <Login onDone={check} />;

  const logout = () => {
    void post('/auth/logout').finally(() => setSignedIn(false));
  };

  return (
    <div className="app admin">
      <nav className="sidebar" aria-label="Yönetim">
        <div className="sidebar-head">
          <span className="brand">Menü Kopilot</span>
        </div>
        <ul className="admin-nav">
          {PAGES.map((item) => (
            <li key={item.key}>
              <button type="button" className={page === item.key ? 'active' : ''} aria-current={page === item.key ? 'page' : undefined} onClick={() => setPage(item.key)}>
                {item.icon}
                {item.label}
                {item.key === 'feedback' && newFeedback > 0 && (
                  <span className="badge" aria-label={`${newFeedback} yeni`}>
                    {newFeedback}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <div className="sidebar-foot">
          <a href="/">Siteye dön</a>
          <button type="button" className="icon-button" aria-label="Çıkış yap" title="Çıkış yap" onClick={logout}>
            <LogOut size={17} />
          </button>
        </div>
      </nav>
      <main className="admin-main">
        {page === 'overview' && <Dashboard onNavigate={setPage} />}
        {page === 'conversations' && <Conversations />}
        {page === 'feedback' && <Feedback onCountsChange={refreshFeedback} />}
        {page === 'templates' && <Templates />}
        {page === 'cuisines' && <Cuisines />}
        {page === 'learning' && <Learning />}
        {page === 'models' && <Models />}
      </main>
    </div>
  );
}
