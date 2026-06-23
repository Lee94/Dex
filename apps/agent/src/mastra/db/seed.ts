import type { InStatement } from '@libsql/client';
import { warehouse, WAREHOUSE_PATH } from './warehouse';

/**
 * Seeds the sample e-commerce warehouse (`warehouse.db`).
 *
 * Run with: `npm run seed`
 *
 * The dataset is small but realistic enough to answer questions like
 * "top products by revenue", "monthly revenue trend", "best customers",
 * "cancellation rate by category", etc. Order dates are spread across the last
 * ~180 days so questions about "last month" stay meaningful over time.
 */

// Deterministic PRNG so re-seeding produces a stable dataset.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const PRODUCTS = [
  { name: 'Aurora Wireless Headphones', category: 'Electronics', price: 129.99 },
  { name: 'Nimbus Bluetooth Speaker', category: 'Electronics', price: 79.5 },
  { name: 'Pulse Smartwatch', category: 'Electronics', price: 199.0 },
  { name: 'Quill Mechanical Keyboard', category: 'Electronics', price: 89.99 },
  { name: 'Hearth Ceramic Mug Set', category: 'Home', price: 34.0 },
  { name: 'Lumen Desk Lamp', category: 'Home', price: 49.99 },
  { name: 'Drift Linen Duvet', category: 'Home', price: 119.0 },
  { name: 'Trailhead Running Jacket', category: 'Apparel', price: 89.0 },
  { name: 'Summit Wool Beanie', category: 'Apparel', price: 24.5 },
  { name: 'Glide Everyday Sneakers', category: 'Apparel', price: 74.99 },
];

const FIRST_NAMES = ['Ava', 'Liam', 'Mia', 'Noah', 'Zoe', 'Kai', 'Ivy', 'Leo', 'Nora', 'Eli', 'Maya', 'Owen', 'Lena', 'Theo', 'Ruby'];
const LAST_NAMES = ['Chen', 'Patel', 'Garcia', 'Kim', 'Nguyen', 'Silva', 'Haddad', 'Olsen', 'Rossi', 'Tanaka'];
const COUNTRIES = ['United States', 'United Kingdom', 'Canada', 'Germany', 'Australia', 'Japan'];
const ORDER_STATUSES = ['completed', 'completed', 'completed', 'completed', 'cancelled', 'refunded', 'pending'];

const NUM_CUSTOMERS = 30;
const NUM_ORDERS = 280;

async function main(): Promise<void> {
  console.log(`Seeding warehouse at ${WAREHOUSE_PATH} ...`);

  // 1. Schema (idempotent: drop + recreate).
  await warehouse.batch(
    [
      'DROP TABLE IF EXISTS order_items',
      'DROP TABLE IF EXISTS orders',
      'DROP TABLE IF EXISTS products',
      'DROP TABLE IF EXISTS customers',
      `CREATE TABLE customers (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        country TEXT NOT NULL,
        signup_date TEXT NOT NULL
      )`,
      `CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL
      )`,
      `CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        order_date TEXT NOT NULL,
        status TEXT NOT NULL
      )`,
      `CREATE TABLE order_items (
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL
      )`,
    ],
    'write',
  );

  const inserts: InStatement[] = [];

  // 2. Products.
  PRODUCTS.forEach((p, i) => {
    inserts.push({
      sql: 'INSERT INTO products (id, name, category, price) VALUES (?, ?, ?, ?)',
      args: [i + 1, p.name, p.category, p.price],
    });
  });

  // 3. Customers.
  for (let id = 1; id <= NUM_CUSTOMERS; id++) {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${id}@example.com`;
    inserts.push({
      sql: 'INSERT INTO customers (id, name, email, country, signup_date) VALUES (?, ?, ?, ?, ?)',
      args: [id, name, email, pick(COUNTRIES), isoDaysAgo(randInt(180, 540))],
    });
  }

  // 4. Orders + order items.
  let itemId = 1;
  for (let orderId = 1; orderId <= NUM_ORDERS; orderId++) {
    const customerId = randInt(1, NUM_CUSTOMERS);
    inserts.push({
      sql: 'INSERT INTO orders (id, customer_id, order_date, status) VALUES (?, ?, ?, ?)',
      args: [orderId, customerId, isoDaysAgo(randInt(0, 180)), pick(ORDER_STATUSES)],
    });

    const lineCount = randInt(1, 4);
    const usedProducts = new Set<number>();
    for (let n = 0; n < lineCount; n++) {
      let productId = randInt(1, PRODUCTS.length);
      while (usedProducts.has(productId)) productId = randInt(1, PRODUCTS.length);
      usedProducts.add(productId);
      const product = PRODUCTS[productId - 1];
      inserts.push({
        sql: 'INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)',
        args: [itemId++, orderId, productId, randInt(1, 3), product.price],
      });
    }
  }

  await warehouse.batch(inserts, 'write');

  // 5. Summary so a successful seed is obvious.
  const summary = await warehouse.execute(`
    SELECT
      (SELECT COUNT(*) FROM customers)    AS customers,
      (SELECT COUNT(*) FROM products)     AS products,
      (SELECT COUNT(*) FROM orders)       AS orders,
      (SELECT COUNT(*) FROM order_items)  AS order_items,
      (SELECT ROUND(SUM(oi.quantity * oi.unit_price), 2)
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.status = 'completed')     AS completed_revenue
  `);
  console.log('Seed complete:', summary.rows[0]);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
