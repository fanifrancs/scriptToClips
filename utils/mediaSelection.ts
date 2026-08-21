import type { MediaCandidate } from './types';

interface QueryResult {
  query: string;
  candidates: MediaCandidate[];
}

interface ImageSelectionOptions {
  landscapeTarget?: number;
  portraitTarget?: number;
  totalTarget?: number;
}

export function dedupeCandidatesById(queryResults: QueryResult[] = []): MediaCandidate[] {
  const dedupedCandidates = new Map<MediaCandidate['id'], MediaCandidate & { sourceQueries: string[] }>();

  queryResults.forEach(({ query, candidates }) => {
    candidates.forEach(candidate => {
      // Same Pexels asset can be returned by both search queries. Keep one
      // object and append each query that found it so later ranking/explanation
      // can still show the full search context.
      const existingCandidate = dedupedCandidates.get(candidate.id);

      if (existingCandidate) {
        if (!existingCandidate.sourceQueries.includes(query)) {
          existingCandidate.sourceQueries.push(query);
        }

        return;
      }

      dedupedCandidates.set(candidate.id, {
        ...candidate,
        sourceQueries: [query]
      });
    });
  });

  return [...dedupedCandidates.values()];
}

export function selectImageResults(candidates: MediaCandidate[] = [], options: ImageSelectionOptions = {}): MediaCandidate[] {
  // Image output is intended for editors who often need both horizontal and
  // vertical options. The candidate list is already ranked, so each pass keeps
  // original ranking order while filling orientation targets.
  const landscapeTarget = Number(options.landscapeTarget) || 2;
  const portraitTarget = Number(options.portraitTarget) || 2;
  const totalTarget = Number(options.totalTarget) || landscapeTarget + portraitTarget;
  const selectedIds = new Set<MediaCandidate['id']>();
  const selectedResults: MediaCandidate[] = [];

  appendByOrientation({
    candidates,
    selectedResults,
    selectedIds,
    orientation: 'landscape',
    target: landscapeTarget
  });

  appendByOrientation({
    candidates,
    selectedResults,
    selectedIds,
    orientation: 'portrait',
    target: portraitTarget
  });

  if (selectedResults.length >= totalTarget) {
    return selectedResults.slice(0, totalTarget);
  }

  // If the exact orientation targets cannot be filled, prefer square assets
  // before any other leftovers because they crop more flexibly in many layouts.
  const remainingCandidates = candidates.filter(candidate => !selectedIds.has(candidate.id));
  const fallbackCandidates = partitionByOrientation(remainingCandidates, 'square');

  fallbackCandidates.forEach(candidate => {
    if (selectedResults.length >= totalTarget || selectedIds.has(candidate.id)) {
      return;
    }

    selectedResults.push(candidate);
    selectedIds.add(candidate.id);
  });

  return selectedResults.slice(0, totalTarget);
}

function appendByOrientation({
  candidates,
  selectedResults,
  selectedIds,
  orientation,
  target
}: {
  candidates: MediaCandidate[];
  selectedResults: MediaCandidate[];
  selectedIds: Set<MediaCandidate['id']>;
  orientation: MediaCandidate['orientation'];
  target: number;
}) {
  let addedCount = 0;

  // Count only assets added during this orientation pass. selectedResults may
  // already contain landscape assets when the portrait pass begins.
  for (const candidate of candidates) {
    if (addedCount >= target || selectedIds.has(candidate.id) || candidate.orientation !== orientation) {
      continue;
    }

    selectedResults.push(candidate);
    selectedIds.add(candidate.id);
    addedCount += 1;
  }
}

function partitionByOrientation(candidates: MediaCandidate[], priorityOrientation: MediaCandidate['orientation']) {
  // This avoids two separate filter passes while preserving the original order
  // inside each group.
  const priority: MediaCandidate[] = [];
  const fallback: MediaCandidate[] = [];

  candidates.forEach(candidate => {
    if (candidate.orientation === priorityOrientation) {
      priority.push(candidate);
      return;
    }

    fallback.push(candidate);
  });

  return [...priority, ...fallback];
}
