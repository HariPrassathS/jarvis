// ──────────────────────────────────────────────
// Tool: Weather — Open-Meteo API (free, no key)
// ──────────────────────────────────────────────

/**
 * Geocode a location name to lat/lng using Open-Meteo's geocoding API,
 * then fetch current weather + daily forecast.
 */
export async function getWeather(location: string): Promise<string> {
  try {
    // 1. Geocode the location
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`
    );
    const geoData = await geoRes.json();

    if (!geoData.results || geoData.results.length === 0) {
      return `I couldn't find weather data for "${location}". Could you be more specific?`;
    }

    const { latitude, longitude, name, country } = geoData.results[0];

    // 2. Fetch weather data
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3`
    );
    const weather = await weatherRes.json();

    const current = weather.current;
    const daily = weather.daily;

    // Map weather codes to descriptions
    const weatherDesc = getWeatherDescription(current.weather_code);

    let result = `Weather in ${name}, ${country}:\n`;
    result += `Currently: ${weatherDesc}, ${current.temperature_2m}°C (feels like ${current.apparent_temperature}°C)\n`;
    result += `Humidity: ${current.relative_humidity_2m}%, Wind: ${current.wind_speed_10m} km/h\n\n`;
    result += `3-Day Forecast:\n`;

    for (let i = 0; i < 3; i++) {
      const dayDesc = getWeatherDescription(daily.weather_code[i]);
      result += `  ${daily.time[i]}: ${dayDesc}, ${daily.temperature_2m_min[i]}°C – ${daily.temperature_2m_max[i]}°C\n`;
    }

    return result;
  } catch (error) {
    console.error('Weather tool error:', error);
    return 'I had trouble fetching weather data. Please try again.';
  }
}

function getWeatherDescription(code: number): string {
  const descriptions: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snowfall',
    73: 'Moderate snowfall',
    75: 'Heavy snowfall',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };
  return descriptions[code] || 'Unknown conditions';
}
