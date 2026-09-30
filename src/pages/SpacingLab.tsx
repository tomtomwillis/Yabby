/*
 * Spacing lab — a scratch tool, not part of the site.
 *
 * Sliders on the left, the real page in a same-origin iframe on the right.
 * Every knob writes a declaration into a style tag inside that iframe, so what
 * you are adjusting is the actual page with its actual content rather than a
 * mock of it. The board's knobs are its --mb-* spacing variables; the home
 * page has few variables, so most of its knobs override a property on a
 * selector from Home.css directly.
 *
 * The device toggle sets the iframe's width, so the page's own media queries
 * fire for real; values you change while it is on "mobile" are kept as a
 * separate set and exported inside the target's mobile breakpoint.
 *
 * Admins only, the same way the media manager does it — the gate is UI, and it
 * is all this page needs: it writes nothing, and the board inside the frame
 * fetches under the reader's own credentials whoever opens this.
 *
 * The defaults below track the stylesheet. When values chosen here are folded
 * into the stylesheet, update the matching def/mobileDef so the sliders
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
  unit?: 'rem' | 'em' | 'px' | '%';  // kind 'len'
  factor?: Factor;        // kind 'len'
  base?: string;          // kind 'scale' — the expression the factor multiplies
  mobileBase?: string;    // kind 'scale', where the narrow rule is a different expression
  wrap?: string;          // template the value is substituted into at $
  at?: [string, string][]; // [selector, property] pairs; default the root's --key
  only?: 'desktop' | 'mobile';  // the rule it overrides exists at one width only
  hint?: string;
}

const L = (
  key: string, label: string, group: string, def: number,
  o: Partial<Knob> = {},
): Knob => ({
  key, label, group, kind: 'len', def, unit: 'rem', factor: 'space',
  min: 0, max: Math.max(3, def * 3), step: 0.05, ...o,
});

const BOARD_KNOBS: Knob[] = [
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

/* Home knobs. Keys are only ids here — `at` says what each one writes. Scale
   knobs multiply the clamp the stylesheet uses, so they stay fluid. */
const H = (
  key: string, label: string, group: string, def: number,
  at: [string, string][], o: Partial<Knob> = {},
): Knob => ({
  key, label, group, kind: 'len', def, unit: 'rem', factor: null,
  min: 0, max: Math.max(3, def * 3), step: 0.05, at, ...o,
});

const HS = (
  key: string, label: string, group: string, base: string,
  at: [string, string][], o: Partial<Knob> = {},
): Knob => ({
  key, label, group, kind: 'scale', def: 1, base,
  min: 0, max: 3, step: 0.05, at, ...o,
});

