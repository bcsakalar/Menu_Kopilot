import { FileSpreadsheet, Image as ImageIcon, Type } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { ModeSwitch } from '../ModeSwitch';
import { ExcelTool } from './ExcelTool';
import { ImageTool } from './ImageTool';
import { TextTool } from './TextTool';
import './tools.css';

/**
 * The tools page (D-218): the panel's writing rules for pasted text, a spreadsheet viewer and fixer, and the image
 * formats for logos and banners. Everything runs in the browser; the only call to the server is the dictionary.
 */

type ToolKey = 'metin' | 'excel' | 'gorsel';

const TOOLS: { key: ToolKey; path: string; label: string; icon: ReactNode }[] = [
  { key: 'metin', path: '/araclar', label: 'Metin düzeltme', icon: <Type size={17} aria-hidden /> },
  { key: 'excel', path: '/araclar/excel', label: 'Excel', icon: <FileSpreadsheet size={17} aria-hidden /> },
  { key: 'gorsel', path: '/araclar/gorsel', label: 'Logo ve banner', icon: <ImageIcon size={17} aria-hidden /> },
];

const toolOf = (path: string): ToolKey => TOOLS.find((tool) => tool.key !== 'metin' && path.startsWith(tool.path))?.key ?? 'metin';

export function ToolsApp() {
  const [tool, setTool] = useState<ToolKey>(() => toolOf(window.location.pathname));

  useEffect(() => {
    const onPop = () => setTool(toolOf(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    document.title = `${TOOLS.find((t) => t.key === tool)?.label ?? 'Araçlar'} · Menü Kopilot`;
  }, [tool]);

  const open = (next: (typeof TOOLS)[number]) => {
    if (next.key === tool) return;
    window.history.pushState(null, '', next.path);
    setTool(next.key);
  };

  return (
    <div className="app admin tools">
      <nav className="sidebar" aria-label="Araçlar">
        <div className="sidebar-head">
          <span className="brand">Menü Kopilot</span>
        </div>
        <ModeSwitch current="tools" />
        <ul className="admin-nav">
          {TOOLS.map((item) => (
            <li key={item.key}>
              <button type="button" className={tool === item.key ? 'active' : ''} aria-current={tool === item.key ? 'page' : undefined} onClick={() => open(item)} title={item.label}>
                {item.icon}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <p className="sidebar-note">Dosyalar ve görseller bilgisayarından çıkmaz. Havuzdan açıklama için yalnızca ürün adları sorulur.</p>
      </nav>
      <main className="admin-main">
        {tool === 'metin' && <TextTool />}
        {tool === 'excel' && <ExcelTool />}
        {tool === 'gorsel' && <ImageTool />}
      </main>
    </div>
  );
}
