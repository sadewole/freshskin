// Mirror of db/migrations/0001_core.sql, for typed writes and documentation.
// Catalogue reads never use this: they go through the gated views (see src/catalogue/read-view.ts).
// Generated columns (richness, fragrance_free, status) are intentionally absent — they are computed
// by Postgres and must never appear in an insert.
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const productCategory = pgEnum('product_category', ['cream', 'perfume']);

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  country: text('country'),
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').notNull(),
  category: productCategory('category').notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull(),
  dataConfidence: numeric('data_confidence').notNull(),
  inciMatchRate: numeric('inci_match_rate'),
  isActive: boolean('is_active').notNull().default(true),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
});

export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull(),
  sizeMl: numeric('size_ml').notNull(),
  priceNgn: integer('price_ngn').notNull(),
  availability: text('availability').notNull(),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
});

export const ingredients = pgTable('ingredients', {
  id: uuid('id').primaryKey().defaultRandom(),
  inciName: text('inci_name').notNull(),
  aliases: text('aliases').array().notNull().default([]),
  functions: text('functions').array().notNull().default([]),
  comedogenicRating: smallint('comedogenic_rating'),
  irritationRisk: text('irritation_risk'),
  isAllergen: boolean('is_allergen').notNull().default(false),
  evidenceGrade: text('evidence_grade'),
});

export const productIngredients = pgTable('product_ingredients', {
  productId: uuid('product_id').notNull(),
  ingredientId: uuid('ingredient_id').notNull(),
  position: integer('position').notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email'),
  market: text('market').notNull().default('NG'),
});

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey(),
  skinType: text('skin_type').notNull().default('unsure'),
  concerns: text('concerns').array().notNull().default([]),
  climateZone: text('climate_zone').notNull().default('hot_humid'),
  budgetMaxNgn: integer('budget_max_ngn'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sensitivities = pgTable('sensitivities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  ingredientId: uuid('ingredient_id'),
  freeText: text('free_text'),
  severity: text('severity').notNull(),
  appliesTo: text('applies_to').array().notNull().default(['cream', 'perfume']),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type ProductRow = typeof products.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type SensitivityRow = typeof sensitivities.$inferSelect;
