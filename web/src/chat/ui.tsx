import { Check, Copy } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';

const COPIED_MS = 1400;

export function CopyButton({ text, label, compact = false }: { text: string; label: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    });
  };

  return (
    <button type="button" className={compact ? 'icon-button small' : 'button ghost'} onClick={copy} aria-label={label} title={label}>
      {copied ? <Check size={compact ? 14 : 16} /> : <Copy size={compact ? 14 : 16} />}
      {!compact && (copied ? 'Kopyalandı' : label)}
    </button>
  );
}

function inline(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/gu).map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : <Fragment key={index}>{part}</Fragment>));
}

/** The model is told to write only **bold** and "- " lists; everything else stays plain text, so nothing here is HTML. */
export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={blocks.length}>
        {items.map((item, index) => (
          <li key={index}>{inline(item)}</li>
        ))}
      </ul>,
    );
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) {
      bullets.push(line.slice(2));
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="rich-text">{blocks}</div>;
}

const SEGMENTED_MAX = 24;

/** The number that matters on a call: one segment per product, amber until the target, green at it. */
export function CountMeter({ current, target }: { current: number; target: number }) {
  const reached = target > 0 && current >= target;
  const shown = Math.min(current, target);
  return (
    <div className={`meter ${reached ? 'reached' : ''}`} role="img" aria-label={`${current} / ${target} ürün`}>
      <span className="meter-count">
        <strong>{current}</strong> / {target} ürün
      </span>
      {target <= SEGMENTED_MAX ? (
        <span className="meter-track" aria-hidden>
          {Array.from({ length: target }, (_, index) => (
            <i key={index} className={index < shown ? 'on' : ''} />
          ))}
        </span>
      ) : (
        <span className="meter-track" aria-hidden>
          <b style={{ width: `${(shown / target) * 100}%` }} />
        </span>
      )}
    </div>
  );
}
