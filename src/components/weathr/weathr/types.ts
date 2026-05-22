export type WeatherCondition =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'freezing-rain'
  | 'rain-showers'
  | 'snow'
  | 'snow-grains'
  | 'snow-showers'
  | 'thunderstorm'
  | 'thunderstorm-hail';

export type RainIntensity = 'drizzle' | 'light' | 'heavy' | 'storm';
export type SnowIntensity = 'light' | 'medium' | 'heavy';
export type FogIntensity = 'light' | 'medium' | 'heavy';

export interface CelestialEvents {
  isDay: boolean;
}

export interface WeatherConditionsFlags {
  isRaining: boolean;
  isSnowing: boolean;
  isThunderstorm: boolean;
  isCloudy: boolean;
  isFoggy: boolean;
  sun: CelestialEvents;
}

export interface WeatherInput {
  condition: WeatherCondition;
  temperature: number;
  windSpeedKmh: number;
  windDirectionDeg: number;
  moonPhase: number;
  isDay: boolean;
}

export type RenderLayer = 'background' | 'postScene' | 'foreground';

export interface FrameCommands {
  flashScreen: boolean;
}

export interface FrameContext {
  width: number;
  height: number;
  horizonY: number;
  conditions: WeatherConditionsFlags;
  weather: WeatherInput;
  showLeaves: boolean;
  chimney?: { x: number; y: number };
}

export function isRaining(c: WeatherCondition): boolean {
  return (
    c === 'drizzle' ||
    c === 'rain' ||
    c === 'rain-showers' ||
    c === 'freezing-rain' ||
    c === 'thunderstorm' ||
    c === 'thunderstorm-hail'
  );
}

export function isSnowing(c: WeatherCondition): boolean {
  return c === 'snow' || c === 'snow-grains' || c === 'snow-showers';
}

export function isThunderstorm(c: WeatherCondition): boolean {
  return c === 'thunderstorm' || c === 'thunderstorm-hail';
}

export function isCloudy(c: WeatherCondition): boolean {
  return c === 'partly-cloudy' || c === 'cloudy' || c === 'overcast';
}

export function isFoggy(c: WeatherCondition): boolean {
  return c === 'fog';
}

export function rainIntensityOf(c: WeatherCondition): RainIntensity {
  switch (c) {
    case 'drizzle':
      return 'drizzle';
    case 'rain':
    case 'rain-showers':
      return 'light';
    case 'freezing-rain':
    case 'thunderstorm':
      return 'heavy';
    case 'thunderstorm-hail':
      return 'storm';
    default:
      return 'light';
  }
}

export function snowIntensityOf(c: WeatherCondition): SnowIntensity {
  switch (c) {
    case 'snow-grains':
      return 'light';
    case 'snow-showers':
      return 'medium';
    case 'snow':
      return 'heavy';
    default:
      return 'light';
  }
}

export function fogIntensityOf(c: WeatherCondition): FogIntensity {
  return c === 'fog' ? 'medium' : 'light';
}

export function conditionsFlags(c: WeatherCondition, isDay: boolean): WeatherConditionsFlags {
  const thunder = isThunderstorm(c);
  return {
    isThunderstorm: thunder,
    isSnowing: isSnowing(c),
    isRaining: isRaining(c) && !thunder,
    isCloudy: isCloudy(c),
    isFoggy: isFoggy(c),
    sun: { isDay },
  };
}
