const { rankWithOpenAI } = require('./rankers/openAiClipRanker');
const { rankWithHeuristics } = require('./rankers/heuristicClipRanker');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_RANKER_MODEL = process.env.OPENAI_RANKER_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini';
const HEURISTIC_FALLBACK_ENABLED = process.env.HEURISTIC_FALLBACK_ENABLED !== 'false';

async function rankMediaCandidates({ mediaType, sceneText, searchQueries, candidates, maxSelections = 2 }) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      assets: [],
      ranking: buildInitialRankingStatus()
    };
  }

  const candidateEntries = candidates.map(candidate => ({
    ...candidate,
    sourceQueries: Array.isArray(candidate.sourceQueries) ? candidate.sourceQueries : []
  }));

  const minimumRankScore = Number(process.env.MIN_CLIP_RANK_SCORE || 70);

  if (!OPENAI_API_KEY) {
    if (!HEURISTIC_FALLBACK_ENABLED) {
      throw new Error('Missing OPENAI_API_KEY in environment.');
    }

    return {
      assets: rankWithHeuristics({
        mediaType,
        sceneText,
        searchQueries,
        candidates: candidateEntries,
        maxSelections,
        minimumRankScore
      }),
      ranking: {
        requestedMode: 'heuristic',
        appliedMode: 'heuristic',
        usedFallback: true,
        fallbackReason: null,
        message: 'OpenAI is unavailable, so heuristic ranking was used instead.'
      }
    };
  }

  try {
    return {
      assets: await rankWithOpenAI({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_RANKER_MODEL,
        mediaType,
        sceneText,
        searchQueries,
        candidates: candidateEntries,
        maxSelections,
        minimumRankScore
      }),
      ranking: {
        requestedMode: 'openai',
        appliedMode: 'openai',
        usedFallback: false,
        fallbackReason: null,
        message: 'OpenAI ranked the media candidates.'
      }
    };
  } catch (error) {
    if (!HEURISTIC_FALLBACK_ENABLED || !shouldUseHeuristicFallback(error)) {
      throw error;
    }

    return {
      assets: rankWithHeuristics({
        mediaType,
        sceneText,
        searchQueries,
        candidates: candidateEntries,
        maxSelections,
        minimumRankScore,
        fallbackReason: error.message
      }),
      ranking: {
        requestedMode: 'openai',
        appliedMode: 'heuristic',
        usedFallback: true,
        fallbackReason: error.message,
        message: 'OpenAI could not be used for ranking, so heuristic ranking was used instead.'
      }
    };
  }
}

function getInitialRankingStatus() {
  if (OPENAI_API_KEY) {
    return {
      requestedMode: 'openai',
      appliedMode: 'openai',
      usedFallback: false,
      fallbackReason: null,
      message: 'OpenAI ranking is available and will be tried first.'
    };
  }

  if (HEURISTIC_FALLBACK_ENABLED) {
    return {
      requestedMode: 'heuristic',
      appliedMode: 'heuristic',
      usedFallback: true,
      fallbackReason: null,
      message: 'OpenAI is unavailable, so heuristic ranking will be used instead.'
    };
  }

  return {
    requestedMode: 'openai',
    appliedMode: 'openai',
    usedFallback: false,
    fallbackReason: null,
    message: 'OpenAI ranking is required for media ranking.'
  };
}

function summarizeRankingStatus(statuses = []) {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    return buildInitialRankingStatus();
  }

  const appliedModes = new Set(statuses.map(status => status.appliedMode));
  const requestedModes = new Set(statuses.map(status => status.requestedMode));

  if (appliedModes.size === 1 && appliedModes.has('openai')) {
    return {
      requestedMode: 'openai',
      appliedMode: 'openai',
      usedFallback: false,
      fallbackReason: null,
      message: 'OpenAI ranked the media candidates.'
    };
  }

  if (appliedModes.size === 1 && appliedModes.has('heuristic')) {
    const startedWithOpenAI = requestedModes.has('openai');

    return {
      requestedMode: startedWithOpenAI ? 'openai' : 'heuristic',
      appliedMode: 'heuristic',
      usedFallback: true,
      fallbackReason: statuses.find(status => status.fallbackReason)?.fallbackReason || null,
      message: startedWithOpenAI
        ? 'OpenAI could not be used for ranking, so heuristic ranking was used instead.'
        : 'OpenAI is unavailable, so heuristic ranking was used instead.'
    };
  }

  return {
    requestedMode: 'openai',
    appliedMode: 'mixed',
    usedFallback: true,
    fallbackReason: statuses.find(status => status.fallbackReason)?.fallbackReason || null,
    message: 'OpenAI ranked some scenes, and heuristic ranking handled the scenes where OpenAI was unavailable.'
  };
}

function buildInitialRankingStatus() {
  return getInitialRankingStatus();
}

function shouldUseHeuristicFallback(error) {
  const message = String(error?.message || '').toLowerCase();

  return (
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('billing') ||
    message.includes('api key') ||
    message.includes('empty ranking response') ||
    message.includes('invalid json')
  );
}

module.exports = {
  getInitialRankingStatus,
  rankClipCandidates: rankMediaCandidates,
  rankMediaCandidates,
  summarizeRankingStatus
};
