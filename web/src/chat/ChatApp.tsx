import { Menu, MessageSquarePlus, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, sendMessage } from '../api';
import { timeLabel } from '../format';
import type { ChatEvent, Conversation, ConversationRow, Message, RunResult } from '../types';
import { OpeningChecklist } from './Checklist';
import { Composer, type Attachment } from './Composer';
import { FeedbackDialog } from './Feedback';
import { RunBlock } from './RunBlock';
import { CountMeter, RichText } from './ui';

const FIRST_PROMPT = 'Menünün ekran görüntüsünü yapıştır ya da ürünleri yaz…';
const NEXT_PROMPT = 'Sor, iste ya da yeni ekran görüntüsü yapıştır…';
const EXAMPLES = ['Adana, Urfa, Lahmacun, Ayran', 'Kaşarlı Pide, Kıymalı Pide, Çay'];
const SAVED_CONVERSATION = 'conversation';
/** Long enough for a full analysis, which has a 26 s deadline on top of reading the images. */
const WAIT_TRIES = 30;
const WAIT_MS = 2000;

interface Live {
  status: string;
  cuisine: string | null;
  menuCount: number | null;
  warnings: string[];
}

const IDLE_LIVE: Live = { status: 'Düşünüyorum', cuisine: null, menuCount: null, warnings: [] };

/** The menu the header stands for; a run that read nothing (an invoice, a blurry shot) has no cuisine to show. */
function latestRun(messages: readonly Message[]): RunResult | null {
  for (const message of [...messages].reverse()) if (message.result?.counts && message.result.menu.length > 0) return message.result;
  return null;
}

function MessageBubble({ message }: { message: Message }) {
  return (
    <div className="message user">
      {message.previews && message.previews.length > 0 ? (
        <div className="message-images">
          {message.previews.map((url) => (
            <img key={url} src={url} alt="Gönderilen ekran görüntüsü" />
          ))}
        </div>
      ) : (
        message.imageCount > 0 && <p className="image-note">{message.imageCount} ekran görüntüsü</p>
      )}
      {message.text && <p>{message.text}</p>}
    </div>
  );
}

function LiveStatus({ live }: { live: Live }) {
  return (
    <div className="message assistant" aria-live="polite">
      <div className="live">
        <span className="live-dot" aria-hidden />
        <span>{live.status}</span>
        {live.cuisine && <span className="live-fact">{live.cuisine}</span>}
        {live.menuCount !== null && <span className="live-fact">{live.menuCount} ürün okundu</span>}
      </div>
      {live.warnings.map((warning) => (
        <p key={warning} className="notice">
          {warning}
        </p>
      ))}
      <div className="skeleton" aria-hidden>
        <i />
        <i />
      </div>
    </div>
  );
}

function CallHeader({ title, run }: { title: string; run: RunResult | null }) {
  const counts = run?.counts ?? null;
  const gaps = counts?.categories.filter((c) => c.missing > 0) ?? [];
  return (
    <header className="call-header">
      <div className="call-title">
        <h1>{counts?.cuisineName ?? title}</h1>
        {counts?.quality ? (
          <OpeningChecklist quality={counts.quality} />
        ) : (
          gaps.length > 0 && <p className="gaps">Eksik: {gaps.map((gap) => `${gap.label} ${gap.present}/${gap.minItems}`).join(' · ')}</p>
        )}
      </div>
      {counts && <CountMeter current={counts.current} target={counts.target} />}
    </header>
  );
}

