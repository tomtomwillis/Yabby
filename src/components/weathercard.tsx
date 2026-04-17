import React from "react";
import "./weathercard.css";
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'; // Import FontAwesomeIcon
import { faNotdef, faSun, faMoon, faWind, faTemperatureLow, faCloudSun, faCloud, faSmog, faCloudSunRain, faCloudShowersHeavy, faSnowflake, faCloudBolt, faBoltLightning } from '@fortawesome/free-solid-svg-icons';

interface WeatherCode {
  weatherCode: number;
  description: string;
  icon: IconDefinition;
}

const weatherCodes: WeatherCode[] = [
  { weatherCode: 0, description: "clear sky", icon: faSun },
  { weatherCode: 1, description: "mainly clear sky", icon: faCloudSun },
  { weatherCode: 2, description: "partly cloudy", icon: faCloudSun },
  { weatherCode: 3, description: "overcast", icon: faCloud },
  { weatherCode: 45, description: "foggy", icon: faSmog },
  { weatherCode: 48, description: "depositing rime fog (?)", icon: faSmog },
  { weatherCode: 51, description: "drizzling", icon: faCloudSunRain },
  { weatherCode: 53, description: "drizzling", icon: faCloudSunRain },
  { weatherCode: 55, description: "drizzling", icon: faCloudSunRain },
  { weatherCode: 56, description: "freezing mist", icon: faCloudSunRain },
  { weatherCode: 57, description: "freezing mist", icon: faCloudSunRain },
  { weatherCode: 61, description: "slightly raining", icon: faCloudShowersHeavy },
  { weatherCode: 63, description: "raining", icon: faCloudShowersHeavy },
  { weatherCode: 65, description: "raining heavily", icon: faCloudShowersHeavy },
  { weatherCode: 66, description: "freezing rain", icon: faCloudShowersHeavy },
  { weatherCode: 67, description: "freezing rain", icon: faCloudShowersHeavy },
  { weatherCode: 71, description: "slightly snowing", icon: faSnowflake },
  { weatherCode: 73, description: "snowing", icon: faSnowflake },
  { weatherCode: 75, description: "snowing heavily", icon: faSnowflake },
  { weatherCode: 77, description: "snow grains", icon: faSnowflake },
  { weatherCode: 80, description: "showering", icon: faCloudShowersHeavy },
  { weatherCode: 81, description: "showering", icon: faCloudShowersHeavy },
  { weatherCode: 82, description: "violently showering", icon: faCloudShowersHeavy },
  { weatherCode: 85, description: "snow showering", icon: faSnowflake },
  { weatherCode: 86, description: "snow showering", icon: faSnowflake },
  { weatherCode: 95, description: "thunderstorming", icon: faCloudBolt },
  { weatherCode: 96, description: "thunderstorming with slight hail !!", icon: faBoltLightning },
  { weatherCode: 99, description: "thunderstorming with heavy hail !!", icon: faBoltLightning }
];

export default function WeatherCard({weather} : { weather: any })
{
  const weatherCode = weather?.current_weather?.weathercode;
  const weatherInfo = weatherCodes.find(item => item.weatherCode === weatherCode) || { icon: faSun, description: "Unknown weather" }; // Fallback

  return (
    <div>
       <p className="normal-text">The temperature in Yabbyville is {Math.round(weather?.current_weather.temperature)} °C and it is currently {weatherInfo?.description} <FontAwesomeIcon icon={weatherInfo?.icon} /></p>
    </div>
  );  
}

