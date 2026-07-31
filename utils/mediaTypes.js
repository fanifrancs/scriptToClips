const MEDIA_TYPES = Object.freeze({
  VIDEO: 'video',
  IMAGE: 'image'
});

const DEFAULT_MEDIA_TYPE = MEDIA_TYPES.VIDEO;

const MEDIA_TYPE_DETAILS = Object.freeze({
  [MEDIA_TYPES.VIDEO]: {
    value: MEDIA_TYPES.VIDEO,
    label: 'Video',
    pluralLabel: 'videos',
    resultLabel: 'clips',
    sourceLabel: 'clip',
    buttonLabel: 'Get Videos',
    emptyStateLabel: 'clips'
  },
  [MEDIA_TYPES.IMAGE]: {
    value: MEDIA_TYPES.IMAGE,
    label: 'Pictures',
    pluralLabel: 'pictures',
    resultLabel: 'pictures',
    sourceLabel: 'picture',
    buttonLabel: 'Get Pictures',
    emptyStateLabel: 'pictures'
  }
});

function normalizeMediaType(value) {
  const normalizedValue = String(value || '').trim().toLowerCase();

  if (normalizedValue === MEDIA_TYPES.VIDEO || normalizedValue === MEDIA_TYPES.IMAGE) {
    return normalizedValue;
  }

  return null;
}

function getMediaTypeDetails(mediaType = DEFAULT_MEDIA_TYPE) {
  return MEDIA_TYPE_DETAILS[mediaType] || MEDIA_TYPE_DETAILS[DEFAULT_MEDIA_TYPE];
}

module.exports = {
  DEFAULT_MEDIA_TYPE,
  MEDIA_TYPES,
  getMediaTypeDetails,
  normalizeMediaType
};
