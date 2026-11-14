import { MessagesSquare, Wrench } from 'lucide-react';

/**
 * The site's two modes (D-218): the menu assistant, as it always was, and the tools (text rules, spreadsheets, images).
 * Plain links: each mode is its own page, and the browser's back button moves between them.
 */
export function ModeSwitch({ current }: { current: 'assistant' | 'tools' }) {
  return (
    <nav className="mode-switch" aria-label="Mod">
      <a href="/" aria-current={current === 'assistant' ? 'page' : undefined} title="Menü asistanı">
        <MessagesSquare size={15} aria-hidden />
        <span>Asistan</span>
      </a>
      <a href="/araclar" aria-current={current === 'tools' ? 'page' : undefined} title="Metin, Excel ve görsel araçları">
        <Wrench size={15} aria-hidden />
        <span>Araçlar</span>
      </a>
    </nav>
  );
}
