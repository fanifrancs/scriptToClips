# ScriptToClips

ScriptToClips is an Express app that helps creators turn written scripts into organized, ready-to-edit stock media packs.

The app takes structured scene JSON, validates it, searches Pexels for matching videos or pictures, ranks the best candidates for each scene, previews the results in the browser, lets users replace weak matches, and bundles selected assets into a ZIP download.

## Pitch Deck

A slide-by-slide pitch deck draft is included in:

```text
pitch-deck.md
```

It covers the problem, solution, target users, workflow, features, business model, go-to-market plan, roadmap, and ask.

## How It Works

ScriptToClips currently uses ChatGPT as the script parsing step.

1. Open the app in the browser.
2. Copy the built-in ChatGPT prompt.
3. Paste your script into ChatGPT.
4. ChatGPT returns a JSON array of scene objects.
5. Paste that JSON into ScriptToClips.
6. Review and edit scene text or search queries.
7. Choose video or picture results.
8. Fetch ranked Pexels matches for each scene.
9. Replace any weak scene result.
10. Select which assets should be included.
11. Download a ZIP containing the selected media plus optional metadata.

## Features

- Built-in ChatGPT prompt for scene JSON generation
- Scene JSON validation before remote media fetching
- Review modal for editing scene text and search queries
- Pexels video and photo search
- Highest-quality available MP4 selection for videos
- High-quality photo source selection for pictures
- OpenAI-based visual ranking
- Heuristic ranking fallback when OpenAI is unavailable
- Per-scene replacement flow that avoids already-shown asset IDs
- Selected-only ZIP export
- Optional scene text and metadata files in the ZIP
- Browser session persistence
- Request-local Pexels query caching
- Bounded scene processing concurrency

## Requirements

- Node.js 18+ recommended
- A Pexels API key
- An OpenAI API key if you want AI ranking

OpenAI is optional when heuristic fallback is enabled.

## Setup

Install dependencies:

```bash
npm install
```

Create a `.env` file in the project root:

```env
PEXELS_API_KEY=your_pexels_api_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_RANKER_MODEL=gpt-5-mini
OPENAI_MODEL=gpt-5-mini
HEURISTIC_FALLBACK_ENABLED=true
MIN_CLIP_RANK_SCORE=70
PEXELS_CANDIDATES_PER_QUERY=10
MAX_CANDIDATES_FOR_RANKING=10
SCENE_PROCESSING_CONCURRENCY=3
ASSET_DOWNLOAD_TIMEOUT_MS=15000
ZIP_COMPRESSION_LEVEL=6
PORT=3000
```

## Run

Development:

```bash
npm run dev
```

Production:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Environment Variables

- `PEXELS_API_KEY`: Required. Used for Pexels video and photo search.
- `OPENAI_API_KEY`: Optional if heuristic fallback is enabled. Required if you want OpenAI ranking without fallback.
- `OPENAI_RANKER_MODEL`: Optional. Model used specifically for ranking. Defaults to `OPENAI_MODEL`, then `gpt-5-mini`.
- `OPENAI_MODEL`: Optional fallback model name for ranking.
- `HEURISTIC_FALLBACK_ENABLED`: Optional. Defaults to `true`. Set to `false` to fail instead of falling back when OpenAI is unavailable.
- `MIN_CLIP_RANK_SCORE`: Optional. Minimum accepted ranking score. Defaults to `70`.
- `PEXELS_CANDIDATES_PER_QUERY`: Optional. Number of Pexels candidates fetched per search query. Defaults to `10`.
- `MAX_CANDIDATES_FOR_RANKING`: Optional. Maximum deduplicated candidates kept for ranking per scene. Defaults to `10`.
- `SCENE_PROCESSING_CONCURRENCY`: Optional. Number of scenes processed in parallel during full media fetch. Defaults to `3`.
- `ASSET_DOWNLOAD_TIMEOUT_MS`: Optional. Per-asset timeout when streaming files into a ZIP. Defaults to `15000`.
- `ZIP_COMPRESSION_LEVEL`: Optional. ZIP compression level. Defaults to `6`.
- `PORT`: Optional. Defaults to `3000`.

## Expected JSON Input

The app expects a JSON array of scene objects:

```json
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
```

## Validation Rules

- The top-level payload must be a JSON array.
- The array must contain at least one scene.
- Each scene must be an object.
- `id` must be an integer.
- `id` must match its 1-based position in the array.
- `sceneText` must be a non-empty string.
- `searchQueries` must be an array.
- `searchQueries` must contain at least one query.
- `searchQueries` can contain at most two queries.
- Each query must be a non-empty lowercase string with no leading or trailing spaces.

