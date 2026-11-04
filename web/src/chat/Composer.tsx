import { ArrowUp, ImagePlus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { shrinkImage } from '../format';

const MAX_IMAGES = 5;

export interface Attachment {
  id: number;
  blob: Blob;
  url: string;
}

interface Props {
  busy: boolean;
  draft: string;
  onDraft: (text: string) => void;
  onSend: (text: string, attachments: Attachment[]) => void;
  placeholder: string;
}

const imagesIn = (data: DataTransfer | null): File[] =>
  [...(data?.items ?? [])].filter((item) => item.kind === 'file' && item.type.startsWith('image/')).flatMap((item) => item.getAsFile() ?? []);

let nextId = 0;

/** Ctrl+V works from anywhere on the page: the rep comes back from the panel with a screenshot and nothing focused. */
export function Composer({ busy, draft, onDraft, onSend, placeholder }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  const add = useCallback(async (files: File[]) => {
    setProblem(null);
    try {
      const blobs = await Promise.all(files.map(shrinkImage));
      setAttachments((current) => {
        const room = MAX_IMAGES - current.length;
        if (blobs.length > room) setProblem(`Bir mesajda en fazla ${MAX_IMAGES} görüntü gönderilebilir.`);
        return [...current, ...blobs.slice(0, room).map((blob) => ({ id: nextId++, blob, url: URL.createObjectURL(blob) }))];
      });
      input.current?.focus();
    } catch {
      setProblem('Bu görüntü okunamadı. PNG veya JPEG dene.');
    }
  }, []);

  useEffect(() => {
    const onPaste = (event: globalThis.ClipboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.('.composer')) return;
      const files = imagesIn(event.clipboardData);
      if (files.length > 0) void add(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [add]);

  const onPasteHere = (event: ClipboardEvent) => {
    const files = imagesIn(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    void add(files);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'));
    if (files.length > 0) void add(files);
  };

  const remove = (id: number) => {
    setAttachments((current) => {
      const gone = current.find((a) => a.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return current.filter((a) => a.id !== id);
    });
  };

  const canSend = !busy && (draft.trim().length > 0 || attachments.length > 0);
  const send = () => {
    if (!canSend) return;
    onSend(draft.trim(), attachments);
    setAttachments([]);
    setProblem(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };

  return (
    <form
      className={`composer ${dragging ? 'dragging' : ''}`}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {attachments.length > 0 && (
        <ul className="attachments" aria-label="Eklenen görüntüler">
          {attachments.map((attachment, index) => (
            <li key={attachment.id}>
              <img src={attachment.url} alt={`Ekran görüntüsü ${index + 1}`} />
              <button type="button" className="attachment-remove" aria-label={`Ekran görüntüsü ${index + 1} kaldır`} onClick={() => remove(attachment.id)}>
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={input}
        autoFocus
        rows={1}
        value={draft}
        placeholder={placeholder}
        aria-label="Mesaj"
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPasteHere}
      />
      <div className="composer-bar">
        <button type="button" className="icon-button" aria-label="Görüntü ekle" title="Görüntü ekle" onClick={() => picker.current?.click()}>
          <ImagePlus size={19} />
        </button>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            void add([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
        <span className="composer-hint">{problem ?? <><kbd>Ctrl</kbd> + <kbd>V</kbd> ile ekran görüntüsü yapıştır</>}</span>
        <button type="submit" className="send" disabled={!canSend} aria-label="Gönder" title="Gönder">
          <ArrowUp size={19} />
        </button>
      </div>
    </form>
  );
}
