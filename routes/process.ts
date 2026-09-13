import express from 'express';
import { createRequestLogger } from '../utils/logger';
import { DEFAULT_MEDIA_TYPE, getMediaTypeDetails, normalizeMediaType } from '../utils/mediaTypes';
import { processScenes } from '../utils/mediaPipeline';
import { validateScenesJson } from '../utils/sceneJsonValidator';

const router = express.Router();

router.post('/', async (req, res) => {
  const log = createRequestLogger('process');
  const { mediaType: requestedMediaType, scenesJson } = req.body;

  // Validation happens before mediaType handling because invalid JSON should
  // produce JSON-specific feedback instead of a generic processing failure.
  const validationResult = validateScenesJson(scenesJson);

  // normalizeMediaType returns null for unsupported values. The DEFAULT value
  // covers older clients that did not yet send a mediaType field.
  const mediaType = normalizeMediaType(requestedMediaType || DEFAULT_MEDIA_TYPE);

  if (!validationResult.valid) {
    log.info('validation_failed', {
      errorCount: validationResult.errors.length
    });

    return res.status(400).json(validationResult);
  }

  if (!mediaType) {
    return res.status(400).json({
      valid: false,
      message: 'The selected result type is not supported.',
      errors: ['Use either "video" or "image" for mediaType.']
    });
  }

  try {
    // From this point forward, scenes are normalized by the validator:
    // sequential ids, trimmed sceneText, and at most two lowercase queries.
    const scenes = validationResult.scenes || [];
    const mediaDetails = getMediaTypeDetails(mediaType);

    log.info('media_processing_started', {
      mediaType,
      sceneCount: scenes.length
    });

    // processScenes owns the expensive work: Pexels searches, deduping,
    // OpenAI/heuristic ranking, and final per-scene asset selection.
    const { results, ranking, assetsFound } = await processScenes({ scenes, mediaType });

    log.info('media_processing_completed', {
      mediaType,
      sceneCount: results.length,
      assetsFound,
      rankingMode: ranking.appliedMode
    });

    return res.json({
      valid: true,
      status: 'media_fetched',
      mediaType,
      message: `Fetched Pexels ${mediaDetails.pluralLabel} and ranked the best matches.`,
      sceneCount: results.length,
      assetsFound,
      ranking,
      results
    });
  } catch (error) {
    // This catch covers remote API failures and unexpected pipeline errors.
    // Validation errors are handled above so they can keep their 400 status.
    const message = error instanceof Error ? error.message : 'Failed to fetch media from Pexels.';

    log.error('media_processing_failed', {
      mediaType,
      message
    });

    return res.status(500).json({
      valid: false,
      message,
      errors: ['The media fetch step did not complete.']
    });
  }
});

export default router;
