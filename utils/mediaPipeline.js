const { rankMediaCandidates, summarizeRankingStatus } = require('./clipRanker');
const { dedupeCandidatesById, selectImageResults } = require('./mediaSelection');
const { MEDIA_TYPES } = require('./mediaTypes');
const { searchPhotos, searchVideos } = require('./pexelsApi');

const PEXELS_CANDIDATES_PER_QUERY = Number(process.env.PEXELS_CANDIDATES_PER_QUERY || 10);
const MAX_CANDIDATES_FOR_RANKING = Number(process.env.MAX_CANDIDATES_FOR_RANKING || 10);

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
  const results = [];
  const rankingStatuses = [];

  for (const scene of scenes) {
    const searchQueries = [...new Set(scene.searchQueries.map(query => query.trim().toLowerCase()))];
    const queryResults = await Promise.all(
      searchQueries.map(async query => ({
        query,
        candidates: await pipeline.fetchCandidates(query, PEXELS_CANDIDATES_PER_QUERY)
      }))
    );

    const candidates = dedupeCandidatesById(queryResults).slice(0, MAX_CANDIDATES_FOR_RANKING);
    const rankingResult = await rankMediaCandidates({
      mediaType,
      sceneText: scene.sceneText,
      searchQueries,
      candidates,
      maxSelections: pipeline.getRankingSelectionLimit(candidates)
    });

    const selectedAssets = pipeline.finalizeSelections(rankingResult.assets);
    rankingStatuses.push(rankingResult.ranking);

    results.push({
      id: scene.id,
      mediaType,
      sceneText: scene.sceneText,
      searchQueries,
      candidateCount: candidates.length,
      ranking: rankingResult.ranking,
      assets: selectedAssets
    });
  }

  return {
    results,
    ranking: summarizeRankingStatus(rankingStatuses),
    assetsFound: results.reduce((total, scene) => total + scene.assets.length, 0)
  };
}

function getPipeline(mediaType) {
  return MEDIA_PIPELINES[mediaType] || MEDIA_PIPELINES[MEDIA_TYPES.VIDEO];
}

module.exports = { processScenes };
