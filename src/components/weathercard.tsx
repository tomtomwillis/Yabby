import type { IconType } from 'react-icons';
import {
  FaSun, FaCloudSun, FaCloud, FaSmog, FaCloudSunRain, FaCloudShowersHeavy,
  FaSnowflake, FaCloudBolt, FaBoltLightning,
} from 'react-icons/fa6';
import './weathercard.css';

export interface WeatherData {
  current_weather: { weathercode: number; temperature: number };
}

/** WMO weather codes, as open-meteo reports them. */
const WEATHER: Record<number, { description: string; Icon: IconType }> = {
  0: { description: 'clear sky', Icon: FaSun },
  1: { description: 'mainly clear sky', Icon: FaCloudSun },
  2: { description: 'partly cloudy', Icon: FaCloudSun },
  3: { description: 'overcast', Icon: FaCloud },
  45: { description: 'foggy', Icon: FaSmog },
  48: { description: 'depositing rime fog (?)', Icon: FaSmog },
  51: { description: 'drizzling', Icon: FaCloudSunRain },
  53: { description: 'drizzling', Icon: FaCloudSunRain },
  55: { description: 'drizzling', Icon: FaCloudSunRain },
  56: { description: 'freezing mist', Icon: FaCloudSunRain },
  57: { description: 'freezing mist', Icon: FaCloudSunRain },
  61: { description: 'slightly raining', Icon: FaCloudShowersHeavy },
  63: { description: 'raining', Icon: FaCloudShowersHeavy },
  65: { description: 'raining heavily', Icon: FaCloudShowersHeavy },
  66: { description: 'freezing rain', Icon: FaCloudShowersHeavy },
  67: { description: 'freezing rain', Icon: FaCloudShowersHeavy },
  71: { description: 'slightly snowing', Icon: FaSnowflake },
  73: { description: 'snowing', Icon: FaSnowflake },
  75: { description: 'snowing heavily', Icon: FaSnowflake },
  77: { description: 'snow grains', Icon: FaSnowflake },
  80: { description: 'showering', Icon: FaCloudShowersHeavy },
  81: { description: 'showering', Icon: FaCloudShowersHeavy },
  82: { description: 'violently showering', Icon: FaCloudShowersHeavy },
  85: { description: 'snow showering', Icon: FaSnowflake },
  86: { description: 'snow showering', Icon: FaSnowflake },
  95: { description: 'thunderstorming', Icon: FaCloudBolt },
  96: { description: 'thunderstorming with slight hail !!', Icon: FaBoltLightning },
  99: { description: 'thunderstorming with heavy hail !!', Icon: FaBoltLightning },
};

const UNKNOWN = { description: 'Unknown weather', Icon: FaSun };

export default function WeatherCard({ weather }: { weather: WeatherData | null }) {
  // Checked here as well as at the fetch: this sits in the home shell's rail,
  // above the page's error boundary, so a malformed response reaching the
  // lines below would take the whole shell down rather than just the card.
  if (!weather?.current_weather) return null;

  const { weathercode, temperature } = weather.current_weather;
  const { description, Icon } = WEATHER[weathercode] ?? UNKNOWN;

  return (
    <div>
      <p className="normal-text">
        The temperature in Yabbyville is {Math.round(temperature)} °C and it is currently {description}{' '}
        <Icon style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />
      </p>
    </div>
  );
}
