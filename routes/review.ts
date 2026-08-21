import express from 'express';
import { createRequestLogger } from '../utils/logger';
import { validateScenesJson } from '../utils/sceneJsonValidator';

const router = express.Router();

router.post('/', (req, res) => {
  const log = createRequestLogger('review');

  // Review is deliberately a cheap server step. It does not call Pexels or
  // OpenAI; it only proves the pasted JSON has the exact shape required by the
  // later media pipeline. This lets users fix scene text/search queries before
  // spending time on network-heavy work.
  const validationResult = validateScenesJson(req.body.scenesJson);

  log.info('validation_completed', {
    valid: validationResult.valid,
    sceneCount: validationResult.sceneCount || 0,
    errorCount: validationResult.errors?.length || 0
  });

  if (!validationResult.valid) {
    // The validator response already contains user-facing messages and a list
    // of field-specific errors, so the route returns it directly.
    return res.status(400).json(validationResult);
  }

  return res.json({
    valid: true,
    message: 'Scenes are ready to review.',
    sceneCount: validationResult.sceneCount,
    scenes: validationResult.scenes
  });
});

export default router;
