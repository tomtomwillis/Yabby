/*
 * Spacing lab — a scratch tool, not part of the site.
 *
 * Sliders on the left, the real message board in a same-origin iframe on the
 * right. Every knob writes one of the board's --mb-* spacing variables into a
 * style tag inside that iframe, so what you are adjusting is the actual page
 * with its actual content rather than a mock of it.
 *
 * The device toggle sets the iframe's width, so the board's own media queries
 * fire for real; values you change while it is on "mobile" are kept as a
 * separate set and exported as a (max-width: 768px) block.
 *
 * Admins only, the same way the media manager does it — the gate is UI, and it
 * is all this page needs: it writes nothing, and the board inside the frame
 * fetches under the reader's own credentials whoever opens this.
 *
 * The defaults below track the stylesheet. When values chosen here are folded
 * into MessageBoardPage.css, update the matching def/mobileDef so the sliders
 * keep starting from what the site actually renders.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from '../components/basic/Header';
import { useAdmin } from '../utils/useAdmin';
import './SpacingLab.css';

type Kind = 'len' | 'scale' | 'ratio';
type Factor = 'space' | 'control' | 'avatar' | 'type' | null;

interface Knob {
  key: string;            // css custom property, without the leading --
  label: string;
  group: string;
  kind: Kind;
  def: number;            // desktop default
  mobileDef?: number;     // where the stylesheet already differs on narrow
  min: number;
  max: number;
  step: number;
  unit?: 'rem' | 'px' | '%';  // kind 'len'
  factor?: Factor;        // kind 'len'
  base?: string;          // kind 'scale' — the expression the factor multiplies
  hint?: string;
}

const L = (
  key: string, label: string, group: string, def: number,
  o: Partial<Knob> = {},
): Knob => ({
  key, label, group, kind: 'len', def, unit: 'rem', factor: 'space',
  min: 0, max: Math.max(3, def * 3), step: 0.05, ...o,
});

const KNOBS: Knob[] = [
  // Page
  { key: 'mb-edge', label: 'Row side padding', group: 'Page', kind: 'scale', def: 0.55, mobileDef: 0.9, min: 0.2, max: 2.5, step: 0.05,
    base: 'clamp(18px, 3vw, 44px) * var(--mb-k-space)', hint: 'multiplies the whole clamp' },
  { key: 'mb-gutter', label: 'Poster gutter width', group: 'Page', kind: 'scale', def: 0.7, mobileDef: 1.1, min: 0.4, max: 2, step: 0.05,
    base: 'clamp(116px, 11vw, 148px) * var(--mb-k-avatar)' },
  { key: 'mb-measure', label: 'Body measure', group: 'Page', kind: 'scale', def: 1.44, min: 0.5, max: 1.8, step: 0.02,
    base: 'clamp(660px, 35vw, 790px) * var(--mb-k-measure)' },
  L('mb-gap', 'Gutter → body gap', 'Page', 14, { unit: 'px', max: 60, step: 0.2, mobileDef: 9.6 }),
  L('mb-channel', 'Dotted channel', 'Page', 9, { unit: 'px', max: 48, step: 1 }),

  // Masthead & bars
  L('mb-masthead-top', 'Masthead top', 'Masthead & bars', 0, { max: 3, mobileDef: 0 }),
  L('mb-masthead-bottom', 'Masthead bottom', 'Masthead & bars', 0.4, { max: 3, mobileDef: 0.9 }),
  L('mb-bar-top', 'Section bar top', 'Masthead & bars', 0.45, { max: 3, mobileDef: 1.1 }),
  L('mb-bar-bottom', 'Section bar bottom', 'Masthead & bars', 0, { max: 3, mobileDef: 0.05 }),
  L('mb-tip-pad', 'Tip band', 'Masthead & bars', 0.45, { max: 3, mobileDef: 0.2 }),
  L('mb-tail-pad', 'Footer / load-more', 'Masthead & bars', 1.25),

  // Post
  L('mb-post-pad', 'Post row padding', 'Post', 0.45, { max: 3, mobileDef: 0.25 }),
  L('mb-head-pad', 'Header rule offset', 'Post', 0.25, { max: 2 }),
  L('mb-head-gap', 'Header → prose', 'Post', 0.4, { max: 2 }),
  { key: 'mb-body-leading', label: 'Prose line height', group: 'Post', kind: 'ratio', def: 1.38, mobileDef: 1.36, min: 1.1, max: 2.6, step: 0.01 },
  L('mb-text-gap', 'Below prose / images', 'Post', 0.2, { max: 2, mobileDef: 0.45 }),
  L('mb-btn-gap', 'Between control glyphs', 'Post', 0, { unit: 'px', max: 24, step: 1, factor: 'control', mobileDef: 0 }),

  // Poster gutter
  L('mb-poster-gap', 'Gutter stack gap', 'Poster', 0, { max: 2, mobileDef: 0.15 }),
  L('mb-poster-gap-x', 'Gutter gap (across)', 'Poster', 0.3, { max: 2, mobileDef: 0.1, hint: 'only visible on mobile, where the block lies along' }),
  L('mb-poster-stats-gap', 'Stats block gap', 'Poster', 0, { max: 2, mobileDef: 0 }),
  L('mb-poster-meta-gap', 'Meta lines gap', 'Poster', 0, { max: 2, mobileDef: 0.2 }),
  L('mb-poster-meta-gap-x', 'Meta gap (across)', 'Poster', 0.3, { max: 2, mobileDef: 0.5 }),
  L('mb-poster-meta-pad', 'Above meta rule', 'Poster', 0.7, { max: 2, mobileDef: 0.25 }),

  // Replies
  L('mb-reply-measure', 'Reply row width', 'Replies', 100, { unit: '%', factor: null, min: 30, max: 200, step: 1, mobileDef: 112,
    hint: 'the reply’s line and its like move together — past 100% they run wider than the prose above' }),
  L('mb-replies-top', 'Above the thread', 'Replies', 0.75, { max: 3, mobileDef: 1.55 }),
  L('mb-reply-gap', 'Between replies', 'Replies', 0.6, { max: 3, mobileDef: 1.1 }),
  L('mb-reply-indent', 'Thread indent', 'Replies', 1.5, { max: 4, mobileDef: 0.4 }),
  L('mb-reply-cols-gap', 'Reply column gap', 'Replies', 0.35, { max: 2, mobileDef: 0.35 }),
  L('mb-reply-indicator-top', 'Above disclosure', 'Replies', 0.6, { max: 3, mobileDef: 0.55 }),
  L('mb-reply-input-top', 'Reply box offset', 'Replies', 0.7),
  L('mb-reply-input-indent', 'Reply box indent', 'Replies', 0, { max: 3 }),

  // Composer
  L('mb-composer-pad', 'Composer padding', 'Composer', 0.55, { max: 3, mobileDef: 0.5 }),
  L('mb-composer-row-gap', 'Composer row gap', 'Composer', 0, { max: 2, mobileDef: 0.4 }),
  L('mb-composer-controls-top', 'Above controls', 'Composer', 0.35, { max: 2, mobileDef: 0.45 }),
  L('mb-composer-controls-gap', 'Between controls', 'Composer', 1.85, { max: 4 }),
  L('mb-field-pad-y', 'Field padding (y)', 'Composer', 0.7, { max: 3, factor: 'control', mobileDef: 0.25 }),
  L('mb-field-pad-x', 'Field padding (x)', 'Composer', 0.8, { max: 4, factor: 'control', mobileDef: 3 }),
];

const GROUPS = [...new Set(KNOBS.map(k => k.group))];

const FACTOR_VAR: Record<Exclude<Factor, null>, string> = {
  space: '--mb-k-space',
  control: '--mb-k-control',
  avatar: '--mb-k-avatar',
  type: '--mb-k-type',
};

function declaration(knob: Knob, value: number): string {
  if (knob.kind === 'ratio') return String(round(value));
  if (knob.kind === 'scale') {
    return value === 1 ? `calc(${knob.base})` : `calc((${knob.base}) * ${round(value)})`;
  }
  const len = `${round(value)}${knob.unit}`;
  if (!knob.factor) return len;
  return `calc(${len} * var(${FACTOR_VAR[knob.factor]}))`;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

type Values = Record<string, number>;

const STORE_KEY = 'mb-spacing-lab';

export default function SpacingLab() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [desktop, setDesktop] = useState<Values>({});
  const [mobile, setMobile] = useState<Values>({});
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [size, setSize] = useState(0.75);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>(
    () => Object.fromEntries(GROUPS.map(g => [g, true])),
  );
  const frame = useRef<HTMLIFrameElement>(null);

  // Restore, then keep, whatever has been dialled in — a reload mid-tune should
  // not throw the session away.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      setDesktop(saved.desktop ?? {});
      setMobile(saved.mobile ?? {});
      if (typeof saved.size === 'number') setSize(saved.size);
    } catch { /* nothing worth recovering */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ desktop, mobile, size }));
    } catch { /* private mode, or full — the sliders still work */ }
  }, [desktop, mobile, size]);

  const mobileDefault = useCallback(
    (k: Knob) => mobile[k.key] ?? k.mobileDef ?? desktop[k.key] ?? k.def,
    [mobile, desktop],
  );
  const valueOf = useCallback(
    (k: Knob) => (device === 'mobile' ? mobileDefault(k) : desktop[k.key] ?? k.def),
    [device, desktop, mobileDefault],
  );

  const set = (k: Knob, v: number) => {
    setCopied(false);
    if (device === 'mobile') setMobile(m => ({ ...m, [k.key]: v }));
    else setDesktop(d => ({ ...d, [k.key]: v }));
  };

  const reset = (k: Knob) => {
    setCopied(false);
    const drop = (o: Values) => {
      const next = { ...o };
      delete next[k.key];
      return next;
    };
    if (device === 'mobile') setMobile(drop);
    else setDesktop(drop);
  };

  // Preview writes every knob, for whichever device is being shown, as one
  // plain block. No media query: the stage only ever renders one width at a
  // time, so wrapping the narrow values in @media bought nothing and left the
  // preview depending on the query matching inside the frame.
  //
  // The class is repeated to win on specificity rather than on order. In dev the
  // board's stylesheet arrives as a style tag when its route chunk loads, which
  // is after this one is appended — at equal specificity the board's own
  // declarations would simply come later and hold. Repeating it also beats the
  // stylesheet's own (max-width: 768px) block, which is what the narrow values
  // have to override.
  const previewCss = useMemo(() => {
    const sel = '.mb-board.mb-board.mb-board';
    const vars = KNOBS.map(k => {
      const v = device === 'mobile' ? mobileDefault(k) : desktop[k.key] ?? k.def;
      return `  --${k.key}: ${declaration(k, v)};`;
    }).join('\n');
    return `${sel} {\n  --mb-t: ${size};\n${vars}\n}\n`;
  }, [device, desktop, size, mobileDefault]);

  // Export is the opposite: only what actually moved.
  const exportCss = useMemo(() => {
    const desk = KNOBS.filter(k => desktop[k.key] !== undefined && desktop[k.key] !== k.def)
      .map(k => `  --${k.key}: ${declaration(k, desktop[k.key])};`);
    const narrow = KNOBS.filter(k => {
      if (mobile[k.key] === undefined) return false;
      return mobile[k.key] !== (k.mobileDef ?? desktop[k.key] ?? k.def);
    }).map(k => `    --${k.key}: ${declaration(k, mobile[k.key])};`);
    if (!desk.length && !narrow.length) return '/* nothing changed yet */';
    let out = '';
    if (desk.length) out += `.mb-board {\n${desk.join('\n')}\n}\n`;
    if (narrow.length) out += `${desk.length ? '\n' : ''}@media (max-width: 768px) {\n  .mb-board {\n${narrow.join('\n')}\n  }\n}\n`;
    return out;
  }, [desktop, mobile]);

  const apply = useCallback(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    let tag = doc.getElementById('spacing-lab') as HTMLStyleElement | null;
    if (!tag) {
      tag = doc.createElement('style');
      tag.id = 'spacing-lab';
    }
    tag.textContent = previewCss;
    doc.head.appendChild(tag);
  }, [previewCss]);

  useEffect(apply, [apply]);

  const changed = new Set([
    ...Object.keys(desktop).filter(k => desktop[k] !== KNOBS.find(x => x.key === k)?.def),
    ...Object.keys(mobile),
  ]);

  if (adminLoading) {
    return (
      <div className="app-container">
        <Header title="Spacing Lab" subtitle="Loading..." />
        <p style={{ textAlign: 'center', color: 'var(--colour2)', padding: '40px' }}>
          Checking permissions...
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="app-container">
        <Header title="Spacing Lab" subtitle="Access Denied" />
        <p style={{ textAlign: 'center', color: 'var(--colour5)', padding: '40px' }}>
          You do not have admin permissions.
        </p>
      </div>
    );
  }

  return (
    <div className="lab">
      <aside className="lab-panel">
        <header className="lab-head">
          <h1>spacing lab</h1>
          <div className="lab-device">
            {(['desktop', 'mobile'] as const).map(d => (
              <button
                key={d}
                className={device === d ? 'on' : ''}
                onClick={() => setDevice(d)}
              >{d}</button>
            ))}
          </div>
          <label className="lab-size">
            <span>board size <code>--mb-t</code></span>
            <input
              type="range" min={0} max={1} step={0.01} value={size}
              onChange={e => setSize(Number(e.target.value))}
            />
            <output>{size.toFixed(2)}</output>
          </label>
          <p className="lab-note">
            editing the <b>{device}</b> set{device === 'mobile' ? ' — only knobs you touch here are exported as a narrow-screen override' : ''}
          </p>
        </header>

        <div className="lab-knobs">
          {GROUPS.map(group => (
            <section key={group} className={open[group] ? '' : 'shut'}>
              <h2 onClick={() => setOpen(o => ({ ...o, [group]: !o[group] }))}>
                {open[group] ? '▾' : '▸'} {group}
              </h2>
              {open[group] && KNOBS.filter(k => k.group === group).map(k => {
                const v = valueOf(k);
                const dirty = device === 'mobile' ? mobile[k.key] !== undefined : desktop[k.key] !== undefined && desktop[k.key] !== k.def;
                return (
                  <div className={`lab-knob${dirty ? ' dirty' : ''}`} key={k.key}>
                    <div className="lab-knob-top">
                      <span className="lab-knob-label" title={k.hint ?? k.key}>{k.label}</span>
                      <input
                        className="lab-num"
                        type="number" step={k.step} value={round(v)}
                        onChange={e => set(k, Number(e.target.value))}
                      />
                      <span className="lab-unit">{k.kind === 'len' ? k.unit : k.kind === 'scale' ? '×' : ''}</span>
                      <button className="lab-reset" onClick={() => reset(k)} title="reset">↺</button>
                    </div>
                    <input
                      type="range" min={k.min} max={k.max} step={k.step} value={v}
                      onChange={e => set(k, Number(e.target.value))}
                    />
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        <footer className="lab-foot">
          <div className="lab-foot-row">
            <span>{changed.size} changed</span>
            <button onClick={() => { setDesktop({}); setMobile({}); setCopied(false); }}>reset all</button>
            <button
              onClick={() => { navigator.clipboard.writeText(exportCss); setCopied(true); }}
            >{copied ? 'copied ✓' : 'copy css'}</button>
          </div>
          <textarea readOnly value={exportCss} spellCheck={false} />
        </footer>
      </aside>

      <main className="lab-stage">
        <div className={`lab-frame ${device}`}>
          <iframe
            ref={frame}
            src="/messageboard"
            title="message board preview"
            onLoad={apply}
          />
        </div>
      </main>
    </div>
  );
}
