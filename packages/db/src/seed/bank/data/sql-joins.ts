import type { DbDataset, DbQuestionInput } from '@hbe/shared';
import { topEarner } from '../../questions/db-questions.js';
import { CITIES, ds, int, md, nameOf, pick, rng, sqlQuestion, table } from './common.js';

const CATEGORIES = ['Books', 'Garden', 'Kitchen', 'Sports', 'Toys'];
interface Shop {
  customers: [number, string, string][];
  products: [number, string, string, number][];
  orders: [number, number, string][];
  items: [number, number, number][];
}

function shop(seed: number, o: { customers: number; products: number; orders: number; maxItems?: number; categories?: number; buyers?: number }): Shop {
  const r = rng(seed);
  const cats = CATEGORIES.slice(0, o.categories ?? 4);
  const customers = Array.from({ length: o.customers }, (_, i) => [i + 1, nameOf(i), pick(r, CITIES)] as [number, string, string]);
  const products = Array.from({ length: o.products }, (_, i) => {
    const c = i < cats.length ? cats[i]! : pick(r, cats);
    return [i + 1, `${c} item ${i + 1}`, c, int(r, 1, 400) * 5 + (r() < 0.3 ? 0.5 : 0)] as [number, string, string, number];
  });
  const buyers = Math.max(1, Math.min(o.customers, o.buyers ?? o.customers));
  const orders = Array.from({ length: o.orders }, (_, i) => [i + 1, int(r, 1, buyers), pick(r, ['paid', 'paid', 'paid', 'cancelled'])] as [number, number, string]);
  const items: [number, number, number][] = [];
  for (const [oid] of orders) {
    const used = new Set<number>();
    const k = int(r, 0, o.maxItems ?? 3);
    for (let j = 0; j < k && o.products > 0; j++) {
      const p = int(r, 1, o.products);
      if (used.has(p)) continue;
      used.add(p);
      items.push([oid, p, int(r, 1, 5)]);
    }
  }
  return { customers, products, orders, items };
}
const shopSql = (s: Shop) =>
  table('customers', 'id INT PRIMARY KEY, name VARCHAR(40) NOT NULL, city VARCHAR(30) NOT NULL', ['id', 'name', 'city'], s.customers) +
  table('products', 'id INT PRIMARY KEY, name VARCHAR(40) NOT NULL, category VARCHAR(20) NOT NULL, price DECIMAL(10,2) NOT NULL', ['id', 'name', 'category', 'price'], s.products) +
  table('orders', 'id INT PRIMARY KEY, customer_id INT NOT NULL REFERENCES customers (id), status VARCHAR(10) NOT NULL', ['id', 'customer_id', 'status'], s.orders) +
  table('order_items', 'order_id INT NOT NULL REFERENCES orders (id), product_id INT NOT NULL REFERENCES products (id), qty INT NOT NULL, PRIMARY KEY (order_id, product_id)', ['order_id', 'product_id', 'qty'], s.items);
const SCHEMA = [
  md('customers', [['id', 'INT (primary key)'], ['name', 'VARCHAR(40), unique'], ['city', 'VARCHAR(30)']]),
  md('products', [['id', 'INT (primary key)'], ['name', 'VARCHAR(40), unique'], ['category', 'VARCHAR(20)'], ['price', 'DECIMAL(10,2)']]),
  md('orders', [['id', 'INT (primary key)'], ['customer_id', 'INT → customers.id'], ['status', "VARCHAR(10): 'paid' or 'cancelled'"]]),
  md('order_items', [['order_id', 'INT → orders.id'], ['product_id', 'INT → products.id'], ['qty', 'INT ≥ 1'], ['', '(order_id, product_id) is the primary key']]),
].join('\n\n');
const STARTER = '-- customers(id, name, city), products(id, name, category, price),\n-- orders(id, customer_id, status), order_items(order_id, product_id, qty)\nSELECT\n';

/** A small hand-made shop for the samples. */
const SAMPLE: Shop = {
  customers: [[1, 'Asha', 'Pune'], [2, 'Ravi', 'Delhi'], [3, 'Meera', 'Agra']],
  products: [[1, 'Atlas', 'Books', 450], [2, 'Trowel', 'Garden', 199.5], [3, 'Kettle', 'Kitchen', 899], [4, 'Comic', 'Books', 120]],
  orders: [[1, 1, 'paid'], [2, 2, 'paid'], [3, 1, 'cancelled']],
  items: [[1, 1, 2], [1, 2, 1], [2, 1, 1], [2, 4, 3], [3, 3, 1]],
};
const SAMPLE2: Shop = {
  customers: [[1, 'Kiran', 'Kochi'], [2, 'Dev', 'Pune']],
  products: [[1, 'Ball', 'Sports', 300], [2, 'Bat', 'Sports', 1200]],
  orders: [[1, 2, 'paid']],
  items: [[1, 1, 2], [1, 2, 1]],
};
const shopHidden = (seed: number, sizes: Partial<Parameters<typeof shop>[1]>[]): DbDataset[] =>
  sizes.map((sz, i) => ds(shopSql(shop(seed + i, { customers: 8, products: 10, orders: 15, ...sz }))));