export function ChatApp() {
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const lastAnswer = useRef<HTMLDivElement>(null);
  // Answers to a stream arrive after a React render; this is the conversation the stream belongs to.
  const activeId = useRef<string | null>(null);
  // Bumped when the rep leaves a conversation: an answer still on its way must not land in the one now on screen.
  const view = useRef(0);

  const messages = useMemo(() => conversation?.messages ?? [], [conversation]);
  const run = useMemo(() => latestRun(messages), [messages]);
  const lastMessage = messages.at(-1);

  useEffect(() => {
    // An answer is read from its first line: scrolling to the end would hide the summary behind thirty cards.
    if (lastMessage?.role === 'assistant') lastAnswer.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, live !== null, lastMessage?.role]);

  const open = useCallback(async (id: string) => {
    view.current += 1;
    const mine = view.current;
    setError(null);
    setLive(null);
    setSidebarOpen(false);
    try {
      let loaded = await api<Conversation>(`/chat/conversations/${id}`);
      if (mine !== view.current) return;
      activeId.current = id;
      sessionStorage.setItem(SAVED_CONVERSATION, id);
      setConversation(loaded);
      // The answer keeps running on the server after a reload or a lost connection: wait for it here.
      for (let tries = 0; loaded.messages.at(-1)?.role === 'user' && tries < WAIT_TRIES; tries += 1) {
        setLive(IDLE_LIVE);
        await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
        if (mine !== view.current) return;
        loaded = await api<Conversation>(`/chat/conversations/${id}`);
        if (mine !== view.current) return;
        setConversation(loaded);
      }
      setLive(null);
    } catch (err) {
      if (mine !== view.current) return;
      setLive(null);
      setError(err instanceof ApiError ? err.message : 'Görüşme açılamadı.');
    }
  }, []);

  useEffect(() => {
    void api<{ data: ConversationRow[] }>('/chat/conversations')
      .then((res) => {
        setRows(res.data);
        // A reload in the middle of a call comes back to the same conversation.
        const saved = sessionStorage.getItem(SAVED_CONVERSATION);
        if (res.data.some((row) => row.id === saved) && saved) void open(saved);
      })
      .catch(() => undefined);
  }, [open]);

  const startNew = () => {
    view.current += 1;
    activeId.current = null;
    sessionStorage.removeItem(SAVED_CONVERSATION);
    setConversation(null);
    setLive(null);
    setDraft('');
    setError(null);
    setSidebarOpen(false);
  };

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`"${title}" görüşmesi silinsin mi?`)) return;
    await api(`/chat/conversations/${id}`, { method: 'DELETE' }).catch(() => undefined);
    setRows((current) => current.filter((row) => row.id !== id));
    if (activeId.current === id) startNew();
  };

  const onEvent = useCallback((event: ChatEvent) => {
    switch (event.type) {
      case 'conversation': {
        const row = event.conversation;
        activeId.current = row.id;
        sessionStorage.setItem(SAVED_CONVERSATION, row.id);
        setConversation((current) => ({ messages: [], ...current, ...row }));
        break;
      }
      case 'message':
        setConversation((current) => current && { ...current, messages: [...current.messages, event.message] });
        break;
      case 'progress':
        setLive((current) => current && { ...current, status: event.total ? `${event.message} (${event.done ?? 0}/${event.total})` : event.message });
        break;
      case 'classification':
        setLive((current) => current && { ...current, cuisine: event.classification.cuisineName });
        break;
      case 'menu':
        setLive((current) => current && { ...current, menuCount: event.items.length });
        break;
      case 'warning':
        setLive((current) => current && { ...current, warnings: [...current.warnings, event.message] });
        break;
      case 'error':
        setError(event.message);
        break;
      default:
    }
  }, []);

  const send = useCallback(
    async (text: string, sent: Attachment[]) => {
      const mine = view.current;
      setDraft('');
      setAttachments([]);
      setError(null);
      setLive({ ...IDLE_LIVE, status: sent.length > 0 ? 'Menüyü okuyorum' : 'Düşünüyorum' });
      const local: Message = {
        id: `local-${Date.now()}`,
        role: 'user',
        text,
        imageCount: sent.length,
        runId: null,
        quickReplies: [],
        createdAt: new Date().toISOString(),
        result: null,
        previews: sent.map((a) => a.url),
      };
      setConversation((current) => (current ? { ...current, messages: [...current.messages, local] } : { id: '', title: '', updatedAt: '', messages: [local] }));

      const form = new FormData();
      if (activeId.current) form.append('conversationId', activeId.current);
      if (text) form.append('text', text);
      sent.forEach((attachment, index) => form.append('images', attachment.blob, `menu-${index}.jpg`));

      let started = false;
      let answered = false;
      try {
        await sendMessage(form, (event) => {
          if (event.type === 'conversation') {
            started = true;
            const row = event.conversation;
            setRows((current) => [row, ...current.filter((r) => r.id !== row.id)]);
          }
          if (event.type === 'message') answered = true;
          if (mine === view.current) onEvent(event);
        });
      } catch (err) {
        // Once the stream has started the message is on the server, and sending it again would answer it twice.
        if (!started && mine === view.current) {
          setConversation((current) => current && { ...current, messages: current.messages.filter((m) => m.id !== local.id) });
          setDraft(text);
          setAttachments(sent);
          setError(err instanceof ApiError ? err.message : 'Mesaj gönderilemedi. Tekrar dene.');
        }
      }
      if (mine !== view.current) return;
      if (started && !answered && activeId.current) await open(activeId.current);
      else setLive(null);
    },
    [onEvent, open],
  );

  const hasConversation = messages.length > 0;
  const replies = !live && lastMessage?.role === 'assistant' ? lastMessage.quickReplies : [];
  const composer = (
    <Composer
      busy={live !== null}
      draft={draft}
      onDraft={setDraft}
      onSend={(text, sent) => void send(text, sent)}
      attachments={attachments}
      setAttachments={setAttachments}
      placeholder={hasConversation ? NEXT_PROMPT : FIRST_PROMPT}
    />
  );

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <nav className="sidebar" aria-label="Görüşmeler">
        <div className="sidebar-head">
          <span className="brand">Menü Kopilot</span>
          <button type="button" className="icon-button close-sidebar" aria-label="Görüşmeleri kapat" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <button type="button" className="button primary new-call" onClick={startNew}>
          <Plus size={17} />
          Yeni görüşme
        </button>
        {rows.length === 0 ? (
          <p className="sidebar-empty">Görüşmelerin bu tarayıcıda saklanır, hesap açman gerekmez.</p>
        ) : (
          <ul className="conversations">
            {rows.map((row) => (
              <li key={row.id} className={row.id === conversation?.id ? 'active' : ''}>
                <button type="button" className="conversation" onClick={() => void open(row.id)}>
                  <span>{row.title}</span>
                  <small>{timeLabel(row.updatedAt)}</small>
                </button>
                <button type="button" className="icon-button small remove" aria-label={`${row.title} görüşmesini sil`} onClick={() => void remove(row.id, row.title)}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="feedback-button" onClick={() => setFeedbackOpen(true)}>
          <MessageSquarePlus size={16} aria-hidden />
          Geri bildirim gönder
        </button>
      </nav>
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} conversationId={conversation?.id ?? null} />
      <button type="button" className="sidebar-scrim" aria-label="Görüşmeleri kapat" onClick={() => setSidebarOpen(false)} />

      <main className="chat">
        <button type="button" className="icon-button open-sidebar" aria-label="Görüşmeleri aç" onClick={() => setSidebarOpen(true)}>
          <Menu size={20} />
        </button>
        {hasConversation ? (
          <>
            <CallHeader title={conversation?.title ?? ''} run={run} />
            <div className="scroller" ref={scroller}>
              <div className="thread">
                {messages.map((message) =>
                  message.role === 'user' ? (
                    <MessageBubble key={message.id} message={message} />
                  ) : (
                    <div key={message.id} className="message assistant" ref={message === lastMessage ? lastAnswer : undefined}>
                      <RichText text={message.text} />
                      {message.result && <RunBlock result={message.result} />}
                    </div>
                  ),
                )}
                {live && <LiveStatus live={live} />}
              </div>
            </div>
            <div className="dock">
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {replies.length > 0 && (
                <div className="quick-replies">
                  {replies.map((reply) => (
                    <button key={reply} type="button" className="chip" onClick={() => void send(reply, [])}>
                      {reply}
                    </button>
                  ))}
                </div>
              )}
              {composer}
            </div>
          </>
        ) : (
          <div className="welcome">
            <h1>Restoranın menüsünü yapıştır</h1>
            <p>Ekran görüntüsünü okurum, eksikleri bulurum; menüye uygun ürünleri, opsiyonları ve ekstra malzemeleri görüşme sırasına dizerim.</p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {composer}
            <div className="quick-replies center">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" className="chip" onClick={() => void send(example, [])}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
