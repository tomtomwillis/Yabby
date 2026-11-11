import { useEffect, useState } from 'react';
import WeatherCard, { type WeatherData } from './weathercard';
import './weathercard.css';

// Glasgow.
const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=55.83&longitude=-4.27&current_weather=true';

export default function Weather() {
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(WEATHER_URL);
        // A 503 resolves rather than throwing, and open-meteo answers it with
        // a JSON error body, which parses fine and would otherwise be stored
        // as weather with no current_weather on it.
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && data?.current_weather) setWeather(data);
      } catch {
        // No weather is not worth a message: the card stays empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="weather-card">
      <WeatherCard weather={weather} />
    </div>
  );
}
