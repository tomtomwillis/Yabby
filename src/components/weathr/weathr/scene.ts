import { FENCE, HOUSE, HOUSE_HEIGHT, HOUSE_WIDTH, MAILBOX, PINE_TREE, TREE } from './assets';
import type { Color } from './colors';
import type { GridRenderer } from './renderer';

export interface ScenePalette {
  skyDay: Color;
  skyNight: Color;
  groundDay: Color;
  groundNight: Color;
  accentPrimary: Color;
  accentSecondary: Color;
}

export const DEFAULT_PALETTE: ScenePalette = {
  skyDay: 'cyan',
  skyNight: 'darkBlue',
  groundDay: 'green',
  groundNight: 'darkGreen',
  accentPrimary: 'darkRed',
  accentSecondary: { r: 210, g: 180, b: 140 },
};

interface WorldStyle {
  roof: Color;
  wood: Color;
  door: Color;
  window: Color;
  trim: Color;
  grassPrimary: Color;
  grassSecondary: Color;
  flowerColors: Color[];
  soil: Color;
  treeFoliage: Color;
  fence: Color;
  mailbox: Color;
}

export function resolveWorldStyle(isDay: boolean, palette: ScenePalette): WorldStyle {
  if (isDay) {
    return {
      roof: palette.accentPrimary,
      wood: palette.accentSecondary,
      door: { r: 139, g: 69, b: 19 },
      window: 'cyan',
      trim: 'darkGrey',
      grassPrimary: palette.groundDay,
      grassSecondary: 'darkGreen',
      flowerColors: ['magenta', 'red', 'cyan', 'yellow'],
      soil: { r: 101, g: 67, b: 33 },
      treeFoliage: 'darkGreen',
      fence: 'white',
      mailbox: 'blue',
    };
  }
  return {
    roof: 'darkMagenta',
    wood: { r: 100, g: 70, b: 50 },
    door: { r: 80, g: 40, b: 10 },
    window: 'yellow',
    trim: 'darkGrey',
    grassPrimary: palette.groundNight,
    grassSecondary: { r: 0, g: 50, b: 0 },
    flowerColors: ['darkMagenta', 'darkRed', 'blue', 'darkYellow'],
    soil: { r: 60, g: 40, b: 20 },
    treeFoliage: { r: 0, g: 50, b: 0 },
    fence: 'grey',
    mailbox: 'darkBlue',
  };
}

const GROUND_HEIGHT = 7;

function pseudoRand(x: number, y: number): number {
  // Mirror Rust's pseudo_rand with u32 wrapping multiplication.
  const a = (x ^ 0x5deece6) >>> 0;
  const b = (y ^ 0xb) >>> 0;
  return (Math.imul(a, b) >>> 0) % 100;
}

function renderGround(
  renderer: GridRenderer,
  width: number,
  yStart: number,
  style: WorldStyle,
): void {
  for (let y = 0; y < GROUND_HEIGHT; y++) {
    for (let x = 0; x < width; x++) {
      let ch = ' ';
      let color: Color = style.soil;
      if (y === 0) {
        const r = pseudoRand(x, y);
        if (r < 5) {
          ch = '*';
          color = style.flowerColors[(x + y) % style.flowerColors.length];
        } else if (r < 15) {
          ch = ',';
          color = style.grassSecondary;
        } else {
          ch = '^';
          color = style.grassPrimary;
        }
      } else {
        const r = pseudoRand(x, y);
        if (r < 20) ch = '~';
        else if (r < 25) ch = '.';
        else ch = ' ';
      }
      renderer.renderChar(x, yStart + y, ch, color);
    }
  }
}

function renderHouse(renderer: GridRenderer, x: number, y: number, style: WorldStyle): void {
  for (let i = 0; i < HOUSE.length; i++) {
    const line = HOUSE[i];
    const row = y + i;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === ' ') continue;
      let color: Color;
      if (i <= 4) {
        color = style.roof;
      } else if (i <= 7) {
        if (ch === '[' || ch === ']') color = style.window;
        else if (ch === '|' || ch === '.' || ch === '_') color = style.wood;
        else if (ch === '(' || ch === ')') color = style.door;
        else if (ch === '=') color = style.trim;
        else color = style.wood;
      } else if (i === 8) {
        if (ch === '=' || ch === '|') color = style.trim;
        else if (ch === '(' || ch === ')') color = style.door;
        else color = style.wood;
      } else {
        if (ch === '^') color = style.grassPrimary;
        else if (ch === '=') color = style.trim;
        else color = 'reset';
      }
      renderer.renderChar(x + j, row, ch, color);
    }
  }
}

function renderArt(
  renderer: GridRenderer,
  lines: string[],
  x: number,
  y: number,
  color: Color,
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch !== ' ') renderer.renderChar(x + j, y + i, ch, color);
    }
  }
}

export interface SceneLayout {
  width: number;
  height: number;
  groundY: number;
  houseX: number;
  houseY: number;
  chimneyX: number;
  chimneyY: number;
}

export function computeSceneLayout(width: number, height: number): SceneLayout {
  const groundY = Math.max(0, height - GROUND_HEIGHT);
  const houseX = Math.max(0, Math.floor(width / 2) - Math.floor(HOUSE_WIDTH / 2));
  const houseY = Math.max(0, groundY - HOUSE_HEIGHT);
  return {
    width,
    height,
    groundY,
    houseX,
    houseY,
    chimneyX: houseX + 12, // HOUSE_CHIMNEY_X_OFFSET
    chimneyY: houseY,
  };
}

export function renderWorldScene(
  renderer: GridRenderer,
  layout: SceneLayout,
  isDay: boolean,
  palette: ScenePalette,
): void {
  const style = resolveWorldStyle(isDay, palette);

  renderGround(renderer, layout.width, layout.groundY, style);
  renderHouse(renderer, layout.houseX, layout.houseY, style);

  // Decorations: tree, fence, mailbox, optional pine
  const treeX = Math.max(0, layout.houseX - 20);
  if (treeX !== 0) {
    renderArt(renderer, TREE, treeX, layout.groundY - TREE.length, style.treeFoliage);
  }

  const fenceX = layout.houseX + HOUSE_WIDTH + 2;
  if (fenceX < layout.width) {
    renderArt(renderer, FENCE, fenceX, layout.groundY - FENCE.length, style.fence);
  }

  if (treeX >= 10) {
    const mailboxX = treeX - 10;
    if (mailboxX < layout.width) {
      renderArt(renderer, MAILBOX, mailboxX, layout.groundY - MAILBOX.length, style.mailbox);
    }
  }

  if (layout.width > 120) {
    const pineX = layout.houseX + HOUSE_WIDTH + 18;
    if (pineX + 10 < layout.width) {
      renderArt(renderer, PINE_TREE, pineX, layout.groundY - PINE_TREE.length, style.treeFoliage);
    }
  }
}
