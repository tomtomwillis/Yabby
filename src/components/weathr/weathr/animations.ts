import { AIRPLANE, CLOUD_SHAPES, MOON_PHASES, SUN_FRAMES } from './assets';
import type { Color } from './colors';
import type { GridRenderer } from './renderer';
import {
  type FogIntensity,
  type FrameCommands,
  type FrameContext,
  type RainIntensity,
  type RenderLayer,
  type SnowIntensity,
} from './types';

const TAU = Math.PI * 2;

function randInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  return Math.floor(Math.random() * maxExclusive);
}

function randBool(): boolean {
  return Math.random() < 0.5;
}

export interface AnimationSystem {
  id: string;
  layer: RenderLayer;
  isActive(ctx: FrameContext): boolean;
  onResize?(width: number, height: number): void;
  onWind?(speedKmh: number, directionDeg: number): void;
  onRainIntensity?(intensity: RainIntensity): void;
  onSnowIntensity?(intensity: SnowIntensity): void;
  onFogIntensity?(intensity: FogIntensity): void;
  onMoonPhase?(phase: number): void;
  update(ctx: FrameContext, commands: FrameCommands): void;
  render(renderer: GridRenderer, ctx: FrameContext): void;
}

// -----------------------------------------------------------------------------
// Stars
// -----------------------------------------------------------------------------

interface Star {
  x: number;
  y: number;
  brightness: number;
  phase: number;
}

interface ShootingStar {
  x: number;
  y: number;
  speedX: number;
  speedY: number;
  length: number;
}

