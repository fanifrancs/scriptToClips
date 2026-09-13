import express from 'express';
import { createRequestLogger } from '../utils/logger';
import { streamResultsZip } from '../utils/zipCreator';

const router = express.Router();

router.post('/', async (req, res) => {
  const log = createRequestLogger('download');

  // The browser sends the current in-memory result list, including selection
  // checkboxes. The server does not refetch/rerank here; it only packages the
  // provided asset URLs into a ZIP stream.
  const { mediaType, results, options } = req.body;

  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({
      error: 'No scene results were provided for download.'
    });
  }

  try {
    log.info('zip_started', {
      mediaType,
      sceneCount: results.length,
      options: options || {}
    });

    // streamResultsZip writes directly to the response. Once headers/body
    // have started, errors must end the stream instead of returning JSON.
    await streamResultsZip(results, res, { mediaType, ...options });

    log.info('zip_completed', {
      mediaType,
      sceneCount: results.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create the ZIP download.';

    log.error('zip_failed', {
      mediaType,
      message
    });

    if (!res.headersSent) {
      return res.status(500).json({
        error: message
      });
    }

    res.end();
  }
});

export default router;