const orderCustomers = sqlQuestion({
  title: 'Orders With Customer Names',
  statement: 'Return every order\'s `id` as `order_id` and the name of the customer who placed it as `customer`, ordered by `order_id`.',
  difficulty: 'easy',
  tags: ['sql', 'joins', 'inner-join'],
  mode: 'query',
  schemaDisplay: SCHEMA,
  samples: [ds(shopSql(SAMPLE), 'Orders 1 and 3 belong to Asha, order 2 to Ravi.'), ds(shopSql(SAMPLE2), 'The only order belongs to Dev.')],
  hidden: shopHidden(1201, [{ orders: 1 }, { orders: 5, customers: 2 }, {}, { orders: 40, customers: 20 }, { orders: 100, customers: 30 }, { orders: 3, customers: 50 }, { orders: 200, customers: 5 }, { orders: 25, customers: 25 }]),
  solution: 'SELECT o.id AS order_id, c.name AS customer\nFROM orders o\nJOIN customers c ON c.id = o.customer_id\nORDER BY o.id;\n',
  starter: STARTER,
});

const withoutOrders = sqlQuestion({
  title: 'Customers Without Orders',
  statement: 'Return the `name` of every customer who has never placed an order (in any status), ordered by customer `id`.',
  difficulty: 'easy',
  tags: ['sql', 'joins', 'left-join', 'anti-join'],
  mode: 'query',
  schemaDisplay: SCHEMA,
  samples: [ds(shopSql(SAMPLE), 'Asha and Ravi have orders; Meera has none.'), ds(shopSql(SAMPLE2), 'Kiran has no orders.')],
  hidden: shopHidden(1211, [{ orders: 0 }, { orders: 10, customers: 3 }, { buyers: 4 }, { customers: 30, orders: 20, buyers: 10 }, { customers: 60, orders: 150 }, { customers: 1, orders: 1 }, { customers: 40, orders: 5 }, { customers: 12, orders: 30, buyers: 6 }]),
  solution: 'SELECT c.name\nFROM customers c\nWHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)\nORDER BY c.id;\n',
  starter: STARTER,
});

const neverOrdered = sqlQuestion({
  title: 'Products Never Ordered',
  statement: 'Return the `name` of every product that does not appear in any order item, ordered by product `id`.',
  difficulty: 'easy',
  tags: ['sql', 'joins', 'left-join'],
  mode: 'query',
  schemaDisplay: SCHEMA,
  samples: [ds(shopSql(SAMPLE), 'Every product appears in some order: no rows.'), ds(shopSql({ ...SAMPLE2, items: [[1, 2, 1]] }), 'Only the Bat was ordered, so the Ball is listed.')],
  hidden: shopHidden(1221, [{ orders: 0 }, { products: 30, orders: 5 }, {}, { products: 50, orders: 40 }, { products: 5, orders: 100 }, { products: 80, orders: 20, maxItems: 1 }, { products: 2, orders: 1 }, { products: 20, orders: 10 }]),
  solution: 'SELECT p.name\nFROM products p\nLEFT JOIN order_items i ON i.product_id = p.id\nWHERE i.product_id IS NULL\nORDER BY p.id;\n',
  starter: STARTER,
});

const orderCounts = sqlQuestion({
  title: 'Order Count per Customer',
  statement: 'Return every customer\'s `name` and their number of orders as `orders` — including customers with **0** orders — ordered by customer `id`.',
  difficulty: 'easy',
  tags: ['sql', 'joins', 'left-join', 'group-by'],
  mode: 'query',
  schemaDisplay: SCHEMA,
  samples: [ds(shopSql(SAMPLE), 'Asha 2, Ravi 1, Meera 0. `COUNT(*)` would wrongly give Meera 1 — count a column from orders.'), ds(shopSql(SAMPLE2), 'Kiran 0, Dev 1.')],
  hidden: shopHidden(1231, [{ orders: 0 }, { customers: 3, orders: 12 }, {}, { customers: 25, orders: 60, buyers: 15 }, { customers: 50, orders: 200 }, { customers: 1, orders: 4 }, { customers: 30, orders: 3 }, { customers: 10, orders: 50, buyers: 2 }]),
  solution: 'SELECT c.name, COUNT(o.id) AS orders\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id\nGROUP BY c.id, c.name\nORDER BY c.id;\n',
  starter: STARTER,
});