export class StarSystem implements AnimationSystem {
  id = 'stars';
  layer: RenderLayer = 'background';
  private stars: Star[] = [];
  private shooting: ShootingStar | null = null;
  private width = 0;
  private height = 0;
  private static MIN_DISTANCE = 3;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.rebuild();
  }

  private rebuild(): void {
    if (this.width === 0 || this.height === 0) {
      this.stars = [];
      return;
    }
    const skyHeight = Math.max(1, Math.floor(this.height / 2));
    const count = Math.floor((this.width * this.height) / 80);
    const surviving = this.stars.filter((s) => s.x < this.width && s.y < skyHeight).slice(0, count);
    const stars = [...surviving];
    const needed = Math.max(0, count - stars.length);
    for (let i = 0; i < needed; i++) {
      let attempts = 0;
      const maxAttempts = 50;
      while (true) {
        const x = randInt(this.width);
        const y = randInt(skyHeight);
        const tooClose = stars.some((s) => {
          const dx = s.x - x;
          const dy = s.y - y;
          return Math.sqrt(dx * dx + dy * dy) < StarSystem.MIN_DISTANCE;
        });
        if (!tooClose || attempts >= maxAttempts) {
          stars.push({ x, y, brightness: Math.random(), phase: Math.random() * TAU });
          break;
        }
        attempts++;
      }
    }
    this.stars = stars;
  }

  isActive(ctx: FrameContext): boolean {
    return !ctx.conditions.sun.isDay;
  }

  onResize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.rebuild();
    if (width === 0 || height === 0) this.shooting = null;
  }

  update(ctx: FrameContext): void {
    if (ctx.width === 0 || ctx.height === 0) {
      this.stars = [];
      this.shooting = null;
      this.width = ctx.width;
      this.height = ctx.height;
      return;
    }
    if (ctx.width !== this.width || ctx.height !== this.height) {
      this.width = ctx.width;
      this.height = ctx.height;
      this.rebuild();
      return;
    }

    for (const star of this.stars) {
      star.phase += 0.05;
      star.brightness = (Math.sin(star.phase) + 1) / 2;
    }

    if (this.shooting) {
      this.shooting.x += this.shooting.speedX;
      this.shooting.y += this.shooting.speedY;
      if (this.shooting.x < 0 || this.shooting.y >= this.height || this.shooting.length === 0) {
        this.shooting = null;
      }
    } else if (Math.random() < 0.005) {
      const halfWidth = Math.max(1, Math.floor(this.width / 2));
      const quarterWidth = Math.floor(this.width / 4);
      const quarterHeight = Math.max(1, Math.floor(this.height / 4));
      this.shooting = {
        x: randInt(halfWidth) + quarterWidth,
        y: randInt(quarterHeight),
        speedX: randBool() ? 1.5 : -1.5,
        speedY: 0.5 + Math.random() * 0.5,
        length: 5,
      };
    }
  }

  render(renderer: GridRenderer): void {
    for (const s of this.stars) {
      const ch = s.brightness > 0.8 ? '*' : s.brightness > 0.4 ? '+' : '.';
      const color: Color = s.brightness > 0.6 ? 'white' : 'darkGrey';
      renderer.renderChar(s.x, s.y, ch, color);
    }
    if (this.shooting) {
      const hx = Math.floor(this.shooting.x);
      const hy = Math.floor(this.shooting.y);
      if (hx >= 0 && hx < this.width && hy >= 0 && hy < this.height) {
        renderer.renderChar(hx, hy, '*', 'white');
      }
      for (let i = 1; i < this.shooting.length; i++) {
        const tx = Math.floor(this.shooting.x - this.shooting.speedX * i);
        const ty = Math.floor(this.shooting.y - this.shooting.speedY * i);
        if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
          renderer.renderChar(tx, ty, i === 1 ? '+' : '.', 'white');
        }
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Moon
// -----------------------------------------------------------------------------

export class MoonSystem implements AnimationSystem {
  id = 'moon';
  layer: RenderLayer = 'background';
  private phase: number;
  private x = 0;
  private y = 0;
  private width: number;
  private height: number;

  constructor(width: number, height: number, phase = 0.5) {
    this.width = width;
    this.height = height;
    this.phase = phase;
    this.recompute();
  }

  private recompute(): void {
    this.x = Math.min(Math.floor((this.width / 4) * 3), Math.max(0, this.width - 15));
    this.y = Math.max(2, Math.floor(this.height / 4));
  }

  isActive(ctx: FrameContext): boolean {
    return !ctx.conditions.sun.isDay;
  }

  onResize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.recompute();
  }

  onMoonPhase(phase: number): void {
    this.phase = phase;
  }

  update(ctx: FrameContext): void {
    this.width = ctx.width;
    this.height = ctx.height;
    this.recompute();
  }

  render(renderer: GridRenderer): void {
    const step = Math.round(this.phase * 8) % 8;
    const art = MOON_PHASES[step];
    for (let i = 0; i < art.length; i++) {
      const line = art[i];
      const yy = this.y + i;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (ch === ' ') continue; // transparent
        const xx = this.x + j;
        if (ch === '~') {
          // Opaque moon body — render space with white color so stars below are hidden.
          renderer.renderChar(xx, yy, ' ', 'white');
        } else {
          renderer.renderChar(xx, yy, ch, 'white');
        }
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Sun
// -----------------------------------------------------------------------------

export class SunSystem implements AnimationSystem {
  id = 'sun';
  layer: RenderLayer = 'background';
  private frame = 0;
  private lastFrameMs = 0;
  private static FRAME_DELAY_MS = 500;

  isActive(ctx: FrameContext): boolean {
    return (
      !ctx.conditions.isRaining && !ctx.conditions.isThunderstorm && !ctx.conditions.isSnowing
    );
  }

  update(): void {
    const now = performance.now();
    if (now - this.lastFrameMs >= SunSystem.FRAME_DELAY_MS) {
      this.frame = (this.frame + 1) % SUN_FRAMES.length;
      this.lastFrameMs = now;
    }
  }

  private shouldShow(ctx: FrameContext): boolean {
    if (!ctx.conditions.sun.isDay) return false;
    const c = ctx.weather.condition;
    return c === 'clear' || c === 'partly-cloudy' || c === 'cloudy';
  }

  render(renderer: GridRenderer, ctx: FrameContext): void {
    if (
      !this.shouldShow(ctx) ||
      ctx.conditions.isRaining ||
      ctx.conditions.isThunderstorm ||
      ctx.conditions.isSnowing
    ) {
      return;
    }
    const defaultY = ctx.height > 20 ? 3 : 2;
    renderer.renderCenteredColored(SUN_FRAMES[this.frame], defaultY, 'yellow');
  }
}

// -----------------------------------------------------------------------------
// Clouds
// -----------------------------------------------------------------------------

interface Cloud {
  x: number;
  y: number;
  speed: number;
  windX: number;
  shape: string[];
  color: Color;
}

export class CloudSystem implements AnimationSystem {
  id = 'clouds';
  layer: RenderLayer = 'background';
  private clouds: Cloud[] = [];
  private width: number;
  private height: number;
  private baseWindX = 0.15;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const count = Math.max(1, Math.floor(width / 30));
    const segment = width / count;
    for (let i = 0; i < count; i++) {
      const xMin = Math.floor(i * segment);
      const xMax = Math.floor((i + 1) * segment);
      const x = xMin + randInt(Math.max(1, xMax - xMin + 1));
      this.clouds.push(this.createRandomCloud(x, 'white'));
    }
  }

  private createRandomCloud(x: number, color: Color): Cloud {
    const shape = CLOUD_SHAPES[randInt(CLOUD_SHAPES.length)];
    const yRange = Math.max(1, Math.floor(this.height / 3));
    const y = randInt(yRange);
    const speed = 0.02 + Math.random() * 0.03;
    const windX = this.baseWindX * (0.8 + Math.random() * 0.4);
    return { x, y, speed, windX, shape, color };
  }

  isActive(ctx: FrameContext): boolean {
    const isClear = ctx.weather.condition === 'clear';
    return ctx.conditions.isCloudy || isClear;
  }

  onResize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  onWind(speedKmh: number, directionDeg: number): void {
    const dirRad = (directionDeg * Math.PI) / 180;
    this.baseWindX = (speedKmh / 50) * -Math.sin(dirRad);
    for (const c of this.clouds) {
      c.windX = this.baseWindX * (0.8 + Math.random() * 0.4);
    }
  }

  update(ctx: FrameContext): void {
    this.width = ctx.width;
    this.height = ctx.height;
    const cond = ctx.weather.condition;
    const isClear = cond === 'clear';
    let cloudColor: Color = 'darkGrey';
    if (cond === 'clear') cloudColor = 'white';
    else if (cond === 'partly-cloudy') cloudColor = 'grey';
    for (const c of this.clouds) c.color = isClear ? 'white' : 'darkGrey';

    for (const c of this.clouds) c.x += c.speed + c.windX;

    this.clouds = this.clouds.filter((c) => {
      const cloudWidth = c.shape.reduce((m, l) => Math.max(m, l.length), 0);
      const drift = c.speed + c.windX;
      return drift >= 0 ? c.x < this.width : c.x + cloudWidth > 0;
    });

    const maxClouds = isClear ? Math.floor(this.width / 30) : Math.floor(this.width / 20);
    const spawnChance = isClear ? 0.002 : 0.005;
    if (this.clouds.length < maxClouds && Math.random() < spawnChance) {
      const cloud = this.createRandomCloud(0, cloudColor);
      const cloudWidth = cloud.shape.reduce((m, l) => Math.max(m, l.length), 0);
      const drift = cloud.speed + cloud.windX;
      const spawnFromLeft = drift >= 0;
      const minGap = Math.max(15, this.width / 8);
      const tooClose = spawnFromLeft
        ? this.clouds.some((c) => c.x < minGap)
        : this.clouds.some((c) => c.x > this.width - minGap);
      if (!tooClose) {
        cloud.x = spawnFromLeft ? -cloudWidth : this.width;
        this.clouds.push(cloud);
      }
    }
  }

  render(renderer: GridRenderer): void {
    for (const cloud of this.clouds) {
      for (let i = 0; i < cloud.shape.length; i++) {
        const line = cloud.shape[i];
        const y = Math.floor(cloud.y) + i;
        const x = Math.floor(cloud.x);
        if (y < 0 || y >= this.height) continue;
        const clip = Math.max(0, -x);
        const visible = line.slice(Math.min(clip, line.length));
        if (visible.length > 0) {
          renderer.renderLineColored(Math.max(0, x), y, visible, cloud.color);
        }
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Birds
// -----------------------------------------------------------------------------

interface Bird {
  x: number;
  y: number;
  speed: number;
  character: string;
  flapState: boolean;
  flapTimer: number;
}

export class BirdSystem implements AnimationSystem {
  id = 'birds';
  layer: RenderLayer = 'background';
  private birds: Bird[] = [];
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  isActive(ctx: FrameContext): boolean {
    return (
      ctx.conditions.sun.isDay &&
      !ctx.conditions.isRaining &&
      !ctx.conditions.isThunderstorm &&
      !ctx.conditions.isSnowing
    );
  }

  onResize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.birds = this.birds.filter((b) => b.x < width && b.y < height);
  }

  update(ctx: FrameContext): void {
    this.width = ctx.width;
    this.height = ctx.height;
    for (const b of this.birds) {
      b.x += b.speed;
      b.flapTimer++;
      if (b.flapTimer > 5) {
        b.flapState = !b.flapState;
        b.flapTimer = 0;
      }
      b.character = b.flapState ? 'v' : '-';
    }
    this.birds = this.birds.filter((b) => b.x < this.width);
    if (this.birds.length < 3 && Math.random() < 0.01) {
      const band = Math.max(1, Math.floor(this.height / 3));
      this.birds.push({
        x: 0,
        y: randInt(band),
        speed: 0.2 + Math.random() * 0.2,
        character: 'v',
        flapState: true,
        flapTimer: 0,
      });
    }
  }

  render(renderer: GridRenderer): void {
    for (const b of this.birds) {
      const x = Math.floor(b.x);
      const y = Math.floor(b.y);
      if (x < this.width && y < this.height) {
        renderer.renderChar(x, y, b.character, 'yellow');
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Airplanes
// -----------------------------------------------------------------------------

interface Plane {
  x: number;
  y: number;
  speed: number;
}

export class AirplaneSystem implements AnimationSystem {
  id = 'airplanes';
  layer: RenderLayer = 'background';
  private planes: Plane[] = [];
  private width: number;
  private height: number;
  private spawnCooldown = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  isActive(ctx: FrameContext): boolean {
    return (
      !ctx.conditions.isRaining &&
      !ctx.conditions.isThunderstorm &&
      !ctx.conditions.isSnowing &&
      !ctx.conditions.isFoggy
    );
  }

  onResize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.planes = this.planes.filter((p) => p.x < width && p.y < height);
  }

  update(ctx: FrameContext): void {
    this.width = ctx.width;
    this.height = ctx.height;
    for (const p of this.planes) p.x += p.speed;
    this.planes = this.planes.filter((p) => p.x < this.width);
    this.spawnCooldown = Math.max(0, this.spawnCooldown - 1);
    if (this.spawnCooldown === 0 && Math.random() < 0.001) {
      const band = Math.max(1, Math.floor(this.height / 4));
      this.planes.push({ x: 0, y: randInt(band), speed: 0.3 + Math.random() * 0.2 });
      this.spawnCooldown = 600 + randInt(300);
    }
  }

  render(renderer: GridRenderer): void {
    for (const plane of this.planes) {
      const x = Math.floor(plane.x);
      const y = Math.floor(plane.y);
      for (let i = 0; i < AIRPLANE.length; i++) {
        const line = AIRPLANE[i];
        const ry = y + i;
        if (ry >= this.height) break;
        for (let j = 0; j < line.length; j++) {
          const rx = x + j;
          if (rx >= this.width) break;
          const ch = line[j];
          if (ch === ' ') continue;
          let color: Color = 'white';
          if (ch === '"') color = 'cyan';
          else if (ch === '\\') color = 'blue';
          else if (ch === '_') color = 'darkGrey';
          else if (ch === '~') color = 'grey';
          renderer.renderChar(rx, ry, ch, color);
        }
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Chimney smoke
// -----------------------------------------------------------------------------

interface SmokeParticle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  drift: number;
}

export class ChimneySmoke implements AnimationSystem {
  id = 'chimney-smoke';
  layer: RenderLayer = 'postScene';
  private particles: SmokeParticle[] = [];
  private spawnCounter = 0;
  private static MAX_PARTICLES = 200;
  private static MIN_MAX_AGE = 70;
  private static MAX_AGE_VARIANCE = 30;
  private static SPAWN_JITTER_X = 1.6;
  private static SPAWN_RATE = 12;
  private static VERTICAL_SPEED = 0.1;
  private static DRIFT_SCALE = 0.08;

  isActive(ctx: FrameContext): boolean {
    return !ctx.conditions.isRaining && !ctx.conditions.isThunderstorm && !!ctx.chimney;
  }

  update(ctx: FrameContext): void {
    if (!ctx.chimney) return;
    const { x: cx, y: cy } = ctx.chimney;

    for (const p of this.particles) {
      p.age++;
      p.y -= ChimneySmoke.VERTICAL_SPEED;
      p.x += p.drift;
    }
    this.particles = this.particles.filter((p) => p.age < p.maxAge && p.y >= 0);

    this.spawnCounter++;
    if (
      this.spawnCounter >= ChimneySmoke.SPAWN_RATE &&
      this.particles.length < ChimneySmoke.MAX_PARTICLES
    ) {
      this.spawnCounter = 0;
      this.particles.push({
        x: cx + (Math.random() - 0.5) * ChimneySmoke.SPAWN_JITTER_X,
        y: cy,
        age: 0,
        maxAge: ChimneySmoke.MIN_MAX_AGE + randInt(ChimneySmoke.MAX_AGE_VARIANCE),
        drift: (Math.random() - 0.5) * ChimneySmoke.DRIFT_SCALE,
      });
    }
  }

  render(renderer: GridRenderer, ctx: FrameContext): void {
    if (!ctx.chimney) return;
    for (const p of this.particles) {
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      if (x < 0 || y < 0) continue;
      let ch = '·';
      if (p.age <= 6) ch = 'o';
      else if (p.age <= 14) ch = '.';
      else if (p.age <= 25) ch = '~';
      const lifeRatio = p.age / p.maxAge;
      const color: Color = lifeRatio < 0.3 ? 'white' : lifeRatio < 0.6 ? 'grey' : 'darkGrey';
      renderer.renderChar(x, y, ch, color);
    }
  }
}

// -----------------------------------------------------------------------------
// Fireflies
// -----------------------------------------------------------------------------

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  glowPhase: number;
  glowSpeed: number;
  brightness: number;
}

export class FireflySystem implements AnimationSystem {
  id = 'fireflies';
  layer: RenderLayer = 'background';
  private fireflies: Firefly[] = [];
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  isActive(ctx: FrameContext): boolean {
    if (ctx.conditions.sun.isDay) return false;
    const w = ctx.weather;
    const isWarm = w.temperature > 15;
    const isClearNight = w.condition === 'clear' || w.condition === 'partly-cloudy';
    return (
      isWarm &&
      isClearNight &&
      !ctx.conditions.isRaining &&
      !ctx.conditions.isThunderstorm &&
      !ctx.conditions.isSnowing
    );
  }

  onResize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const target = Math.max(3, Math.floor(width / 15));
    if (this.fireflies.length > target) this.fireflies.length = target;
  }

  private spawn(horizonY: number): Firefly {
    const minY = Math.max(0, horizonY - 8);
    const maxY = Math.max(0, horizonY - 1);
    return {
      x: Math.random() * this.width,
      y: minY + Math.random() * Math.max(0, maxY - minY),
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.2,
      glowPhase: Math.random() * TAU,
      glowSpeed: 0.1 + Math.random() * 0.15,
      brightness: 0,
    };
  }

  update(ctx: FrameContext): void {
    this.width = ctx.width;
    this.height = ctx.height;
    const horizonY = ctx.horizonY;
    for (const f of this.fireflies) {
      f.x += f.vx;
      f.y += f.vy;
      if (Math.random() < 0.02) {
        f.vx = (Math.random() - 0.5) * 0.3;
        f.vy = (Math.random() - 0.5) * 0.2;
      }
      if (f.x < 0) f.x = this.width;
      else if (f.x > this.width) f.x = 0;
      const minY = Math.max(0, horizonY - 8);
      const maxY = Math.max(0, horizonY - 1);
      if (f.y < minY) {
        f.y = minY;
        f.vy = Math.abs(f.vy);
      } else if (f.y > maxY) {
        f.y = maxY;
        f.vy = -Math.abs(f.vy);
      }
      f.glowPhase += f.glowSpeed;
      if (f.glowPhase > TAU) f.glowPhase -= TAU;
      const g = (Math.sin(f.glowPhase) + 1) / 2;
      f.brightness = Math.min(255, Math.floor(g * 255));
    }
    const target = Math.max(3, Math.floor(this.width / 15));
    if (this.fireflies.length < target && Math.random() < 0.01) {
      this.fireflies.push(this.spawn(horizonY));
    }
  }

  render(renderer: GridRenderer): void {
    for (const f of this.fireflies) {
      if (f.brightness <= 64) continue;
      const x = Math.floor(f.x);
      const y = Math.floor(f.y);
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
      let ch = ' ';
      if (f.brightness > 200) ch = '*';
      else if (f.brightness > 128) ch = '.';
      else if (f.brightness > 64) ch = '·';
      let color: Color = 'darkGrey';
      if (f.brightness > 200) color = 'yellow';
      else if (f.brightness > 128) color = { r: 200, g: 255, b: 100 };
      else if (f.brightness > 64) color = { r: 150, g: 200, b: 80 };
      renderer.renderChar(x, y, ch, color);
    }
  }
}

// -----------------------------------------------------------------------------
// Rain
// -----------------------------------------------------------------------------

interface Raindrop {
  x: number;
  y: number;
  speedY: number;
  speedX: number;
  character: string;
  color: Color;
  zIndex: number;
}

interface Splash {
  x: number;
  y: number;
  timer: number;
  maxTimer: number;
}

export class RaindropSystem implements AnimationSystem {
  id = 'rain';
  layer: RenderLayer = 'foreground';
  private drops: Raindrop[] = [];
  private splashes: Splash[] = [];
  private width: number;
  private height: number;
  private intensity: RainIntensity;
  private windX = 0;
  private static MAX_SPLASHES = 100;

  constructor(width: number, height: number, intensity: RainIntensity = 'light') {
    this.width = width;
    this.height = height;
    this.intensity = intensity;
    this.applyIntensityWindOnly(intensity, randBool() ? 1 : -1);
  }

  private applyIntensityWindOnly(intensity: RainIntensity, dirMul: number): void {
    this.intensity = intensity;
    const base = intensity === 'drizzle' ? 0.05 : intensity === 'light' ? 0.1 : intensity === 'heavy' ? 0.15 : 0.8;
    this.windX = base * dirMul;
  }

  isActive(ctx: FrameContext): boolean {
    return ctx.conditions.isRaining || ctx.conditions.isThunderstorm;
  }

  onResize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.drops = this.drops.filter(
      (d) => d.x >= -10 && d.x <= width + 10 && d.y >= 0 && d.y < height,
    );
    this.splashes = this.splashes.filter((s) => s.x < width && s.y < height);
  }

  onWind(speedKmh: number, directionDeg: number): void {
    const dirRad = (directionDeg * Math.PI) / 180;
    this.windX = (speedKmh / 40) * -Math.sin(dirRad);
  }

  onRainIntensity(intensity: RainIntensity): void {
    const dir = this.windX >= 0 ? 1 : -1;
    this.applyIntensityWindOnly(intensity, dir);
  }

  private spawnDrop(): void {
    const span = Math.max(1, this.width * 2);
    const x = randInt(span) - this.width * 0.5;
    const z = randBool() ? 1 : 0;
    let speedY: number;
    let chars: string[];
    let color: Color;
    switch (this.intensity) {
      case 'drizzle':
        speedY = z === 1 ? 0.4 : 0.2;
        chars = ['.', ','];
        color = z === 1 ? 'cyan' : 'darkGrey';
        break;
      case 'light':
        speedY = z === 1 ? 0.7 : 0.4;
        chars = ['|', ':', '.'];
        color = z === 1 ? 'white' : 'darkGrey';
        break;
      case 'heavy':
        speedY = z === 1 ? 0.9 : 0.6;
        chars = ['|', ':'];
        color = z === 1 ? 'cyan' : 'darkGrey';
        break;
      case 'storm':
      default:
        speedY = z === 1 ? 1.8 : 1.2;
        chars = this.windX > 0 ? ['\\'] : ['/'];
        color = z === 1 ? 'white' : 'darkGrey';
        break;
    }
    this.drops.push({
      x,
      y: 0,
      speedY: speedY + Math.random() * 0.2,
      speedX: this.windX + (Math.random() * 0.1 - 0.05),
      character: chars[randInt(chars.length)],
      color,
      zIndex: z,
    });
  }

  update(ctx: FrameContext): void {
    this.width = ctx.width;
    this.height = ctx.height;
    const targetCount =
      this.intensity === 'drizzle'
        ? Math.floor(this.width / 4)
        : this.intensity === 'light'
          ? Math.floor(this.width / 2)
          : this.intensity === 'heavy'
            ? this.width
            : Math.floor(this.width * 1.5);

    if (this.drops.length < targetCount) {
      const spawnRate = this.intensity === 'drizzle' ? 1 : this.intensity === 'light' ? 2 : 5;
      for (let i = 0; i < spawnRate; i++) this.spawnDrop();
    }

    const splashChance =
      this.intensity === 'drizzle' ? 0.1 : this.intensity === 'light' ? 0.3 : 0.6;
    const groundY = Math.max(0, this.height - 1);

    this.drops = this.drops.filter((d) => {
      d.y += d.speedY;
      d.x += d.speedX;
      if (d.y >= groundY) {
        if (d.zIndex === 1 && Math.random() < splashChance) {
          this.splashes.push({
            x: Math.max(0, Math.floor(d.x)),
            y: groundY,
            timer: 0,
            maxTimer: 3,
          });
        }
        return false;
      }
      return d.x >= -10 && d.x <= this.width + 10;
    });

    while (this.splashes.length > RaindropSystem.MAX_SPLASHES) this.splashes.shift();

    this.splashes = this.splashes.filter((s) => {
      s.timer++;
      return s.timer < s.maxTimer;
    });
  }

  render(renderer: GridRenderer): void {
    for (const d of this.drops) {
      const x = Math.floor(d.x);
      const y = Math.floor(d.y);
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;
      let ch = d.character;
      if (this.intensity === 'storm' || this.intensity === 'heavy') {
        if (d.speedX > 0.5) ch = '\\';
        else if (d.speedX < -0.5) ch = '/';
      }
      renderer.renderChar(x, y, ch, d.color);
    }
    for (const s of this.splashes) {
      if (s.x >= this.width || s.y >= this.height) continue;
      const ch = s.timer === 0 ? '.' : s.timer === 1 ? 'o' : s.timer === 2 ? 'O' : ' ';
      renderer.renderChar(s.x, s.y, ch, 'white');
    }
  }
}

// -----------------------------------------------------------------------------
// Snow
// -----------------------------------------------------------------------------

interface Snowflake {
  x: number;
  y: number;
  speedY: number;
  speedX: number;
  swayOffset: number;
  character: string;
  color: Color;
}

export class SnowSystem implements AnimationSystem {
  id = 'snow';
  layer: RenderLayer = 'foreground';
  private flakes: Snowflake[] = [];
  private width: number;
  private height: number;
  private intensity: SnowIntensity;
  private windX = 0;

  constructor(width: number, height: number, intensity: SnowIntensity = 'light') {
    this.width = width;
    this.height = height;
    this.intensity = intensity;
    const dirMul = randBool() ? 0.2 : -0.2;
    this.applyIntensity(intensity, dirMul);
  }

  private applyIntensity(intensity: SnowIntensity, dirMul: number): void {
    this.intensity = intensity;
    const base = intensity === 'light' ? 0.05 : intensity === 'medium' ? 0.1 : 0.2;
    this.windX = base * dirMul;
  }

  isActive(ctx: FrameContext): boolean {
    return ctx.conditions.isSnowing;
  }

  onResize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.flakes = this.flakes.filter(
      (f) => f.x >= -20 && f.x <= width + 20 && f.y >= 0 && f.y < height,
    );
  }

  onWind(speedKmh: number, directionDeg: number): void {
    const dirRad = (directionDeg * Math.PI) / 180;
    this.windX = (speedKmh / 20) * -Math.sin(dirRad);
  }

  onSnowIntensity(intensity: SnowIntensity): void {
    const dir = this.windX >= 0 ? 1 : -1;
    this.applyIntensity(intensity, dir);
  }

  private spawnFlake(): void {
    const span = Math.max(1, this.width * 3);
    const x = randInt(span) - this.width;
    const z = randBool() ? 1 : 0;
    let baseY: number;
    let chars: string[];
    if (this.intensity === 'light') {
      baseY = z === 1 ? 0.15 : 0.08;
      chars = ['.', '·'];
    } else if (this.intensity === 'medium') {
      baseY = z === 1 ? 0.2 : 0.1;
      chars = ['.', '·', '*'];
    } else {
      baseY = z === 1 ? 0.3 : 0.15;
      chars = ['*', '.', '·'];
    }
    this.flakes.push({
      x,
      y: 0,
      speedY: baseY + Math.random() * 0.05,
      speedX: this.windX + (Math.random() * 0.1 - 0.05),
      swayOffset: Math.random() * 100,
      character: chars[randInt(chars.length)],
      color: z === 1 ? 'white' : 'darkGrey',
    });
  }

  update(ctx: FrameContext): void {
    this.width = ctx.width;
    this.height = ctx.height;
    const target =
      this.intensity === 'light'
        ? Math.floor(this.width / 4)
        : this.intensity === 'medium'
          ? Math.floor(this.width / 2)
          : this.width;
    if (this.flakes.length < target) {
      const rate = this.intensity === 'light' ? 1 : this.intensity === 'medium' ? 2 : 4;
      for (let i = 0; i < rate; i++) this.spawnFlake();
    }
    const groundY = Math.max(0, this.height - 1);
    this.flakes = this.flakes.filter((f) => {
      f.y += f.speedY;
      const sway = Math.sin(f.y * 0.2 + f.swayOffset) * 0.05;
      f.x += f.speedX + sway;
      if (f.y >= groundY) return false;
      return f.x >= -20 && f.x <= this.width + 20;
    });
  }

  render(renderer: GridRenderer): void {
    for (const f of this.flakes) {
      const x = Math.floor(f.x);
      const y = Math.floor(f.y);
      if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
        renderer.renderChar(x, y, f.character, f.color);
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Fog
// -----------------------------------------------------------------------------

interface FogWisp {
  x: number;
  y: number;
  speedX: number;
  character: string;
  color: Color;
  lifetime: number;
  maxLifetime: number;
}

export class FogSystem implements AnimationSystem {
  id = 'fog';
  layer: RenderLayer = 'foreground';
  private wisps: FogWisp[] = [];
  private width: number;
  private height: number;
  private intensity: FogIntensity;
  private spawnTimer = 0;
  private static CHARS = ['.', ',', '-', '~'];
  private static COLORS: Color[] = ['grey', 'darkGrey', { r: 120, g: 120, b: 120 }];

  constructor(width: number, height: number, intensity: FogIntensity = 'light') {
    this.width = width;
    this.height = height;
    this.intensity = intensity;
  }

  isActive(ctx: FrameContext): boolean {
    return ctx.conditions.isFoggy;
  }

  onResize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.wisps = this.wisps.filter(
      (w) => w.lifetime < w.maxLifetime && w.x >= -5 && w.x < width + 5 && w.y >= 0 && w.y < height,
    );
  }

  onFogIntensity(intensity: FogIntensity): void {
    this.intensity = intensity;
  }

  private spawn(): FogWisp {
    const groundLevel = Math.max(0, this.height - 7);
    const fogTop = Math.max(0, groundLevel - 15);
    return {
      x: Math.random() * this.width,
      y: fogTop + Math.random() * 15,
      speedX: (Math.random() - 0.5) * 0.15,
      character: FogSystem.CHARS[randInt(FogSystem.CHARS.length)],
      color: FogSystem.COLORS[randInt(FogSystem.COLORS.length)],
      lifetime: 0,
      maxLifetime: 100 + randInt(200),
    };
  }

  update(ctx: FrameContext): void {
    this.width = ctx.width;
    this.height = ctx.height;
    for (const w of this.wisps) {
      w.x += w.speedX;
      w.lifetime++;
    }
    this.wisps = this.wisps.filter(
      (w) => w.lifetime < w.maxLifetime && w.x >= -5 && w.x < this.width + 5,
    );
    const [mul, delay] =
      this.intensity === 'light' ? [0.3, 4] : this.intensity === 'medium' ? [0.6, 2] : [1.0, 1];
    const target = Math.floor(this.width * mul);
    this.spawnTimer++;
    if (this.spawnTimer >= delay && this.wisps.length < target) {
      this.spawnTimer = 0;
      for (let i = 0; i < 2 && this.wisps.length < target; i++) this.wisps.push(this.spawn());
    }
  }

  render(renderer: GridRenderer): void {
    for (const w of this.wisps) {
      const x = Math.floor(w.x);
      const y = Math.floor(w.y);
      if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
        renderer.renderChar(x, y, w.character, w.color);
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Thunderstorm
// -----------------------------------------------------------------------------

interface Bolt {
  segments: [number, number, string][];
  age: number;
  maxAge: number;
}

type LightningState = 'idle' | 'forming' | 'strike' | 'flash' | 'fading';

export class ThunderstormSystem implements AnimationSystem {
  id = 'thunderstorm';
  layer: RenderLayer = 'foreground';
  private bolts: Bolt[] = [];
  private state: LightningState = 'idle';
  private timer = 0;
  private width: number;
  private height: number;
  private flashActive = false;
  private nextStrikeIn: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.nextStrikeIn = 60 + randInt(120);
  }

  isActive(ctx: FrameContext): boolean {
    return ctx.conditions.isThunderstorm;
  }

  onResize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (width < 12 || height < 8) {
      this.bolts = [];
      this.flashActive = false;
      this.state = 'idle';
      this.timer = 0;
    }
  }

  private generateBolt(): boolean {
    if (this.width < 12 || this.height < 8) return false;
    const usableWidth = Math.max(0, this.width - 10);
    if (usableWidth === 0) return false;
    const startX = randInt(usableWidth) + 5;
    const segments: [number, number, string][] = [];
    let x = startX;
    let y = 2;
    segments.push([x, y, '+']);
    const yEnd = Math.max(0, this.height - 5);
    const maxX = Math.max(0, this.width - 3);
    while (y < yEnd) {
      const direction = randInt(3) - 1; // -1, 0, 1
      x += direction;
      y += 1;
      if (x < 2) x = 2;
      if (x > maxX) x = maxX;
      const ch = direction === -1 ? '/' : direction === 1 ? '\\' : '|';
      segments.push([x, y, ch]);
      if (Math.random() < 0.2) {
        const branchDir = -direction;
        let bx = x + branchDir;
        let by = y + 1;
        for (let i = 0; i < 3; i++) {
          if (by < this.height - 2) {
            segments.push([bx, by, branchDir < 0 ? '/' : '\\']);
            bx += branchDir;
            by += 1;
          }
        }
      }
    }
    this.bolts.push({ segments, age: 0, maxAge: 10 });
    while (this.bolts.length > 10) this.bolts.shift();
    return true;
  }

  update(ctx: FrameContext, commands: FrameCommands): void {
    this.width = ctx.width;
    this.height = ctx.height;
    if (this.width < 12 || this.height < 8) {
      this.bolts = [];
      this.flashActive = false;
      this.state = 'idle';
      this.timer = 0;
      this.nextStrikeIn = 60 + randInt(120);
      return;
    }
    switch (this.state) {
      case 'idle':
        this.flashActive = false;
        if (this.timer >= this.nextStrikeIn) {
          this.timer = 0;
          if (this.generateBolt()) {
            this.state = 'forming';
          } else {
            this.nextStrikeIn = 30 + randInt(200);
          }
        } else this.timer++;
        break;
      case 'forming':
        this.state = 'strike';
        this.timer = 0;
        break;
      case 'strike':
        this.flashActive = true;
        this.state = 'flash';
        this.timer = 0;
        break;
      case 'flash':
        this.flashActive = false;
        if (this.timer > 2) {
          this.state = 'fading';
          this.timer = 0;
        } else this.timer++;
        break;
      case 'fading':
        this.bolts = this.bolts.filter((b) => {
          b.age++;
          return b.age < b.maxAge;
        });
        if (this.bolts.length === 0) {
          this.state = 'idle';
          this.timer = 0;
          this.nextStrikeIn = 30 + randInt(200);
        }
        break;
    }
    if (this.flashActive) commands.flashScreen = true;
  }

  render(renderer: GridRenderer): void {
    const color: Color = this.flashActive ? 'white' : 'yellow';
    for (const bolt of this.bolts) {
      for (const [x, y, ch] of bolt.segments) {
        renderer.renderChar(x, y, ch, color);
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Falling leaves
// -----------------------------------------------------------------------------

interface Leaf {
  x: number;
  y: number;
  fallSpeed: number;
  swaySpeed: number;
  swayPhase: number;
  swayAmplitude: number;
  rotation: number;
  color: Color;
  character: string;
}

const LEAF_COLORS: Color[] = [
  { r: 255, g: 165, b: 0 },
  { r: 218, g: 165, b: 32 },
  { r: 184, g: 134, b: 11 },
  { r: 205, g: 92, b: 92 },
  { r: 160, g: 82, b: 45 },
  { r: 139, g: 69, b: 19 },
];

const LEAF_CHARS = ['*', '+', ',', '.', '~'];

export class FallingLeaves implements AnimationSystem {
  id = 'leaves';
  layer: RenderLayer = 'foreground';
  private leaves: Leaf[] = [];
  private spawnCounter = 0;
  private width: number;
  private height: number;
  private static SPAWN_RATE = 15;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const initial = Math.max(5, Math.floor(width / 10));
    for (let i = 0; i < initial; i++) this.leaves.push(this.newLeaf(false));
  }

  private newLeaf(atTop: boolean): Leaf {
    return {
      x: Math.random() * this.width,
      y: atTop ? -(Math.random() * 5) : Math.random() * this.height,
      fallSpeed: 0.15 + Math.random() * 0.2,
      swaySpeed: 0.05 + Math.random() * 0.1,
      swayPhase: Math.random() * TAU,
      swayAmplitude: 0.5 + Math.random() * 1.5,
      rotation: 0,
      color: LEAF_COLORS[randInt(LEAF_COLORS.length)],
      character: LEAF_CHARS[randInt(LEAF_CHARS.length)],
    };
  }

  isActive(ctx: FrameContext): boolean {
    return (
      ctx.showLeaves &&
      !ctx.conditions.isRaining &&
      !ctx.conditions.isThunderstorm &&
      !ctx.conditions.isSnowing
    );
  }

  onResize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.leaves = this.leaves.filter((l) => l.y < height && l.x > -10 && l.x < width + 10);
  }

  update(ctx: FrameContext): void {
    this.width = ctx.width;
    this.height = ctx.height;
    for (const l of this.leaves) {
      l.y += l.fallSpeed;
      l.swayPhase += l.swaySpeed;
      if (l.swayPhase > TAU) l.swayPhase -= TAU;
      const swayOffset = Math.sin(l.swayPhase) * l.swayAmplitude;
      l.x += swayOffset * 0.1;
      l.rotation = Math.floor(Math.sin(l.swayPhase * 2) * 4) & 0xff;
    }
    this.leaves = this.leaves.filter((l) => l.y <= this.height);
    this.spawnCounter++;
    if (this.spawnCounter >= FallingLeaves.SPAWN_RATE) {
      this.spawnCounter = 0;
      if (Math.random() < 0.7) this.leaves.push(this.newLeaf(true));
    }
    const max = Math.max(10, Math.floor(this.width / 8));
    if (this.leaves.length > max) this.leaves.length = max;
  }

  render(renderer: GridRenderer): void {
    for (const l of this.leaves) {
      const x = Math.floor(l.x);
      const y = Math.floor(l.y);
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
      let ch = l.character;
      const r = l.rotation % 4;
      if (r === 1 && l.character === '*') ch = '+';
      else if (r === 2 && l.character === '+') ch = '*';
      renderer.renderChar(x, y, ch, l.color);
    }
  }
}
