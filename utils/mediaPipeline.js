const { rankMediaCandidates, summarizeRankingStatus } = require('./clipRanker');
const { dedupeCandidatesById, selectImageResults } = require('./mediaSelection');
const { MEDIA_TYPES } = require('./mediaTypes');
const { searchPhotos, searchVideos } = require('./pexelsApi');

const PEXELS_CANDIDATES_PER_QUERY = Number(process.env.PEXELS_CANDIDATES_PER_QUERY || 10);
const MAX_CANDIDATES_FOR_RANKING = Number(process.env.MAX_CANDIDATES_FOR_RANKING || 10);
const SCENE_PROCESSING_CONCURRENCY = Number(process.env.SCENE_PROCESSING_CONCURRENCY || 3);

// Each media type has the same high-level pipeline but a different fetcher and
// final selection rule. Videos keep the top two ranked clips. Images keep more
// items and try to preserve a practical landscape/portrait mix for editing.
const MEDIA_PIPELINES = {
  [MEDIA_TYPES.VIDEO]: {
    fetchCandidates: searchVideos,
    getRankingSelectionLimit: () => 2,
    finalizeSelections: candidates => candidates.slice(0, 2)
  },
  [MEDIA_TYPES.IMAGE]: {
    fetchCandidates: searchPhotos,
    getRankingSelectionLimit: candidates => candidates.length,
    finalizeSelections: candidates => selectImageResults(candidates, {
      landscapeTarget: 2,
      portraitTarget: 2,
      totalTarget: 4
    })
  }
};

async function processScenes({ scenes, mediaType }) {
  const pipeline = getPipeline(mediaType);

  // This cache lives only for one /process request. It avoids duplicate Pexels
  // calls when multiple scenes use the same query, but it does not persist
  // across users or server restarts.
  const searchCache = new Map();

  // Scenes are independent, so a small amount of parallelism improves latency.
  // The limit prevents one large script from launching every Pexels/OpenAI call
  // at the same time and overwhelming rate limits.
  const results = await mapWithConcurrency(
    scenes,
    SCENE_PROCESSING_CONCURRENCY,
    scene => processSingleScene({ scene, mediaType, pipeline, searchCache })
  );
  const rankingStatuses = results.map(result => result.ranking);

  return {
    results,
    ranking: summarizeRankingStatus(rankingStatuses),
    assetsFound: results.reduce((total, scene) => total + scene.assets.length, 0)
  };
}

// Replacement uses the same ranking path as the full process endpoint. The
// only difference is that it can exclude already-shown Pexels ids and ask for a
// slightly larger candidate pool, giving the user a real alternate result.
async function processSingleScene({ scene, mediaType, excludedAssetIds = [], pipeline = getPipeline(mediaType), searchCache } = {}) {
  // Asset ids are converted to strings because ids can cross the browser/server
  // boundary as either numbers or strings. A string Set keeps comparisons
  // stable for replacement filtering.
  const excludedIds = new Set(excludedAssetIds.map(id => String(id)));

  // Queries should already be normalized by validation, but this protects the
  // utility if it is called directly in tests or from a future endpoint.
  const searchQueries = [...new Set(scene.searchQueries.map(query => query.trim().toLowerCase()))];

  // Replacement requests need enough candidates to skip the already-shown ids.
  // Example: if two clips are excluded, ask Pexels for at least two extra.
  const perQueryLimit = Math.max(PEXELS_CANDIDATES_PER_QUERY, excludedIds.size + PEXELS_CANDIDATES_PER_QUERY);

  // Queries within one scene can be searched in parallel because the ranking
  // step only starts after all candidates for that scene are available.
  const queryResults = await Promise.all(
    searchQueries.map(async query => ({
      query,
      candidates: await fetchCandidatesWithCache({
        cache: searchCache,
        mediaType,
        query,
        perQueryLimit,
        fetchCandidates: pipeline.fetchCandidates
      })
    }))
  );

  // Pexels can return the same asset for multiple related queries. Deduping
  // preserves a sourceQueries list so the ranker still knows every query that
  // matched that asset.
  const candidates = dedupeCandidatesById(queryResults)
    .filter(candidate => !excludedIds.has(String(candidate.id)))
    .slice(0, MAX_CANDIDATES_FOR_RANKING);

  // The ranker may use OpenAI or fall back to heuristics. The returned ranking
  // object records which mode actually ran, which lets the UI explain it.
  const rankingResult = await rankMediaCandidates({
    mediaType,
    sceneText: scene.sceneText,
    searchQueries,
    candidates,
    maxSelections: pipeline.getRankingSelectionLimit(candidates)
  });
  const selectedAssets = pipeline.finalizeSelections(rankingResult.assets);

  return {
    id: scene.id,
    mediaType,
    sceneText: scene.sceneText,
    searchQueries,
    candidateCount: candidates.length,
    ranking: rankingResult.ranking,
    assets: selectedAssets
  };
}

function getPipeline(mediaType) {
  return MEDIA_PIPELINES[mediaType] || MEDIA_PIPELINES[MEDIA_TYPES.VIDEO];
}

function fetchCandidatesWithCache({ cache, mediaType, query, perQueryLimit, fetchCandidates }) {
  if (!cache) {
    return fetchCandidates(query, perQueryLimit);
  }

  const cacheKey = `${mediaType}:${perQueryLimit}:${query}`;

  if (!cache.has(cacheKey)) {
    // Store the promise, not only the resolved array. If two scenes ask for the
    // same query at the same time, they share the in-flight request.
    cache.set(cacheKey, fetchCandidates(query, perQueryLimit));
  }

  return cache.get(cacheKey);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  // Keep result order identical to input order even though individual workers
  // finish at different times. The browser expects scene 1, scene 2, etc.
  const safeConcurrency = Math.max(1, Math.min(Number(concurrency) || 1, items.length || 1));
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: safeConcurrency }, () => worker())
  );

  return results;
}

module.exports = { processScenes, processSingleScene };
