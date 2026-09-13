import type { MediaCandidate, MediaType, RankedMediaCandidate } from '../types';

const HEURISTIC_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'be', 'by', 'for', 'from', 'his', 'her', 'in', 'into', 'is',
  'it', 'of', 'on', 'or', 'that', 'the', 'their', 'this', 'to', 'with', 'young'
]);

interface HeuristicRankingInput {
  mediaType: MediaType;
  sceneText: string;
  searchQueries: string[];
  candidates: Array<MediaCandidate & { sourceQueries: string[] }>;
  maxSelections: number;
  minimumRankScore: number;
  fallbackReason?: string;
}

export function rankWithHeuristics({
  mediaType,
  sceneText,
  searchQueries,
  candidates,
  maxSelections,
  minimumRankScore,
  fallbackReason
}: HeuristicRankingInput): RankedMediaCandidate[] {
  // The heuristic ranker is intentionally transparent and cheap. It scores
  // keyword overlap, source query overlap, duration, resolution, and orientation
  // so the app can still return usable results when OpenAI is unavailable.
  const sceneKeywords = extractKeywords(sceneText);
  const queryKeywords = extractKeywords(searchQueries.join(' '));
  const scoringKeywords = [...new Set([...sceneKeywords, ...queryKeywords])];

  return candidates
    .map((candidate): RankedMediaCandidate => {
      const metadataKeywords = extractKeywords([
        candidate.title,
        candidate.description,
        candidate.creator,
        candidate.sourceQueries.join(' ')
      ].join(' '));
      const overlappingKeywords = scoringKeywords.filter(keyword => metadataKeywords.includes(keyword));

      let score = 35;

      // Keyword overlap is the strongest signal because Pexels metadata is
      // text-first. The score starts below the acceptance threshold so weak
      // candidates need multiple supporting signals to survive.
      score += overlappingKeywords.length * 12;

      if (candidate.sourceQueries.some(query => searchQueries.includes(query))) {
        score += 10;
      }

      if (mediaType === 'video' && typeof candidate.duration === 'number') {
        if (candidate.duration >= 4 && candidate.duration <= 30) {
          score += 8;
        } else if (candidate.duration > 60) {
          score -= 8;
        }
      }

      if (candidate.width && candidate.height) {
        score += getResolutionBonus(candidate.width, candidate.height);
      }

      if (candidate.orientation === 'landscape' || candidate.orientation === 'portrait') {
        score += 3;
      }

      score = Math.max(0, Math.min(100, score));

      return {
        ...candidate,
        rankScore: score,
        rankReason: buildHeuristicReason({
          mediaType,
          overlappingKeywords,
          candidate,
          fallbackReason
        }),
        rankingMode: 'heuristic' as const
      };
    })
    .filter(candidate => candidate.rankScore >= minimumRankScore)
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, maxSelections);
}

function extractKeywords(text = ''): string[] {
  // Lowercase tokenization plus stop-word removal keeps common filler words
  // from inflating scores. The Set also prevents repeated words from counting
  // multiple times.
  return [...new Set(
    String(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(word => word.length > 2 && !HEURISTIC_STOP_WORDS.has(word))
  )];
}

function buildHeuristicReason({
  mediaType,
  overlappingKeywords,
  candidate,
  fallbackReason
}: {
  mediaType: MediaType;
  overlappingKeywords: string[];
  candidate: MediaCandidate;
  fallbackReason?: string;
}) {
  // Reasons are included in the UI and ZIP metadata, so they are written as
  // human-facing notes instead of raw scoring internals.
  const matchedTerms = overlappingKeywords.length > 0
    ? `Matched terms: ${overlappingKeywords.slice(0, 4).join(', ')}.`
    : 'Matched through source query overlap and metadata similarity.';

  const durationNote = mediaType === 'video' && Number.isFinite(candidate.duration)
    ? ` Duration: ${candidate.duration}s.`
    : '';

  const orientationNote = candidate.orientation && candidate.orientation !== 'unknown'
    ? ` Orientation: ${candidate.orientation}.`
    : '';

  const resolutionNote = candidate.width && candidate.height
    ? ` Resolution: ${candidate.width}x${candidate.height}.`
    : '';

  const fallbackNote = fallbackReason
    ? ' Heuristic fallback used because the OpenAI ranker was unavailable.'
    : ' Heuristic scoring used.';

  return `${matchedTerms}${durationNote}${orientationNote}${resolutionNote}${fallbackNote}`;
}

function getResolutionBonus(width: number, height: number) {
  const pixelCount = Number(width) * Number(height);

  if (pixelCount >= 3840 * 2160) {
    return 8;
  }

  if (pixelCount >= 1920 * 1080) {
    return 6;
  }

  if (pixelCount > 0) {
    return 4;
  }

  return 0;
}
