const copyPromptButton = document.getElementById('copyPromptButton');
const chatgptPrompt = document.getElementById('chatgptPrompt');
const form = document.getElementById('sceneJsonForm');
const scenesJson = document.getElementById('scenesJson');
const mediaTypeInputs = [...document.querySelectorAll('input[name="mediaType"]')];
const resultsContainer = document.getElementById('resultsContainer');
const formStatus = document.getElementById('formStatus');
const submitButton = document.getElementById('submitButton');
const downloadTopButton = document.getElementById('downloadTopButton');
const downloadBottomButton = document.getElementById('downloadBottomButton');
const backToTopButton = document.getElementById('backToTopButton');
const initialRankingMode = form.dataset.rankingMode || 'openai';

let latestResults = [];
let latestMediaType = getSelectedMediaType();

copyPromptButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(chatgptPrompt.value);
    copyPromptButton.textContent = 'Prompt Copied';
    setTimeout(() => {
      copyPromptButton.textContent = 'Copy Prompt';
    }, 1800);
  } catch (error) {
    copyPromptButton.textContent = 'Copy Failed';
    setTimeout(() => {
      copyPromptButton.textContent = 'Copy Prompt';
    }, 1800);
  }
});

downloadTopButton.addEventListener('click', () => {
  void downloadAllResults();
});

downloadBottomButton.addEventListener('click', () => {
  void downloadAllResults();
});

backToTopButton.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

window.addEventListener('scroll', toggleBackToTopButton);
toggleBackToTopButton();
syncMediaTypeUi();

mediaTypeInputs.forEach(input => {
  input.addEventListener('change', () => {
    latestMediaType = getSelectedMediaType();
    syncMediaTypeUi();
  });
});

form.addEventListener('submit', async event => {
  event.preventDefault();

  latestResults = [];
  latestMediaType = getSelectedMediaType();
  setDownloadButtonsDisabled(true);
  setButtonLoading(submitButton, `Fetching ${getMediaTypeDetails(latestMediaType).label}...`);
  formStatus.textContent = buildLoadingStatusMessage(latestMediaType);
  formStatus.classList.remove('invalid');
  renderLoadingState(latestMediaType);

  try {
    const response = await fetch(form.action, {
      method: form.method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mediaType: latestMediaType,
        scenesJson: scenesJson.value
      })
    });

    const payload = await response.json();

    if (response.ok) {
      latestResults = Array.isArray(payload.results) ? payload.results : [];
      latestMediaType = normalizeMediaType(payload.mediaType) || latestMediaType;
      formStatus.textContent = payload.ranking?.message || 'Results fetched successfully';
      setDownloadButtonsDisabled(latestResults.length === 0);
      renderResults(payload);
    } else {
      formStatus.textContent = 'Could not fetch results';
      formStatus.classList.add('invalid');
      setDownloadButtonsDisabled(true);
      renderErrorState(payload);
    }
  } catch (error) {
    const payload = {
      valid: false,
      message: 'Request failed before the fetch completed.',
      errors: [error.message]
    };

    formStatus.textContent = 'Request failed';
    formStatus.classList.add('invalid');
    setDownloadButtonsDisabled(true);
    renderErrorState(payload);
  } finally {
    setButtonIdle(submitButton, getMediaTypeDetails(getSelectedMediaType()).buttonLabel);
  }
});

function renderLoadingState(mediaType) {
  const mediaDetails = getMediaTypeDetails(mediaType);

  resultsContainer.innerHTML = `
    <div class="results-state">
      <p class="results-state-title">Fetching ${escapeHtml(mediaDetails.pluralLabel)}...</p>
      <p class="results-state-copy mb-0">
        ${escapeHtml(buildLoadingStatusMessage(mediaType))}
      </p>
    </div>
  `;
}

