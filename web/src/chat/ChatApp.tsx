import { ClipboardList, Menu, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, post, sendMessage } from '../api';
import { formatCards, timeLabel } from '../format';
import type { Answer, Card, ChatEvent, Conversation, ConversationRow, Message, RunResult } from '../types';
import { Composer, type Attachment } from './Composer';
import { RunBlock } from './RunBlock';
import { CopyButton, CountMeter, RichText } from './ui';

const FIRST_PROMPT = 'Menünün ekran görüntüsünü yapıştır ya da ürünleri yaz…';
const NEXT_PROMPT = 'Sor, iste ya da yeni ekran görüntüsü yapıştır…';
const EXAMPLES = ['Adana, Urfa, Lahmacun, Ayran', 'Kaşarlı Pide, Kıymalı Pide, Çay'];

interface Live {
  status: string;
  cuisine: string | null;
  menuCount: number | null;
  warnings: string[];
}

const IDLE_LIVE: Live = { status: 'Düşünüyorum', cuisine: null, menuCount: null, warnings: [] };

/** Everything the rep has seen in this call, oldest first. */
const allCards = (messages: readonly Message[]): Card[] => messages.flatMap((m) => m.result?.cards ?? []);

function latestRun(messages: readonly Message[]): RunResult | null {
  for (const message of [...messages].reverse()) if (message.result?.counts) return message.result;
  return null;
}

/** The latest analysis already counts what was accepted before it; only what was accepted since moves the meter. */
function acceptedSince(run: RunResult | null, cards: readonly Card[]): number {
  const onMenu = new Set(run?.menu.map((item) => item.name.toLocaleLowerCase('tr-TR')));
  return cards.filter((c) => c.section === 'new_product' && c.status === 'accepted' && !onMenu.has(c.name.toLocaleLowerCase('tr-TR'))).length;
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
        <i />
      </div>
    </div>
  );
}

