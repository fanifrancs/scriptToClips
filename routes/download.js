const express = require('express');
const { streamResultsZip } = require('../utils/zipCreator');

const router = express.Router();

router.post('/', async (req, res) => {
  const { mediaType, results } = req.body;

  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({
      error: 'No scene results were provided for download.'
    });
  }

  try {
    await streamResultsZip(results, res, { mediaType });
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({
        error: error.message || 'Failed to create the ZIP download.'
      });
    }

    res.end();
  }
});

module.exports = router;
