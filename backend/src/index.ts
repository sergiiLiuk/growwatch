import express, { Express, Request, Response } from 'express';
import { ApolloServer } from 'apollo-server-express';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { createServer } from 'http';
import { typeDefs } from './schema';
import { resolvers, handleSensorData, startHourlyAggregation, saveHourlyData, initPlantCache } from './resolvers';
import { ESP32Message } from './types';
import { connectDB } from './db';

const PORT = Number(process.env.PORT) || 4000;

async function startServer() {
    await connectDB();
    await initPlantCache();
    startHourlyAggregation();

    const app: Express = express();
    const httpServer = createServer(app);

    app.use(express.json());

    // ─── ESP32 endpoint ───────────────────────────────────────────────────────
    app.post('/api/sensor-data', (req: Request, res: Response) => {
        try {
            const data: ESP32Message = req.body;
            const result = handleSensorData(data);

            console.log(`📥 ESP32: light=${result.lightLevel}lux${
                result.temperature !== undefined ? ` temp=${result.temperature}°C` : ''
            }${
                result.humidity !== undefined ? ` hum=${result.humidity}%` : ''
            }`);

            res.json({ success: true, data: result });
        } catch (error) {
            console.error('❌ Error processing sensor data:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ─── Health check ─────────────────────────────────────────────────────────
    app.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // ─── Manual hourly save (testing only) ───────────────────────────────────
    app.post('/api/save-hourly', async (_req: Request, res: Response) => {
        try {
            await saveHourlyData();
            res.json({ success: true, message: 'Hourly data saved' });
        } catch (error) {
            console.error('❌ Error saving hourly data:', error);
            res.status(500).json({ error: 'Failed to save hourly data' });
        }
    });

    // ─── GraphQL ──────────────────────────────────────────────────────────────
    const schema = makeExecutableSchema({ typeDefs, resolvers });

    const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
    useServer({ schema }, wsServer);

    const apolloServer = new ApolloServer({ schema });
    await apolloServer.start();
    apolloServer.applyMiddleware({ app: app as any, path: '/graphql', cors: { origin: true, credentials: true } });

    // ─── Start ────────────────────────────────────────────────────────────────
    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📊 GraphQL:  http://localhost:${PORT}/graphql`);
        console.log(`📨 ESP32:    POST http://localhost:${PORT}/api/sensor-data`);
        console.log(`❤️  Health:   http://localhost:${PORT}/health`);
    });
}

startServer().catch((err) => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
});
