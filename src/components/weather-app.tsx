import React from "react";
import WeatherCard from './weathercard';
import "./weathercard.css";

export default function Weather() {
  const baseWeatherApiUrl = 'https://api.open-meteo.com/v1/forecast';
  const [weatherData, setWeatherData] = React.useState(null);
  const [latitude,longitude] = [55.83, -4.27];
  const [error,setError] = React.useState(false);


  React.useEffect(() => {
    const getWeatherData = async () => {
      const weatherApi = `${baseWeatherApiUrl}?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
      try {
      const response = await fetch(weatherApi);
      // A 503 resolves rather than throwing, and open-meteo answers it with a
      // JSON error body — which parses fine and would otherwise be stored as
      // weather with no current_weather on it.
      if (!response.ok) throw new Error(`Weather API returned ${response.status}`);
      const data = await response.json();
      if (!data?.current_weather) throw new Error('Weather API returned no current_weather');
      setWeatherData(data);
    } catch (error) {
      setError(true);
    }}
    
    getWeatherData();
    
  }, [latitude, longitude]);

  if (error) return null
  
  return (
    <div className="weather-card">
    <WeatherCard weather = {weatherData}/>
    </div>
  )
}