import { rankMediaCandidates, summarizeRankingStatus } from './clipRanker';
import { MEDIA_TYPES } from './mediaTypes';
import { searchPhotos, searchVideos } from './pexelsApi';
import type { MediaCandidate, MediaType, RankedMediaCandidate, RankingStatus, Scene, SceneProcessingResult } from './types';

const PEXELS_CANDIDATES_PER_QUERY = Number(process.env.PEXELS_CANDIDATES_PER_QUERY || 10);
const MAX_CANDIDATES_FOR_RANKING = Number(process.env.MAX_CANDIDATES_FOR_RANKING || 10);
const SCENE_PROCESSING_CONCURRENCY = Number(process.env.SCENE_PROCESSING_CONCURRENCY || 3);

// Each media type has the same high-level pipeline but a different Pexels
// fetcher. Final selection is query-balanced: one chosen asset per search query.
interface MediaPipeline {
  fetchCandidates: (query: string, perPage: number) => Promise<MediaCandidate[]>;
}

interface SearchCache extends Map<string, Promise<MediaCandidate[]>> {}

interface ProcessScenesInput {
  scenes: Scene[];
  mediaType: MediaType;
}

interface ProcessSingleSceneInput {
  scene: Scene;
  mediaType: MediaType;
  excludedAssetIds?: Array<string | number>;
  pipeline?: MediaPipeline;
  searchCache?: SearchCache;
}

const MEDIA_PIPELINES: Record<MediaType, MediaPipeline> = {
  [MEDIA_TYPES.VIDEO]: {
    fetchCandidates: searchVideos
  },
  [MEDIA_TYPES.IMAGE]: {
    fetchCandidates: searchPhotos
  }
};

export async function processScenes({ scenes, mediaType }: ProcessScenesInput) {
  const pipeline = getPipeline(mediaType);

  // This cache lives only for one /process request. It avoids duplicate Pexels
  // calls when multiple scenes use the same query, but it does not persist
  // across users or server restarts.
  const searchCache: SearchCache = new Map();

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
export async function processSingleScene({
  scene,
  mediaType,
  excludedAssetIds = [],
  pipeline = getPipeline(mediaType),
  searchCache
}: ProcessSingleSceneInput): Promise<SceneProcessingResult> {
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

  const selectedIds = new Set(excludedIds);
  const rankingStatuses: RankingStatus[] = [];
  let candidateCount = 0;

  // Each query gets its own candidate pool and ranking pass. This guarantees
  // one returned asset per query whenever Pexels returns at least one usable
  // candidate for that specific query, instead of letting one query dominate
  // the final scene results.
  const selectedAssets: RankedMediaCandidate[] = [];

  for (const { query, candidates } of queryResults) {
    const queryCandidates = dedupeCandidatesForQuery(query, candidates)
      .filter(candidate => !selectedIds.has(String(candidate.id)))
      .slice(0, MAX_CANDIDATES_FOR_RANKING);

    candidateCount += queryCandidates.length;

    const rankingResult = await rankMediaCandidates({
      mediaType,
      sceneText: scene.sceneText,
      searchQueries: [query],
      candidates: queryCandidates,
      maxSelections: 1
    });

    rankingStatuses.push(rankingResult.ranking);

    const selectedAsset = rankingResult.assets[0] || buildBestAvailableAsset({
      query,
      candidates: queryCandidates,
      ranking: rankingResult.ranking
    });

    if (!selectedAsset) {
      continue;
    }

    selectedIds.add(String(selectedAsset.id));
    selectedAssets.push(selectedAsset);
  }

  return {
    id: scene.id,
    mediaType,
    sceneText: scene.sceneText,
    searchQueries,
    candidateCount,
    ranking: summarizeRankingStatus(rankingStatuses),
    assets: selectedAssets
  };
}

function dedupeCandidatesForQuery(query: string, candidates: MediaCandidate[] = []): MediaCandidate[] {
  const dedupedCandidates = new Map<MediaCandidate['id'], MediaCandidate & { sourceQueries: string[] }>();

  candidates.forEach(candidate => {
    if (dedupedCandidates.has(candidate.id)) {
      return;
    }

    dedupedCandidates.set(candidate.id, {
      ...candidate,
      sourceQueries: [query]
    });
  });

  return [...dedupedCandidates.values()];
}

function buildBestAvailableAsset({
  query,
  candidates,
  ranking
}: {
  query: string;
  candidates: MediaCandidate[];
  ranking: RankingStatus;
}): RankedMediaCandidate | null {
  const candidate = candidates[0];

  if (!candidate) {
    return null;
  }

  return {
    ...candidate,
    sourceQueries: [query],
    rankScore: 0,
    rankReason: `Pexels returned this as the best available result for "${query}", but it did not meet the ranking threshold.`,
    rankingMode: ranking.appliedMode === 'openai' ? 'openai' : 'heuristic'
  };
}

function getPipeline(mediaType: MediaType): MediaPipeline {
  return MEDIA_PIPELINES[mediaType] || MEDIA_PIPELINES[MEDIA_TYPES.VIDEO];
}

function fetchCandidatesWithCache({
  cache,
  mediaType,
  query,
  perQueryLimit,
  fetchCandidates
}: {
  cache?: SearchCache;
  mediaType: MediaType;
  query: string;
  perQueryLimit: number;
  fetchCandidates: MediaPipeline['fetchCandidates'];
}): Promise<MediaCandidate[]> {
  if (!cache) {
    return fetchCandidates(query, perQueryLimit);
  }

  const cacheKey = `${mediaType}:${perQueryLimit}:${query}`;

  if (!cache.has(cacheKey)) {
    // Store the promise, not only the resolved array. If two scenes ask for the
    // same query at the same time, they share the in-flight request.
    cache.set(cacheKey, fetchCandidates(query, perQueryLimit));
  }

  return cache.get(cacheKey) as Promise<MediaCandidate[]>;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  // Keep result order identical to input order even though individual workers
  // finish at different times. The browser expects scene 1, scene 2, etc.
  const safeConcurrency = Math.max(1, Math.min(Number(concurrency) || 1, items.length || 1));
  const results = new Array<R>(items.length);
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
