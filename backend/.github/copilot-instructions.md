# Smart Greenhouse Backend - Copilot Instructions

## Project Overview

This is a Node.js TypeScript GraphQL server for real-time ESP32 sensor data streaming to an Angular frontend. The server receives sensor data from an ESP32 via HTTP/WiFi and broadcasts it to connected Angular clients via GraphQL subscriptions over WebSocket.

## Project Status

✅ **Completed Setup:**
- Express.js server with TypeScript
- Apollo GraphQL server with WebSocket support
- HTTP endpoint for ESP32 data ingestion
- GraphQL schema and resolvers
- Real-time subscription system (PubSub)
- Development environment ready

## Core Architecture

### Tech Stack
- **Runtime:** Node.js
- **Language:** TypeScript
- **API:** GraphQL (Apollo Server)
- **Real-time:** WebSocket subscriptions
- **HTTP Server:** Express.js
- **Data Structure:** In-memory sensor data store

### Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Main server entry point, Express + Apollo setup |
| `src/schema.ts` | GraphQL type definitions |
| `src/resolvers.ts` | GraphQL resolvers and business logic |
| `src/pubsub.ts` | GraphQL subscriptions (PubSub) |
| `src/types.ts` | TypeScript interfaces |
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript configuration |

## API Endpoints

### REST API
- **POST** `/api/sensor-data` - Receive sensor data from ESP32
- **GET** `/health` - Health check endpoint

### GraphQL
- **GET/POST** `/graphql` - GraphQL playground and queries
- **WebSocket** `ws://localhost:4000/graphql` - Subscriptions

## Running the Server

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Watch TypeScript Changes
```bash
npm run watch
```

## ESP32 Integration

### Sending Data to Server

**C++ Code for ESP32:**
```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

void sendSensorData(float temperature, float humidity, float soilMoisture, float lightLevel) {
  if(WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin("http://<SERVER_IP>:4000/api/sensor-data");
    http.addHeader("Content-Type", "application/json");
    
    StaticJsonDocument<200> doc;
    doc["temperature"] = temperature;
    doc["humidity"] = humidity;
    doc["soilMoisture"] = soilMoisture;
    doc["lightLevel"] = lightLevel;
    
    String payload;
    serializeJson(doc, payload);
    
    int httpResponseCode = http.POST(payload);
    if(httpResponseCode == 200) {
      Serial.println("Data sent successfully");
    }
    http.end();
  }
}
```

**Expected JSON Payload:**
```json
{
  "temperature": 25.5,
  "humidity": 60.0,
  "soilMoisture": 45.0,
  "lightLevel": 800.0
}
```

## GraphQL Usage

### Query Latest Data
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

### Query Data History (last 100 records)
```graphql
query {
  sensorData {
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

### Install Apollo Client
```bash
npm install @apollo/client graphql
```

### Service Example
```typescript
import { Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { WebSocketLink } from '@apollo/client/link/ws';
import { InMemoryCache } from '@apollo/client/cache';

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

## Configuration

### Environment Variables
Create a `.env` file:
```
PORT=4000
NODE_ENV=development
```

### CORS Settings
Currently allows all origins. To restrict to specific frontend:
Edit `src/index.ts` line ~20:
```typescript
res.header('Access-Control-Allow-Origin', 'http://localhost:4200'); // Your Angular app URL
```

## Troubleshooting

### ESP32 Cannot Connect
1. Verify ESP32 and server are on same network
2. Use server's IP address instead of localhost
3. Check firewall allows port 4000
4. Test with: `curl -X POST http://<SERVER_IP>:4000/api/sensor-data -H "Content-Type: application/json" -d '{"temperature":25,"humidity":60,"soilMoisture":45,"lightLevel":800}'`

### WebSocket Connection Failed
1. Ensure WebSocket port is accessible
2. Check browser console for specific error
3. Verify GraphQL endpoint URL in Angular app

### CORS Issues
Update the CORS origin in `src/index.ts` to match your Angular app domain

## Future Enhancements

- [ ] Database persistence (MongoDB/PostgreSQL)
- [ ] Authentication/Authorization
- [ ] Data validation with Joi/Zod
- [ ] Error logging and monitoring
- [ ] Data aggregation and statistics
- [ ] Export to CSV/PDF reports
- [ ] Multiple sensor support
- [ ] Alert/notification system

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start dev server with auto-reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run start` | Run production build |
| `npm run watch` | Watch TypeScript changes |
| `npm install` | Install all dependencies |

## Notes for Future Development

- **Data Storage:** Currently using in-memory array. For production, integrate a database.
- **Scaling:** Consider adding Redis for pub/sub if handling many concurrent connections.
- **Validation:** Implement schema validation for incoming ESP32 data.
- **Authentication:** Add JWT or API key authentication for ESP32 endpoints.
- **Logging:** Implement proper logging system (Winston/Bunyan).
