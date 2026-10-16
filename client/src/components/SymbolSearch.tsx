import { useEffect, useMemo, useRef, useState } from 'react';
import { getProvider } from '../lib/providers';
import { debounce } from '../lib/storage';
import { useStore } from '../state/store';

export function SymbolSearch() {
  const providerId = useStore((s) => s.providerId);
  const symbol = useStore((s) => s.symbol);
  const suggestions = useStore((s) => s.symbolSuggestions);
  const setSymbol = useStore((s) => s.setSymbol);
  const loadData = useStore((s) => s.loadData);
  const searchSymbols = useStore((s) => s.searchSymbols);

  const provider = getProvider(providerId);
  const [query, setQuery] = useState(symbol);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(symbol);
  }, [symbol]);

  useEffect(() => {
    setOpen(false);
  }, [providerId]);

  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (!wrapRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const debouncedSearch = useMemo(
    () =>
      debounce((q: string) => {
        void searchSymbols(q);
      }, 250),
    [searchSymbols],
  );

  const list = suggestions.length > 0 ? suggestions : provider.popularSymbols;

  const commit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setSymbol(v, { load: true });
    setOpen(false);
  };

  const onKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, list.length - 1));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const picked = open ? list[activeIdx] : undefined;
      commit(picked ? picked.symbol : query);
    } else if (ev.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="symbol-search" ref={wrapRef}>
      <input
        type="text"
        value={query}
        spellCheck={false}
        placeholder="Symbol…"
        title="Type a symbol and press Enter to load"
        onChange={(ev) => {
          setQuery(ev.target.value);
          setOpen(true);
          setActiveIdx(0);
          debouncedSearch(ev.target.value);
        }}
        onFocus={() => {
          setOpen(true);
          void searchSymbols(query);
        }}
        onKeyDown={onKeyDown}
      />
      {open && list.length > 0 && (
        <div className="symbol-suggestions" role="listbox">
          {list.map((s, i) => (
            <div
              key={`${s.symbol}_${i}`}
              role="option"
              aria-selected={i === activeIdx}
              className={`symbol-suggestion${i === activeIdx ? ' active' : ''}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(ev) => {
                ev.preventDefault();
                commit(s.symbol);
              }}
            >
              <span className="sym">{s.symbol}</span>
              {s.label && <span className="lbl">{s.label}</span>}
              {s.exchange && <span className="exch">{s.exchange}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
