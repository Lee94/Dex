import type { SemanticModel } from './types';

/**
 * The curated semantic model over the sample e-commerce warehouse
 * (customers / products / orders / order_items). Hand-authored (CubeJS-style);
 * the same model shape works against a Postgres connection with matching tables.
 *
 * Grain note: `order_items` is the fact table (one row per order line). Measures
 * that count *orders* therefore use COUNT(DISTINCT orders.id) to avoid fan-out
 * inflation when joined to the line-item grain.
 */
export const model: SemanticModel = {
  cubes: [
    {
      name: 'order_items',
      title: 'Order line items',
      description: 'One row per product line within an order — the revenue fact table.',
      sql: 'order_items',
      endorsed: true,
      measures: [
        {
          name: 'revenue',
          title: 'Revenue',
          description: 'Gross revenue = sum of quantity × unit price across all order lines.',
          type: 'sum',
          sql: 'order_items.quantity * order_items.unit_price',
          format: 'currency',
          endorsed: true,
        },
        {
          name: 'quantity_sold',
          title: 'Units sold',
          type: 'sum',
          sql: 'order_items.quantity',
          format: 'integer',
          endorsed: true,
        },
        {
          name: 'line_items',
          title: 'Line items',
          type: 'count',
          format: 'integer',
        },
        {
          name: 'avg_order_value',
          title: 'Average order value',
          description: 'Revenue divided by the number of distinct orders.',
          type: 'ratio',
          sql: 'SUM(order_items.quantity * order_items.unit_price) / NULLIF(COUNT(DISTINCT orders.id), 0)',
          requires: ['orders'],
          format: 'currency',
          endorsed: true,
        },
      ],
      dimensions: [],
      joins: [
        {
          to: 'orders',
          relationship: 'many_to_one',
          sql: 'order_items.order_id = orders.id',
        },
        {
          to: 'products',
          relationship: 'many_to_one',
          sql: 'order_items.product_id = products.id',
        },
      ],
    },
    {
      name: 'orders',
      title: 'Orders',
      description: 'One row per customer order.',
      sql: 'orders',
      endorsed: true,
      measures: [
        {
          name: 'order_count',
          title: 'Orders',
          description: 'Distinct count of orders (safe across joins to line items).',
          type: 'count_distinct',
          sql: 'orders.id',
          format: 'integer',
          endorsed: true,
        },
        {
          name: 'cancellation_rate',
          title: 'Cancellation rate',
          description:
            'Share of orders with status = cancelled (query alone, not joined to line items).',
          type: 'ratio',
          sql: "AVG(CASE WHEN orders.status = 'cancelled' THEN 1.0 ELSE 0.0 END)",
          format: 'percent',
          endorsed: true,
        },
      ],
      dimensions: [
        {
          name: 'status',
          title: 'Order status',
          type: 'categorical',
          sql: 'orders.status',
        },
        {
          name: 'order_date',
          title: 'Order date',
          type: 'temporal',
          sql: 'orders.order_date',
        },
      ],
      joins: [
        {
          to: 'customers',
          relationship: 'many_to_one',
          sql: 'orders.customer_id = customers.id',
        },
      ],
    },
    {
      name: 'products',
      title: 'Products',
      description: 'The product catalog.',
      sql: 'products',
      endorsed: true,
      measures: [
        {
          name: 'product_count',
          title: 'Products',
          type: 'count_distinct',
          sql: 'products.id',
          format: 'integer',
          endorsed: true,
        },
      ],
      dimensions: [
        { name: 'category', title: 'Category', type: 'categorical', sql: 'products.category' },
        { name: 'product_name', title: 'Product', type: 'categorical', sql: 'products.name' },
        { name: 'price', title: 'List price', type: 'numeric', sql: 'products.price' },
      ],
    },
    {
      name: 'customers',
      title: 'Customers',
      description: 'The customer roster.',
      sql: 'customers',
      endorsed: true,
      measures: [
        {
          name: 'customer_count',
          title: 'Customers',
          type: 'count_distinct',
          sql: 'customers.id',
          format: 'integer',
          endorsed: true,
        },
      ],
      dimensions: [
        { name: 'country', title: 'Country', type: 'categorical', sql: 'customers.country' },
        { name: 'customer_name', title: 'Customer', type: 'categorical', sql: 'customers.name' },
        {
          name: 'signup_date',
          title: 'Signup date',
          type: 'temporal',
          sql: 'customers.signup_date',
        },
      ],
    },
  ],

  metrics: [
    {
      name: 'revenue',
      title: 'Revenue',
      description: 'Gross revenue across all order lines (the canonical revenue definition).',
      measure: 'order_items.revenue',
      endorsed: true,
    },
    {
      name: 'completed_revenue',
      title: 'Completed revenue',
      description: 'Revenue from completed orders only — excludes cancelled, refunded, pending.',
      measure: 'order_items.revenue',
      filters: [{ member: 'orders.status', operator: 'equals', values: ['completed'] }],
      endorsed: true,
    },
    {
      name: 'orders',
      title: 'Orders',
      description: 'Number of distinct orders.',
      measure: 'orders.order_count',
      endorsed: true,
    },
    {
      name: 'avg_order_value',
      title: 'Average order value',
      description: 'Revenue per order.',
      measure: 'order_items.avg_order_value',
      endorsed: true,
    },
    {
      name: 'cancellation_rate',
      title: 'Cancellation rate',
      description: 'Share of orders that were cancelled.',
      measure: 'orders.cancellation_rate',
      endorsed: true,
    },
    {
      name: 'customers',
      title: 'Customers',
      description: 'Number of distinct customers.',
      measure: 'customers.customer_count',
      endorsed: true,
    },
  ],
};