const HOME_KNOBS: Knob[] = [
  // Rail
  HS('side-w', 'Rail width', 'Rail', 'clamp(220px, 17.85vw, 305px)', [['.home-page', '--hp-side-w']],
    { min: 0.6, max: 1.8, only: 'desktop' }),
  H('side-top', 'Rail top padding', 'Rail', 1, [['.home-side', 'padding-top']], { only: 'desktop' }),
  HS('side-x', 'Rail side padding', 'Rail', 'clamp(1.2rem, 1.35vw, 1.8rem)', [['.home-side', 'padding-inline']], { only: 'desktop' }),
  HS('side-gap', 'Index → weather gap', 'Rail', 'clamp(1.12rem, 2.72vh, 2.56rem)', [['.home-side-scroll', 'gap']],
    { only: 'desktop', hint: 'windows under 900px tall use a tighter clamp; this overrides both' }),
  { key: 'side-leading', label: 'Index line height', group: 'Rail', kind: 'ratio', def: 1.55, min: 1, max: 2.5, step: 0.01,
    at: [['.home-side .home-index', 'line-height']], only: 'desktop', hint: '1.35 on windows under 900px tall' },
  H('side-sub-top', 'Above strapline', 'Rail', 0, [['.home-side-sub', 'padding-top']],
    { only: 'desktop', wrap: 'calc(clamp(0.5rem, 1.2vh, 1rem) + $)', min: -1, max: 3, hint: 'added to the fluid default' }),
  H('scene-max', 'Weather scene max height', 'Rail', 260, [['.home-side .weathr-frame', 'max-height']],
    { unit: 'px', max: 600, step: 5, only: 'desktop' }),

  // Body column
  HS('main-x', 'Column side padding', 'Body column', 'clamp(1.5rem, 2.75vw, 3.25rem)', [['.home-main', '--hp-main-pad']],
    { mobileBase: '1rem' }),
  H('main-top', 'Column top padding', 'Body column', 0.8, [['.home-page', '--hp-main-pad-top']], { only: 'desktop' }),
  H('main-top-m', 'Column top padding', 'Body column', 0, [['.home-main', 'padding-top']], { only: 'mobile' }),
  H('main-bottom', 'Clearance past last section', 'Body column', 3.1, [['.home-main', 'padding-bottom']],
    { mobileDef: 0, wrap: 'calc(var(--hp-title-clear) + $)', max: 8, hint: 'on top of the player bar’s height' }),
  HS('sec-gap', 'Between sections', 'Body column', 'clamp(1.2rem, 2.4vh, 2rem)', [['.home-main', 'gap']]),
  HS('row2-gap', 'Lists ↔ readouts', 'Body column', 'clamp(1.2rem, 2vw, 2rem)', [['.home-row2', 'gap']]),
  HS('readouts-gap', 'Stats ↔ weather', 'Body column', 'clamp(0.42rem, 0.84vh, 0.7rem)', [['.home-readouts', 'gap']]),

  // Section headings
  H('h-bottom', 'Heading → content', 'Headings', 0.75, [['.hp-h', 'margin-bottom']]),
  H('h-gap', 'Between heading parts', 'Headings', 0.6, [['.hp-h', 'gap']]),
  HS('h-size', 'Heading size', 'Headings', 'clamp(0.72rem, 0.7vw, 0.95rem)', [['.hp-h', 'font-size']], { min: 0.5, max: 2 }),
  H('h-rule', 'Rule lift', 'Headings', 0.25, [['.hp-h-rule', 'transform']],
    { unit: 'em', wrap: 'translateY(calc(-1 * $))', min: -0.5, max: 1, step: 0.01 }),

  // Stickers
  { key: 'sticker-cols', label: 'Sticker columns', group: 'Stickers', kind: 'ratio', def: 8, mobileDef: 4, min: 2, max: 16, step: 1,
    at: [['.home-page', '--hp-sticker-cols']], hint: 'more columns, smaller stickers' },
  H('sticker-gap', 'Sticker gap', 'Stickers', 4, [['.home-page .sticker-wall', 'gap']], { unit: 'px', max: 24, step: 1 }),
  H('sticker-form', 'Below open form', 'Stickers', 0.9, [['.hp-sticker-form.is-open', 'margin-bottom']]),

  // Recently added
  HS('album-size', 'Cover size', 'Recently added', 'clamp(83px, 6.9vw, 127px)', [
    ['.home-page .albums-marquee__tile, .home-page .albums-marquee__caption', 'width'],
    ['.home-page .albums-marquee__img', 'width'],
    ['.home-page .albums-marquee__img', 'height'],
  ], { min: 0.5, max: 2.5, mobileBase: '79px' }),
  H('album-gap', 'Between covers', 'Recently added', 7, [['.home-page .albums-marquee__track', 'gap']],
    { unit: 'px', max: 40, step: 1 }),
  H('album-pad', 'Track padding (y)', 'Recently added', 0, [['.home-page .albums-marquee__track', 'padding-block']],
    { unit: 'px', max: 30, step: 1 }),

  // Week ahead
  H('ev-pad-top', 'Day top padding', 'Week ahead', 0.3, [['.home-page .he-day', 'padding-top']], { mobileDef: 0.45 }),
  H('ev-pad-bottom', 'Day bottom padding', 'Week ahead', 0.75, [['.home-page .he-day', 'padding-bottom']], { mobileDef: 0.45 }),
  H('ev-day-gap', 'Day name → events', 'Week ahead', 0.35, [['.home-page .he-day', 'gap']], { mobileDef: 0.6 }),
  H('ev-gap', 'Between events', 'Week ahead', 0.3, [['.home-page .he-list', 'gap']], { mobileDef: 0.2 }),

  // Recent lists
  H('list-pad', 'Row padding (y)', 'Recent lists', 0.4, [['.home-page .recent-list-card', 'padding-block']], { mobileDef: 0.3 }),
  H('list-gap', 'Thumb → title', 'Recent lists', 0.55, [['.home-page .recent-list-card', 'gap']], { mobileDef: 0.8 }),
  H('list-thumb', 'Thumb size', 'Recent lists', 58, [
    ['.home-page .recent-list-image-wrapper', 'flex-basis'],
    ['.home-page .recent-list-image-wrapper', 'width'],
    ['.home-page .recent-list-image-wrapper', 'height'],
  ], { unit: 'px', min: 20, max: 120, step: 1, mobileDef: 60 }),

  // Readouts
  H('stats-pad', 'Stats row padding (y)', 'Readouts', 0.1, [['.home-readouts .stats-row', 'padding-block']], { max: 1.5 }),
  { key: 'weather-leading', label: 'Weather line height', group: 'Readouts', kind: 'ratio', def: 1.35, min: 1, max: 2.5, step: 0.01,
    at: [['.home-readouts .weather-card .normal-text', 'line-height']] },

  // Player bar
  H('bar-left', 'Bar left padding', 'Player bar', 0.8, [['.home-bottom', 'padding-left']], { mobileDef: 0.75 }),
  HS('bar-right', 'Bar right padding', 'Player bar', 'clamp(0.5rem, 1vw, 1rem)', [['.home-bottom', 'padding-right']],
    { mobileBase: '0.9rem' }),
  H('bar-bottom', 'Bar bottom padding', 'Player bar', 0, [['.home-bottom', 'padding-bottom']], { max: 2, mobileDef: 0.45 }),
  H('toggle-top', 'Above star rule', 'Player bar', 0.1, [['.home-bottom-toggle', 'padding-top']], { max: 1.5 }),
  H('toggle-bottom', 'Below star rule', 'Player bar', 0.3, [['.home-bottom-toggle', 'padding-bottom']], { max: 1.5 }),
  H('title-share', 'Wordmark share', 'Player bar', 31, [['.home-bottom-title', 'flex-basis']],
    { unit: '%', min: 15, max: 60, step: 1, only: 'desktop', hint: 'of the bar’s width — the wordmark scales to fit it' }),
  HS('bar-inner-gap', 'Wordmark ↔ player', 'Player bar', 'clamp(1rem, 2vw, 2.5rem)', [['.home-bottom-inner', 'gap']], { only: 'desktop' }),
  HS('bar-viz-gap', 'Visualiser ↔ player', 'Player bar', 'clamp(1rem, 2vw, 2.5rem)', [['.home-bottom-radio', 'gap']], { only: 'desktop' }),
  H('welcome-gap', '“welcome to” → wordmark', 'Player bar', 0.15, [['.home-fixed-welcome', 'margin-bottom']], { max: 1.5 }),

  // Mobile masthead
  H('mast-top', 'Masthead top', 'Mobile masthead', 0.6, [['.home-top-title', 'padding-top']], { only: 'mobile' }),
  H('mast-bottom', 'Wordmark → strapline', 'Mobile masthead', 0.5, [['.home-top-title', 'padding-bottom']], { only: 'mobile' }),
  H('mast-left', 'Masthead left', 'Mobile masthead', 1, [['.home-top-title, .home-top-sub', 'padding-left']], { only: 'mobile' }),
  H('mast-right', 'Masthead right (burger)', 'Mobile masthead', 4.5, [['.home-top-title, .home-top-sub', 'padding-right']],
    { only: 'mobile', max: 8 }),
  H('sub-bottom', 'Strapline → first section', 'Mobile masthead', 0.6, [['.home-top-sub', 'padding-bottom']], { only: 'mobile' }),

  // Mobile nav — the burger and the drawer it opens ("open nav" above shows it)
  H('burger-top', 'Burger from top', 'Mobile nav', 0.85, [['.home-page > .burger-menu', 'top']], { only: 'mobile' }),
  H('burger-right', 'Burger from right', 'Mobile nav', 1, [['.home-page > .burger-menu', 'right']], { only: 'mobile' }),
  H('burger-size', 'Burger size', 'Mobile nav', 2.4, [
    ['.home-page > .burger-menu', 'min-width'],
    ['.home-page > .burger-menu', 'min-height'],
  ], { only: 'mobile', min: 1.5, max: 4 }),
  H('nav-w', 'Drawer width', 'Mobile nav', 300, [['.home-page > .mobile-nav', 'width']],
    { unit: 'px', min: 180, max: 420, step: 5, only: 'mobile', hint: 'capped at 80vw' }),
  H('nav-top', 'Drawer top padding', 'Mobile nav', 1.05, [['.home-page > .mobile-nav', 'padding-top']], { only: 'mobile', max: 6 }),
  H('nav-x', 'Drawer side padding', 'Mobile nav', 1.55, [['.home-page > .mobile-nav', 'padding-inline']], { only: 'mobile' }),
  H('nav-close-top', 'Close ✕ from top', 'Mobile nav', 0.6, [['.home-page > .mobile-nav .mobile-nav-close', 'top']], { only: 'mobile' }),
  H('nav-close-left', 'Close ✕ from left', 'Mobile nav', 0.9, [['.home-page > .mobile-nav .mobile-nav-close', 'left']], { only: 'mobile' }),
  H('nav-group-top', 'Above group label', 'Mobile nav', 1.4, [['.home-page > .mobile-nav .mobile-nav-group-header', 'padding-top']], { only: 'mobile' }),
  H('nav-group-bottom', 'Below group label', 'Mobile nav', 0.3, [['.home-page > .mobile-nav .mobile-nav-group-header', 'padding-bottom']], { only: 'mobile', max: 2 }),
  H('nav-indent', 'Link indent', 'Mobile nav', 1.45, [['.home-page > .mobile-nav .mobile-nav-sublinks', 'padding-left']], { only: 'mobile' }),
  H('nav-link-y', 'Link padding (y)', 'Mobile nav', 0.5, [['.home-page > .mobile-nav a', 'padding-block']],
    { only: 'mobile', max: 2, hint: 'rows never go below the min height, so shrinking this past it does nothing' }),
  H('nav-link-min', 'Link min height', 'Mobile nav', 24, [['.home-page > .mobile-nav a', 'min-height']],
    { unit: 'px', max: 80, step: 1, only: 'mobile', hint: '44px is the usual smallest comfortable tap target' }),
  HS('nav-link-size', 'Link text size', 'Mobile nav', '0.95rem', [['.home-page > .mobile-nav a', 'font-size']], { only: 'mobile', min: 0.6, max: 1.6 }),
];

