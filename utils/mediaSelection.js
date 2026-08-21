function dedupeCandidatesById(queryResults = []) {
  const dedupedCandidates = new Map();

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

function selectImageResults(candidates = [], options = {}) {
  // Image output is intended for editors who often need both horizontal and
  // vertical options. The candidate list is already ranked, so each pass keeps
  // original ranking order while filling orientation targets.
  const landscapeTarget = Number(options.landscapeTarget) || 2;
  const portraitTarget = Number(options.portraitTarget) || 2;
  const totalTarget = Number(options.totalTarget) || landscapeTarget + portraitTarget;
  const selectedIds = new Set();
  const selectedResults = [];

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

function appendByOrientation({ candidates, selectedResults, selectedIds, orientation, target }) {
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

function partitionByOrientation(candidates, priorityOrientation) {
  // This avoids two separate filter passes while preserving the original order
  // inside each group.
  const priority = [];
  const fallback = [];

  candidates.forEach(candidate => {
    if (candidate.orientation === priorityOrientation) {
      priority.push(candidate);
      return;
    }

    fallback.push(candidate);
  });

  return [...priority, ...fallback];
}

module.exports = {
  dedupeCandidatesById,
  selectImageResults
};
