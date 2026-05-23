/**
 * Wipe all collections from the configured MongoDB. Destructive — requires --yes.
 *
 * Usage:
 *   cd backend
 *   npx ts-node scripts/clear-db.ts --yes
 *
 * Targets whichever MONGODB_URI is in your .env. Verify before running.
 */
import { connectDB } from '../src/db';
import { User, Plant, HourlySensorData, Device } from '../src/models';
import mongoose from 'mongoose';

async function main() {
    const confirmed = process.argv.includes('--yes');

    const uri = process.env.MONGODB_URI || '<no MONGODB_URI set>';
    const dbName = uri.replace(/^.*\//, '').replace(/\?.*$/, '');
    console.log(`🗄️  Target database: ${dbName}`);
    console.log(`   URI: ${uri.replace(/\/\/[^:]+:[^@]+@/, '//<creds-hidden>@')}`);

    if (!confirmed) {
        console.log('');
        console.log('⚠️  This will DELETE all users, plants, hourly data, and devices.');
        console.log('   Re-run with --yes to confirm:');
        console.log('   npx ts-node scripts/clear-db.ts --yes');
        process.exit(1);
    }

    await connectDB();
    const [users, plants, hourly, devices] = await Promise.all([
        User.deleteMany({}),
        Plant.deleteMany({}),
        HourlySensorData.deleteMany({}),
        Device.deleteMany({}),
    ]);
    console.log(`🧹 Cleared:`);
    console.log(`     ${users.deletedCount}  users`);
    console.log(`     ${plants.deletedCount}  plants`);
    console.log(`     ${hourly.deletedCount}  hourly records`);
    console.log(`     ${devices.deletedCount}  devices`);

    await mongoose.disconnect();
    console.log('✅ Done. Restart the backend — superuser will be re-seeded automatically.');
    process.exit(0);
}

main().catch((err) => {
    console.error('❌ Failed to clear DB:', err);
    process.exit(1);
});
