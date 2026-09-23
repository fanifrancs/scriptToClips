# ScriptToClips

ScriptToClips is a TypeScript Express application that turns a written script into an organized, ready-to-edit stock-media pack.

Paste a script into the app and it handles the scene-planning work behind the scenes: an LLM breaks the script into visual scenes and creates stock-media search queries, then ScriptToClips finds, ranks, and packages matching Pexels videos or pictures. There is no separate ChatGPT prompt or external LLM workflow for users to run.

## Pitch Deck

A slide-by-slide pitch-deck draft is available in [pitch-deck.md](pitch-deck.md). It covers the problem, solution, target users, workflow, features, business model, go-to-market plan, roadmap, and ask.

## Workflow

1. Paste a written script into ScriptToClips.
2. The app sends the script to its LLM-powered scene-processing step.
3. The LLM produces concise scenes and up to two visual, stock-media-friendly search queries for each scene.
4. ScriptToClips validates and normalizes the generated scenes.
5. Choose whether to find videos or pictures.
6. The app fetches Pexels candidates for each scene and ranks the strongest matches.
7. Review and edit scene text or search queries, replace weak results, and select the assets to keep.
8. Download a ZIP containing the selected media and, optionally, scene text and metadata.

## Features

- Direct script input with LLM-powered scene extraction and query generation
- Scene validation and normalization before remote media fetching
- Pexels video and photo search
- Highest-quality available MP4 selection for videos
- High-quality photo source selection for pictures
- OpenAI-based visual ranking, with a heuristic fallback when configured
- Inline editing of scene text and search queries
- Per-scene replacement that excludes already-shown Pexels asset IDs
- Selected-only ZIP export with optional scene text and metadata
- Browser-session persistence
- Request-local Pexels query caching
- Bounded scene-processing concurrency

## Requirements

- Node.js 18 or later
- A Pexels API key
- An OpenAI API key for the LLM-powered script-processing pipeline and AI ranking

When heuristic fallback is enabled, the app can use heuristic media ranking if OpenAI ranking is unavailable. Script interpretation still relies on the app's LLM integration.

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

For development:

```bash
npm run dev
```

For a production build:

```bash
npm start
```

Then open <http://localhost:3000>.

## Environment Variables

- `PEXELS_API_KEY`: Required. Used for Pexels video and photo searches.
- `OPENAI_API_KEY`: Required for LLM script processing and OpenAI media ranking.
- `OPENAI_RANKER_MODEL`: Optional. Model used for media ranking. Defaults to `OPENAI_MODEL`, then `gpt-5-mini`.
- `OPENAI_MODEL`: Optional fallback model name for OpenAI operations.
- `HEURISTIC_FALLBACK_ENABLED`: Optional. Defaults to `true`. Set to `false` to fail instead of using heuristic media ranking when OpenAI ranking is unavailable.
- `MIN_CLIP_RANK_SCORE`: Optional. Minimum accepted ranking score. Defaults to `70`.
- `PEXELS_CANDIDATES_PER_QUERY`: Optional. Number of Pexels candidates fetched per search query. Defaults to `10`.
- `MAX_CANDIDATES_FOR_RANKING`: Optional. Maximum deduplicated candidates retained for ranking per scene. Defaults to `10`.
- `SCENE_PROCESSING_CONCURRENCY`: Optional. Number of scenes processed in parallel during media retrieval. Defaults to `3`.
- `ASSET_DOWNLOAD_TIMEOUT_MS`: Optional. Per-asset timeout, in milliseconds, while streaming files into a ZIP. Defaults to `15000`.
- `ZIP_COMPRESSION_LEVEL`: Optional. ZIP compression level. Defaults to `6`.
- `PORT`: Optional. Defaults to `3000`.

## Scene Processing

The LLM turns the submitted script into an internal array of scene objects. Each scene includes a sequential ID, concise scene text, and one or two lowercase search queries optimized for visual matching on Pexels. Users can review and refine those fields before fetching or replacing media.

Generated scenes follow this shape:

```json
[
  {
    "id": 1,
    "sceneText": "A boy stands outside his house.",
    "searchQueries": ["boy outside house", "child outside home"]
  },
  {
    "id": 2,
    "sceneText": "He walks down a quiet street.",
    "searchQueries": ["boy walking street", "child residential street"]
  }
]
```

The pipeline requires at least one scene. Scene IDs are sequential and 1-based; scene text is non-empty; and each scene has one or two non-empty, lowercase search queries.

## Ranking Behavior

Ranking happens per scene after Pexels candidates are fetched and deduplicated.

- The app prefers OpenAI ranking when `OPENAI_API_KEY` is available.
- If OpenAI ranking succeeds, selected assets are marked as OpenAI-ranked.
- If OpenAI ranking fails for a recoverable reason and fallback is enabled, the app uses heuristic ranking.
- If OpenAI ranking is unavailable and fallback is enabled, the app uses heuristic ranking directly.
- If OpenAI ranking is unavailable and fallback is disabled, media processing fails.

Recoverable fallback reasons include quota, rate-limit, billing, API-key, empty-response, and invalid-JSON issues.

## Media Selection and Downloads

For videos, ScriptToClips chooses the highest-quality available MP4 variant from each returned Pexels video. For pictures, it retains a high-quality image source and returns one strong match per search query.

Downloads are streamed as ZIP files, so remote assets are not buffered fully in memory. Depending on the selected options, an archive can contain:

- one folder per scene
- `scene.txt` with the scene text
- `assets.txt` with source, query, orientation, resolution, duration, reason, and score metadata
- `scene-data.json` with the scene result payload
- selected media files
- `download-errors.txt` when an asset cannot be downloaded

## HTTP Endpoints

- `GET /`: Renders the application and its initial ranking status.
- `POST /review`: Validates generated scene data before media is fetched.
- `POST /process`: Fetches Pexels candidates, ranks them, and returns scene-by-scene results.
- `POST /replace`: Fetches and ranks replacement assets for one scene while excluding previously shown Pexels asset IDs.
- `POST /download`: Streams a ZIP built from selected scene results.

## Project Structure

```text
routes/
  index.ts
  review.ts
  process.ts
  replace.ts
  download.ts
utils/
  clipRanker.ts
  logger.ts
  mediaPipeline.ts
  mediaSelection.ts
  mediaTypes.ts
  pexelsApi.ts
  sceneJsonValidator.ts
  scriptParser.ts
  zipCreator.ts
  rankers/
    openAiClipRanker.ts
    heuristicClipRanker.ts
views/
  index.ejs
public/
  scripts/index.js
  styles/index.css
server.ts
tsconfig.json
pitch-deck.md
```

## Notes

- The server is written in TypeScript and compiles to `dist/` before production startup.
- EJS renders the initial page shell; vanilla browser JavaScript handles client-side interaction.
- Pexels query caching is request-local. It improves duplicate-query performance without persisting user data.