interface Target {
  id: 'board' | 'home';
  label: string;
  path: string;
  root: string;
  opener?: string;        // something in the page to click, to show what is normally closed
  breakpoint: number;
  knobs: Knob[];
  sizeVar?: string;       // the board's overall size dial
}

const TARGETS: Target[] = [
  { id: 'board', label: 'message board', path: '/messageboard', root: '.mb-board', breakpoint: 768, knobs: BOARD_KNOBS, sizeVar: '--mb-t' },
  { id: 'home', label: 'home', path: '/', root: '.home-page', breakpoint: 900, knobs: HOME_KNOBS,
    opener: '.home-page > .burger-menu' },
];

const FACTOR_VAR: Record<Exclude<Factor, null>, string> = {
  space: '--mb-k-space',
  control: '--mb-k-control',
  avatar: '--mb-k-avatar',
  type: '--mb-k-type',
};

function declaration(knob: Knob, value: number, narrow = false): string {
  if (knob.kind === 'ratio') return String(round(value));
  if (knob.kind === 'scale') {
    const base = (narrow && knob.mobileBase) || knob.base;
    if (value === 1) return /^[\d.]+[a-z%]*$/.test(base!) ? base! : `calc(${base})`;
    return `calc((${base}) * ${round(value)})`;
  }
  let len = `${round(value)}${knob.unit}`;
  if (knob.factor) len = `calc(${len} * var(${FACTOR_VAR[knob.factor]}))`;
  return knob.wrap ? knob.wrap.replace('$', len) : len;
}

