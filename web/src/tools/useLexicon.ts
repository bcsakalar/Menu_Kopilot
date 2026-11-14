import { useEffect, useState } from 'react';
import { BASE_LEXICON, Lexicon } from './text/lexicon';

/**
 * The text tool's dictionary (D-218): the base menu vocabulary at once, the live pool's words as soon as they arrive.
 * The browser keeps the server's answer for an hour; a failed request leaves the base vocabulary working.
 */
let shared: Promise<Lexicon> | undefined;

function load(): Promise<Lexicon> {
  shared ??= fetch('/api/v1/tools/lexicon')
    .then((res) => (res.ok ? (res.json() as Promise<{ words: [string, number][] }>) : Promise.reject(new Error(String(res.status)))))
    .then((body) => BASE_LEXICON.merge(Lexicon.from(body.words)))
    .catch(() => {
      shared = undefined;
      return BASE_LEXICON;
    });
  return shared;
}

export function useLexicon(): { lexicon: Lexicon; words: number } {
  const [lexicon, setLexicon] = useState<Lexicon>(BASE_LEXICON);
  useEffect(() => {
    let live = true;
    void load().then((loaded) => {
      if (live) setLexicon(loaded);
    });
    return () => {
      live = false;
    };
  }, []);
  return { lexicon, words: lexicon.size };
}
