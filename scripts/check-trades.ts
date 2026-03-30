#!/usr/bin/env ts-node

import { Pool } from 'pg';
import { configManager } from '../src/config';

async function checkTrades() {
  console.log('\n📊 TRADE PROCESSING SUMMARY\n');

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
    const client = await pool.connect();
    
    try {
      // Get total trades
      const totalResult = await client.query('SELECT COUNT(*) FROM trades');
      console.log(`✅ Total trades logged: ${totalResult.rows[0].count}`);

      // Get processed trades
      const processedResult = await client.query('SELECT COUNT(*) FROM trades WHERE processed = true');
      console.log(`✅ Processed trades: ${processedResult.rows[0].count}\n`);

      // Get copy decisions breakdown
      const decisionsResult = await client.query(`
        SELECT should_copy, reason, COUNT(*) as count 
        FROM copy_decisions 
        GROUP BY should_copy, reason 
        ORDER BY count DESC
      `);
      
      console.log('📊 Copy decisions:');
      decisionsResult.rows.forEach((row: any) => {
        const emoji = row.should_copy ? '✅ COPY' : '❌ SKIP';
        console.log(`  ${emoji} (${row.reason || 'no reason'}): ${row.count}`);
      });

      // Get recent decisions
      const recentResult = await client.query(`
        SELECT * FROM copy_decisions 
        ORDER BY timestamp DESC 
        LIMIT 5
      `);
      
      console.log('\n🕐 Last 5 trade decisions:');
      recentResult.rows.forEach((row: any) => {
        const date = new Date(row.timestamp * 1000);
        const emoji = row.should_copy ? '✅ COPY' : '❌ SKIP';
        console.log(`  ${date.toLocaleString()}: ${emoji} - ${row.reason || 'no reason'}`);
      });

      // Get positions summary
      const positionsResult = await client.query(`
        SELECT status, COUNT(*) as count, 
               ROUND(SUM(COALESCE(pnl, 0))::numeric, 2) as total_pnl
        FROM positions 
        GROUP BY status
      `);
      
      if (positionsResult.rows.length > 0) {
        console.log('\n💼 Positions summary:');
        positionsResult.rows.forEach((row: any) => {
          console.log(`  ${row.status}: ${row.count} positions, PnL: $${row.total_pnl}`);
        });
      }

      console.log('');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Error checking trades:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkTrades().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