function renderResults(payload) {
  const mediaType = normalizeMediaType(payload.mediaType) || latestMediaType;
  const mediaDetails = getMediaTypeDetails(mediaType);
  const rankingMessage = payload.ranking?.message
    ? `<p class="results-state-copy mb-0">${escapeHtml(payload.ranking.message)}</p>`
    : '';

  const summaryMarkup = `
    <div class="results-summary">
      <span class="results-summary-chip">${payload.sceneCount} scenes</span>
      <span class="results-summary-chip">${payload.assetsFound} ${escapeHtml(mediaDetails.resultLabel)} found</span>
      <span class="results-summary-chip">${escapeHtml(payload.message || `Pexels ${mediaDetails.pluralLabel} fetched`)}</span>
    </div>
    ${rankingMessage}
  `;

  const scenesMarkup = payload.results.map(scene => {
    const queryMarkup = scene.searchQueries.map(query => (
      `<span class="scene-query-chip">${escapeHtml(query)}</span>`
    )).join('');
    const sceneAssets = Array.isArray(scene.assets) ? scene.assets : [];

    const assetMarkup = sceneAssets.length > 0
      ? sceneAssets.map((asset, index) => `
        <article class="clip-card">
          ${renderAssetPreview(asset, mediaType)}
          <div class="clip-meta">
            <div class="clip-meta-top">
              <span class="clip-label">${escapeHtml(buildAssetLabel(mediaType, index))}</span>
              <span class="clip-duration">${escapeHtml(buildAssetSummary(asset, mediaType))}</span>
            </div>
            <div class="clip-query-list">
              ${(asset.sourceQueries || []).map(query => `<span class="clip-query-chip">${escapeHtml(query)}</span>`).join('')}
            </div>
            <a class="clip-link" href="${escapeHtml(asset.pexelsUrl || asset.url)}" target="_blank" rel="noreferrer">
              ${escapeHtml(`Open source ${mediaDetails.sourceLabel}`)}
            </a>
          </div>
        </article>
      `).join('')
      : `
        <div class="clip-empty">
          <p class="mb-0">No matching ${escapeHtml(mediaDetails.emptyStateLabel)} were returned for this scene yet.</p>
        </div>
      `;

    return `
      <section class="scene-result">
        <div class="scene-result-header">
          <div>
            <h3 class="scene-title"><span>Scene ${scene.id}</span>${escapeHtml(scene.sceneText)}</h3>
          </div>
          <div class="scene-query-list">${queryMarkup}</div>
        </div>
        <div class="clip-row">${assetMarkup}</div>
      </section>
    `;
  }).join('');

  resultsContainer.innerHTML = `${summaryMarkup}${scenesMarkup}`;
  resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderErrorState(payload) {
  const errors = Array.isArray(payload.errors) && payload.errors.length > 0
    ? payload.errors.map(error => `<li>${escapeHtml(error)}</li>`).join('')
    : '<li>No additional error details were provided.</li>';

  resultsContainer.innerHTML = `
    <div class="results-state results-error">
      <p class="results-state-title">${escapeHtml(payload.message || 'Something went wrong.')}</p>
      <ul class="results-state-copy mb-0">${errors}</ul>
    </div>
  `;

  resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) {
    return 'Unknown length';
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function downloadAllResults() {
  if (!Array.isArray(latestResults) || latestResults.length === 0) {
    return;
  }

  setButtonLoading(downloadTopButton, 'Preparing ZIP...');
  setButtonLoading(downloadBottomButton, 'Preparing ZIP...');

  try {
    const response = await fetch('/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mediaType: latestMediaType,
        results: latestResults
      })
    });

    if (!response.ok) {
      let message = 'Failed to prepare the ZIP download.';

      try {
        const payload = await response.json();
        message = payload.error || message;
      } catch (error) {
        // Ignore JSON parse failures and use the generic message.
      }

      throw new Error(message);
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = blobUrl;
    link.download = `script-to-clips-${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    alert(error.message || 'Failed to download results.');
  } finally {
    setButtonIdle(downloadTopButton, 'Download All');
    setButtonIdle(downloadBottomButton, 'Download All');
  }
}

function setButtonLoading(button, label) {
  button.disabled = true;
  button.innerHTML = `
    <span class="spinner-border spinner-border-sm btn-spinner" aria-hidden="true"></span>
    <span>${escapeHtml(label)}</span>
  `;
}

function setButtonIdle(button, label) {
  button.disabled = false;
  button.textContent = label;
}

function setDownloadButtonsDisabled(isDisabled) {
  downloadTopButton.disabled = isDisabled;
  downloadBottomButton.disabled = isDisabled;
}

function toggleBackToTopButton() {
  if (window.scrollY > 320) {
    backToTopButton.classList.add('is-visible');
  } else {
    backToTopButton.classList.remove('is-visible');
  }
}

function buildLoadingStatusMessage(mediaType = getSelectedMediaType()) {
  const mediaLabel = getMediaTypeDetails(mediaType).pluralLabel;

  if (initialRankingMode === 'heuristic') {
    return `Validating JSON, searching Pexels for ${mediaLabel}, and using heuristic ranking because OpenAI is unavailable.`;
  }

  return `Validating JSON, searching Pexels for ${mediaLabel}, and ranking the results with OpenAI.`;
}

function syncMediaTypeUi() {
  const mediaDetails = getMediaTypeDetails(getSelectedMediaType());
  setButtonIdle(submitButton, mediaDetails.buttonLabel);
}

function getSelectedMediaType() {
  return normalizeMediaType(
    mediaTypeInputs.find(input => input.checked)?.value
  ) || 'video';
}

function normalizeMediaType(value) {
  return value === 'image' ? 'image' : 'video';
}

function getMediaTypeDetails(mediaType) {
  if (mediaType === 'image') {
    return {
      label: 'Pictures',
      pluralLabel: 'pictures',
      resultLabel: 'pictures',
      sourceLabel: 'picture',
      buttonLabel: 'Get Pictures',
      emptyStateLabel: 'pictures'
    };
  }

  return {
    label: 'Videos',
    pluralLabel: 'videos',
    resultLabel: 'clips',
    sourceLabel: 'clip',
    buttonLabel: 'Get Videos',
    emptyStateLabel: 'clips'
  };
}

function renderAssetPreview(asset, mediaType) {
  if (mediaType === 'image') {
    const orientationClass = buildImageOrientationClass(asset.orientation);

    return `
      <img
        class="asset-preview ${escapeHtml(orientationClass)}"
        src="${escapeHtml(asset.previewUrl || asset.url)}"
        alt="${escapeHtml(asset.title || asset.description || 'Pexels image result')}"
        loading="lazy"
      >
    `;
  }

  return `
    <video controls preload="metadata" playsinline poster="${escapeHtml(asset.thumbnail || '')}">
      <source src="${escapeHtml(asset.url)}" type="video/mp4">
      Your browser does not support the video tag.
    </video>
  `;
}

function buildAssetLabel(mediaType, index) {
  return mediaType === 'image' ? `Picture ${index + 1}` : `Clip ${index + 1}`;
}

function buildAssetSummary(asset, mediaType) {
  if (mediaType === 'image') {
    const orientation = capitalizeLabel(asset.orientation || 'image');
    const resolution = formatResolution(asset.width, asset.height);

    return resolution === 'Unknown size' ? orientation : `${orientation} - ${resolution}`;
  }

  return formatDuration(asset.duration);
}

function formatResolution(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return 'Unknown size';
  }

  return `${width}x${height}`;
}

function capitalizeLabel(value) {
  const normalizedValue = String(value || '').trim();

  if (!normalizedValue) {
    return 'Unknown';
  }

  return normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1);
}

function buildImageOrientationClass(orientation) {
  if (orientation === 'portrait') {
    return 'asset-preview-portrait';
  }

  if (orientation === 'square') {
    return 'asset-preview-square';
  }

  return 'asset-preview-landscape';
}
