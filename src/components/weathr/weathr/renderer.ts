import { type Color, colorKey, colorToCss } from './colors';

interface Cell {
  ch: string;
  color: Color;
}

const DEFAULT_CELL: Cell = { ch: ' ', color: 'reset' };

export class GridRenderer {
  width: number;
  height: number;
  private buffer: Cell[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.buffer = new Array(width * height).fill(null).map(() => ({ ...DEFAULT_CELL }));
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.buffer = new Array(width * height).fill(null).map(() => ({ ...DEFAULT_CELL }));
  }

  clear(): void {
    for (let i = 0; i < this.buffer.length; i++) {
      this.buffer[i].ch = ' ';
      this.buffer[i].color = 'reset';
    }
  }

  renderChar(x: number, y: number, ch: string, color: Color): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const idx = y * this.width + x;
    this.buffer[idx].ch = ch;
    this.buffer[idx].color = color;
  }

  renderLineColored(x: number, y: number, text: string, color: Color): void {
    if (y < 0 || y >= this.height) return;
    for (let i = 0; i < text.length; i++) {
      const col = x + i;
      if (col < 0) continue;
      if (col >= this.width) break;
      const idx = y * this.width + col;
      this.buffer[idx].ch = text[i];
      this.buffer[idx].color = color;
    }
  }

  renderCenteredColored(lines: string[], startRow: number, color: Color): void {
    const maxWidth = lines.reduce((m, l) => Math.max(m, l.length), 0);
    const startCol = this.width > maxWidth ? Math.floor((this.width - maxWidth) / 2) : 0;
    for (let i = 0; i < lines.length; i++) {
      this.renderLineColored(startCol, startRow + i, lines[i], color);
    }
  }

  flashScreen(): void {
    for (let i = 0; i < this.buffer.length; i++) {
      this.buffer[i].color = 'white';
    }
  }

  toHTML(): string {
    let html = '';
    for (let y = 0; y < this.height; y++) {
      let runStart = 0;
      let runKey = colorKey(this.buffer[y * this.width].color);
      let runColor = this.buffer[y * this.width].color;
      let runText = '';
      const flush = () => {
        if (runText.length === 0) return;
        const css = colorToCss(runColor);
        html += `<span style="color:${css}">${escapeHtml(runText)}</span>`;
        runText = '';
      };
      for (let x = 0; x < this.width; x++) {
        const cell = this.buffer[y * this.width + x];
        const key = colorKey(cell.color);
        if (key !== runKey) {
          flush();
          runKey = key;
          runColor = cell.color;
          runStart = x;
        }
        runText += cell.ch;
      }
      flush();
      html += '\n';
      void runStart;
    }
    return html;
  }
}

function escapeHtml(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '<') out += '&lt;';
    else if (c === '>') out += '&gt;';
    else if (c === '&') out += '&amp;';
    else out += c;
  }
  return out;
}
