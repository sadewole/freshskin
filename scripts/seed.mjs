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

  // Order matters: products reference brands, and recommendations reference products.
  await client.query(
    `DELETE FROM recommendations
      WHERE product_id IN (
        SELECT p.id FROM products p JOIN brands b ON b.id = p.brand_id WHERE b.slug = ANY($1)
      )`,
    [BRAND_SLUGS],
  );
  await client.query(
    'DELETE FROM products WHERE brand_id IN (SELECT id FROM brands WHERE slug = ANY($1))',
    [BRAND_SLUGS],
  );
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


  // ---------------------------------------------------------------------------
  // Perfumes: families, notes, and a note pyramid per product.
  // ---------------------------------------------------------------------------
  const FAMILIES = ['Floral', 'Woody', 'Citrus', 'Oriental', 'Fresh', 'Gourmand'];
  const familyIds = {};
  for (const [index, name] of FAMILIES.entries()) {
    const { rows } = await client.query(
      `INSERT INTO fragrance_families (name, sort_order) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order
       RETURNING id`,
      [name, index],
    );
    familyIds[name] = rows[0].id;
  }

  const NOTES = [
    ['Bergamot', 'Citrus', 'top'],
    ['Lemon', 'Citrus', 'top'],
    ['Rose', 'Floral', 'heart'],
    ['Jasmine', 'Floral', 'heart'],
    ['Cedar', 'Woody', 'base'],
    ['Sandalwood', 'Woody', 'base'],
    ['Patchouli', 'Woody', 'base'],
    ['Vanilla', 'Gourmand', 'base'],
    ['Tonka Bean', 'Gourmand', 'base'],
    ['Amber', 'Oriental', 'base'],
    ['Incense', 'Oriental', 'heart'],
    ['Musk', 'Fresh', 'base'],
  ];

  const noteIds = {};
  for (const [name, family, layer] of NOTES) {
    const { rows } = await client.query(
      `INSERT INTO fragrance_notes (name, family_id) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET family_id = EXCLUDED.family_id
       RETURNING id`,
      [name, familyIds[family]],
    );
    noteIds[name] = { id: rows[0].id, layer };
  }

  const noteNames = NOTES.map(([name]) => name);
  const OCCASIONS = ['daily', 'office', 'evening', 'event'];
  const CONCENTRATIONS = ['edt', 'edp', 'parfum'];

  for (let i = 0; i < 30; i += 1) {
    const family = FAMILIES[i % FAMILIES.length];
    const price = 18000 + (i % 10) * 6500;
    const longevity = 1 + (i % 5);
    const projection = 1 + ((i + 2) % 5);

    const { rows } = await client.query(
      `INSERT INTO products
         (brand_id, category, name, slug, attributes, data_confidence, inci_match_rate,
          verified_at, concentration, performance, occasion_tags, family_ids)
       VALUES ($1, 'perfume', $2, $3, $4, 0.95, NULL, now(), $5, $6::jsonb, $7, $8)
       RETURNING id`,
      [
        brands[i % brands.length],
        `Seed Scent ${String(i + 1).padStart(2, '0')}`,
        `seed-scent-${i + 1}`,
        JSON.stringify({}),
        CONCENTRATIONS[i % CONCENTRATIONS.length],
        JSON.stringify({ longevity, projection }),
        [OCCASIONS[i % OCCASIONS.length], OCCASIONS[(i + 1) % OCCASIONS.length]],
        [familyIds[family]],
      ],
    );
    const productId = rows[0].id;

    await client.query(
      `INSERT INTO product_variants (product_id, size_ml, price_ngn, availability, last_checked_at)
       VALUES ($1, 50, $2, 'in_stock', now())`,
      [productId, price],
    );

    const chosen = [noteNames[i % noteNames.length], noteNames[(i + 3) % noteNames.length], noteNames[(i + 6) % noteNames.length]];
    for (const name of new Set(chosen)) {
      await client.query(
        `INSERT INTO product_notes (product_id, note_id, layer, prominence)
         VALUES ($1, $2, $3, 2) ON CONFLICT DO NOTHING`,
        [productId, noteIds[name].id, noteIds[name].layer],
      );
    }
  }

  await client.query('COMMIT');
  console.log('seeded: 5 brands, 12 ingredients, 150 creams, 6 families, 12 notes, 30 perfumes');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
