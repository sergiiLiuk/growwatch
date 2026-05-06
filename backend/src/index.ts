import express, { Express, Request, Response } from 'express';
import { ApolloServer } from 'apollo-server-express';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { createServer } from 'http';
import { typeDefs } from './schema';
import { resolvers, handleSensorData } from './resolvers';
import { ESP32Message } from './types';

const PORT = process.env.PORT || 4000;

async function startServer() {
    const app = express();
    const httpServer = createServer(app);
    app.use(express.json());

    // Enable CORS for your Angular frontend
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header(
            'Access-Control-Allow-Headers',
            'Origin, X-Requested-With, Content-Type, Accept'
        );
        if (req.method === 'OPTIONS') {
            res.sendStatus(200);
        } else {
            next();
        }
    });

    // HTTP endpoint to receive data from ESP32
    app.post('/api/sensor-data', (req: Request, res: Response) => {
        try {
            const data: ESP32Message = req.body;

            // Validate required fields
            if (
                typeof data.temperature !== 'number' ||
                typeof data.humidity !== 'number' ||
                typeof data.soilMoisture !== 'number' ||
                typeof data.lightLevel !== 'number'
            ) {
                return res.status(400).json({
                    error: 'Invalid data. Required fields: temperature, humidity, soilMoisture, lightLevel',
                });
            }

            // Process the sensor data
            const sensorData = handleSensorData(data);

            res.json({
                success: true,
                data: sensorData,
            });
        } catch (error) {
            console.error('Error processing sensor data:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Health check endpoint
    app.get('/health', (req: Request, res: Response) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Create executable schema
    const schema = makeExecutableSchema({
        typeDefs,
        resolvers,
    });

    // Create WebSocket server for GraphQL subscriptions
    const wsServer = new WebSocketServer({
        server: httpServer,
        path: '/graphql',
    });

    useServer({ schema }, wsServer);

    // Create Apollo Server
    const apolloServer = new ApolloServer({
        schema,
    });

    await apolloServer.start();

    // Apply Apollo middleware
    apolloServer.applyMiddleware({ app: app as any, path: '/graphql' });

    // Start the server
    httpServer.listen(PORT, () => {
        console.log(`🚀 Server is running at http://localhost:${PORT}`);
        console.log(`📊 GraphQL endpoint at http://localhost:${PORT}/graphql`);
        console.log(`🔄 WebSocket subscriptions enabled`);
        console.log(`📨 ESP32 data endpoint: POST http://localhost:${PORT}/api/sensor-data`);
        console.log(`❤️  Health check: GET http://localhost:${PORT}/health`);
    });
}

startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
