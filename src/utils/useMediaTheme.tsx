import React, { createContext, useContext, useEffect, useState } from 'react';

export type MediaTheme =
  | 'geocities' | 'y2k' | 'bbs' | 'lisa-frank' | 'win98'
  | 'angelfire' | 'bondi' | 'encarta' | 'synthwave';

export interface MediaThemeOption {
  id: MediaTheme;
  name: string;
  swatch: [string, string, string, string];
}

export const MEDIA_THEMES: MediaThemeOption[] = [
  { id: 'geocities',  name: 'Geocities',  swatch: ['#f5edd6', '#00007a', '#c8005c', '#cc6600'] },
  { id: 'y2k',        name: 'Y2K Chrome', swatch: ['#c6d4e8', '#0044cc', '#9933ff', '#00aa66'] },
  { id: 'bbs',        name: 'BBS',        swatch: ['#060610', '#00ff66', '#ff00aa', '#ffcc00'] },
  { id: 'lisa-frank', name: 'Lisa Frank', swatch: ['#ff66bb', '#aa66ff', '#66ddee', '#ffd4ec'] },
  { id: 'win98',      name: 'Win98',      swatch: ['#c3c3c3', '#000080', '#dfdfdf', '#808080'] },
  // { id: 'angelfire',  name: 'Angelfire',  swatch: ['#2a0a3a', '#ff4400', '#ff44aa', '#aa44ff'] },
  { id: 'bondi',      name: 'Bondi',      swatch: ['#99e0ee', '#0099b8', '#ff6644', '#aa44dd'] },
  { id: 'encarta',    name: 'Encarta',    swatch: ['#1a1a44', '#cc9933', '#008888', '#fff5e8'] },
  // { id: 'synthwave',  name: 'Synthwave',  swatch: ['#0d0620', '#ff2d78', '#00f5d4', '#9b5de5'] },
];

const STORAGE_KEY = 'mm-theme';
const DEFAULT_THEME: MediaTheme = 'geocities';
const VALID_IDS = new Set(MEDIA_THEMES.map(t => t.id));

function readStoredTheme(): MediaTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && VALID_IDS.has(raw as MediaTheme)) return raw as MediaTheme;
  } catch { /* private mode etc. — fall through */ }
  return DEFAULT_THEME;
}

interface MediaThemeContextValue {
  theme: MediaTheme;
  setTheme: (t: MediaTheme) => void;
}

const MediaThemeContext = createContext<MediaThemeContextValue | null>(null);

export const MediaThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<MediaTheme>(readStoredTheme);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  return (
    <MediaThemeContext.Provider value={{ theme, setTheme: setThemeState }}>
      {children}
    </MediaThemeContext.Provider>
  );
};

export function useMediaTheme(): MediaThemeContextValue {
  const ctx = useContext(MediaThemeContext);
  if (!ctx) throw new Error('useMediaTheme must be used inside MediaThemeProvider');
  return ctx;
}
