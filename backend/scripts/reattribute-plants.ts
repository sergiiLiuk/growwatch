/**
 * Reattribute ALL plants in the database to a single target user (by email).
 * Useful when previous superusers were deleted and plant rows still point at
 * their old _id, so the GraphQL `plants` query returns nothing.
 *
 * Usage (dry-run, prints what would change):
 *   cd backend
 *   npx ts-node scripts/reattribute-plants.ts super
 *
 * Apply changes:
 *   npx ts-node scripts/reattribute-plants.ts super --yes
 *
 * Targets whichever MONGODB_URI is in your environment. To run against
 * production, set the env var first:
 *   $env:MONGODB_URI="<railway-mongo-uri>"
 *   npx ts-node scripts/reattribute-plants.ts super --yes
 */
import { connectDB } from '../src/db';
import { Plant, User } from '../src/models';
import mongoose from 'mongoose';

async function main() {
    const args = process.argv.slice(2);
    const apply = args.includes('--yes');
    const email = args.find(a => !a.startsWith('--'));

    if (!email) {
        console.log('Usage: npx ts-node scripts/reattribute-plants.ts <email> [--yes]');
        process.exit(1);
    }

    const uri = process.env.MONGODB_URI || '<no MONGODB_URI>';
    console.log(`🗄️  DB: ${uri.replace(/\/\/[^:]+:[^@]+@/, '//<creds-hidden>@')}`);
    console.log(`🎯 Target user: ${email}\n`);

    await connectDB();

    const target = await User.findOne({ email });
    if (!target) {
        console.error(`❌ No user with email "${email}". Existing users:`);
        const users = await User.find({}, { email: 1, role: 1 }).lean();
        users.forEach(u => console.error(`     - ${u.email} (${u.role})`));
        process.exit(1);
    }
    const targetId = target._id.toString();
    console.log(`✅ Target user _id: ${targetId}\n`);

    const plants = await Plant.find({}).lean();
    const mismatched = plants.filter(p => p.userId !== targetId);
    console.log(`📦 ${plants.length} plant(s) total, ${mismatched.length} need reattribution:\n`);
    for (const p of mismatched) {
        console.log(`     - ${p.name.padEnd(20)} ${String(p.type).padEnd(12)} userId=${p.userId ?? '(none)'}`);
    }

    if (!apply) {
        console.log('\n⚠️  Dry-run. Re-run with --yes to apply.');
        await mongoose.disconnect();
        process.exit(0);
    }

    if (mismatched.length === 0) {
        console.log('\n✅ Nothing to change.');
        await mongoose.disconnect();
        process.exit(0);
    }

    const result = await Plant.updateMany(
        { _id: { $in: mismatched.map(p => p._id) } },
        { $set: { userId: targetId } }
    );
    console.log(`\n✅ Updated ${result.modifiedCount} plant(s).`);

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
