#!/usr/bin/env ts-node

import { Pool } from 'pg';
import { configManager } from '../src/config';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function resetPaperTrading() {
  console.log('\n🔄 RESET PAPER TRADING DATA\n');
  console.log('⚠️  This will DELETE the following data:');
  console.log('   - All positions (open and closed)');
  console.log('   - All execution logs');
  console.log('   - All copy decisions');
  console.log('   - Mark all trades as unprocessed');
  console.log('\n📝 This is useful for:');
  console.log('   - Starting fresh with paper trading');
  console.log('   - Testing different strategies');
  console.log('   - Resetting after configuration changes\n');

  const answer = await question('Are you sure you want to reset? (yes/no): ');

  if (answer.toLowerCase() !== 'yes') {
    console.log('❌ Reset cancelled.');
    rl.close();
    return;
  }

  const databaseUrl = configManager.getDatabaseUrl();
  const requiresSsl = databaseUrl.includes('render.com') || 
                     databaseUrl.includes('amazonaws.com') ||
                     databaseUrl.includes('supabase.co') ||
                     process.env.NODE_ENV === 'production';

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: requiresSsl ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('\n🗑️  Deleting old data...');

    const client = await pool.connect();
    
    try {
      // Start transaction
      await client.query('BEGIN');

      // Delete positions
      const positionsResult = await client.query('DELETE FROM positions');
      console.log(`   ✅ Deleted ${positionsResult.rowCount} positions`);

      // Delete execution logs
      const executionResult = await client.query('DELETE FROM execution_log');
      console.log(`   ✅ Deleted ${executionResult.rowCount} execution logs`);

      // Delete copy decisions
      const decisionsResult = await client.query('DELETE FROM copy_decisions');
      console.log(`   ✅ Deleted ${decisionsResult.rowCount} copy decisions`);

      // Reset all trades to unprocessed
      const tradesResult = await client.query('UPDATE trades SET processed = FALSE');
      console.log(`   ✅ Reset ${tradesResult.rowCount} trades to unprocessed`);

      // Commit transaction
      await client.query('COMMIT');

      console.log('\n✨ Paper trading data has been reset successfully!');
      console.log('   You can now restart the bot with a clean slate.\n');
    } catch (error) {
      // Rollback on error
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Error resetting paper trading:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await pool.end();
    rl.close();
  }
}

resetPaperTrading().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
