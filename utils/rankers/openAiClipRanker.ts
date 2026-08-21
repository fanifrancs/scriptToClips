import OpenAI from 'openai';
import type { MediaCandidate, MediaType, RankedMediaCandidate } from '../types';

let openaiClient: OpenAI | undefined;

interface OpenAIRankingInput {
  apiKey: string;
  model: string;
  mediaType: MediaType;
  sceneText: string;
  searchQueries: string[];
  candidates: Array<MediaCandidate & { sourceQueries: string[] }>;
  maxSelections: number;
  minimumRankScore: number;
}

interface OpenAISelection {
  id: number | string;
  score: number;
  reason: string;
}

interface OpenAIRankingOutput {
  selections?: OpenAISelection[];
}

export async function rankWithOpenAI({
  apiKey,
  model,
  mediaType,
  sceneText,
  searchQueries,
  candidates,
  maxSelections,
  minimumRankScore
}: OpenAIRankingInput): Promise<RankedMediaCandidate[]> {
  const client = getOpenAIClient(apiKey);
  const rankingSchema = buildRankingSchema(maxSelections);

  // The Responses API is asked for schema-constrained JSON so downstream code
  // can parse selections without scraping natural-language text.
  const response = await client.responses.create({
    model,
    instructions: [
      'You rank stock media candidates for scene matching.',
      'Judge each candidate by how well it matches the requested scene visually.',
      'Use both the candidate metadata and the preview image when available.',
      'Prioritize subject, action, setting, and overall literal visual match.',
      'Penalize candidates that are generic, mismatched, staged differently, or only partially related.',
      'Select at most the requested number of candidates.',
      'Only assign scores of 70 or higher to candidates that are genuinely strong matches.',
      'If none are strong enough, return an empty selections array.',
      'Only choose candidates that are clearly relevant.'
    ].join(' '),
    input: [
      {
        role: 'user',
        content: buildRankingInput({ mediaType, sceneText, searchQueries, candidates, maxSelections })
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'media_ranking',
        strict: true,
        schema: rankingSchema
      }
    }
  });

  const rawOutput = response.output_text || '';

  if (!rawOutput) {
    throw new Error('OpenAI returned an empty ranking response.');
  }

  let parsedOutput: OpenAIRankingOutput;

  try {
    parsedOutput = JSON.parse(rawOutput);
  } catch (error) {
    throw new Error('OpenAI returned invalid JSON while ranking media.');
  }

  const seenCandidateIds = new Set();
  const candidatesById = new Map(candidates.map(candidate => [String(candidate.id), candidate]));

  return (parsedOutput.selections || [])
    .filter(selection => {
      if (selection.score < minimumRankScore) {
        return false;
      }

      if (seenCandidateIds.has(selection.id)) {
        return false;
      }

      seenCandidateIds.add(selection.id);
      return true;
    })
    .map((selection): RankedMediaCandidate | null => {
      const matchedCandidate = candidatesById.get(String(selection.id));

      if (!matchedCandidate) {
        return null;
      }

      return {
        ...matchedCandidate,
        rankScore: selection.score,
        rankReason: selection.reason,
        rankingMode: 'openai' as const
      };
    })
    .filter((candidate): candidate is RankedMediaCandidate => Boolean(candidate))
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, maxSelections);
}

function getOpenAIClient(apiKey: string) {
  // Reuse one client instance for the process. The API key is read from env at
  // startup in clipRanker.js, so recreating a client per scene adds no value.
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }

  return openaiClient;
}

function buildRankingInput({
  mediaType,
  sceneText,
  searchQueries,
  candidates,
  maxSelections
}: Omit<OpenAIRankingInput, 'apiKey' | 'model' | 'minimumRankScore'>) {
  // The input alternates text metadata and preview images. Low image detail is
  // enough for visual relevance checks and is cheaper/faster than high detail.
  const content: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string; detail: 'low' }
  > = [
    {
      type: 'input_text',
      text: [
        `Media type: ${mediaType}`,
        `Scene to match: ${sceneText}`,
        `Search queries used: ${searchQueries.join(', ')}`,
        `Return at most ${maxSelections} strong matches.`,
        'Each candidate appears below with metadata, followed by its preview image when available.'
      ].join('\n')
    }
  ];

  candidates.forEach((candidate, index) => {
    const metadataLines = [
      `Candidate ${index + 1}`,
      `ID: ${candidate.id}`,
      `Title: ${candidate.title || 'unknown'}`,
      `Description: ${candidate.description || 'unknown'}`,
      `Source queries: ${candidate.sourceQueries.join(', ') || 'unknown'}`,
      `Orientation: ${candidate.orientation || 'unknown'}`,
      `Resolution: ${candidate.width || '?'}x${candidate.height || '?'}`,
      `Creator: ${candidate.creator || 'unknown'}`
    ];

    if (Number.isFinite(candidate.duration)) {
      metadataLines.splice(5, 0, `Duration: ${formatDurationSeconds(candidate.duration)}`);
    }

    content.push({
      type: 'input_text',
      text: metadataLines.join('\n')
    });

    if (candidate.thumbnail || candidate.previewUrl) {
      content.push({
        type: 'input_image',
        image_url: candidate.thumbnail || candidate.previewUrl,
        detail: 'low'
      });
    }
  });

  return content;
}

function buildRankingSchema(maxSelections: number) {
  // The schema restricts the model to candidate ids, integer scores, and short
  // reasons. maxItems protects callers from receiving more assets than the UI
  // is prepared to render for a scene.
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      selections: {
        type: 'array',
        maxItems: maxSelections,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: {
              type: 'integer'
            },
            score: {
              type: 'integer',
              minimum: 0,
              maximum: 100
            },
            reason: {
              type: 'string'
            }
          },
          required: ['id', 'score', 'reason']
        }
      }
    },
    required: ['selections']
  };
}

function formatDurationSeconds(value: unknown) {
  if (!Number.isFinite(value)) {
    return 'unknown';
  }

  return `${value} seconds`;
}