const orderTotals = sqlQuestion({
  title: 'Order Totals',
  statement: 'For every order that has at least one item, return `order_id` and its `total` — the sum of `qty × price` over its items. Order by `total` (largest first), then `order_id`.',
  difficulty: 'moderate',
  tags: ['sql', 'joins', 'group-by', 'aggregates'],
  mode: 'query',
  schemaDisplay: SCHEMA,
  samples: [ds(shopSql(SAMPLE), 'Order 1: 2 × 450 + 199.50 = 1099.50; order 3: 899; order 2: 450 + 3 × 120 = 810.'), ds(shopSql(SAMPLE2), 'One order: 2 × 300 + 1200 = 1800.')],
  hidden: shopHidden(1241, [{ orders: 1 }, { orders: 10, maxItems: 1 }, {}, { orders: 50, products: 30 }, { orders: 150, products: 40, maxItems: 5 }, { orders: 5, products: 3 }, { orders: 30, maxItems: 0 }, { orders: 80, products: 15 }]),
  solution: 'SELECT o.id AS order_id, SUM(i.qty * p.price) AS total\nFROM orders o\nJOIN order_items i ON i.order_id = o.id\nJOIN products p ON p.id = i.product_id\nGROUP BY o.id\nORDER BY total DESC, o.id;\n',
  starter: STARTER,
});

const bestSellers = sqlQuestion({
  title: 'Best-Selling Product per Category',
  statement:
    'For each category in which at least one product was sold, return `category`, the product `name` with the largest total quantity sold (sum of `qty` over all order items, any order status) and that quantity as `qty`. Ties go to the product with the smaller `id`. Order by `category`.',
  difficulty: 'moderate',
  tags: ['sql', 'joins', 'subqueries', 'cte'],
  mode: 'query',
  schemaDisplay: SCHEMA,
  samples: [ds(shopSql(SAMPLE), 'Books: Atlas sold 3 and Comic 3 — a tie, so Atlas (id 1). Garden: Trowel 1. Kitchen: Kettle 1.'), ds(shopSql(SAMPLE2), 'Sports: Ball 2 beats Bat 1.')],
  hidden: shopHidden(1251, [{ orders: 1 }, { orders: 20, products: 4 }, {}, { orders: 60, products: 25, categories: 5 }, { orders: 150, products: 40, categories: 5 }, { orders: 10, products: 2, categories: 1 }, { orders: 40, maxItems: 1 }, { orders: 90, products: 12, categories: 3 }]),
  solution:
    'WITH sold AS (\n  SELECT p.id, p.name, p.category, SUM(i.qty) AS qty\n  FROM products p\n  JOIN order_items i ON i.product_id = p.id\n  GROUP BY p.id, p.name, p.category\n)\nSELECT s.category, s.name, s.qty\nFROM sold s\nWHERE NOT EXISTS (\n  SELECT 1 FROM sold t\n  WHERE t.category = s.category AND (t.qty > s.qty OR (t.qty = s.qty AND t.id < s.id))\n)\nORDER BY s.category;\n',
  starter: STARTER,
});

type Emp = [number, string, number | null, number];
const empSql = (rows: Emp[]) => table('employees', 'id INT PRIMARY KEY, name VARCHAR(40) NOT NULL, manager_id INT, salary INT NOT NULL', ['id', 'name', 'manager_id', 'salary'], rows);
function staff(seed: number, n: number, spread: number): Emp[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => [i + 1, nameOf(i), i === 0 ? null : int(r, 1, i), 30000 + int(r, 0, spread) * 1000]);
}
const moreThanManager = sqlQuestion({
  title: 'Employees Earning More Than Their Manager',
  statement: 'Each employee may have a manager (`manager_id`, another employee). Return `employee` and `manager` names for every employee who earns **more** than their manager, ordered by the employee\'s `id`.',
  difficulty: 'moderate',
  tags: ['sql', 'joins', 'self-join'],
  mode: 'query',
  schemaDisplay: md('employees', [['id', 'INT (primary key)'], ['name', 'VARCHAR(40), unique'], ['manager_id', 'INT → employees.id, NULL for the CEO'], ['salary', 'INT']]),
  samples: [
    ds(empSql([[1, 'Asha', null, 90000], [2, 'Ravi', 1, 95000], [3, 'Meera', 2, 60000], [4, 'Kiran', 2, 95000]]), 'Ravi earns more than Asha. Kiran equals Ravi, which is not more.'),
    ds(empSql([[1, 'Dev', null, 50000], [2, 'Lata', 1, 40000]]), 'Nobody out-earns their manager.'),
  ],
  hidden: [1261, 1262, 1263, 1264, 1265, 1266, 1267, 1268].map((s, i) => ds(empSql(staff(s, [1, 3, 10, 30, 60, 120, 20, 8][i]!, [10, 0, 50, 80, 100, 100, 5, 30][i]!)))),
  solution: 'SELECT e.name AS employee, m.name AS manager\nFROM employees e\nJOIN employees m ON m.id = e.manager_id\nWHERE e.salary > m.salary\nORDER BY e.id;\n',
  starter: '-- employees(id, name, manager_id, salary)\nSELECT\n',
});

