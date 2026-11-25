import type pg from 'pg';
import { loadCreamCandidates, loadPerfumeCandidates } from '../catalogue/read-view.js';
import { withUser } from '../db/client.js';
import { bestPairings, type CreamForPairing, type PairingSuggestion } from '../rec/pairing.js';
import { findSimilar, type ScentProfile, type SimilarResult } from '../rec/similar.js';
import type { Candidate } from '../rec/types.js';

/**
 * The composition roots for "similar to" and layering. Both are read-only: they neither rank for
 * the viewer nor persist, because neither is a recommendation in the §12.3 sense.
 */

const toScentProfile = (candidate: Candidate): ScentProfile => ({
  noteNames: candidate.product.perfume?.noteNames ?? [],
  heartAndBaseNotes: candidate.product.perfume?.heartAndBaseNotes ?? [],
  familyNames: candidate.product.perfume?.familyNames ?? [],
  longevity: candidate.product.perfume?.longevity ?? 3,
  projection: candidate.product.perfume?.projection ?? 3,
});

export interface SimilarResponse {
  readonly anchor: { readonly id: string; readonly name: string; readonly priceNgn: number | null };
  readonly results: readonly (SimilarResult & { readonly name: string; readonly priceNgn: number | null })[];
  readonly cheaperOnly: boolean;
}

async function loadAnchor(
  client: pg.PoolClient,
  productId: string,
): Promise<{ id: string; name: string; priceNgn: number | null; profile: ScentProfile } | null> {
  const product = await client.query<{ id: string; name: string; price_ngn: number | null }>(
    `SELECT id, name, price_ngn FROM v_product_browse WHERE id = $1`,
    [productId],
  );
  const row = product.rows[0];
  if (row === undefined) return null;

  const notes = await client.query<{ note_name: string; layer: string }>(
    `SELECT note_name, layer FROM v_perfume_notes WHERE product_id = $1`,
    [productId],
  );
  if (notes.rows.length === 0) return null;

  const families = await client.query<{ family_names: string[] | null }>(
    `SELECT family_names FROM v_perfume_recommendable WHERE id = $1`,
    [productId],
  );

  return {
    id: row.id,
    name: row.name,
    priceNgn: row.price_ngn,
    profile: {
      noteNames: notes.rows.map((note) => note.note_name),
      heartAndBaseNotes: notes.rows.filter((note) => note.layer !== 'top').map((note) => note.note_name),
      familyNames: families.rows[0]?.family_names ?? [],
      longevity: 3,
      projection: 3,
    },
  };
}

export async function recommendSimilar(
  userId: string,
  anchorId: string,
  options: { cheaperOnly?: boolean; limit?: number } = {},
): Promise<SimilarResponse | null> {
  return withUser(userId, async (client) => {
    const anchor = await loadAnchor(client, anchorId);
    if (anchor === null) return null;

    const { candidates } = await loadPerfumeCandidates(client);
    const byId = new Map(candidates.map((candidate) => [candidate.product.id, candidate]));

    const results = findSimilar(
      { productId: anchor.id, priceNgn: anchor.priceNgn, profile: anchor.profile },
      candidates.map((candidate) => ({
        productId: candidate.product.id,
        priceNgn: candidate.product.priceNgn,
        profile: toScentProfile(candidate),
      })),
      options,
    );

    return {
      anchor: { id: anchor.id, name: anchor.name, priceNgn: anchor.priceNgn },
      results: results.map((result) => ({
        ...result,
        name: byId.get(result.productId)?.product.name ?? 'Unknown',
        priceNgn: byId.get(result.productId)?.product.priceNgn ?? null,
      })),
      cheaperOnly: options.cheaperOnly === true,
    };
  });
}

export interface PairingResponse {
  readonly perfume: { readonly id: string; readonly name: string; readonly families: readonly string[] };
  readonly pairings: readonly (PairingSuggestion & { readonly creamName: string })[];
}

export async function recommendPairings(
  userId: string,
  perfumeId?: string,
): Promise<PairingResponse | null> {
  return withUser(userId, async (client) => {
    const perfumes = await loadPerfumeCandidates(client);
    const chosen =
      perfumeId === undefined
        ? perfumes.candidates[0]
        : perfumes.candidates.find((candidate) => candidate.product.id === perfumeId);

    if (chosen === undefined) return null;

    const creams = await loadCreamCandidates(client);
    const forPairing: CreamForPairing[] = creams.candidates.map((candidate) => ({
      productId: candidate.product.id,
      name: candidate.product.name,
      fragranceFree: candidate.product.fragranceFree,
    }));

    const pairings = bestPairings(forPairing, {
      productId: chosen.product.id,
      name: chosen.product.name,
      familyNames: chosen.product.perfume?.familyNames ?? [],
    });

    const names = new Map(creams.candidates.map((candidate) => [candidate.product.id, candidate.product.name]));

    return {
      perfume: {
        id: chosen.product.id,
        name: chosen.product.name,
        families: chosen.product.perfume?.familyNames ?? [],
      },
      pairings: pairings.map((pairing) => ({
        ...pairing,
        creamName: names.get(pairing.creamId) ?? 'Unknown',
      })),
    };
  });
}
