import { gte, ilike, lte, or, sql } from 'drizzle-orm';
import { businessListings as listings } from '#models/listing.model.js';

const textFilters = [
  ['q', [listings.title, listings.description], true],
  ['industry', [listings.industry], false],
  ['location', [listings.location], false],
];
const amountFilters = [
  ['minPrice', 'maxPrice', listings.asking_price],
  ['minRevenue', 'maxRevenue', listings.annual_revenue],
  ['minEbitda', 'maxEbitda', listings.ebitda],
];
export const marketplaceFilterKeys = [
  ...textFilters.map(([key]) => key),
  ...amountFilters.flatMap(([minimum, maximum]) => [minimum, maximum]),
];

export const marketplaceCriteria = filters => [
  ...textFilters.flatMap(([key, columns, literal]) => {
    const value = filters[key];
    if (!value) return [];
    const pattern =
      '%' + (literal ? value.replace(/[\\%_]/g, '\\$&') : value) + '%';
    const comparisons = columns.map(column => ilike(column, pattern));
    return [comparisons.length === 1 ? comparisons[0] : or(...comparisons)];
  }),
  ...amountFilters.flatMap(([minimum, maximum, column]) => [
    ...(filters[minimum] === undefined ? [] : [gte(column, filters[minimum])]),
    ...(filters[maximum] === undefined ? [] : [lte(column, filters[maximum])]),
  ]),
];

// Evaluate saved JSON filters set-wise against the same columns and operators.
export const savedMarketplaceCriteria = filters => {
  const value = key => sql`(${filters} ->> ${key}::text)`;
  const text = textFilters.map(([key, columns, literal]) => {
    const raw = value(key);
    const escaped = literal
      ? sql`replace(replace(replace(${raw}, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_')`
      : raw;
    const comparison = sql.join(
      columns.map(column => sql`${column} ILIKE ('%' || ${escaped} || '%')`),
      sql` OR `
    );
    return sql`(${raw} IS NULL OR (${comparison}))`;
  });
  const amounts = amountFilters.flatMap(([minimum, maximum, column]) => [
    sql`(${value(minimum)} IS NULL OR ${column} >= ${value(minimum)}::numeric)`,
    sql`(${value(maximum)} IS NULL OR ${column} <= ${value(maximum)}::numeric)`,
  ]);
  return sql.join([...text, ...amounts], sql` AND `);
};