const targetsOf = (k: Knob, root: string): [string, string][] => k.at ?? [[root, `--${k.key}`]];

const shown = (k: Knob, device: 'desktop' | 'mobile') => !k.only || k.only === device;

/* Declarations grouped by selector, in first-seen order. */
function rules(
  knobs: Knob[], root: string, value: (k: Knob) => number, narrow: boolean,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const k of knobs) {
    const decl = declaration(k, value(k), narrow);
    for (const [sel, prop] of targetsOf(k, root)) {
      if (!out.has(sel)) out.set(sel, []);
      out.get(sel)!.push(`${prop}: ${decl};`);
    }
  }
  return out;
}

/* Repeats the root class to win on specificity rather than on order: in dev a
   page's stylesheet arrives as a style tag when its route chunk loads, after
   the lab's, and its own media-query blocks have to be beaten too. */
function boost(sel: string, root: string): string {
  const strong = root.repeat(3);
  return sel.split(',').map(part => {
    const p = part.trim();
    return p.startsWith(root) ? strong + p.slice(root.length) : `${strong} ${p}`;
  }).join(', ');
}

function block(sel: string, decls: string[], indent: string): string {
  return `${indent}${sel} {\n${decls.map(d => `${indent}  ${d}`).join('\n')}\n${indent}}\n`;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

type Values = Record<string, number>;

interface Sets { desktop: Values; mobile: Values }

const STORE_KEY = 'spacing-lab';
const LEGACY_KEY = 'mb-spacing-lab';
const EMPTY: Sets = { desktop: {}, mobile: {} };

/* What a saved value was relative to. Once the stylesheet absorbs a tune the
   knob's default moves, and a saved multiplier would then apply twice. */
const sig = (k: Knob) => [k.def, k.base, k.mobileDef, k.mobileBase].join('|');

const SIGS = Object.fromEntries(
  TARGETS.flatMap(t => t.knobs.map(k => [`${t.id}:${k.key}`, sig(k)])),
);

/* Drops saved values whose knob has since been re-based. Saves without
   signatures predate the home target's defaults moving; the board's never did. */
function fresh(sets: Record<string, Sets>, sigs?: Record<string, string>): Record<string, Sets> {
  const out: Record<string, Sets> = {};
  for (const [id, s] of Object.entries(sets)) {
    const keep = (vals: Values) => Object.fromEntries(Object.entries(vals).filter(([key]) =>
      sigs ? sigs[`${id}:${key}`] === SIGS[`${id}:${key}`] : id !== 'home'));
    out[id] = { desktop: keep(s.desktop ?? {}), mobile: keep(s.mobile ?? {}) };
  }
  return out;
}

export default function SpacingLab() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [targetId, setTargetId] = useState<Target['id']>('home');
  const [sets, setSets] = useState<Record<string, Sets>>({});
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [size, setSize] = useState(0.75);
  const [copied, setCopied] = useState(false);
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const [restored, setRestored] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  const target = TARGETS.find(t => t.id === targetId)!;
  const { knobs, root } = target;
  const { desktop, mobile } = sets[targetId] ?? EMPTY;
  const groups = useMemo(() => [...new Set(knobs.map(k => k.group))], [knobs]);

  // Restore, then keep, whatever has been dialled in — a reload mid-tune should
  // not throw the session away. The old board-only save is read once and folded in.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        setSets(fresh(saved.sets ?? {}, saved.sigs));
        if (saved.target === 'board' || saved.target === 'home') setTargetId(saved.target);
        if (typeof saved.size === 'number') setSize(saved.size);
      } else {
        const old = localStorage.getItem(LEGACY_KEY);
        if (old) {
          const saved = JSON.parse(old);
          setSets({ board: { desktop: saved.desktop ?? {}, mobile: saved.mobile ?? {} } });
          if (typeof saved.size === 'number') setSize(saved.size);
        }
      }
    } catch { /* nothing worth recovering */ }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ sets, sigs: SIGS, target: targetId, size }));
    } catch { /* private mode, or full — the sliders still work */ }
  }, [sets, targetId, size, restored]);

  const mobileDefault = useCallback(
    (k: Knob) => mobile[k.key] ?? k.mobileDef ?? (k.mobileBase ? k.def : desktop[k.key]) ?? k.def,
    [mobile, desktop],
  );
  const valueOf = useCallback(
    (k: Knob) => (device === 'mobile' ? mobileDefault(k) : desktop[k.key] ?? k.def),
    [device, desktop, mobileDefault],
  );

  const update = (fn: (s: Sets) => Sets) => {
    setCopied(false);
    setSets(all => ({ ...all, [targetId]: fn(all[targetId] ?? EMPTY) }));
  };

  const set = (k: Knob, v: number) => update(s => (
    device === 'mobile'
      ? { ...s, mobile: { ...s.mobile, [k.key]: v } }
      : { ...s, desktop: { ...s.desktop, [k.key]: v } }
  ));

  const reset = (k: Knob) => update(s => {
    const which = device === 'mobile' ? 'mobile' : 'desktop';
    const next = { ...s[which] };
    delete next[k.key];
    return { ...s, [which]: next };
  });

  // Preview writes every knob, for whichever device is being shown. No media
  // query: the stage only ever renders one width at a time, so wrapping the
  // narrow values in @media bought nothing and left the preview depending on
  // the query matching inside the frame.
  const previewCss = useMemo(() => {
    const live = knobs.filter(k => shown(k, device));
    const byRule = rules(live, root, valueOf, device === 'mobile');
    if (target.sizeVar) {
      const own = byRule.get(root) ?? [];
      byRule.set(root, [`${target.sizeVar}: ${size};`, ...own]);
    }
    return [...byRule].map(([sel, decls]) => block(boost(sel, root), decls, '')).join('\n');
  }, [knobs, root, device, valueOf, size, target.sizeVar]);

  // Export is the opposite: only what actually moved, under the selectors the
  // stylesheet already uses.
  const exportCss = useMemo(() => {
    const desk = knobs.filter(k => shown(k, 'desktop') && desktop[k.key] !== undefined && desktop[k.key] !== k.def);
    const narrow = knobs.filter(k => {
      if (!shown(k, 'mobile') || mobile[k.key] === undefined) return false;
      return mobile[k.key] !== (k.mobileDef ?? (k.mobileBase ? k.def : desktop[k.key]) ?? k.def);
    });
    if (!desk.length && !narrow.length) return '/* nothing changed yet */';
    const deskRules = rules(desk, root, k => desktop[k.key], false);
    const narrowRules = rules(narrow, root, k => mobile[k.key], true);
    let out = [...deskRules].map(([sel, d]) => block(sel, d, '')).join('\n');
    if (narrowRules.size) {
      out += `${out ? '\n' : ''}@media (max-width: ${target.breakpoint}px) {\n`
        + [...narrowRules].map(([sel, d]) => block(sel, d, '  ')).join('\n')
        + '}\n';
    }
    return out;
  }, [knobs, root, desktop, mobile, target.breakpoint]);

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

  const changed = knobs.filter(k => (desktop[k.key] !== undefined && desktop[k.key] !== k.def)
    || mobile[k.key] !== undefined).length;

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
            {TARGETS.map(t => (
              <button
                key={t.id}
                className={targetId === t.id ? 'on' : ''}
                onClick={() => { setTargetId(t.id); setCopied(false); }}
              >{t.label}</button>
            ))}
          </div>
          <div className="lab-device">
            {(['desktop', 'mobile'] as const).map(d => (
              <button
                key={d}
                className={device === d ? 'on' : ''}
                onClick={() => setDevice(d)}
              >{d}</button>
            ))}
          </div>
          {target.opener && device === 'mobile' && (
            <div className="lab-device">
              <button onClick={() => {
                const el = frame.current?.contentDocument?.querySelector<HTMLElement>(target.opener!);
                el?.click();
              }}>open / close nav</button>
            </div>
          )}
          {target.sizeVar && (
            <label className="lab-size">
              <span>board size <code>{target.sizeVar}</code></span>
              <input
                type="range" min={0} max={1} step={0.01} value={size}
                onChange={e => setSize(Number(e.target.value))}
              />
              <output>{size.toFixed(2)}</output>
            </label>
          )}
          <p className="lab-note">
            editing the <b>{device}</b> set{device === 'mobile' ? ` — only knobs you touch here are exported, inside (max-width: ${target.breakpoint}px)` : ''}
          </p>
        </header>

        <div className="lab-knobs">
          {groups.map(group => {
            const inGroup = knobs.filter(k => k.group === group && shown(k, device));
            if (!inGroup.length) return null;
            const open = !shut[`${targetId}:${group}`];
            return (
              <section key={group} className={open ? '' : 'shut'}>
                <h2 onClick={() => setShut(o => ({ ...o, [`${targetId}:${group}`]: open }))}>
                  {open ? '▾' : '▸'} {group}
                </h2>
                {open && inGroup.map(k => {
                  const v = valueOf(k);
                  const dirty = device === 'mobile' ? mobile[k.key] !== undefined : desktop[k.key] !== undefined && desktop[k.key] !== k.def;
                  const where = targetsOf(k, root).map(([sel, prop]) => `${sel} { ${prop} }`).join('\n');
                  return (
                    <div className={`lab-knob${dirty ? ' dirty' : ''}`} key={k.key}>
                      <div className="lab-knob-top">
                        <span className="lab-knob-label" title={k.hint ? `${k.hint}\n\n${where}` : where}>{k.label}</span>
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
            );
          })}
        </div>

        <footer className="lab-foot">
          <div className="lab-foot-row">
            <span>{changed} changed</span>
            <button onClick={() => update(() => EMPTY)}>reset all</button>
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
            key={target.id}
            ref={frame}
            src={target.path}
            title={`${target.label} preview`}
            onLoad={apply}
          />
        </div>
      </main>
    </div>
  );
}
