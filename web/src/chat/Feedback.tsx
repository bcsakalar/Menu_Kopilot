import { X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, post } from '../api';

type Kind = 'oneri' | 'hata' | 'diger';

const KINDS: { key: Kind; label: string }[] = [
  { key: 'oneri', label: 'Öneri' },
  { key: 'hata', label: 'Hata' },
  { key: 'diger', label: 'Diğer' },
];
const NAME_KEY = 'feedback-name';
const DONE_MS = 1800;

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/** What a rep wants the team to know; the panel's "Geri bildirimler" page reads it (D-206). */
export function FeedbackDialog({ open, onClose, conversationId }: { open: boolean; onClose: () => void; conversationId: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [kind, setKind] = useState<Kind>('oneri');
  const [message, setMessage] = useState('');
  const [name, setName] = useState(savedName);
  const [attach, setAttach] = useState(true);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      setState('idle');
      setError(null);
      node.showModal();
      // showModal focuses the first control (the close button); the message is what the rep came to write.
      textarea.current?.focus();
    }
    if (!open && node.open) node.close();
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState('sending');
    setError(null);
    try {
      await post('/feedback', { kind, message, name, conversationId: attach ? conversationId : null });
      try {
        localStorage.setItem(NAME_KEY, name);
      } catch {
        // A private window keeps no name; the next message just asks again.
      }
      setState('sent');
      setMessage('');
      setTimeout(onClose, DONE_MS);
    } catch (err) {
      setState('idle');
      setError(err instanceof ApiError ? err.message : 'Gönderilemedi, tekrar dene.');
    }
  };

  return (
    <dialog ref={dialog} className="dialog" aria-labelledby="feedback-title" onClose={onClose} onCancel={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        <header>
          <h2 id="feedback-title">Geri bildirim</h2>
          <button type="button" className="icon-button small" aria-label="Kapat" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        {state === 'sent' ? (
          <p className="sent" role="status">
            Teşekkürler, ekibe ulaştı.
          </p>
        ) : (
          <>
            <div className="segmented" role="group" aria-label="Tür">
              {KINDS.map((k) => (
                <button key={k.key} type="button" aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>
                  {k.label}
                </button>
              ))}
            </div>
            <label>
              Ne düşünüyorsun?
              <textarea
                required
                minLength={3}
                maxLength={2000}
                rows={5}
                ref={textarea}
                value={message}
                placeholder={kind === 'hata' ? 'Ne oldu, ne bekliyordun?' : 'Önerin, eksik gördüğün bir şey…'}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <label>
              <span>
                Adın <small>(isteğe bağlı)</small>
              </span>
              <input value={name} maxLength={60} autoComplete="name" onChange={(e) => setName(e.target.value)} />
            </label>
            {conversationId && (
              <label className="check">
                <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
                Ekranda açık görüşmeyi de ekle
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <button type="button" className="button ghost" onClick={onClose}>
                Vazgeç
              </button>
              <button type="submit" className="button primary" disabled={state === 'sending' || message.trim().length < 3}>
                {state === 'sending' ? 'Gönderiliyor…' : 'Gönder'}
              </button>
            </div>
          </>
        )}
      </form>
    </dialog>
  );
}
