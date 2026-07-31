function dedupeCandidatesById(queryResults = []) {
  const dedupedCandidates = new Map();

  queryResults.forEach(({ query, candidates }) => {
    candidates.forEach(candidate => {
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

  const remainingCandidates = candidates.filter(candidate => !selectedIds.has(candidate.id));
  const squareCandidates = remainingCandidates.filter(candidate => candidate.orientation === 'square');
  const fallbackCandidates = [
    ...squareCandidates,
    ...remainingCandidates.filter(candidate => candidate.orientation !== 'square')
  ];

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
  candidates
    .filter(candidate => candidate.orientation === orientation)
    .slice(0, target)
    .forEach(candidate => {
      if (selectedIds.has(candidate.id)) {
        return;
      }

      selectedResults.push(candidate);
      selectedIds.add(candidate.id);
    });
}

module.exports = {
  dedupeCandidatesById,
  selectImageResults
};
