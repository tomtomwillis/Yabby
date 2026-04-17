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
      const data = await response.json();
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