const everyCategory = sqlQuestion({
  title: 'Customers Who Bought From Every Category',
  statement:
    'Return the `name` of each customer who has bought at least one product from **every** category that appears in `products` (orders of any status count), ordered by customer `id`.',
  difficulty: 'hard',
  tags: ['sql', 'joins', 'subqueries', 'relational-division'],
  mode: 'query',
  schemaDisplay: SCHEMA,
  samples: [ds(shopSql(SAMPLE), 'There are three categories. Asha bought Books, Garden and Kitchen; Ravi only Books.'), ds(shopSql(SAMPLE2), 'Only Sports exists, and Dev bought from it.')],
  hidden: shopHidden(1271, [{ orders: 0 }, { orders: 10, categories: 1 }, { orders: 30, categories: 2 }, { orders: 60, customers: 10, categories: 3, maxItems: 4 }, { orders: 200, customers: 20, categories: 4, maxItems: 5 }, { orders: 100, customers: 5, categories: 5, products: 8, maxItems: 5 }, { orders: 40, customers: 3, categories: 2 }, { orders: 80, customers: 15, categories: 3 }]),
  solution:
    'SELECT c.name\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nJOIN order_items i ON i.order_id = o.id\nJOIN products p ON p.id = i.product_id\nGROUP BY c.id, c.name\nHAVING COUNT(DISTINCT p.category) = (SELECT COUNT(DISTINCT category) FROM products)\nORDER BY c.id;\n',
  starter: STARTER,
});

const boughtTogether = sqlQuestion({
  title: 'Products Bought Together',
  statement:
    'Find pairs of different products that appear together in at least **two** orders. Return `product_a` and `product_b` (names; `product_a` is the one with the smaller id) and the number of orders containing both as `orders`. Order by `orders` (most first), then by the two product ids.',
  difficulty: 'hard',
  tags: ['sql', 'joins', 'self-join', 'group-by'],
  mode: 'query',
  schemaDisplay: SCHEMA,
  samples: [ds(shopSql({ ...SAMPLE, items: [...SAMPLE.items, [2, 2, 1]] }), 'Atlas and Trowel are together in orders 1 and 2. Every other pair (Atlas–Comic, Trowel–Comic) shares only order 2.'), ds(shopSql({ ...SAMPLE2, orders: [[1, 2, 'paid'], [2, 1, 'paid']], items: [[1, 1, 2], [1, 2, 1], [2, 1, 1], [2, 2, 1]] }), 'Ball and Bat are together in both orders.')],
  hidden: shopHidden(1281, [{ orders: 3, maxItems: 1 }, { orders: 20, products: 4, maxItems: 3 }, { orders: 50, products: 6, maxItems: 4 }, { orders: 100, products: 10, maxItems: 4 }, { orders: 200, products: 15, maxItems: 5 }, { orders: 40, products: 3, maxItems: 3 }, { orders: 10, products: 30 }, { orders: 150, products: 8, maxItems: 3 }]),
  solution:
    'SELECT pa.name AS product_a, pb.name AS product_b, COUNT(*) AS orders\nFROM order_items x\nJOIN order_items y ON y.order_id = x.order_id AND x.product_id < y.product_id\nJOIN products pa ON pa.id = x.product_id\nJOIN products pb ON pb.id = y.product_id\nGROUP BY x.product_id, y.product_id, pa.name, pb.name\nHAVING COUNT(*) >= 2\nORDER BY orders DESC, x.product_id, y.product_id;\n',
  starter: STARTER,
});

export const SQL_JOINS: DbQuestionInput[] = [orderCustomers, withoutOrders, neverOrdered, orderCounts, topEarner, orderTotals, bestSellers, moreThanManager, everyCategory, boughtTogether];
