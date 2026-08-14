import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import pg from 'pg';

const { Client } = pg;
const databaseDirectory = path.dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is required. See database/.env.example.');
  process.exit(1);
}

async function connect() {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

async function sqlFiles(directory) {
  return (await fs.readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => path.join(directory, name));
}

async function executeFile(client, file) {
  console.log(`Running ${path.relative(process.cwd(), file)}...`);
  await client.query(await fs.readFile(file, 'utf8'));
}

async function setup() {
  const client = await connect();
  try {
    for (const file of await sqlFiles(path.join(databaseDirectory, 'migrations'))) {
      await executeFile(client, file);
    }
    await executeFile(client, path.join(databaseDirectory, 'seeds', 'seed.sql'));
    console.log('Database schema and demo data are ready.');
  } finally {
    await client.end();
  }
}

async function expectFailure(client, name, operation) {
  await client.query('BEGIN');
  try {
    await operation();
    throw new Error(`${name}: expected PostgreSQL to reject this operation`);
  } catch (error) {
    if (error.message.endsWith('expected PostgreSQL to reject this operation')) throw error;
    if (!['23503', '23505', '23514', '23P01'].includes(error.code)) throw error;
    console.log(`PASS expected rejection: ${name} (${error.code})`);
  } finally {
    await client.query('ROLLBACK');
  }
}

async function tests() {
  const client = await connect();
  try {
    const seeded = await client.query('SELECT count(*)::int AS count FROM users');
    if (seeded.rows[0].count < 10) throw new Error('Demo data is missing. Run npm run db:setup against an empty database first.');

    await expectFailure(client, 'duplicate email', () => client.query(
      "INSERT INTO users (auth_user_id, name, email) VALUES ('20000000-0000-4000-8000-000000000001', 'Duplicate', 'aarav.sharma@youruniversity.edu')"));
    await expectFailure(client, 'non-campus email', () => client.query(
      "INSERT INTO users (auth_user_id, name, email) VALUES ('20000000-0000-4000-8000-000000000002', 'Outside', 'outside@example.com')"));
    await expectFailure(client, 'invalid listing type', () => client.query(
      "INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (1, 1, 'Bad', 'GIFT', 1)"));
    await expectFailure(client, 'negative SELL price', () => client.query(
      "INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (1, 1, 'Bad', 'SELL', -1)"));
    await expectFailure(client, 'priced BORROW listing', () => client.query(
      "INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (1, 1, 'Bad', 'BORROW', 1)"));
    await expectFailure(client, 'missing SELL price', () => client.query(
      "INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (1, 1, 'Bad', 'SELL', NULL)"));
    await expectFailure(client, 'missing owner foreign key', () => client.query(
      "INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (999999, 1, 'Bad', 'SELL', 1)"));
    await expectFailure(client, 'invalid booking period', () => client.query(
      "INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (2, 1, '2027-11-02 10:00+00', '2027-11-02 10:00+00')"));
    await expectFailure(client, 'borrowing SELL listing', () => client.query(
      "INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (3, 1, '2027-11-02 10:00+00', '2027-11-03 10:00+00')"));
    await expectFailure(client, 'overlapping booking', () => client.query(
      "INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (2, 1, '2027-08-16 10:00+00', '2027-08-18 10:00+00')"));
    await expectFailure(client, 'identical booking range', () => client.query(
      "INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (2, 1, '2027-08-15 10:00+00', '2027-08-17 10:00+00')"));
    await expectFailure(client, 'invalid listing status', () => client.query(
      "INSERT INTO listings (owner_id, category_id, title, type, price, status) VALUES (1, 1, 'Bad', 'SELL', 1, 'ARCHIVED')"));

    await client.query('BEGIN');
    try {
      await client.query("INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (2, 9, '2027-08-19 10:00+00', '2027-08-20 10:00+00')");
      const before = await client.query('SELECT updated_at FROM listings WHERE listing_id = 3');
      await client.query("UPDATE listings SET description = 'temporary trigger test' WHERE listing_id = 3");
      const after = await client.query('SELECT updated_at FROM listings WHERE listing_id = 3');
      if (after.rows[0].updated_at < before.rows[0].updated_at) throw new Error('updated_at did not advance');
      console.log('PASS adjacent booking and updated_at trigger');
    } finally {
      await client.query('ROLLBACK');
    }
    console.log('All JavaScript integrity tests passed.');
  } finally {
    await client.end();
  }
}

function printRows(rows) {
  console.table(rows);
}

async function askNumber(rl, label) {
  const input = await rl.question(label);
  const value = Number(input);
  if (!Number.isInteger(value) || value < 1) throw new Error('Enter a positive numeric ID.');
  return value;
}

async function cli() {
  const client = await connect();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\nCampus Marketplace database CLI — demo data should be loaded with npm run db:setup.');
    for (;;) {
      console.log('\n1) Active listings  2) Listing details  3) Book item  4) Return/cancel booking');
      console.log('5) Purchase item  6) Complete transaction  7) Transaction history  8) List users  0) Exit');
      const choice = (await rl.question('Choose an operation: ')).trim();
      try {
        if (choice === '0') break;
        if (choice === '1') {
          const result = await client.query("SELECT l.listing_id, l.title, l.type, l.price, c.name AS category, u.name AS owner FROM listings l JOIN categories c USING (category_id) JOIN users u ON u.user_id = l.owner_id WHERE l.status = 'ACTIVE' ORDER BY l.listing_id");
          printRows(result.rows);
        } else if (choice === '2') {
          const listingId = await askNumber(rl, 'Listing ID: ');
          const result = await client.query("SELECT l.*, c.name AS category, u.name AS owner, COALESCE(json_agg(li.image_url) FILTER (WHERE li.image_id IS NOT NULL), '[]') AS images FROM listings l JOIN categories c USING (category_id) JOIN users u ON u.user_id = l.owner_id LEFT JOIN listing_images li ON li.listing_id = l.listing_id WHERE l.listing_id = $1 GROUP BY l.listing_id, c.name, u.name", [listingId]);
          printRows(result.rows);
        } else if (choice === '3') {
          const listingId = await askNumber(rl, 'BORROW listing ID: ');
          const borrowerId = await askNumber(rl, 'Borrower user ID: ');
          const start = await rl.question('Start time (ISO, e.g. 2027-10-01T10:00:00Z): ');
          const end = await rl.question('End time (ISO, e.g. 2027-10-03T10:00:00Z): ');
          await client.query('BEGIN');
          try {
            await client.query('SELECT listing_id FROM listings WHERE listing_id = $1 FOR UPDATE', [listingId]);
            const result = await client.query('INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES ($1, $2, $3, $4) RETURNING borrowing_id, status', [listingId, borrowerId, start, end]);
            await client.query('COMMIT');
            printRows(result.rows);
          } catch (error) { await client.query('ROLLBACK'); throw error; }
        } else if (choice === '4') {
          const borrowingId = await askNumber(rl, 'Borrowing ID: ');
          const status = (await rl.question('RETURNED or CANCELLED: ')).trim().toUpperCase();
          if (!['RETURNED', 'CANCELLED'].includes(status)) throw new Error('Status must be RETURNED or CANCELLED.');
          printRows((await client.query('UPDATE borrowings SET status = $1 WHERE borrowing_id = $2 RETURNING borrowing_id, status', [status, borrowingId])).rows);
        } else if (choice === '5') {
          const listingId = await askNumber(rl, 'ACTIVE SELL listing ID: ');
          const buyerId = await askNumber(rl, 'Buyer user ID: ');
          await client.query('BEGIN');
          try {
            const listing = await client.query("SELECT listing_id, owner_id, price, type, status FROM listings WHERE listing_id = $1 FOR UPDATE", [listingId]);
            if (listing.rowCount !== 1 || listing.rows[0].type !== 'SELL' || listing.rows[0].status !== 'ACTIVE') throw new Error('Listing must be an ACTIVE SELL listing.');
            const row = listing.rows[0];
            const result = await client.query('INSERT INTO transactions (listing_id, buyer_id, seller_id, amount) VALUES ($1, $2, $3, $4) RETURNING transaction_id, status, amount', [row.listing_id, buyerId, row.owner_id, row.price]);
            await client.query("UPDATE listings SET status = 'SOLD' WHERE listing_id = $1", [listingId]);
            await client.query('COMMIT');
            printRows(result.rows);
          } catch (error) { await client.query('ROLLBACK'); throw error; }
        } else if (choice === '6') {
          const transactionId = await askNumber(rl, 'Transaction ID: ');
          printRows((await client.query("UPDATE transactions SET status = 'COMPLETED', completed_at = NOW() WHERE transaction_id = $1 AND status = 'PENDING' RETURNING transaction_id, status, completed_at", [transactionId])).rows);
        } else if (choice === '7') {
          printRows((await client.query('SELECT t.transaction_id, l.title, buyer.name AS buyer, seller.name AS seller, t.amount, t.status, t.created_at, t.completed_at FROM transactions t JOIN listings l USING (listing_id) JOIN users buyer ON buyer.user_id = t.buyer_id JOIN users seller ON seller.user_id = t.seller_id ORDER BY t.created_at DESC')).rows);
        } else if (choice === '8') {
          printRows((await client.query('SELECT user_id, name, email, created_at FROM users ORDER BY user_id')).rows);
        } else {
          console.log('Unknown menu option.');
        }
      } catch (error) {
        console.error(`Operation rejected: ${error.message}`);
      }
    }
  } finally {
    rl.close();
    await client.end();
  }
}

const command = process.argv[2];
if (command === 'setup') await setup();
else if (command === 'test') await tests();
else if (command === 'cli') await cli();
else {
  console.error('Usage: node database/run.js <setup|test|cli>');
  process.exitCode = 1;
}
