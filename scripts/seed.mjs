// Seeds a deterministic catalogue: 5 brands, 12 ingredients, 150 creams with variants.
// Idempotent for the seeded brand set; leaves user data alone.
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const BRAND_SLUGS = ['seed-ade', 'seed-ola', 'seed-kito', 'seed-nne', 'seed-zuri'];

const INGREDIENTS = [
  ['Glycerin', ['humectant'], 0, 'none', false],
  ['Butyrospermum Parkii Butter', ['emollient', 'occlusive'], 1, 'low', false],
  ['Cocos Nucifera Oil', ['emollient', 'occlusive'], 4, 'moderate', false],
  ['Fragrance', ['fragrance'], 0, 'high', true],
  ['Niacinamide', ['active'], 0, 'low', false],
  ['Urea', ['humectant', 'active'], 0, 'low', false],
  ['Lanolin', ['occlusive'], 2, 'moderate', false],
  ['Phenoxyethanol', ['preservative'], 0, 'low', false],
  ['Tocopherol', ['antioxidant'], 0, 'none', false],
  ['Sodium Hyaluronate', ['humectant'], 0, 'none', false],
  ['Salicylic Acid', ['active'], 0, 'moderate', false],
  ['Dimethicone', ['occlusive'], 1, 'low', false],
];

const RICHNESS = ['light', 'medium', 'rich'];

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query('BEGIN');

  await client.query('DELETE FROM brands WHERE slug = ANY($1)', [BRAND_SLUGS]);

  const brands = [];
  for (const [index, slug] of BRAND_SLUGS.entries()) {
    const { rows } = await client.query(
      'INSERT INTO brands (name, slug, country) VALUES ($1, $2, $3) RETURNING id',
      [`Seed Brand ${index + 1}`, slug, 'NG'],
    );
    brands.push(rows[0].id);
  }

  const ingredientIds = [];
  for (const [inci, functions, comedogenic, irritation, allergen] of INGREDIENTS) {
    const { rows } = await client.query(
      `INSERT INTO ingredients (inci_name, functions, comedogenic_rating, irritation_risk, is_allergen, evidence_grade)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (inci_name) DO UPDATE SET functions = EXCLUDED.functions
       RETURNING id`,
      [inci, functions, comedogenic, irritation, allergen, 'B'],
    );
    ingredientIds.push(rows[0].id);
  }

  for (let i = 0; i < 150; i += 1) {
    const richness = RICHNESS[i % 3];
    const price = 3000 + (i % 20) * 1800;
    const dataConfidence = i % 10 === 9 ? 0.5 : 0.95;
    const inciMatchRate = i % 17 === 0 ? 0.9 : 0.99;
    const containsFragrance = i % 7 === 0;

    const attributes = {
      fragrance_free: !containsFragrance,
      vegan: i % 2 === 0,
      non_comedogenic: richness !== 'rich',
      richness,
    };

    const { rows } = await client.query(
      `INSERT INTO products (brand_id, category, name, slug, attributes, data_confidence, inci_match_rate, verified_at)
       VALUES ($1, 'cream', $2, $3, $4, $5, $6, now())
       RETURNING id`,
      [
        brands[i % brands.length],
        `Seed Cream ${String(i + 1).padStart(3, '0')}`,
        `seed-cream-${i + 1}`,
        JSON.stringify(attributes),
        dataConfidence,
        inciMatchRate,
      ],
    );
    const productId = rows[0].id;

    await client.query(
      `INSERT INTO product_variants (product_id, size_ml, price_ngn, availability, last_checked_at)
       VALUES ($1, 250, $2, 'in_stock', now())`,
      [productId, price],
    );

    const ingredientSet = new Set([0, 1 + (i % 3)]);
    if (containsFragrance) ingredientSet.add(3);
    if (i % 4 === 0) ingredientSet.add(4);
    if (richness === 'rich') ingredientSet.add(2);

    let position = 1;
    for (const index of [...ingredientSet].sort((a, b) => a - b)) {
      await client.query(
        `INSERT INTO product_ingredients (product_id, ingredient_id, position)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [productId, ingredientIds[index], position],
      );
      position += 1;
    }
  }

  await client.query('COMMIT');
  console.log('seeded: 5 brands, 12 ingredients, 150 creams');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
