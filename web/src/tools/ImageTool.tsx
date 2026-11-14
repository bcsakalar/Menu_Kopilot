import { Download, ImageUp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { containRect, coverRect, customPreset, IMAGE_PRESETS, outputName, type ImagePreset } from './image/fit';

/**
 * Logo ve banner (D-218): a seller's logo, banner or product photo brought to the panel's format — the right size, cropped
 * or fitted, under the size limit — as JPEG or PNG. Drawn and compressed in the browser's canvas; nothing is uploaded.
 */

type Fit = 'cover' | 'contain';
type Format = 'jpeg' | 'png';

interface Source {
  name: string;
  bitmap: ImageBitmap;
}

interface Output {
  url: string;
  bytes: number;
  quality: number | null;
  overLimit: boolean;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> =>
  new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), type, quality));

/** The highest JPEG quality under the limit, found in a few halvings; PNG has no quality to lower. */
async function encode(canvas: HTMLCanvasElement, format: Format, maxBytes: number): Promise<{ blob: Blob; quality: number | null }> {
  if (format === 'png') return { blob: await toBlob(canvas, 'image/png'), quality: null };
  let best = await toBlob(canvas, 'image/jpeg', 0.92);
  if (best.size <= maxBytes) return { blob: best, quality: 0.92 };
  let low = 0.3;
  let high = 0.92;
  let bestQuality = low;
  best = await toBlob(canvas, 'image/jpeg', low);
  for (let step = 0; step < 7; step += 1) {
    const middle = (low + high) / 2;
    const blob = await toBlob(canvas, 'image/jpeg', middle);
    if (blob.size <= maxBytes) {
      best = blob;
      bestQuality = middle;
      low = middle;
    } else {
      high = middle;
    }
  }
  return { blob: best, quality: bestQuality };
}

