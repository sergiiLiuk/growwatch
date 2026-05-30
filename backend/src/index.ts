import express, { Express, Request, Response } from 'express';
import { ApolloServer } from 'apollo-server-express';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { createServer } from 'http';
import { typeDefs } from './schema';
import { resolvers, handleSensorData, startHourlyAggregation, saveHourlyData, initPlantCache, setSuperuserId, setLlmProvider } from './resolvers';
import { StubLlmProvider } from './services/smartTip';
import { ClaudeLlmProvider } from './services/claudeLlmProvider';
import { startSmartTipScheduler } from './services/smartTipScheduler';
import { ESP32Message } from './types';
import { connectDB } from './db';
import { User, Plant, HourlySensorData } from './models';
import { hashPassword, verifyToken } from './auth';

const PORT = Number(process.env.PORT) || 4000;

async function seedAndMigrate(): Promise<string> {
    // Auto-seed the superuser if missing
    let superuser = await User.findOne({ email: 'super' });
    if (!superuser) {
        const passwordHash = await hashPassword('test1234!');
        superuser = await User.create({ email: 'super', passwordHash, role: 'superuser' });
        console.log('🌱 Superuser created (email: super, password: test1234!)');
    }

    const superuserId = superuser._id.toString();

    // Keep the seeded superuser on pro tier so dev/testing always has full access
    if (superuser.subscriptionTier !== 'pro') {
        superuser.subscriptionTier = 'pro';
        await superuser.save();
        console.log('🌱 Superuser tier set to pro');
    }

    // Backfill pre-existing users (no subscriptionTier field) to free
    const tierMigrated = await User.updateMany(
        { subscriptionTier: { $exists: false } },
        { $set: { subscriptionTier: 'free' } },
    );
    if (tierMigrated.modifiedCount > 0) {
        console.log(`🔄 Backfilled ${tierMigrated.modifiedCount} users → free tier`);
    }

    // Attribute legacy records that have no userId to the superuser
    const [hourlyMigrated, plantsMigrated] = await Promise.all([
        HourlySensorData.updateMany({ userId: { $exists: false } }, { $set: { userId: superuserId } }),
        Plant.updateMany({ userId: { $exists: false } }, { $set: { userId: superuserId } }),
    ]);
    if (hourlyMigrated.modifiedCount > 0)
        console.log(`🔄 Migrated ${hourlyMigrated.modifiedCount} hourly records → superuser`);
    if (plantsMigrated.modifiedCount > 0)
        console.log(`🔄 Migrated ${plantsMigrated.modifiedCount} plant records → superuser`);

    // The old schema had `hour: { unique: true }` — drop that legacy single-column index if it
    // still exists, so the new compound (userId, hour) index can coexist without conflict.
    try {
        const indexes = await HourlySensorData.collection.indexes();
        const oldHourIndex = indexes.find((i: any) => i.key && i.key.hour === 1 && Object.keys(i.key).length === 1 && i.unique);
        if (oldHourIndex && oldHourIndex.name) {
            await HourlySensorData.collection.dropIndex(oldHourIndex.name);
            console.log(`🗑️  Dropped legacy unique index ${oldHourIndex.name} on hour`);
        }
    } catch (err) {
        // Non-fatal — the index might not exist on a fresh DB, or already be gone
        console.warn('⚠️  Could not check/drop legacy hour index:', (err as Error).message);
    }

    return superuserId;
}

async function startServer() {
    await connectDB();
    await initPlantCache();

    const superuserId = await seedAndMigrate();
    setSuperuserId(superuserId);

    startHourlyAggregation();

    // ─── Smart tips: choose provider + start scheduler ─────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
        setLlmProvider(new ClaudeLlmProvider({ apiKey }));
        console.log(`✨ Smart tips using Claude (claude-haiku-4-5)`);
    } else {
        setLlmProvider(new StubLlmProvider());
        console.log('✨ Smart tips using stub provider (set ANTHROPIC_API_KEY for Claude)');
    }
    startSmartTipScheduler();

    const app: Express = express();
    const httpServer = createServer(app);

    app.use(express.json());

    // ─── ESP32 endpoint ──
    // Routing rules:
    //   1) If payload includes `deviceId` (MAC) and a Device row matches → attribute to its user
    //   2) Else if exactly one user has an open claim window → bind this MAC to them
    //   3) Else reject with 401
    app.post('/api/sensor-data', async (req: Request, res: Response) => {
        try {
            const data: ESP32Message = req.body;
            const result = await handleSensorData(data);

            if (!result) {
                return res.status(401).json({
                    error: 'Unknown device. Open a device claim from the GrowWatch app or contact admin.',
                });
            }

            console.log(`📥 ESP32: light=${result.lightLevel}lux${
                result.temperature !== undefined ? ` temp=${result.temperature}°C` : ''
            }${
                result.humidity !== undefined ? ` hum=${result.humidity}%` : ''
            }${
                result.deviceId ? ` device=${result.deviceId.slice(-6)}` : ''
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

    const apolloServer = new ApolloServer({
        schema,
        context: ({ req }: { req: Request }) => {
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) return { user: null };
            try {
                const user = verifyToken(authHeader.slice(7));
                return { user };
            } catch {
                return { user: null };
            }
        },
    });
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
