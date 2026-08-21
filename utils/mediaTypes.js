const MEDIA_TYPES = Object.freeze({
  VIDEO: 'video',
  IMAGE: 'image'
});

const DEFAULT_MEDIA_TYPE = MEDIA_TYPES.VIDEO;

// Central media metadata keeps backend messages and selection behavior aligned.
// Routes import these labels instead of hardcoding "clip"/"picture" wording in
// multiple places, which reduces drift when adding another media type later.
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
  // Treat media type as user/client input: trim it, lowercase it, and return
  // null instead of throwing so routes can send a clean 400 response.
  const normalizedValue = String(value || '').trim().toLowerCase();

  if (normalizedValue === MEDIA_TYPES.VIDEO || normalizedValue === MEDIA_TYPES.IMAGE) {
    return normalizedValue;
  }

  return null;
}

function getMediaTypeDetails(mediaType = DEFAULT_MEDIA_TYPE) {
  // Fall back to video details for display-only usage. Validation-sensitive
  // code should still call normalizeMediaType first when accepting client input.
  return MEDIA_TYPE_DETAILS[mediaType] || MEDIA_TYPE_DETAILS[DEFAULT_MEDIA_TYPE];
}

module.exports = {
  DEFAULT_MEDIA_TYPE,
  MEDIA_TYPES,
  getMediaTypeDetails,
  normalizeMediaType
};
