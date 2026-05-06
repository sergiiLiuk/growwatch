import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { CommonModule } from '@angular/common';
import { SensorData, SensorService } from './sensor.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('smart-green-house');
  sensorData = signal<SensorData[]>([]);
  latestData = signal<SensorData | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);

  private refreshInterval?: number;

  constructor(private readonly sensorService: SensorService) { }

  ngOnInit() {
    this.loadSensorData();
    // Auto-refresh every 10 seconds
    this.refreshInterval = window.setInterval(() => {
      this.loadSensorData();
    }, 10000);
  }

  ngOnDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  loadSensorData() {
    this.loading.set(true);
    this.error.set(null);

    this.sensorService.getSensorData().subscribe({
      next: (data: SensorData[]) => {
        this.sensorData.set(data);
        this.loading.set(false);
      },
      error: (err: any) => {
        this.error.set('Failed to load sensor data');
        this.loading.set(false);
        console.error('Error loading sensor data:', err);
      }
    });

    this.sensorService.getLatestSensorData().subscribe({
      next: (data: SensorData | null) => {
        this.latestData.set(data);
      },
      error: (err: any) => {
        console.error('Error loading latest sensor data:', err);
      }
    });
  }
}
