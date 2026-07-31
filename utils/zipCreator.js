const archiver = require('archiver');
const axios = require('axios');
const { DEFAULT_MEDIA_TYPE, MEDIA_TYPES, normalizeMediaType } = require('./mediaTypes');

async function streamResultsZip(results, res, options = {}) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const archiveCompletion = new Promise((resolve, reject) => {
    archive.on('error', reject);
    res.on('finish', resolve);
    res.on('error', reject);
  });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="script-to-clips-${Date.now()}.zip"`);

  archive.pipe(res);

  for (const [index, scene] of results.entries()) {
    const folderName = buildSceneFolderName(scene, index);
    const sceneText = typeof scene.sceneText === 'string' ? scene.sceneText : '';
    const mediaType = resolveSceneMediaType(scene, options.mediaType);
    const assets = getSceneAssets(scene);

    archive.append(sceneText, { name: `${folderName}/scene.txt` });

    const failedDownloads = [];
    const assetManifest = assets.length > 0
      ? assets.map((asset, assetIndex) => {
        const assetName = buildAssetFileName(asset, assetIndex, mediaType);
        const assetLabel = mediaType === MEDIA_TYPES.IMAGE ? 'image' : 'clip';

        return [
          `${assetLabel} ${assetIndex + 1}`,
          `file: ${assetName}`,
          `source: ${asset.pexelsUrl || asset.url || 'unknown'}`,
          `queries: ${(asset.sourceQueries || []).join(', ') || 'unknown'}`,
          `orientation: ${asset.orientation || 'unknown'}`,
          `resolution: ${formatResolution(asset)}`,
          `duration: ${formatDuration(asset)}`,
          `reason: ${asset.rankReason || 'n/a'}`,
          `score: ${asset.rankScore ?? 'n/a'}`
        ].join('\n');
      }).join('\n\n')
      : 'No assets were available for this scene.';

    archive.append(assetManifest, { name: `${folderName}/assets.txt` });

    for (const [assetIndex, asset] of assets.entries()) {
      if (!asset?.url) {
        continue;
      }

      try {
        const assetName = buildAssetFileName(asset, assetIndex, mediaType);
        const response = await axios.get(asset.url, {
          responseType: 'stream',
          timeout: 30000
        });

        archive.append(response.data, { name: `${folderName}/${assetName}` });
      } catch (error) {
        failedDownloads.push(
          `${mediaType === MEDIA_TYPES.IMAGE ? 'image' : 'clip'} ${assetIndex + 1}: ${asset.pexelsUrl || asset.url} -> ${error.message}`
        );
      }
    }

    if (failedDownloads.length > 0) {
      archive.append(failedDownloads.join('\n'), {
        name: `${folderName}/download-errors.txt`
      });
    }
  }

  archive.finalize();
  await archiveCompletion;
}

function buildSceneFolderName(scene, index) {
  const label = truncateText(scene?.sceneText || 'scene', 40);
  const safeLabel = sanitizeFileName(label) || 'scene';
  return `scene_${index + 1}_${safeLabel}`;
}

function getSceneAssets(scene = {}) {
  if (Array.isArray(scene.assets)) {
    return scene.assets;
  }

  if (Array.isArray(scene.videos)) {
    return scene.videos;
  }

  return [];
}

function resolveSceneMediaType(scene = {}, fallbackMediaType) {
  const sceneMediaType = normalizeMediaType(scene.mediaType);
  const normalizedFallback = normalizeMediaType(fallbackMediaType);
  return sceneMediaType || normalizedFallback || inferMediaTypeFromAssets(getSceneAssets(scene)) || DEFAULT_MEDIA_TYPE;
}

function inferMediaTypeFromAssets(assets = []) {
  const firstAsset = assets.find(asset => asset);

  if (!firstAsset) {
    return null;
  }

  if (Number.isFinite(firstAsset.duration)) {
    return MEDIA_TYPES.VIDEO;
  }

  return MEDIA_TYPES.IMAGE;
}

function buildAssetFileName(asset, index, mediaType) {
  const extension = detectExtension(asset?.url) || getDefaultExtension(mediaType);
  const prefix = mediaType === MEDIA_TYPES.IMAGE ? 'image' : 'clip';
  return `${prefix}_${index + 1}.${extension}`;
}

function detectExtension(url = '') {
  const match = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
  return match ? match[1].toLowerCase() : null;
}

function getDefaultExtension(mediaType) {
  return mediaType === MEDIA_TYPES.IMAGE ? 'jpg' : 'mp4';
}

function formatResolution(asset = {}) {
  if (!asset.width || !asset.height) {
    return 'unknown';
  }

  return `${asset.width}x${asset.height}`;
}

function formatDuration(asset = {}) {
  if (!Number.isFinite(asset.duration)) {
    return 'n/a';
  }

  return `${asset.duration}s`;
}

function sanitizeFileName(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function truncateText(value = '', maxLength = 40) {
  return String(value).slice(0, maxLength).trim();
}

module.exports = { streamResultsZip };
