// One-time setup: creates the three Azure Tables required by the wheel strategy.
// Safe to run multiple times — existing tables are left untouched.
//
// Usage:
//   node scripts/createWheelTables.js

import 'dotenv/config';
import { TableServiceClient } from '@azure/data-tables';

const TABLES = ['wheelPositions', 'wheelCycles', 'wheelIncome'];

const connectionString =
  process.env.AZURE_STORAGE_CONNECTION_STRING ||
  process.env.AZURE_TABLE_CONNECTION_STRING ||
  process.env.AzureWebJobsStorage;

if (!connectionString) {
  console.error('Missing connection string. Set AZURE_STORAGE_CONNECTION_STRING in .env');
  process.exit(1);
}

const serviceClient = TableServiceClient.fromConnectionString(connectionString);

for (const table of TABLES) {
  try {
    await serviceClient.createTable(table);
    console.log(`  created   ${table}`);
  } catch (err) {
    if (err?.statusCode === 409) {
      console.log(`  exists    ${table}`);
    } else {
      console.error(`  FAILED    ${table} — ${err.message}`);
      process.exit(1);
    }
  }
}

console.log('Done.');
