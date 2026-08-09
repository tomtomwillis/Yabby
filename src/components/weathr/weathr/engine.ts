import {
  AirplaneSystem,
  type AnimationSystem,
  BirdSystem,
  ChimneySmoke,
  CloudSystem,
  FallingLeaves,
  FireflySystem,
  FogSystem,
  MoonSystem,
  RaindropSystem,
  SnowSystem,
  StarSystem,
  SunSystem,
  ThunderstormSystem,
} from './animations';
import { GridRenderer } from './renderer';
import { computeSceneLayout, DEFAULT_PALETTE, renderWorldScene, type ScenePalette } from './scene';
import {
  conditionsFlags,
  type FrameCommands,
  type FrameContext,
  fogIntensityOf,
  rainIntensityOf,
  snowIntensityOf,
  type WeatherInput,
} from './types';

export interface EngineOptions {
  width: number;
  height: number;
  weather: WeatherInput;
  showLeaves?: boolean;
  palette?: ScenePalette;
}

export class WeathrEngine {
  private renderer: GridRenderer;
  private systems: AnimationSystem[];
  private weather: WeatherInput;
  private showLeaves: boolean;
  private palette: ScenePalette;
  private width: number;
  private height: number;

  constructor(opts: EngineOptions) {
    this.width = opts.width;
    this.height = opts.height;
    this.weather = opts.weather;
    this.showLeaves = opts.showLeaves ?? false;
    this.palette = opts.palette ?? DEFAULT_PALETTE;
    this.renderer = new GridRenderer(opts.width, opts.height);

    this.systems = [
      new StarSystem(this.width, this.height),
      new MoonSystem(this.width, this.height, this.weather.moonPhase),
      new FireflySystem(this.width, this.height),
      new BirdSystem(this.width, this.height),
      new SunSystem(),
      new CloudSystem(this.width, this.height),
      new AirplaneSystem(this.width, this.height),
      new ChimneySmoke(),
      new RaindropSystem(this.width, this.height, rainIntensityOf(this.weather.condition)),
      new ThunderstormSystem(this.width, this.height),
      new SnowSystem(this.width, this.height, snowIntensityOf(this.weather.condition)),
      new FogSystem(this.width, this.height, fogIntensityOf(this.weather.condition)),
      new FallingLeaves(this.width, this.height),
    ];

    this.broadcastWeather();
  }

  setWeather(weather: WeatherInput): void {
    this.weather = weather;
    this.broadcastWeather();
  }

  private broadcastWeather(): void {
    for (const s of this.systems) {
      s.onWind?.(this.weather.windSpeedKmh, this.weather.windDirectionDeg);
      s.onRainIntensity?.(rainIntensityOf(this.weather.condition));
      s.onSnowIntensity?.(snowIntensityOf(this.weather.condition));
      s.onFogIntensity?.(fogIntensityOf(this.weather.condition));
      s.onMoonPhase?.(this.weather.moonPhase);
    }
  }

  setShowLeaves(show: boolean): void {
    this.showLeaves = show;
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.resize(width, height);
    for (const s of this.systems) s.onResize?.(width, height);
  }

  private buildContext(): FrameContext {
    const layout = computeSceneLayout(this.width, this.height);
    return {
      width: this.width,
      height: this.height,
      horizonY: layout.groundY,
      conditions: conditionsFlags(this.weather.condition, this.weather.isDay),
      weather: this.weather,
      showLeaves: this.showLeaves,
      chimney: { x: layout.chimneyX, y: layout.chimneyY },
    };
  }

  step(): string {
    const ctx = this.buildContext();
    this.renderer.clear();
    const layout = computeSceneLayout(this.width, this.height);

    const commands: FrameCommands = { flashScreen: false };

    // Background
    this.runLayer('background', ctx, commands);
    // Scene
    renderWorldScene(this.renderer, layout, ctx.weather.isDay, this.palette);
    // Post-scene (chimney smoke)
    this.runLayer('postScene', ctx, commands);
    // Foreground
    this.runLayer('foreground', ctx, commands);

    if (commands.flashScreen) this.renderer.flashScreen();

    return this.renderer.toHTML();
  }

  private runLayer(layer: 'background' | 'postScene' | 'foreground', ctx: FrameContext, commands: FrameCommands): void {
    for (const s of this.systems) {
      if (s.layer !== layer) continue;
      if (!s.isActive(ctx)) continue;
      s.update(ctx, commands);
      s.render(this.renderer, ctx);
    }
  }
}
