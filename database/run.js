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

// connect to the PostgreSQL database using the DATABASE_URL from the environment
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

// run all migration files in order, then load the demo data
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

// run an operation that is expected to fail, then roll it back so the test
// does not leave any invalid data behind
async function expectFailure(client, name, operation) {
  await client.query('BEGIN');
  try {
    await operation();
    throw new Error(`${name}: expected PostgreSQL to reject this operation`);
  } catch (error) {
    if (error.message.endsWith('expected PostgreSQL to reject this operation')) throw error;
    if (!['23502', '23503', '23505', '23514', '23P01'].includes(error.code)) throw error;
    console.log(`PASS expected rejection: ${name} (${error.code})`);
  } finally {
    await client.query('ROLLBACK');
  }
}

async function tests() {
  const client = await connect();
  try {
    // make sure the seeded database is present before running the integrity tests
    const seeded = await client.query('SELECT count(*)::int AS count FROM users');
    if (seeded.rows[0].count < 10) {
      throw new Error('Demo data is missing. Run npm run db:setup against an empty database first.');
    }

    // test the database constraints by deliberately trying invalid operations
    await expectFailure(client, 'duplicate email', () => client.query(
      "INSERT INTO users (auth_user_id, name, email) VALUES ('20000000-0000-4000-8000-000000000001', 'Duplicate', 'aarav.sharma@thapar.edu')"
    ));

    await expectFailure(client, 'non-campus email', () => client.query(
      "INSERT INTO users (auth_user_id, name, email) VALUES ('20000000-0000-4000-8000-000000000002', 'Outside', 'outside@example.com')"
    ));

    await expectFailure(client, 'invalid listing type', () => client.query(
      "INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (1, 1, 'Bad', 'GIFT', 1)"
    ));

    await expectFailure(client, 'negative SELL price', () => client.query(
      "INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (1, 1, 'Bad', 'SELL', -1)"
    ));

    await expectFailure(client, 'priced BORROW listing', () => client.query(
      "INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (1, 1, 'Bad', 'BORROW', 1)"
    ));

    await expectFailure(client, 'BORROW listing missing price_per_day', () => client.query(
      "INSERT INTO listings (owner_id, category_id, title, type, price_per_day) VALUES (1, 1, 'Bad', 'BORROW', NULL)"
    ));

    await expectFailure(client, 'missing SELL price', () => client.query(
      "INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (1, 1, 'Bad', 'SELL', NULL)"
    ));

    await expectFailure(client, 'missing owner foreign key', () => client.query(
      "INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (999999, 1, 'Bad', 'SELL', 1)"
    ));

    await expectFailure(client, 'invalid booking period', () => client.query(
      "INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (2, 1, '2027-11-02 10:00+00', '2027-11-02 10:00+00')"
    ));

    await expectFailure(client, 'borrowing SELL listing', () => client.query(
      "INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (3, 1, '2027-11-02 10:00+00', '2027-11-03 10:00+00')"
    ));

    await expectFailure(client, 'owner borrowing own listing', () => client.query(
      "INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (2, 2, '2027-11-02 10:00+00', '2027-11-03 10:00+00')"
    ));

    await expectFailure(client, 'borrowing removed listing', () => client.query(
      "UPDATE listings SET status = 'REMOVED' WHERE listing_id = 12; INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (12, 1, '2027-11-02 10:00+00', '2027-11-03 10:00+00')"
    ));

    await expectFailure(client, 'direct BOOKED borrowing on insert', () => client.query(
      "INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time, status, responded_at) VALUES (12, 1, '2027-11-02 10:00+00', '2027-11-03 10:00+00', 'BOOKED', NOW())"
    ));

    // overlap is only checked for BOOKED/ACTIVE rows, so these two explicitly
    // request BOOKED (with responded_at set, satisfying borrowings_responded_at_check)
    // to actually exercise the exclusion constraint rather than a different check
    await expectFailure(client, 'overlapping BOOKED booking', () => client.query(
      "INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time, status, responded_at) VALUES (2, 1, '2027-08-16 10:00+00', '2027-08-18 10:00+00', 'BOOKED', NOW())"
    ));

    await expectFailure(client, 'identical BOOKED range', () => client.query(
      "INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time, status, responded_at) VALUES (2, 1, '2027-08-15 10:00+00', '2027-08-17 10:00+00', 'BOOKED', NOW())"
    ));

    await expectFailure(client, 'invalid listing status', () => client.query(
      "INSERT INTO listings (owner_id, category_id, title, type, price, status) VALUES (1, 1, 'Bad', 'SELL', 1, 'ARCHIVED')"
    ));

    await expectFailure(client, 'invalid borrowing status', () => client.query(
      "INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time, status) VALUES (2, 1, '2027-11-04 10:00+00', '2027-11-05 10:00+00', 'LOST')"
    ));

    await expectFailure(client, 'invalid transaction status', () => client.query(
      "INSERT INTO transactions (listing_id, buyer_id, seller_id, amount, status) VALUES (3, 1, 3, 700, 'PAID')"
    ));

    await expectFailure(client, 'edit listing price after creation', () => client.query(
      "UPDATE listings SET price = 1.00 WHERE listing_id = 3"
    ));

    await expectFailure(client, 'purchase request on own listing', () => client.query(
      'INSERT INTO purchase_requests (listing_id, buyer_id) VALUES (3, 3)'
    ));

    await expectFailure(client, 'purchase request on BORROW listing', () => client.query(
      'INSERT INTO purchase_requests (listing_id, buyer_id) VALUES (2, 1)'
    ));

    await expectFailure(client, 'direct ACCEPTED purchase request', () => client.query(
      "INSERT INTO purchase_requests (listing_id, buyer_id, status, responded_at) VALUES (3, 4, 'ACCEPTED', NOW())"
    ));

    await expectFailure(client, 'accept purchase request after listing removed', () => client.query(
      "UPDATE listings SET status = 'REMOVED' WHERE listing_id = 9; UPDATE purchase_requests SET status = 'ACCEPTED', responded_at = NOW() WHERE request_id = 7 AND status = 'PENDING'"
    ));

    await expectFailure(client, 'direct transaction without accepted request', () => client.query(
      "INSERT INTO transactions (purchase_request_id, listing_id, buyer_id, seller_id, amount) VALUES (999999, 3, 4, 3, 700)"
    ));

    await expectFailure(client, 'duplicate pending purchase request', () => client.query(
      'INSERT INTO purchase_requests (listing_id, buyer_id) VALUES (3, 4)'
    ));

    await expectFailure(client, 'review of a PENDING transaction', () => client.query(
      "INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating) VALUES (3, 8, 5, 5)"
    ));

    await expectFailure(client, 'review by someone not party to the deal', () => client.query(
      'INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating) VALUES (1, 9, 1, 5)'
    ));

    await expectFailure(client, 'duplicate review of the same deal', () => client.query(
      'INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating) VALUES (1, 2, 1, 1)'
    ));

    await expectFailure(client, 'invalid review update', () => client.query(
      'UPDATE reviews SET reviewer_id = 9 WHERE review_id = 1'
    ));

    await expectFailure(client, 'remove listing with active borrowing', () => client.query(
      "UPDATE listings SET status = 'REMOVED' WHERE listing_id = 2"
    ));

    await expectFailure(client, 'SOLD listing cannot become ACTIVE', () => client.query(
      "UPDATE listings SET status = 'ACTIVE' WHERE listing_id = 1"
    ));

    await client.query('BEGIN');
    try {
      // these operations should succeed: adjacent bookings are allowed,
      // borrow pricing is computed automatically, and the listing trigger
      // updates updated_at automatically
      const priced = await client.query(
        "INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (2, 9, '2027-08-19 10:00+00', '2027-08-20 10:00+00') RETURNING total_amount, status"
      );

      if (Number(priced.rows[0].total_amount) !== 60 || priced.rows[0].status !== 'PENDING') {
        throw new Error('borrowing was not auto-priced/defaulted as expected');
      }

      const before = await client.query(
        'SELECT updated_at FROM listings WHERE listing_id = 3'
      );

      await client.query(
        "UPDATE listings SET status = 'REMOVED' WHERE listing_id = 3"
      );

      const after = await client.query(
        'SELECT updated_at FROM listings WHERE listing_id = 3'
      );

      if (after.rows[0].updated_at < before.rows[0].updated_at) {
        throw new Error('updated_at did not advance');
      }

      console.log('PASS adjacent booking, auto-priced total_amount, and updated_at trigger');
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
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Enter a positive numeric ID.');
  }
  return value;
}

// interactive CLI for demonstrating the main database operations
// without having to write each query manually
async function cli() {
  const client = await connect();
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('\nCampus Marketplace database CLI — demo data should be loaded with npm run db:setup.');

    for (;;) {
      console.log('\n1) Active listings          2) Listing details');
      console.log('3) Request to borrow        4) Respond to borrow request');
      console.log('5) Return/cancel booking    6) Express interest to buy');
      console.log('7) Respond to purchase request  8) Complete transaction');
      console.log('9) Transaction history      10) Leave a review');
      console.log('11) List users              0) Exit');

      const choice = (await rl.question('Choose an operation: ')).trim();

      try {
        if (choice === '0') break;

        if (choice === '1') {
          const result = await client.query(
            "SELECT l.listing_id, l.title, l.type, l.price, l.price_per_day, c.name AS category, u.name AS owner FROM listings l JOIN categories c USING (category_id) JOIN users u ON u.user_id = l.owner_id WHERE l.status = 'ACTIVE' ORDER BY l.listing_id"
          );
          printRows(result.rows);

        } else if (choice === '2') {
          const listingId = await askNumber(rl, 'Listing ID: ');
          const result = await client.query(
            "SELECT l.*, c.name AS category, u.name AS owner, COALESCE(json_agg(li.image_url) FILTER (WHERE li.image_id IS NOT NULL), '[]') AS images FROM listings l JOIN categories c USING (category_id) JOIN users u ON u.user_id = l.owner_id LEFT JOIN listing_images li ON li.listing_id = l.listing_id WHERE l.listing_id = $1 GROUP BY l.listing_id, c.name, u.name",
            [listingId]
          );
          printRows(result.rows);

        } else if (choice === '3') {
          const listingId = await askNumber(rl, 'BORROW listing ID: ');
          const borrowerId = await askNumber(rl, 'Borrower user ID: ');
          const start = await rl.question('Start time (ISO, e.g. 2027-10-01T10:00:00Z): ');
          const end = await rl.question('End time (ISO, e.g. 2027-10-03T10:00:00Z): ');

          // total_amount is computed automatically from the listing's
          // price_per_day; the request starts PENDING until the owner responds
          printRows(
            (await client.query(
              'INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES ($1, $2, $3, $4) RETURNING borrowing_id, total_amount, status',
              [listingId, borrowerId, start, end]
            )).rows
          );

        } else if (choice === '4') {
          const borrowingId = await askNumber(rl, 'Borrowing ID: ');
          const decision = (await rl.question('ACCEPT or REJECT: ')).trim().toUpperCase();

          if (!['ACCEPT', 'REJECT'].includes(decision)) {
            throw new Error('Decision must be ACCEPT or REJECT.');
          }

          const newStatus = decision === 'ACCEPT' ? 'BOOKED' : 'REJECTED';

          // the no_overlapping_bookings exclusion constraint is what actually
          // rejects an ACCEPT if it would overlap an already-BOOKED period
          printRows(
            (await client.query(
              "UPDATE borrowings SET status = $1, responded_at = NOW() WHERE borrowing_id = $2 AND status = 'PENDING' RETURNING borrowing_id, status, total_amount",
              [newStatus, borrowingId]
            )).rows
          );

        } else if (choice === '5') {
          const borrowingId = await askNumber(rl, 'Borrowing ID: ');
          const status = (await rl.question('RETURNED or CANCELLED: ')).trim().toUpperCase();

          if (!['RETURNED', 'CANCELLED'].includes(status)) {
            throw new Error('Status must be RETURNED or CANCELLED.');
          }

          printRows(
            (await client.query(
              'UPDATE borrowings SET status = $1 WHERE borrowing_id = $2 RETURNING borrowing_id, status',
              [status, borrowingId]
            )).rows
          );

        } else if (choice === '6') {
          const listingId = await askNumber(rl, 'ACTIVE SELL listing ID: ');
          const buyerId = await askNumber(rl, 'Buyer user ID: ');

          // just records interest; nothing is committed until the seller accepts
          printRows(
            (await client.query(
              'INSERT INTO purchase_requests (listing_id, buyer_id) VALUES ($1, $2) RETURNING request_id, status',
              [listingId, buyerId]
            )).rows
          );

        } else if (choice === '7') {
          const requestId = await askNumber(rl, 'Purchase request ID: ');
          const decision = (await rl.question('ACCEPT or REJECT: ')).trim().toUpperCase();

          if (!['ACCEPT', 'REJECT'].includes(decision)) {
            throw new Error('Decision must be ACCEPT or REJECT.');
          }

          if (decision === 'REJECT') {
            printRows(
              (await client.query(
                "UPDATE purchase_requests SET status = 'REJECTED', responded_at = NOW() WHERE request_id = $1 AND status = 'PENDING' RETURNING request_id, status",
                [requestId]
              )).rows
            );
          } else {
            // accepting is kept atomic: mark the request ACCEPTED (which
            // auto-rejects any other pending requests on the same listing),
            // create the transaction, and mark the listing SOLD together
            await client.query('BEGIN');

            try {
              const request = await client.query(
                "UPDATE purchase_requests SET status = 'ACCEPTED', responded_at = NOW() WHERE request_id = $1 AND status = 'PENDING' RETURNING listing_id, buyer_id",
                [requestId]
              );

              if (request.rowCount !== 1) {
                throw new Error('Purchase request must exist and be PENDING.');
              }

              const { listing_id: listingId, buyer_id: buyerId } = request.rows[0];

              const listing = await client.query(
                'SELECT owner_id, price FROM listings WHERE listing_id = $1 FOR UPDATE',
                [listingId]
              );

              const result = await client.query(
                'INSERT INTO transactions (listing_id, buyer_id, seller_id, amount) VALUES ($1, $2, $3, $4) RETURNING transaction_id, status, amount',
                [listingId, buyerId, listing.rows[0].owner_id, listing.rows[0].price]
              );

              await client.query(
                "UPDATE listings SET status = 'SOLD' WHERE listing_id = $1",
                [listingId]
              );

              await client.query('COMMIT');
              printRows(result.rows);
            } catch (error) {
              await client.query('ROLLBACK');
              throw error;
            }
          }

        } else if (choice === '8') {
          const transactionId = await askNumber(rl, 'Transaction ID: ');

          printRows(
            (await client.query(
              "UPDATE transactions SET status = 'COMPLETED', completed_at = NOW() WHERE transaction_id = $1 AND status = 'PENDING' RETURNING transaction_id, status, completed_at",
              [transactionId]
            )).rows
          );

        } else if (choice === '9') {
          printRows(
            (await client.query(
              'SELECT t.transaction_id, l.title, buyer.name AS buyer, seller.name AS seller, t.amount, t.status, t.created_at, t.completed_at FROM transactions t JOIN listings l USING (listing_id) JOIN users buyer ON buyer.user_id = t.buyer_id JOIN users seller ON seller.user_id = t.seller_id ORDER BY t.created_at DESC'
            )).rows
          );

        } else if (choice === '10') {
          const dealType = (await rl.question('Review a (T)ransaction or (B)orrowing: ')).trim().toUpperCase();
          const reviewerId = await askNumber(rl, 'Reviewer user ID: ');
          const revieweeId = await askNumber(rl, 'Reviewee user ID: ');
          const rating = await askNumber(rl, 'Rating (1-5): ');
          const comment = await rl.question('Comment (optional): ');

          if (dealType === 'T') {
            const transactionId = await askNumber(rl, 'Transaction ID: ');
            printRows(
              (await client.query(
                'INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating, comment) VALUES ($1, $2, $3, $4, $5) RETURNING review_id, rating',
                [transactionId, reviewerId, revieweeId, rating, comment || null]
              )).rows
            );
          } else if (dealType === 'B') {
            const borrowingId = await askNumber(rl, 'Borrowing ID: ');
            printRows(
              (await client.query(
                'INSERT INTO reviews (borrowing_id, reviewer_id, reviewee_id, rating, comment) VALUES ($1, $2, $3, $4, $5) RETURNING review_id, rating',
                [borrowingId, reviewerId, revieweeId, rating, comment || null]
              )).rows
            );
          } else {
            throw new Error('Enter T for transaction or B for borrowing.');
          }

        } else if (choice === '11') {
          printRows(
            (await client.query(
              'SELECT user_id, name, email, contact_info, created_at FROM users ORDER BY user_id'
            )).rows
          );

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
