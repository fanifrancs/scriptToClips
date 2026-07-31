const express = require('express');
const { processScenes } = require('../utils/mediaPipeline');
const { validateScenesJson } = require('../utils/sceneJsonValidator');
const { DEFAULT_MEDIA_TYPE, getMediaTypeDetails, normalizeMediaType } = require('../utils/mediaTypes');

const router = express.Router();

router.post('/', async (req, res) => {
  const { mediaType: requestedMediaType, scenesJson } = req.body;
  const validationResult = validateScenesJson(scenesJson);
  const mediaType = normalizeMediaType(requestedMediaType || DEFAULT_MEDIA_TYPE);

  if (!validationResult.valid) {
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
    const scenes = JSON.parse(scenesJson);
    const mediaDetails = getMediaTypeDetails(mediaType);
    const { results, ranking, assetsFound } = await processScenes({ scenes, mediaType });

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
    return res.status(500).json({
      valid: false,
      message: error.message || 'Failed to fetch media from Pexels.',
      errors: ['The media fetch step did not complete.']
    });
  }
});

module.exports = router;
