import { z } from 'zod';
import type { CosmeticSurface, SurfaceItem } from '../safety/conflicts.js';
import type { Availability, Candidate, CatalogueProduct, ProductFacts, Richness } from '../rec/types.js';

/**
 * The only file that names both a storage shape and a domain shape.
 * A parse failure demotes the product rather than crashing a request or scoring `undefined` as 0.
 */

export const gatedProductRow = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  brand_name: z.string().min(1),
  category: z.enum(['cream', 'perfume']),
  richness: z.string().nullable(),
  fragrance_free: z.boolean().nullable(),
  price_ngn: z.coerce.number().int().nonnegative().nullable(),
  availability: z.enum(['in_stock', 'low_stock', 'out_of_stock', 'unknown']),
});

export type GatedProductRow = z.infer<typeof gatedProductRow>;

export const ingredientRow = z.object({
  ingredient_id: z.string().uuid(),
  inci_name: z.string().min(1),
  is_allergen: z.boolean(),
  irritation_risk: z.enum(['none', 'low', 'moderate', 'high']).nullable(),
  comedogenic_rating: z.coerce.number().int().min(0).max(5).nullable(),
  functions: z.array(z.string()),
});

export type IngredientRow = z.infer<typeof ingredientRow>;

const IRRITATION_SCORE: Record<string, number> = { none: 0, low: 0.25, moderate: 0.6, high: 1 };

const RICHNESS: readonly Richness[] = ['light', 'medium', 'rich'];

export type ProjectionResult =
  | { readonly kind: 'candidate'; readonly candidate: Candidate }
  | { readonly kind: 'draft'; readonly productId: string; readonly reason: string };

export function projectProduct(
  rawProduct: unknown,
  rawIngredients: readonly unknown[],
): ProjectionResult {
  const product = gatedProductRow.safeParse(rawProduct);
  if (!product.success) {
    const id =
      typeof rawProduct === 'object' && rawProduct !== null && 'id' in rawProduct
        ? String((rawProduct as { id: unknown }).id)
        : 'unknown';
    return { kind: 'draft', productId: id, reason: product.error.issues[0]?.message ?? 'malformed row' };
  }

  const rows = product.data;
  const parsedIngredients = rawIngredients.map((row) => ingredientRow.safeParse(row));
  const failed = parsedIngredients.find((result) => !result.success);
  if (failed !== undefined) {
    return { kind: 'draft', productId: rows.id, reason: 'malformed ingredient row' };
  }
  const ingredients = parsedIngredients.map((r) => r.data!);

  const richness =
    rows.richness !== null && (RICHNESS as readonly string[]).includes(rows.richness)
      ? (rows.richness as Richness)
      : null;

  const facts: ProductFacts = {
    irritancyAvg:
      ingredients.length === 0
        ? 0
        : ingredients.reduce((sum, i) => sum + (IRRITATION_SCORE[i.irritation_risk ?? 'none'] ?? 0), 0) /
          ingredients.length,
    comedogenicMax: ingredients.reduce((max, i) => Math.max(max, i.comedogenic_rating ?? 0), 0),
    humectantRatio: ratioWith(ingredients, 'humectant'),
    occlusiveRatio: ratioWith(ingredients, 'occlusive'),
    beneficialCount: ingredients.filter((i) =>
      i.functions.some((f) => f === 'humectant' || f === 'emollient' || f === 'active'),
    ).length,
  };

  const surface: CosmeticSurface = {
    kind: 'inci',
    disclosure: 'full',
    items: ingredients.map<SurfaceItem>((i) => ({
      ingredientId: i.ingredient_id,
      inciName: i.inci_name,
      isAllergen: i.is_allergen,
    })),
  };

  const catalogueProduct: CatalogueProduct = {
    id: rows.id,
    name: rows.name,
    brandName: rows.brand_name,
    category: rows.category,
    priceNgn: rows.price_ngn,
    availability: rows.availability as Availability,
    richness,
    fragranceFree: rows.fragrance_free,
    facts,
    perfume: null,
  };

  return { kind: 'candidate', candidate: { product: catalogueProduct, surface } };
}

function ratioWith(ingredients: readonly IngredientRow[], fn: string): number {
  if (ingredients.length === 0) return 0;
  const count = ingredients.filter((i) => i.functions.includes(fn)).length;
  return count / ingredients.length;
}

// ---------------------------------------------------------------------------
// Perfumes
// ---------------------------------------------------------------------------

export const perfumeRow = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  brand_name: z.string().min(1),
  price_ngn: z.coerce.number().int().nonnegative().nullable(),
  availability: z.enum(['in_stock', 'low_stock', 'out_of_stock', 'unknown']),
  concentration: z.string().nullable(),
  performance: z
    .object({
      longevity: z.coerce.number().min(1).max(5).optional(),
      projection: z.coerce.number().min(1).max(5).optional(),
    })
    .nullable(),
  occasion_tags: z.array(z.string()).nullable(),
  family_names: z.array(z.string()).nullable(),
});

export const perfumeNoteRow = z.object({
  note_name: z.string().min(1),
  layer: z.enum(['top', 'heart', 'base']),
  prominence: z.coerce.number().int().min(1).max(3),
});

export type PerfumeNoteRow = z.infer<typeof perfumeNoteRow>;

export function projectPerfume(rawProduct: unknown, rawNotes: readonly unknown[]): ProjectionResult {
  const product = perfumeRow.safeParse(rawProduct);
  if (!product.success) {
    const id =
      typeof rawProduct === 'object' && rawProduct !== null && 'id' in rawProduct
        ? String((rawProduct as { id: unknown }).id)
        : 'unknown';
    return { kind: 'draft', productId: id, reason: product.error.issues[0]?.message ?? 'malformed row' };
  }

  const notes = rawNotes.map((row) => perfumeNoteRow.safeParse(row));
  const failed = notes.find((result) => !result.success);
  if (failed !== undefined) {
    return { kind: 'draft', productId: product.data.id, reason: 'malformed note row' };
  }
  const parsedNotes = notes.map((result) => result.data!);

  const row = product.data;
  const noteNames = parsedNotes.map((note) => note.note_name);

  return {
    kind: 'candidate',
    candidate: {
      product: {
        id: row.id,
        name: row.name,
        brandName: row.brand_name,
        category: 'perfume',
        priceNgn: row.price_ngn,
        availability: row.availability as Availability,
        richness: null,
        fragranceFree: null,
        facts: {
          irritancyAvg: 0,
          comedogenicMax: 0,
          humectantRatio: 0,
          occlusiveRatio: 0,
          beneficialCount: 0,
        },
        perfume: {
          familyNames: row.family_names ?? [],
          noteNames,
          heartAndBaseNotes: parsedNotes
            .filter((note) => note.layer !== 'top')
            .map((note) => note.note_name),
          longevity: row.performance?.longevity ?? 3,
          projection: row.performance?.projection ?? 3,
          occasions: row.occasion_tags ?? [],
        },
      },
      surface: {
        kind: 'notes',
        disclosure: 'partial',
        items: parsedNotes.map((note) => ({
          ingredientId: null,
          inciName: note.note_name,
          isAllergen: false,
        })),
      },
    },
  };
}
