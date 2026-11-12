import { Check, Eye, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { ApiError, patch } from '../api';
import { dateTimeLabel } from '../format';
import { ConversationView, Loading, Page, useLoad } from './pages';

type Status = 'new' | 'seen' | 'done';

interface FeedbackRow {
  id: string;
  kind: 'oneri' | 'hata' | 'diger';
  message: string;
  authorName: string;
  status: Status;
  adminNote: string;
  conversationId: string | null;
  conversationTitle: string | null;
  visitor: string;
  createdAt: string;
}

interface FeedbackList {
  data: FeedbackRow[];
  counts: Record<Status, number>;
}

const KIND_LABEL: Record<FeedbackRow['kind'], string> = { oneri: 'Öneri', hata: 'Hata', diger: 'Diğer' };
const FILTERS: { key: Status | 'all'; label: string }[] = [
  { key: 'new', label: 'Yeni' },
  { key: 'seen', label: 'Görüldü' },
  { key: 'done', label: 'Tamamlandı' },
  { key: 'all', label: 'Tümü' },
];

function Item({ row, onChange, onOpenConversation }: { row: FeedbackRow; onChange: (body: { status?: Status; adminNote?: string }) => void; onOpenConversation: (id: string) => void }) {
  const [note, setNote] = useState(row.adminNote);
  return (
    <li className={`feedback-item ${row.status}`}>
      <header>
        <span className={`kind ${row.kind}`}>{KIND_LABEL[row.kind]}</span>
        <span className="muted small">
          {row.authorName || `Ziyaretçi ${row.visitor}`} · {dateTimeLabel(row.createdAt)}
        </span>
        {row.conversationId && (
          <button type="button" className="link small" onClick={() => onOpenConversation(row.conversationId!)}>
            <MessageSquare size={13} aria-hidden /> {row.conversationTitle ?? 'Görüşme'}
          </button>
        )}
      </header>
      <p className="feedback-message">{row.message}</p>
      <div className="feedback-actions">
        <input
          aria-label="Not"
          placeholder="Not ekle (ör. ne yapıldı)"
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== row.adminNote && onChange({ adminNote: note })}
        />
        {row.status === 'new' && (
          <button type="button" className="button ghost small" onClick={() => onChange({ status: 'seen' })}>
            <Eye size={14} /> Görüldü
          </button>
        )}
        {row.status !== 'done' ? (
          <button type="button" className="button ghost small" onClick={() => onChange({ status: 'done', adminNote: note })}>
            <Check size={14} /> Tamamlandı
          </button>
        ) : (
          <button type="button" className="button ghost small" onClick={() => onChange({ status: 'seen' })}>
            Yeniden aç
          </button>
        )}
      </div>
    </li>
  );
}

/** What the reps sent from the site: read it, note what was done, close it (D-206). */
export function Feedback({ onCountsChange }: { onCountsChange: () => void }) {
  const [filter, setFilter] = useState<Status | 'all'>('new');
  const [conversation, setConversation] = useState<{ id: string; title: string } | null>(null);
  const { data, error, reload } = useLoad<FeedbackList>(`/admin/feedback?limit=100${filter === 'all' ? '' : `&status=${filter}`}`);
  const [actionError, setActionError] = useState<string | null>(null);

  const change = (id: string, body: { status?: Status; adminNote?: string }) => {
    setActionError(null);
    patch(`/admin/feedback/${id}`, body)
      .then(() => {
        reload();
        onCountsChange();
      })
      .catch((err: unknown) => setActionError(err instanceof ApiError ? err.message : 'Kaydedilemedi.'));
  };

  if (conversation) return <ConversationView row={conversation} onBack={() => setConversation(null)} backLabel="Geri bildirimler" />;

  return (
    <Page
      title="Geri bildirimler"
      intro="Temsilcilerin siteden gönderdikleri. Okuduğunu 'Görüldü', gereğini yaptığını 'Tamamlandı' yap; nota ne yapıldığını yaz."
      error={error ?? actionError}
      actions={
        <div className="segmented" role="group" aria-label="Durum">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
              {f.key !== 'all' && data ? ` ${data.counts[f.key]}` : ''}
            </button>
          ))}
        </div>
      }
    >
      {!data && !error && <Loading />}
      {data && data.data.length === 0 && <p className="muted">{filter === 'new' ? 'Yeni geri bildirim yok.' : 'Bu durumda geri bildirim yok.'}</p>}
      {data && data.data.length > 0 && (
        <ul className="feedback-list">
          {data.data.map((row) => (
            <Item
              key={row.id}
              row={row}
              onChange={(body) => change(row.id, body)}
              onOpenConversation={(id) => setConversation({ id, title: row.conversationTitle ?? 'Görüşme' })}
            />
          ))}
        </ul>
      )}
    </Page>
  );
}
