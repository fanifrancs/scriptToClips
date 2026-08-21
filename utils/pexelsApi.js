const axios = require('axios');
const { MEDIA_TYPES } = require('./mediaTypes');

const API_KEY = process.env.PEXELS_API_KEY;
const VIDEO_SEARCH_URL = 'https://api.pexels.com/videos/search';
const PHOTO_SEARCH_URL = 'https://api.pexels.com/v1/search';

async function searchVideos(query, perPage = 5) {
  // Pexels videos include several encodes for each result. The app exposes one
  // downloadable URL per candidate, so each video is normalized to the best mp4
  // file plus common metadata used by both rankers and the ZIP manifest.
  const response = await searchPexels(VIDEO_SEARCH_URL, query, perPage);

  return response.data.videos.map(video => {
    const selectedVideoFile = pickVideoFile(video.video_files);
    const width = selectedVideoFile?.width || null;
    const height = selectedVideoFile?.height || null;
    const title = deriveVideoTitle(video.url);

    return {
      id: video.id,
      mediaType: MEDIA_TYPES.VIDEO,
      title,
      description: title,
      url: selectedVideoFile?.link || '',
      previewUrl: selectedVideoFile?.link || '',
      duration: video.duration,
      thumbnail: video.image,
      width,
      height,
      orientation: determineOrientation(width, height),
      pexelsUrl: video.url,
      creator: video.user?.name || ''
    };
  }).filter(video => video.url);
}

async function searchPhotos(query, perPage = 5) {
  // Photo search returns a src object with multiple sizes. The app keeps an
  // original/high-quality URL for ZIP output and smaller URLs for browser
  // preview/thumbnail display.
  const response = await searchPexels(PHOTO_SEARCH_URL, query, perPage);

  return response.data.photos.map(photo => {
    const width = Number(photo.width) || null;
    const height = Number(photo.height) || null;
    const title = derivePhotoTitle(photo);

    return {
      id: photo.id,
      mediaType: MEDIA_TYPES.IMAGE,
      title,
      description: photo.alt || title,
      url: pickPhotoAssetUrl(photo.src),
      previewUrl: pickPhotoPreviewUrl(photo.src),
      thumbnail: pickPhotoThumbnailUrl(photo.src),
      width,
      height,
      orientation: determineOrientation(width, height),
      pexelsUrl: photo.url,
      creator: photo.photographer || ''
    };
  }).filter(photo => photo.url);
}

async function searchPexels(url, query, perPage) {
  if (!API_KEY) {
    throw new Error('Missing PEXELS_API_KEY in environment.');
  }

  try {
    // axios builds the query string from params and sends the Pexels API key in
    // the Authorization header required by Pexels.
    return await axios.get(url, {
      headers: { Authorization: API_KEY },
      params: { query, per_page: perPage }
    });
  } catch (error) {
    throw new Error('Pexels API error: ' + error.message);
  }
}

function pickVideoFile(videoFiles = []) {
  // Choose the best mp4 in one pass instead of sorting the full list. The
  // quality comparison below mirrors the old sort order: resolution first,
  // then quality label, then file id as a deterministic tie-breaker.
  return videoFiles.reduce((bestFile, file) => {
    if (file.file_type !== 'video/mp4') {
      return bestFile;
    }

    if (!bestFile || isBetterVideoFile(file, bestFile)) {
      return file;
    }

    return bestFile;
  }, null);
}

function isBetterVideoFile(candidate, currentBest) {
  const candidatePixels = getPixelCount(candidate);
  const currentPixels = getPixelCount(currentBest);

  if (candidatePixels !== currentPixels) {
    return candidatePixels > currentPixels;
  }

  const qualityDelta = getQualityRank(candidate?.quality) - getQualityRank(currentBest?.quality);

  if (qualityDelta !== 0) {
    return qualityDelta > 0;
  }

  return getFileId(candidate) > getFileId(currentBest);
}

function getPixelCount(videoFile = {}) {
  const width = Number(videoFile.width) || 0;
  const height = Number(videoFile.height) || 0;
  return width * height;
}

function getQualityRank(quality = '') {
  const normalizedQuality = String(quality).toLowerCase();

  if (normalizedQuality === 'uhd') {
    return 3;
  }

  if (normalizedQuality === 'hd') {
    return 2;
  }

  if (normalizedQuality === 'sd') {
    return 1;
  }

  return 0;
}

function getFileId(videoFile = {}) {
  return Number(videoFile.id) || 0;
}

function deriveVideoTitle(pexelsUrl = '') {
  // Pexels URLs usually end with a slug and numeric id. Splitting before the
  // final dash removes that id and turns the slug into readable metadata.
  const slug = pexelsUrl
    .split('/video/')[1]
    ?.split('-')
    .slice(0, -1)
    .join(' ')
    .trim();

  return slug || '';
}

function derivePhotoTitle(photo = {}) {
  if (photo.alt && String(photo.alt).trim()) {
    return String(photo.alt).trim();
  }

  const slug = String(photo.url || '')
    .split('/photo/')[1]
    ?.split('-')
    .slice(0, -1)
    .join(' ')
    .trim();

  return slug || 'pexels photo';
}

function pickPhotoAssetUrl(photoSource = {}) {
  return (
    photoSource.original ||
    photoSource.large2x ||
    photoSource.large ||
    photoSource.medium ||
    photoSource.small ||
    ''
  );
}

function pickPhotoPreviewUrl(photoSource = {}) {
  return (
    photoSource.large2x ||
    photoSource.large ||
    photoSource.medium ||
    photoSource.small ||
    photoSource.original ||
    ''
  );
}

function pickPhotoThumbnailUrl(photoSource = {}) {
  return (
    photoSource.medium ||
    photoSource.small ||
    photoSource.large ||
    photoSource.original ||
    ''
  );
}

function determineOrientation(width, height) {
  // Orientation is computed once at API-normalization time so later UI, image
  // selection, and ZIP manifest code can use the same simple field.
  if (!width || !height) {
    return 'unknown';
  }

  if (width === height) {
    return 'square';
  }

  return width > height ? 'landscape' : 'portrait';
}

module.exports = {
  searchPhotos,
  searchVideos
};
