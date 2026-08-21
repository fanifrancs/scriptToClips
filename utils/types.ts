import type { Response } from 'express';

export type MediaType = 'video' | 'image';
export type Orientation = 'landscape' | 'portrait' | 'square' | 'unknown';
export type RankingMode = 'openai' | 'heuristic' | 'mixed';

export interface Scene {
  id: number;
  sceneText: string;
  searchQueries: string[];
}

export interface MediaCandidate {
  id: number | string;
  mediaType: MediaType;
  title: string;
  description: string;
  url: string;
  previewUrl: string;
  thumbnail: string;
  width: number | null;
  height: number | null;
  orientation: Orientation;
  pexelsUrl: string;
  creator: string;
  duration?: number;
  sourceQueries?: string[];
  rankScore?: number;
  rankReason?: string;
  rankingMode?: Exclude<RankingMode, 'mixed'>;
  isSelected?: boolean;
}

export interface RankedMediaCandidate extends MediaCandidate {
  sourceQueries: string[];
  rankScore: number;
  rankReason: string;
  rankingMode: Exclude<RankingMode, 'mixed'>;
}

export interface RankingStatus {
  requestedMode: Exclude<RankingMode, 'mixed'>;
  appliedMode: RankingMode;
  usedFallback: boolean;
  fallbackReason: string | null;
  message: string;
}

export interface SceneProcessingResult {
  id: number;
  mediaType: MediaType;
  sceneText: string;
  searchQueries: string[];
  candidateCount: number;
  ranking: RankingStatus;
  assets: RankedMediaCandidate[];
}

export interface ValidationResult {
  valid: boolean;
  message: string;
  errors: string[];
  sceneCount?: number;
  scenes?: Scene[];
}

export interface Logger {
  id: string;
  info: (event: string, details?: Record<string, unknown>) => void;
  error: (event: string, details?: Record<string, unknown>) => void;
}

export interface ZipOptions {
  includeMetadata?: boolean;
  includeSceneText?: boolean;
  selectedOnly?: boolean;
  mediaType?: MediaType | string | null;
}

export type ZipResponse = Response;
