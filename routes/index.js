const express = require('express');
const { getInitialRankingStatus } = require('../utils/clipRanker');
const router = express.Router();

const chatGptPrompt = `Generate a JSON output for a script I am going to provide you. Split the script into distinct scenes and structure the result as a valid JSON array of objects, using the format below as an illustration:

[
  {
    "id": 1,
    "sceneText": "leo stands outside his house",
    "searchQueries": ["boy standing outside house", "young boy outside home"]
  },
  {
    "id": 2,
    "sceneText": "leo walks down a quiet street",
    "searchQueries": ["boy walking residential street", "young boy walking neighborhood"]
  }
]

### Requirements:

* Split the script using the original script sentences as closely as possible.
* Do not merge multiple sentences into one scene unless they clearly describe the same exact visual moment.
* Do not invent, infer, expand, or introduce any context that is not explicitly present in the script.
* Each scene should match a sentence or a very small concrete part of a sentence from the script.
* Split the script into very simple, minimal scenes. Each scene must describe only one single action, image, or point of interest.
* sceneText must be clear, short, concrete, and descriptive.
* sceneText should stay close to the script wording, but cleaned up into a simple visual description.
* searchQueries must be highly relevant visual search phrases optimized for stock media search on Pexels.
* Each searchQueries array must contain at most 2 search queries.
* Each search query should be short, usually 2 to 5 words long.
* Use only lowercase for search queries.
* Make the search queries semantic, visual, literal, and easy for Pexels to match.
* Focus the search queries on what should be visibly present on screen: subject, action, and setting.
* Prefer generic visual descriptions over names. Replace character names with searchable descriptions such as "young man", "woman", "child", "older man", "person", etc.
* If possible, make the two search queries complementary rather than repetitive:
  - the first should be the most direct visual match
  - the second should be an alternate phrasing or close stock-footage-friendly variation
* Avoid abstract or non-visual words such as "sadness", "tension", "realization", "success", "betrayal", unless they are represented by a visible action or setting.
* Avoid dialogue, story meaning, camera directions, shot types, brand names, and character names in search queries.
* If a scene contains something too specific for stock footage, rewrite it into the closest broad visual equivalent that someone could realistically find on Pexels.
* Each scene must have a unique incremental id starting from 1.
* Output must be valid JSON only (no extra text, comments, or trailing commas).`;

// Root endpoint
router.get('/', (req, res) => {
  res.render('index', {
    chatGptPrompt,
    initialRankingStatus: getInitialRankingStatus()
  });
});

module.exports = router;
