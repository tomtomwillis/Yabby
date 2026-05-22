import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAdmin } from '../utils/useAdmin';
import './DesignTool.css';

const MIXED = '<mixed>';

const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96];

const FONTS: { label: string; value: string }[] = [
  { label: 'Arial', value: 'AsciiArial' },
  { label: 'Avara Bold Italic', value: 'AvaraItalic' },
  { label: 'DT Nouveau', value: 'DTNouveau' },
  { label: 'JGS 5', value: 'jgs5' },
  { label: 'JGS 7', value: 'jgs7' },
  { label: 'JGS 9', value: 'jgs9' },
  { label: 'Necto Mono', value: 'NectoMono' },
  { label: 'Work Sans', value: 'WorkSans' },
];

const PALETTE = [
  { label: 'green',  value: '#4CAF50' },
  { label: 'blue',   value: '#1a2ecc' },
  { label: 'orange', value: '#e87a3a' },
  { label: 'white',  value: '#FFFFFF' },
  { label: 'dark',   value: '#2b2b2b' },
  { label: 'purple', value: '#8825e6' },
];

function rgbToHex(color: string): string {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#000000';
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

interface SelInfo {
  colour: string;
  font: string;
  fontSize: string;
}

export default function DesignTool() {
  const auth = getAuth();
  const [user] = useAuthState(auth);
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const [colour, setColour] = useState('#2b2b2b');
  const [font, setFont] = useState('WorkSans');
  const [fontSize, setFontSize] = useState(16);
  const [selInfo, setSelInfo] = useState<SelInfo | null>(null);

  const [pos, setPos] = useState({ x: 16, y: 100 });
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const colourWheelRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);

  // Read preference from localStorage + Firestore (same pattern as Oneko)
  useEffect(() => {
    if (!user) return;

    const cached = localStorage.getItem('designToolEnabled');
    if (cached !== null) setEnabled(cached === 'true');

    const check = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const val = snap.data().designToolEnabled === true;
          setEnabled(val);
          localStorage.setItem('designToolEnabled', String(val));
        } else {
          setEnabled(false);
        }
      } catch {
        if (cached === null) setEnabled(false);
      }
    };
    check();
  }, [user]);

  // Listen for toggle events dispatched from the Profile page
  useEffect(() => {
    const handler = (e: Event) => {
      setEnabled((e as CustomEvent<boolean>).detail);
    };
    window.addEventListener('design-tool-toggle', handler);
    return () => window.removeEventListener('design-tool-toggle', handler);
  }, []);

  const readSelection = useCallback(() => {
    if (!enabled) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setSelInfo(null); return; }

    const range = sel.getRangeAt(0);
    const colors = new Set<string>();
    const fonts = new Set<string>();
    const sizes = new Set<string>();

    const sample = (node: Node) => {
      const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : node) as Element | null;
      if (!el) return;
      const s = window.getComputedStyle(el);
      colors.add(s.color);
      fonts.add(s.fontFamily.split(',')[0].trim().replace(/['"]/g, ''));
      sizes.add(s.fontSize);
    };

    const root = range.commonAncestorContainer;
    if (root.nodeType === Node.TEXT_NODE) {
      sample(root);
    } else {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) { if (range.intersectsNode(n)) sample(n); }
    }

    if (colors.size === 0) { setSelInfo(null); return; }

    const info: SelInfo = {
      colour: colors.size === 1 ? rgbToHex([...colors][0]) : MIXED,
      font: fonts.size === 1 ? [...fonts][0] : MIXED,
      fontSize: sizes.size === 1 ? [...sizes][0] : MIXED,
    };
    setSelInfo(info);

    if (info.colour !== MIXED) setColour(info.colour);
    if (info.fontSize !== MIXED) {
      const px = Math.round(parseFloat(info.fontSize));
      if (!isNaN(px)) setFontSize(px);
    }
  }, [enabled]);

  useEffect(() => {
    document.addEventListener('selectionchange', readSelection);
    return () => document.removeEventListener('selectionchange', readSelection);
  }, [readSelection]);

  const onPanelMouseDown = () => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const applyToSelection = () => {
    const sel = window.getSelection();
    let range: Range | null = null;

    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      range = sel.getRangeAt(0);
    } else if (savedRangeRef.current) {
      range = savedRangeRef.current;
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    if (!range) return;

    try {
      const fragment = range.extractContents();
      const span = document.createElement('span');
      span.style.color = colour;
      span.style.fontFamily = `'${font}', sans-serif`;
      span.style.fontSize = `${fontSize}px`;
      span.appendChild(fragment);
      range.insertNode(span);

      sel?.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel?.addRange(newRange);
      savedRangeRef.current = null;
    } catch {
      // Cross-element selection with no clean split
    }
  };

  const onHandleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(0, dragRef.current.px + e.clientX - dragRef.current.ox),
        y: Math.max(0, dragRef.current.py + e.clientY - dragRef.current.oy),
      });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (adminLoading || !isAdmin || !enabled) return null;

  const hasTarget = selInfo !== null || savedRangeRef.current !== null;

  return (
    <div
      className="design-tool"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={onPanelMouseDown}
    >
      <div className="design-tool-handle" onMouseDown={onHandleMouseDown}>
        <span className="design-tool-title">✏ Design Tool</span>
      </div>

      <div className={`design-tool-sel-info${selInfo ? ' has-sel' : ''}`}>
        {selInfo ? (
          <>
            <span
              className="design-tool-sel-chip"
              style={{ background: selInfo.colour !== MIXED ? selInfo.colour : undefined }}
            />
            <span className="design-tool-sel-val">{selInfo.colour}</span>
            <span className="design-tool-sel-sep">·</span>
            <span className="design-tool-sel-val">{selInfo.font}</span>
            <span className="design-tool-sel-sep">·</span>
            <span className="design-tool-sel-val">
              {selInfo.fontSize === MIXED ? MIXED : selInfo.fontSize}
            </span>
          </>
        ) : (
          <span className="design-tool-no-sel">no selection</span>
        )}
      </div>

      <div className="design-tool-row">
        <label>font</label>
        <select value={font} onChange={e => setFont(e.target.value)} onMouseDown={e => e.stopPropagation()}>
          {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      <div className="design-tool-row">
        <label>size</label>
        <select value={fontSize} onChange={e => setFontSize(Number(e.target.value))} onMouseDown={e => e.stopPropagation()}>
          {(() => {
            const sizes = FONT_SIZES.includes(fontSize) ? FONT_SIZES : [...FONT_SIZES, fontSize].sort((a, b) => a - b);
            return sizes.map(s => <option key={s} value={s}>{s}px</option>);
          })()}
        </select>
      </div>

      <div className="design-tool-row">
        <label>colour</label>
        <div className="design-tool-palette">
          {PALETTE.map(p => (
            <button
              key={p.value}
              className={`design-tool-swatch${colour === p.value ? ' active' : ''}`}
              style={{ background: p.value }}
              title={p.label}
              onClick={() => setColour(p.value)}
            />
          ))}
          <button
            className="design-tool-wheel-btn"
            title="Custom colour"
            style={{ background: PALETTE.some(p => p.value === colour) ? undefined : colour }}
            onClick={() => colourWheelRef.current?.click()}
          >⊕</button>
          <input
            ref={colourWheelRef}
            type="color"
            value={colour}
            onChange={e => setColour(e.target.value)}
            className="design-tool-hidden-input"
            tabIndex={-1}
          />
        </div>
      </div>

      <button
        className="design-tool-apply"
        onClick={applyToSelection}
        disabled={!hasTarget}
      >
        Apply to selection
      </button>
    </div>
  );
}
