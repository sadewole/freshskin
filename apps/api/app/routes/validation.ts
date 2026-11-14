import { z, type ZodTypeAny } from 'zod';
import type { ConsentKind } from '../../src/consent/consent.js';
import type { StrengthPreference } from '../../src/rec/types.js';
import type { DismissReasonCode, FeedbackAction } from '../../src/rec/store.js';
import type { SavedList } from '../../src/saved/items.js';
import { HttpError } from '../http.js';

/**
 * Request shapes at the HTTP boundary. Everything below this line is typed domain input; no
 * handler casts a string from the body into a domain union.
 */

const consentKinds = [
  'terms',
  'privacy',
  'image_processing',
  'model_training',
  'marketing',
] as const satisfies readonly ConsentKind[];

const savedLists = ['wishlist', 'owned'] as const satisfies readonly SavedList[];

const feedbackActions = [
  'view',
  'save',
  'dismiss',
  'rate',
  'purchase_intent',
] as const satisfies readonly FeedbackAction[];

const dismissReasons = [
  'too_expensive',
  'wrong_scent',
  'wrong_skin',
  'already_own',
  'not_available',
  'other',
] as const satisfies readonly DismissReasonCode[];

const strengths = ['light', 'moderate', 'strong', 'very_strong'] as const satisfies readonly StrengthPreference[];

const checkInCompletions = ['skipped', 'partly', 'done'] as const;
const skinFeels = ['drier', 'about_same', 'more_comfortable', 'not_sure'] as const;

const captureSchema = z
  .object({
    brightness: z.coerce.number().optional(),
    glareFraction: z.coerce.number().optional(),
    blurScore: z.coerce.number().optional(),
  })
  .default({});

export const consentBodySchema = z.object({
  kind: z.enum(consentKinds),
  granted: z.boolean(),
  policy_version: z.string().optional(),
});

export const fragranceProfileBodySchema = z.object({
  families_liked: z.array(z.string()).default([]),
  families_disliked: z.array(z.string()).default([]),
  notes_loved: z.array(z.string()).default([]),
  notes_avoided: z.array(z.string()).default([]),
  strength: z.enum(strengths).default('moderate'),
  occasions: z.array(z.string()).default([]),
  budget_max_ngn: z.number().nullable().optional(),
});

export const feedbackBodySchema = z.object({
  recommendation_id: z.string().min(1),
  action: z.enum(feedbackActions),
  rating: z.number().optional(),
  dismiss_reason: z.enum(dismissReasons).optional(),
});

export const saveItemBodySchema = z.object({
  product_id: z.string().min(1),
  list: z.enum(savedLists).default('wishlist'),
});

export const removeItemQuerySchema = z.object({
  product_id: z.string().min(1),
  list: z.enum(savedLists).default('wishlist'),
});

export const scanBodySchema = z.object({
  kind: z.enum(['ingredient_label', 'bottle']).default('ingredient_label'),
  image_key: z.string().nullable().optional(),
});

export const skinAnalysisBodySchema = z.object({
  image_key: z.string().nullable().optional(),
  capture: captureSchema,
});

export const completeScanBodySchema = z.object({
  raw_text: z.string().min(1),
  subject: z
    .object({
      concerns: z.array(z.string()).default([]),
      high_irritant_count: z.coerce.number().default(0),
      comedogenic_hits: z.coerce.number().default(0),
      fragrance_allergen: z.boolean().default(false),
      beneficial_count: z.coerce.number().default(0),
    })
    .default({}),
});

export const completeAnalysisBodySchema = z.object({
  analysis: z.unknown(),
  capture: captureSchema,
});

export const checkInBodySchema = z.object({
  completion: z.enum(checkInCompletions),
  feel: z.enum(skinFeels).nullable().optional(),
  checked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export function parseBody<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new HttpError(400, 'INVALID_BODY', formatIssues(parsed.error));
}

export function parseQuery<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new HttpError(400, 'INVALID_QUERY', formatIssues(parsed.error));
}

export function parseQueryInt(value: string | null, field: string): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(400, 'INVALID_QUERY', `${field} must be a non-negative integer`);
  }
  return parsed;
}

export function parseQueryBool(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  return value === '1' || value === 'true';
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length === 0 ? 'body' : issue.path.join('.');
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}
