export type NamedColor =
  | 'reset'
  | 'black'
  | 'darkGrey'
  | 'grey'
  | 'white'
  | 'red'
  | 'darkRed'
  | 'green'
  | 'darkGreen'
  | 'yellow'
  | 'darkYellow'
  | 'blue'
  | 'darkBlue'
  | 'magenta'
  | 'darkMagenta'
  | 'cyan'
  | 'darkCyan';

export type Color = NamedColor | { r: number; g: number; b: number };

export type PaletteMode = 'light' | 'dark';

// "light" palette is tuned for transparent placement over the warm white/orange
// Yabbyville home page: every named colour is shifted into the mid-to-deep
// range so glyphs read against both the white card body and the yellow/orange
// strips behind the homepage components.
const LIGHT_NAMED: Record<NamedColor, string> = {
  reset: '#1f2937',
  black: '#0f172a',
  darkGrey: '#475569',
  grey: '#64748b',
  white: '#1e293b', // anchor / dark slate (reads as "high contrast" foreground)
  red: '#b91c1c',
  darkRed: '#7f1d1d',
  green: '#047857',
  darkGreen: '#064e3b',
  yellow: '#b45309', // amber/burnt-orange — still reads as sun, contrasts orange bg
  darkYellow: '#78350f',
  blue: '#1d4ed8',
  darkBlue: '#1e3a8a',
  magenta: '#be185d',
  darkMagenta: '#831843',
  cyan: '#0e7490',
  darkCyan: '#155e75',
};

const DARK_NAMED: Record<NamedColor, string> = {
  reset: '#d0d0d0',
  black: '#000000',
  darkGrey: '#5a5a5a',
  grey: '#c0c0c0',
  white: '#ffffff',
  red: '#ff6b6b',
  darkRed: '#a02020',
  green: '#5fd75f',
  darkGreen: '#008000',
  yellow: '#ffd866',
  darkYellow: '#b58900',
  blue: '#6a8cff',
  darkBlue: '#1f3da0',
  magenta: '#ff66cc',
  darkMagenta: '#8a2da0',
  cyan: '#5fd7d7',
  darkCyan: '#008080',
};

let activePalette: PaletteMode = 'light';

export function setPaletteMode(mode: PaletteMode): void {
  activePalette = mode;
}

function namedHex(name: NamedColor): string {
  return (activePalette === 'light' ? LIGHT_NAMED : DARK_NAMED)[name];
}

export function colorToCss(color: Color): string {
  if (typeof color === 'string') return namedHex(color);
  return `rgb(${color.r},${color.g},${color.b})`;
}

export function colorKey(color: Color): string {
  if (typeof color === 'string') return color;
  return `r${color.r}g${color.g}b${color.b}`;
}