export function ImageTool() {
  const [chosen, setChosen] = useState<ImagePreset['key']>('urun');
  const [custom, setCustom] = useState({ width: 800, height: 800, maxKb: 150, lock: true });
  const [fit, setFit] = useState<Fit>('cover');
  const [format, setFormat] = useState<Format>('jpeg');
  const [background, setBackground] = useState('#ffffff');
  const [source, setSource] = useState<Source | null>(null);
  const [focus, setFocus] = useState({ x: 0.5, y: 0.5 });
  const [output, setOutput] = useState<Output | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; focus: { x: number; y: number } } | null>(null);
  const preset = chosen === 'ozel' ? customPreset(custom.width, custom.height, custom.maxKb) : IMAGE_PRESETS.find((p) => p.key === chosen)!;
  /** With the ratio locked, one side follows the other and the source's shape. */
  const resize = (side: 'width' | 'height', value: number) => {
    setCustom((current) => {
      if (!current.lock || !source) return { ...current, [side]: value };
      const ratio = source.bitmap.width / source.bitmap.height;
      return side === 'width' ? { ...current, width: value, height: Math.round(value / ratio) } : { ...current, height: value, width: Math.round(value * ratio) };
    });
  };
  const preview = useRef<HTMLImageElement>(null);

  const open = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Bir görsel dosyası seç: JPEG, PNG ya da WebP.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      setSource((current) => {
        current?.bitmap.close();
        return { name: file.name, bitmap };
      });
      setFocus({ x: 0.5, y: 0.5 });
    } catch {
      setError('Görsel açılamadı. Başka bir dosya dene.');
    }
  };

  // A pasted image (Ctrl+V) opens like a dropped one.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) void open(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    const canvas = document.createElement('canvas');
    canvas.width = preset.width;
    canvas.height = preset.height;
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    const { width, height } = source.bitmap;
    // JPEG has no transparency: the background shows wherever the image does not. A PNG keeps it transparent.
    if (format === 'jpeg') {
      context.fillStyle = background;
      context.fillRect(0, 0, preset.width, preset.height);
    }
    if (fit === 'cover') {
      const crop = coverRect(width, height, preset.width, preset.height, focus.x, focus.y);
      context.drawImage(source.bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, preset.width, preset.height);
    } else {
      const place = containRect(width, height, preset.width, preset.height);
      context.drawImage(source.bitmap, place.x, place.y, place.width, place.height);
    }
    const timer = window.setTimeout(() => {
      void encode(canvas, format, preset.maxKb * 1024).then(({ blob, quality }) => {
        if (cancelled) return;
        setOutput((current) => {
          if (current) URL.revokeObjectURL(current.url);
          return { url: URL.createObjectURL(blob), bytes: blob.size, quality, overLimit: blob.size > preset.maxKb * 1024 };
        });
      });
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, preset, fit, format, background, focus]);

  const reset = () => {
    source?.bitmap.close();
    setSource(null);
    setOutput((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  };

  return (
    <section className="admin-page tool-page wide">
      <header className="page-head">
        <div>
          <h1>Logo ve banner</h1>
          <p className="admin-intro">Satıcının gönderdiği logo, banner ya da ürün görselini panelin ölçüsüne ve boyut sınırına getir.</p>
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="image-tool">
        <div className="image-stage">
          {!source ? (
            <label
              className={`dropzone tall${dragging ? ' dragging' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void open(e.dataTransfer.files[0]);
              }}
            >
              <ImageUp size={28} aria-hidden />
              <strong>Görseli buraya bırak, seç ya da Ctrl+V ile yapıştır</strong>
              <span className="muted small">JPEG, PNG veya WebP · görsel bilgisayarından çıkmaz</span>
              <input type="file" accept="image/*" onChange={(e) => void open(e.target.files?.[0])} />
            </label>
          ) : (
            <>
              <div className={`preview-frame${format === 'png' && fit === 'contain' ? ' checker' : ''}`} style={{ aspectRatio: `${preset.width} / ${preset.height}` }}>
                {output && (
                  <img
                    ref={preview}
                    src={output.url}
                    alt={`${preset.label} önizlemesi`}
                    draggable={false}
                    className={fit === 'cover' ? 'movable' : undefined}
                    onPointerDown={(e) => {
                      if (fit !== 'cover') return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      drag.current = { x: e.clientX, y: e.clientY, focus };
                    }}
                    onPointerMove={(e) => {
                      if (!drag.current || !preview.current) return;
                      const box = preview.current.getBoundingClientRect();
                      const start = drag.current;
                      setFocus({
                        x: Math.min(1, Math.max(0, start.focus.x - (e.clientX - start.x) / box.width)),
                        y: Math.min(1, Math.max(0, start.focus.y - (e.clientY - start.y) / box.height)),
                      });
                    }}
                    onPointerUp={() => {
                      drag.current = null;
                    }}
                  />
                )}
              </div>
              <div className="image-meta">
                <span className="muted small">
                  {source.name} · kaynak {source.bitmap.width} × {source.bitmap.height}
                  {fit === 'cover' && ' · kırpılan alanı sürükleyerek kaydır'}
                </span>
                <button type="button" className="icon-button small" aria-label="Görseli kaldır" title="Başka görsel seç" onClick={reset}>
                  <X size={15} />
                </button>
              </div>
            </>
          )}
        </div>

        <aside className="image-options">
          <fieldset>
            <legend>Ölçü</legend>
            {IMAGE_PRESETS.map((item) => (
              <label key={item.key} className={`preset${item.key === chosen ? ' active' : ''}`}>
                <input type="radio" name="preset" checked={item.key === chosen} onChange={() => setChosen(item.key)} />
                <span>
                  <strong>{item.label}</strong>
                  <span className="muted small">
                    {item.width} × {item.height} · en fazla {item.maxKb} KB
                  </span>
                </span>
              </label>
            ))}
            <label className={`preset${chosen === 'ozel' ? ' active' : ''}`}>
              <input type="radio" name="preset" checked={chosen === 'ozel'} onChange={() => setChosen('ozel')} />
              <span>
                <strong>Özel ölçü</strong>
                <span className="muted small">Genişlik, yükseklik ve boyut sınırını sen ver</span>
              </span>
            </label>
            {chosen === 'ozel' && (
              <div className="custom-size">
                <label>
                  Genişlik
                  <input type="number" min={16} max={4000} value={custom.width} onChange={(e) => resize('width', Number(e.target.value))} />
                </label>
                <label>
                  Yükseklik
                  <input type="number" min={16} max={4000} value={custom.height} onChange={(e) => resize('height', Number(e.target.value))} />
                </label>
                <label>
                  En fazla KB
                  <input type="number" min={10} max={5000} value={custom.maxKb} onChange={(e) => setCustom((c) => ({ ...c, maxKb: Number(e.target.value) }))} />
                </label>
                <label className="lock">
                  <input type="checkbox" checked={custom.lock} onChange={(e) => setCustom((c) => ({ ...c, lock: e.target.checked }))} />
                  Oranı koru
                </label>
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend>Yerleşim</legend>
            <div className="segmented" role="group" aria-label="Yerleşim">
              <button type="button" aria-pressed={fit === 'cover'} onClick={() => setFit('cover')}>
                Kırp
              </button>
              <button type="button" aria-pressed={fit === 'contain'} onClick={() => setFit('contain')}>
                Sığdır
              </button>
            </div>
            {fit === 'contain' &&
              (format === 'jpeg' ? (
                <label className="color-row">
                  <span>Arka plan</span>
                  <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} aria-label="Arka plan rengi" />
                  <span className="muted small">{background}</span>
                </label>
              ) : (
                <p className="muted small">PNG’de görselin dışı saydam kalır.</p>
              ))}
          </fieldset>
          <fieldset>
            <legend>Biçim</legend>
            <div className="segmented" role="group" aria-label="Biçim">
              <button type="button" aria-pressed={format === 'jpeg'} onClick={() => setFormat('jpeg')}>
                JPEG
              </button>
              <button type="button" aria-pressed={format === 'png'} onClick={() => setFormat('png')}>
                PNG
              </button>
            </div>
          </fieldset>
          {output && source && (
            <div className="image-result">
              <p>
                <strong>
                  {preset.width} × {preset.height}
                </strong>{' '}
                · {(output.bytes / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} KB · {format.toUpperCase()}
                {output.quality !== null && output.quality < 0.92 && <span className="muted small"> · kalite %{Math.round(output.quality * 100)}</span>}
              </p>
              {output.overLimit && (
                <p className="warning small">{format === 'png' ? `PNG ${preset.maxKb} KB sınırını aşıyor; JPEG seç.` : `En düşük kalitede bile ${preset.maxKb} KB sınırını aşıyor.`}</p>
              )}
              <a className="button primary" href={output.url} download={outputName(source.name, preset, format)}>
                <Download size={15} aria-hidden />
                İndir
              </a>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
