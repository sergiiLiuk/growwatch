# Smart Greenhouse Server

Node.js TypeScript GraphQL server for real-time ESP32 sensor data streaming to your Angular frontend.

## Features

- ✅ **GraphQL API** with Apollo Server
- ✅ **WebSocket Subscriptions** for real-time data updates
- ✅ **HTTP REST endpoint** for ESP32 data ingestion
- ✅ **TypeScript** for type safety
- ✅ **Express.js** web server
- ✅ **CORS** enabled for frontend communication

## Project Structure

```
backend/
├── src/
│   ├── index.ts          # Main server entry point
│   ├── schema.ts         # GraphQL type definitions
│   ├── resolvers.ts      # GraphQL resolvers
│   ├── types.ts          # TypeScript interfaces
│   └── pubsub.ts         # GraphQL subscriptions setup
├── dist/                 # Compiled JavaScript output
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

## Development

Run in development mode with auto-reload:
```bash
npm run dev
```

Build TypeScript:
```bash
npm run build
```

Start production build:
```bash
npm start
```

## ESP32 Integration

### Sending Data from ESP32

The ESP32 sends data to the GraphQL server via HTTP POST:

```c
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

void sendSensorData(float temperature, float humidity, float soilMoisture, float lightLevel) {
  HTTPClient http;
  http.begin("http://<YOUR_SERVER_IP>:4000/api/sensor-data");
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<200> doc;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["soilMoisture"] = soilMoisture;
  doc["lightLevel"] = lightLevel;

  String payload;
  serializeJson(doc, payload);

  int httpResponseCode = http.POST(payload);
  Serial.println("Response code: " + String(httpResponseCode));

  http.end();
}
```

## GraphQL Endpoints

### Query Latest Sensor Data

```graphql
query {
  latestSensorData {
    id
    temperature
    humidity
    soilMoisture
    lightLevel
    timestamp
  }
}
```

### Subscribe to Real-Time Updates

```graphql
subscription {
  sensorDataUpdated {
    id
    temperature
    humidity
    soilMoisture
    lightLevel
    timestamp
  }
}
```

## Angular Frontend Integration

### Installing Apollo Client

```bash
npm install @apollo/client graphql
```

### Example Service

```typescript
import { Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { WebSocketLink } from '@apollo/client/link/ws';

@Injectable({
  providedIn: 'root'
})
export class SensorService {
  constructor(private apollo: Apollo) {
    const wsLink = new WebSocketLink({
      uri: 'ws://localhost:4000/graphql',
      options: {
        reconnect: true,
      },
    });

    this.apollo = new Apollo({
      link: wsLink,
      cache: new InMemoryCache(),
    });
  }

  subscribeSensorData(): Observable<any> {
    return this.apollo.subscribe({
      query: gql`
        subscription {
          sensorDataUpdated {
            id
            temperature
            humidity
            soilMoisture
            lightLevel
            timestamp
          }
        }
      `,
    }).pipe(
      map(result => result.data.sensorDataUpdated)
    );
  }
}
```

## API Endpoints

### Health Check
- **GET** `http://localhost:4000/health`
- Returns server status

### GraphQL Playground
- **GET/POST** `http://localhost:4000/graphql`
- Interactive GraphQL IDE

### Receive Sensor Data from ESP32
- **POST** `http://localhost:4000/api/sensor-data`
- Body:
  ```json
  {
    "temperature": 25.5,
    "humidity": 60.0,
    "soilMoisture": 45.0,
    "lightLevel": 800.0
  }
  ```

## Environment Variables

Edit `.env` file:

```
PORT=4000
NODE_ENV=development
```

## Troubleshooting

**WebSocket Connection Failed:**
- Ensure your Angular app connects to the correct WebSocket URL
- Check that the server is running on the correct port

**CORS Issues:**
- Update the CORS origin in `src/index.ts` to match your Angular app domain

**ESP32 Cannot Connect:**
- Verify ESP32 and server are on the same network
- Use the server's IP address instead of localhost
- Check firewall settings

## License

MIT
