import { Injectable, signal } from '@angular/core';

export interface WeatherData {
  temperature: number;
  humidity: number;
  windSpeed: number;
  cloudCover: number;
  weatherCode: number;
  conditionLabel: string;
  conditionIcon: string;
  city: string;
}

interface StoredLocation {
  lat: number;
  lng: number;
  city?: string;
}

function weatherInfo(code: number): { label: string; icon: string } {
  if (code === 0) return { label: 'Clear sky',     icon: '☀️' };
  if (code === 1) return { label: 'Mainly clear',  icon: '🌤️' };
  if (code === 2) return { label: 'Partly cloudy', icon: '⛅' };
  if (code === 3) return { label: 'Overcast',      icon: '☁️' };
  if (code <= 48) return { label: 'Foggy',         icon: '🌫️' };
  if (code <= 55) return { label: 'Drizzle',       icon: '🌦️' };
  if (code <= 65) return { label: 'Rain',          icon: '🌧️' };
  if (code <= 77) return { label: 'Snow',          icon: '❄️' };
  if (code <= 82) return { label: 'Rain showers',  icon: '🌦️' };
  if (code <= 86) return { label: 'Snow showers',  icon: '🌨️' };
  return { label: 'Thunderstorm', icon: '⛈️' };
}

const LOCATION_KEY = 'growwatch-location';

@Injectable({ providedIn: 'root' })
export class WeatherService {
  weather = signal<WeatherData | null>(null);
  loading = signal(false);

  private async getLocation(): Promise<StoredLocation> {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (raw) {
      try { return JSON.parse(raw) as StoredLocation; } catch {}
    }
    return new Promise(resolve => {
      if (!navigator.geolocation) {
        resolve({ lat: 55.68, lng: 12.57 });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: 55.68, lng: 12.57 }),
        { timeout: 8000 }
      );
    });
  }

  private async resolveCity(lat: number, lng: number): Promise<string> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'User-Agent': 'GrowWatch/1.0 (sergiiliuk@gmail.com)' } }
      );
      const data = await res.json();
      return (
        data.address?.city ||
        data.address?.town ||
        data.address?.village ||
        data.address?.county ||
        'Unknown'
      );
    } catch {
      return 'Unknown';
    }
  }

  async fetchWeather(): Promise<void> {
    this.loading.set(true);
    try {
      const loc = await this.getLocation();
      const { lat, lng } = loc;

      let city = loc.city;
      if (!city) {
        city = await this.resolveCity(lat, lng);
        localStorage.setItem(LOCATION_KEY, JSON.stringify({ lat, lng, city }));
      }

      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,cloud_cover&timezone=auto`
      );
      const data = await res.json();
      const c = data.current;
      const { label, icon } = weatherInfo(c.weather_code);

      this.weather.set({
        temperature: Math.round(c.temperature_2m),
        humidity: Math.round(c.relative_humidity_2m),
        windSpeed: Math.round(c.wind_speed_10m),
        cloudCover: c.cloud_cover,
        weatherCode: c.weather_code,
        conditionLabel: label,
        conditionIcon: icon,
        city,
      });
    } catch (err) {
      console.error('Weather fetch failed:', err);
    } finally {
      this.loading.set(false);
    }
  }
}
