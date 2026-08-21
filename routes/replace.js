const express = require('express');
const { processSingleScene } = require('../utils/mediaPipeline');
const { DEFAULT_MEDIA_TYPE, getMediaTypeDetails, normalizeMediaType } = require('../utils/mediaTypes');
const { createRequestLogger } = require('../utils/logger');
const { validateScenesJson } = require('../utils/sceneJsonValidator');

const router = express.Router();

router.post('/', async (req, res) => {
  const log = createRequestLogger('replace');

  // Replacement receives a single scene from the browser plus the Pexels ids
  // already shown. Those ids are excluded later so the replacement button is
  // more likely to produce a visibly different result.
  const mediaType = normalizeMediaType(req.body.mediaType || DEFAULT_MEDIA_TYPE);
  const scene = req.body.scene;
  const excludedAssetIds = Array.isArray(req.body.excludedAssetIds) ? req.body.excludedAssetIds : [];

  if (!mediaType) {
    return res.status(400).json({
      valid: false,
      message: 'The selected result type is not supported.',
      errors: ['Use either "video" or "image" for mediaType.']
    });
  }

  // The validator expects an array, so a single replacement scene is wrapped in
  // one item. This keeps replacement rules identical to the full workflow.
  const validationResult = validateScenesJson(JSON.stringify([{ ...scene, id: 1 }]));

  if (!validationResult.valid) {
    log.info('validation_failed', { errors: validationResult.errors });
    return res.status(400).json(validationResult);
  }

  try {
    log.info('replacement_started', {
      mediaType,
      sceneId: scene.id,
      excludedAssetCount: excludedAssetIds.length
    });

    const result = await processSingleScene({
      scene: {
        // validateScenesJson wrapped the scene as id 1 so it could reuse the
        // normal sequence checks. Restore the original scene id before sending
        // the response so the browser can replace the correct card.
        ...validationResult.scenes[0],
        id: scene.id
      },
      mediaType,
      excludedAssetIds
    });
    const mediaDetails = getMediaTypeDetails(mediaType);

    log.info('replacement_completed', {
      sceneId: result.id,
      assetCount: result.assets.length,
      candidateCount: result.candidateCount,
      rankingMode: result.ranking.appliedMode
    });

    return res.json({
      valid: true,
      status: 'replacement_fetched',
      mediaType,
      message: `Fetched replacement Pexels ${mediaDetails.pluralLabel}.`,
      result
    });
  } catch (error) {
    log.error('replacement_failed', {
      message: error.message,
      sceneId: scene?.id
    });

    return res.status(500).json({
      valid: false,
      message: error.message || 'Failed to fetch a replacement result.',
      errors: ['The replacement fetch step did not complete.']
    });
  }
});

module.exports = router;
