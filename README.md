# ScriptToClips

ScriptToClips is an Express app that takes scene JSON, fetches matching stock media from Pexels, ranks the best results for each scene, previews them in the browser, and bundles the selected assets into a ZIP download.

The app does not split scripts into scenes on the backend. Instead, the UI gives you a prompt to use in ChatGPT, and you paste the returned JSON into the app.

## Current Flow

1. Open the app in the browser.
2. Copy the built-in ChatGPT prompt.
3. Paste your script into ChatGPT and get back a JSON array of scene objects.
4. Paste that JSON into ScriptToClips.
5. The app validates the JSON.
6. Choose whether you want video or picture results.
7. For each scene, the app searches Pexels using up to two search queries.
8. Candidate results are ranked with OpenAI when available.
9. If OpenAI cannot be used and fallback is enabled, heuristic ranking is used instead.
10. The best results are shown on the results page.
11. Clicking `Download All` creates a ZIP containing the selected assets plus scene and asset metadata files.

## Features

- Scene JSON validation before any media fetching starts
- Pexels video and photo search for each scene query
- Highest-quality available MP4 selected for video preview and download
- Highest-quality available photo source selected for picture preview and download
- OpenAI-based media ranking with heuristic fallback
- Ranking status surfaced in the UI
- ZIP export of the selected assets for all scenes

## Requirements

- Node.js 18+ recommended
- A Pexels API key
- An OpenAI API key if you want AI ranking

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the project root.

3. Add the environment variables you need:

```env
PEXELS_API_KEY=your_pexels_api_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_RANKER_MODEL=gpt-5-mini
OPENAI_MODEL=gpt-5-mini
HEURISTIC_FALLBACK_ENABLED=true
MIN_CLIP_RANK_SCORE=70
PEXELS_CANDIDATES_PER_QUERY=10
MAX_CANDIDATES_FOR_RANKING=10
PORT=3000
```

## Environment Variables

- `PEXELS_API_KEY`: Required. Used for Pexels video and photo search.
- `OPENAI_API_KEY`: Optional if heuristic fallback is enabled. Required if you want OpenAI ranking.
- `OPENAI_RANKER_MODEL`: Optional. Model used specifically for ranking. Defaults to `OPENAI_MODEL`, then `gpt-5-mini`.
- `OPENAI_MODEL`: Optional fallback model name for ranking.
- `HEURISTIC_FALLBACK_ENABLED`: Optional. Defaults to `true`. Set to `false` to fail instead of falling back when OpenAI is unavailable.
- `MIN_CLIP_RANK_SCORE`: Optional. Minimum accepted ranking score. Defaults to `70`.
- `PEXELS_CANDIDATES_PER_QUERY`: Optional. Number of Pexels candidates fetched per search query. Defaults to `10`.
- `MAX_CANDIDATES_FOR_RANKING`: Optional. Maximum deduplicated candidates kept for ranking per scene. Defaults to `10`.
- `PORT`: Optional. Defaults to `3000`.

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

## Expected JSON Input

The app expects a JSON array of scene objects in this shape:

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

- The top-level payload must be a JSON array
- The array must contain at least one scene
- Each scene must be an object
- `id` must be an integer
- `id` must match its 1-based position in the array
- `sceneText` must be a non-empty string
- `searchQueries` must be an array
- `searchQueries` must contain at least one query
- `searchQueries` can contain at most two queries
- Each query must be a non-empty lowercase string with no leading or trailing spaces

## Ranking Behavior

Ranking happens per scene after Pexels candidates are fetched and deduplicated.

- If `OPENAI_API_KEY` is available, the app tries OpenAI ranking first.
- If OpenAI succeeds, selected results are marked as ranked by OpenAI.
- If OpenAI fails for supported recoverable reasons such as quota, rate-limit, billing, API key, empty response, or invalid JSON issues, the app falls back to heuristic ranking when fallback is enabled.
- If no `OPENAI_API_KEY` is present and fallback is enabled, heuristic ranking is used directly.
- If no `OPENAI_API_KEY` is present and fallback is disabled, the request fails.

The UI shows which ranking path is being used.

## Pexels Selection

For each returned Pexels video, the app picks the highest-quality available MP4 variant. That same selected file URL is used for:

- preview playback in the browser
- ranking metadata
- ZIP download bundling

For each returned Pexels photo, the app keeps the highest-quality source image available. Picture mode then returns up to four selected images per scene:

- 2 landscape images
- 2 portrait images

## HTTP Endpoints

### `GET /`

Renders the main app UI.

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

### `POST /download`

Creates and streams a ZIP file from the selected results returned by `/process`.

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
  ]
}
```

The ZIP contains:

- one folder per scene
- `scene.txt` with the scene text
- `assets.txt` with source, query, reason, and score metadata
- the selected asset files
- `download-errors.txt` when an asset could not be fetched during ZIP creation

## Project Structure

```text
routes/
  index.js
  process.js
  download.js
utils/
  clipRanker.js
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
```

## Notes

- The backend currently expects `scenesJson` as a stringified JSON array, because that matches the browser form submission flow.
- The app uses EJS for server-rendered pages and vanilla browser JavaScript for client-side interactions.
