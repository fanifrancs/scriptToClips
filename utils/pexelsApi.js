const axios = require('axios');
const { MEDIA_TYPES } = require('./mediaTypes');

const API_KEY = process.env.PEXELS_API_KEY;
const VIDEO_SEARCH_URL = 'https://api.pexels.com/videos/search';
const PHOTO_SEARCH_URL = 'https://api.pexels.com/v1/search';

async function searchVideos(query, perPage = 5) {
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
    return await axios.get(url, {
      headers: { Authorization: API_KEY },
      params: { query, per_page: perPage }
    });
  } catch (error) {
    throw new Error('Pexels API error: ' + error.message);
  }
}

function pickVideoFile(videoFiles = []) {
  const mp4Files = videoFiles.filter(file => file.file_type === 'video/mp4');

  if (mp4Files.length === 0) {
    return null;
  }

  return [...mp4Files].sort(compareVideoFilesByQuality)[0] || null;
}

function compareVideoFilesByQuality(left, right) {
  const leftPixels = getPixelCount(left);
  const rightPixels = getPixelCount(right);

  if (rightPixels !== leftPixels) {
    return rightPixels - leftPixels;
  }

  const qualityDelta = getQualityRank(right?.quality) - getQualityRank(left?.quality);

  if (qualityDelta !== 0) {
    return qualityDelta;
  }

  return getFileId(right) - getFileId(left);
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
