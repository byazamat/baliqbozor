/**
 * Подбор кандидатов для заявки (SPEC 8.5). Скоринг и `suggestSplit` реализуются в M3.
 */
export interface MatchingCandidate {
  listingId: string;
  orgId: string;
  distanceKm: number;
}

export interface ScoredCandidate extends MatchingCandidate {
  score: number;
}