## Ranking Behavior

Ranking happens per scene after Pexels candidates are fetched and deduplicated.

- If `OPENAI_API_KEY` is available, the app tries OpenAI ranking first.
- If OpenAI succeeds, selected assets are marked as ranked by OpenAI.
- If OpenAI fails for supported recoverable reasons, the app falls back to heuristic ranking when fallback is enabled.
- If no `OPENAI_API_KEY` is present and fallback is enabled, heuristic ranking is used directly.
- If no `OPENAI_API_KEY` is present and fallback is disabled, the request fails.

Recoverable fallback reasons include quota, rate-limit, billing, API key, empty response, and invalid JSON issues.

## Media Selection

For videos, the app picks the highest-quality available MP4 variant from each returned Pexels video.

For pictures, the app keeps a high-quality source URL and returns up to four selected images per scene:

- 2 landscape images
- 2 portrait images

If there are not enough landscape or portrait images, square and remaining candidates are used as fallbacks.

## ZIP Downloads

Downloads are streamed as ZIP files. The browser sends the current result state, including selected assets and packaging options.

Depending on user options, the ZIP can contain:

- one folder per scene
- `scene.txt` with scene text
- `assets.txt` with source, query, orientation, resolution, duration, reason, and score metadata
- `scene-data.json` with the scene result payload
- selected media files
- `download-errors.txt` when a remote asset could not be downloaded

## HTTP Endpoints

### `GET /`

Renders the main app UI and injects the ChatGPT prompt plus initial ranking status.

### `POST /review`

Validates scene JSON and returns normalized scenes for browser-side review.

### `POST /process`

Validates scene JSON, fetches Pexels candidates, ranks them, and returns scene-by-scene results.

Request body:

```json
{
  "mediaType": "video",
  "scenesJson": "[{\"id\":1,\"sceneText\":\"leo stands outside his house\",\"searchQueries\":[\"boy standing outside house\"]}]"
}
```

Successful response shape:

```json
{
  "valid": true,
  "status": "media_fetched",
  "mediaType": "video",
  "message": "Fetched Pexels videos and ranked the best matches.",
  "sceneCount": 1,
  "assetsFound": 1,
  "ranking": {
    "requestedMode": "openai",
    "appliedMode": "openai",
    "usedFallback": false,
    "fallbackReason": null,
    "message": "OpenAI ranked the media candidates."
  },
  "results": [
    {
      "id": 1,
      "mediaType": "video",
      "sceneText": "leo stands outside his house",
      "searchQueries": ["boy standing outside house"],
      "candidateCount": 6,
      "ranking": {
        "requestedMode": "openai",
        "appliedMode": "openai",
        "usedFallback": false,
        "fallbackReason": null,
        "message": "OpenAI ranked the media candidates."
      },
      "assets": []
    }
  ]
}
```

Validation failure response shape:

```json
{
  "valid": false,
  "message": "The JSON payload must be an array of scene objects.",
  "errors": ["Expected a top-level JSON array."]
}
```

### `POST /replace`

Fetches and ranks replacement assets for one scene while excluding already-shown Pexels asset IDs.

### `POST /download`

Creates and streams a ZIP file from the selected scene results.

Request body:

```json
{
  "mediaType": "image",
  "results": [
    {
      "id": 1,
      "sceneText": "leo stands outside his house",
      "searchQueries": ["boy standing outside house"],
      "assets": []
    }
  ],
  "options": {
    "selectedOnly": true,
    "includeMetadata": true,
    "includeSceneText": true
  }
}
```

## Project Structure

```text
routes/
  index.js
  review.js
  process.js
  replace.js
  download.js
utils/
  clipRanker.js
  logger.js
  mediaPipeline.js
  mediaSelection.js
  mediaTypes.js
  pexelsApi.js
  sceneJsonValidator.js
  zipCreator.js
  rankers/
    openAiClipRanker.js
    heuristicClipRanker.js
views/
  index.ejs
public/
  scripts/index.js
  styles/index.css
server.js
pitch-deck.md
```

## Notes

- The backend currently expects `scenesJson` as a stringified JSON array because that matches the browser fetch/form workflow.
- The app uses EJS for the server-rendered page shell and vanilla browser JavaScript for client-side interactions.
- Pexels query caching is request-local only. It improves duplicate-query performance without persisting user data.
- The ZIP builder streams remote media into the archive instead of buffering full files in memory.