function Summary({ cards, onClose }: { cards: Card[]; onClose: () => void }) {
  const yes = cards.filter((c) => c.status === 'accepted');
  const later = cards.filter((c) => c.status === 'later');
  const list = (title: string, items: Card[]) => (
    <section>
      <div className="summary-head">
        <h3>
          {title} <span>{items.length}</span>
        </h3>
        {items.length > 0 && <CopyButton text={formatCards(items)} label="Kopyala" />}
      </div>
      <ul>
        {items.map((card) => (
          <li key={card.id}>
            {card.targetName ?? card.name}
            {card.section === 'option' && <small>opsiyon ve malzeme</small>}
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <aside className="summary" aria-label="Görüşme özeti">
      <header>
        <h2>Panele girilecekler</h2>
        <button type="button" className="icon-button" aria-label="Özeti kapat" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      {yes.length === 0 && later.length === 0 ? (
        <p className="summary-empty">Kartlarda Evet veya Düşünecek dediklerin burada toplanır. Görüşme bitince tek seferde kopyalarsın.</p>
      ) : (
        <>
          {list('Evet dedi', yes)}
          {later.length > 0 && list('Düşünecek', later)}
        </>
      )}
    </aside>
  );
}

function CallHeader({ title, run, cards, onSummary }: { title: string; run: RunResult | null; cards: Card[]; onSummary: () => void }) {
  const counts = run?.counts ?? null;
  const yes = cards.filter((c) => c.status === 'accepted').length;
  const later = cards.filter((c) => c.status === 'later').length;
  const gaps = counts?.categories.filter((c) => c.missing > 0) ?? [];
  return (
    <header className="call-header">
      <div className="call-title">
        <h1>{counts?.cuisineName ?? title}</h1>
        {gaps.length > 0 && (
          <p className="gaps">
            {gaps.slice(0, 5).map((gap) => (
              <span key={gap.key}>
                {gap.label} {gap.present}/{gap.minItems}
              </span>
            ))}
          </p>
        )}
      </div>
      {counts && <CountMeter current={counts.current + acceptedSince(run, cards)} target={counts.target} />}
      <button type="button" className="button ghost" onClick={onSummary}>
        <ClipboardList size={16} />
        Özet{yes + later > 0 ? ` ${yes + later}` : ''}
      </button>
    </header>
  );
}

export function ChatApp() {
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const lastAnswer = useRef<HTMLDivElement>(null);
  // Answers to a stream arrive after a React render; this is the conversation the stream belongs to.
  const activeId = useRef<string | null>(null);

  useEffect(() => {
    void api<{ data: ConversationRow[] }>('/chat/conversations')
      .then((res) => setRows(res.data))
      .catch(() => undefined);
  }, []);

  const messages = useMemo(() => conversation?.messages ?? [], [conversation]);
  const cards = useMemo(() => allCards(messages), [messages]);
  const run = useMemo(() => latestRun(messages), [messages]);
  const lastMessage = messages.at(-1);

  useEffect(() => {
    // An answer is read from its first line: scrolling to the end would hide the summary behind thirty cards.
    if (lastMessage?.role === 'assistant') lastAnswer.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, live !== null, lastMessage?.role]);

  const open = useCallback(async (id: string) => {
    setError(null);
    setSidebarOpen(false);
    setShowSummary(false);
    try {
      const loaded = await api<Conversation>(`/chat/conversations/${id}`);
      activeId.current = id;
      setConversation(loaded);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Görüşme açılamadı.');
    }
  }, []);

  const startNew = () => {
    activeId.current = null;
    setConversation(null);
    setDraft('');
    setError(null);
    setShowSummary(false);
    setSidebarOpen(false);
  };

  const remove = async (id: string) => {
    await api(`/chat/conversations/${id}`, { method: 'DELETE' }).catch(() => undefined);
    setRows((current) => current.filter((row) => row.id !== id));
    if (activeId.current === id) startNew();
  };

  const onEvent = useCallback((event: ChatEvent) => {
    switch (event.type) {
      case 'conversation': {
        const row = event.conversation;
        activeId.current = row.id;
        setRows((current) => [row, ...current.filter((r) => r.id !== row.id)]);
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
    async (text: string, attachments: Attachment[]) => {
      setDraft('');
      setError(null);
      setLive({ ...IDLE_LIVE, status: attachments.length > 0 ? 'Menüyü okuyorum' : 'Düşünüyorum' });
      const local: Message = {
        id: `local-${Date.now()}`,
        role: 'user',
        text,
        imageCount: attachments.length,
        runId: null,
        quickReplies: [],
        createdAt: new Date().toISOString(),
        result: null,
        previews: attachments.map((a) => a.url),
      };
      setConversation((current) => (current ? { ...current, messages: [...current.messages, local] } : { id: '', title: '', updatedAt: '', messages: [local] }));

      const form = new FormData();
      if (activeId.current) form.append('conversationId', activeId.current);
      if (text) form.append('text', text);
      attachments.forEach((attachment, index) => form.append('images', attachment.blob, `menu-${index}.jpg`));
      try {
        await sendMessage(form, onEvent);
      } catch (err) {
        setDraft(text);
        setError(err instanceof ApiError ? err.message : 'Mesaj gönderilemedi. Tekrar dene.');
      } finally {
        setLive(null);
      }
    },
    [onEvent],
  );

  const answer = useCallback(async (card: Card, choice: Answer) => {
    const status = { accept: 'accepted', skip: 'skipped', later: 'later' }[choice] as Card['status'];
    const patchCard = (next: Card['status']) =>
      setConversation(
        (current) =>
          current && {
            ...current,
            messages: current.messages.map((m) =>
              m.result ? { ...m, result: { ...m.result, cards: m.result.cards.map((c) => (c.id === card.id ? { ...c, status: next } : c)) } } : m,
            ),
          },
      );
    patchCard(status);
    try {
      await post(`/suggestion-items/${card.id}/${choice}`);
    } catch (err) {
      patchCard(card.status);
      setError(err instanceof ApiError ? err.message : 'Cevap kaydedilemedi.');
    }
  }, []);

  const hasConversation = messages.length > 0;
  const composer = (
    <Composer busy={live !== null} draft={draft} onDraft={setDraft} onSend={(text, attachments) => void send(text, attachments)} placeholder={hasConversation ? NEXT_PROMPT : FIRST_PROMPT} />
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
                <button type="button" className="icon-button small remove" aria-label={`${row.title} görüşmesini sil`} onClick={() => void remove(row.id)}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
      <button type="button" className="sidebar-scrim" aria-label="Görüşmeleri kapat" onClick={() => setSidebarOpen(false)} />

      <main className="chat">
        <button type="button" className="icon-button open-sidebar" aria-label="Görüşmeleri aç" onClick={() => setSidebarOpen(true)}>
          <Menu size={20} />
        </button>
        {hasConversation ? (
          <>
            <CallHeader title={conversation?.title ?? ''} run={run} cards={cards} onSummary={() => setShowSummary((v) => !v)} />
            <div className="scroller" ref={scroller}>
              <div className="thread">
                {messages.map((message) =>
                  message.role === 'user' ? (
                    <MessageBubble key={message.id} message={message} />
                  ) : (
                    <div key={message.id} className="message assistant" ref={message === lastMessage ? lastAnswer : undefined}>
                      <RichText text={message.text} />
                      {message === lastMessage && !live && message.quickReplies.length > 0 && (
                        <div className="quick-replies">
                          {message.quickReplies.map((reply) => (
                            <button key={reply} type="button" className="chip" onClick={() => void send(reply, [])}>
                              {reply}
                            </button>
                          ))}
                        </div>
                      )}
                      {message.result && <RunBlock result={message.result} onAnswer={(card, choice) => void answer(card, choice)} />}
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
      {showSummary && <Summary cards={cards} onClose={() => setShowSummary(false)} />}
    </div>
  );
}
