// ScriptToClips frontend controller.
//
// This file intentionally stays framework-free. The app has one focused
// workflow, so plain browser APIs are enough: read user input, validate/review
// scenes, fetch media, render results, replace bad matches, and download a ZIP.

const STORAGE_KEY = 'scriptToClips.session.v2';

// DOM lookups are grouped at the top so every function below reads like app
// behavior instead of repeatedly querying the document.
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
const downloadStatusMessages = [...document.querySelectorAll('[data-download-status]')];
const backToTopButton = document.getElementById('backToTopButton');
const progressPanel = document.getElementById('progressPanel');
const progressFill = document.getElementById('progressFill');
const progressSteps = document.getElementById('progressSteps');
const selectedOnlyOption = document.getElementById('selectedOnlyOption');
const metadataOption = document.getElementById('metadataOption');
const sceneTextOption = document.getElementById('sceneTextOption');
const clearSessionButton = document.getElementById('clearSessionButton');
const initialRankingMode = form.dataset.rankingMode || 'openai';

// App state mirrors the workflow: raw JSON becomes reviewed scenes, reviewed
// scenes become fetched results, and fetched results become a configurable ZIP.
let reviewedScenes = [];
let latestResults = [];
let latestMediaType = getSelectedMediaType();
let downloadFeedbackTimer = null;
let downloadStartedAt = 0;
let reviewedScenesJsonSnapshot = '';
let persistSessionTimer = null;

restoreSession();
bindEvents();
syncMediaTypeUi();
toggleBackToTopButton();
renderPersistedResults();

function bindEvents() {
  // All browser event wiring lives in one place so the startup sequence above
  // stays easy to audit. Most handlers delegate to named functions because this
  // file controls several workflow states.
  copyPromptButton.addEventListener('click', copyPromptToClipboard);
  clearSessionButton.addEventListener('click', clearSavedSession);
  form.addEventListener('submit', event => {
    event.preventDefault();
    void fetchMediaForReviewedScenes();
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
  window.addEventListener('beforeunload', persistSession);
  scenesJson.addEventListener('input', () => {
    invalidateReviewedScenesIfJsonChanged();
    schedulePersistSession();
  });
  [selectedOnlyOption, metadataOption, sceneTextOption].forEach(input => {
    input.addEventListener('change', schedulePersistSession);
  });
  mediaTypeInputs.forEach(input => {
    input.addEventListener('change', () => {
      latestMediaType = getSelectedMediaType();
      syncMediaTypeUi();
      schedulePersistSession();
    });
  });
  resultsContainer.addEventListener('input', handleSceneEditInput);
  resultsContainer.addEventListener('click', handleSceneEditClick);
  resultsContainer.addEventListener('change', handleResultSelectionChange);
  resultsContainer.addEventListener('click', event => {
    const replaceButton = event.target.closest('[data-replace-scene]');

    if (replaceButton) {
      void replaceSceneResult(Number(replaceButton.dataset.replaceScene));
    }
  });
}

async function copyPromptToClipboard() {
  try {
    await navigator.clipboard.writeText(chatgptPrompt.value);
    setTemporaryButtonLabel(copyPromptButton, 'Prompt Copied', 'Copy Prompt');
  } catch (error) {
    setTemporaryButtonLabel(copyPromptButton, 'Copy Failed', 'Copy Prompt');
  }
}

async function reviewScenes(options = {}) {
  // Review normalizes the pasted JSON before any expensive media fetching
  // happens. The editable scene fields live in the results section, so this
  // step updates that section instead of opening a separate editor.
  setProgress([
    { label: 'Reading JSON', state: 'active' },
    { label: 'Checking scene rules', state: 'waiting' },
    { label: 'Preparing scene editor', state: 'waiting' }
  ], 10);
  setStatus('Checking JSON before review.');

  try {
    const payload = await postJson('/review', { scenesJson: scenesJson.value });

    reviewedScenes = payload.scenes;
    scenesJson.value = JSON.stringify(reviewedScenes, null, 2);
    reviewedScenesJsonSnapshot = scenesJson.value;
    latestResults = [];
    renderInitialResultsState();
    setDownloadButtonsDisabled(true);
    setStatus(`${payload.sceneCount} scenes ready. You can edit them in the results section.`);
    setProgress([
      { label: 'Reading JSON', state: 'done' },
      { label: 'Checking scene rules', state: 'done' },
      { label: 'Preparing scene editor', state: 'done' }
    ], 100);
    persistSession();
  } catch (error) {
    setInvalidStatus('Scene review failed.');
    renderErrorState(error.payload || buildClientErrorPayload(error));
    setProgress([
      { label: 'Reading JSON', state: 'done' },
      { label: 'Checking scene rules', state: 'failed' },
      { label: 'Preparing scene editor', state: 'waiting' }
    ], 62);
  }
}

async function fetchMediaForReviewedScenes() {
  // The submit button should always operate on reviewedScenes, not directly on
  // textarea text. ensureReviewedScenes silently validates first if needed.
  const scenesReady = await ensureReviewedScenes();

  if (!scenesReady) {
    return;
  }

  latestResults = [];
  latestMediaType = getSelectedMediaType();
  setDownloadButtonsDisabled(true);
  setButtonLoading(submitButton, `Fetching ${getMediaTypeDetails(latestMediaType).label}...`);
  setStatus(buildLoadingStatusMessage(latestMediaType));
  setProgress([
    { label: 'Validating reviewed scenes', state: 'done' },
    { label: `Searching Pexels for ${getMediaTypeDetails(latestMediaType).pluralLabel}`, state: 'active' },
    { label: 'Ranking candidates', state: 'waiting' },
    { label: 'Rendering results', state: 'waiting' }
  ], 36);
  renderLoadingState(latestMediaType);

  try {
    const payload = await postJson(form.action, {
      mediaType: latestMediaType,
      scenesJson: JSON.stringify(reviewedScenes)
    });

    latestResults = markAssetsSelected(payload.results || []);
    latestMediaType = normalizeMediaType(payload.mediaType) || latestMediaType;
    setStatus(payload.ranking?.message || 'Results fetched successfully. Scene text and queries remain editable below.');
    setDownloadButtonsDisabled(latestResults.length === 0);
    setProgress([
      { label: 'Validating reviewed scenes', state: 'done' },
      { label: `Searching Pexels for ${getMediaTypeDetails(latestMediaType).pluralLabel}`, state: 'done' },
      { label: 'Ranking candidates', state: 'done' },
      { label: 'Rendering results', state: 'done' }
    ], 100);
    renderResults({
      ...payload,
      results: latestResults
    });
    persistSession();
  } catch (error) {
    setInvalidStatus('Could not fetch results.');
    setDownloadButtonsDisabled(true);
    setProgress([
      { label: 'Validating reviewed scenes', state: 'done' },
      { label: `Searching Pexels for ${getMediaTypeDetails(latestMediaType).pluralLabel}`, state: 'failed' },
      { label: 'Ranking candidates', state: 'waiting' },
      { label: 'Rendering results', state: 'waiting' }
    ], 45);
    renderErrorState(error.payload || buildClientErrorPayload(error));
  } finally {
    setButtonIdle(submitButton, getMediaTypeDetails(getSelectedMediaType()).buttonLabel);
  }
}

async function replaceSceneResult(sceneId) {
  // Replacement is scene-scoped: it keeps the rest of latestResults intact and
  // only swaps the result whose id matches the clicked button.
  const scene = reviewedScenes.find(entry => entry.id === sceneId);
  const sceneResult = latestResults.find(entry => entry.id === sceneId);

  if (!scene || !sceneResult) {
    return;
  }

  const excludedAssetIds = (sceneResult.assets || []).map(asset => asset.id);
  const button = resultsContainer.querySelector(`[data-replace-scene="${sceneId}"]`);

  setButtonLoading(button, 'Replacing...');
  setStatus(`Finding another match for scene ${sceneId}.`);

  try {
    const payload = await postJson('/replace', {
      mediaType: latestMediaType,
      scene,
      excludedAssetIds
    });
    const replacement = {
      ...payload.result,
      assets: (payload.result.assets || []).map(asset => ({ ...asset, isSelected: true }))
    };

    latestResults = latestResults.map(result => (
      result.id === sceneId ? replacement : result
    ));
    renderResults({
      mediaType: latestMediaType,
      message: payload.message,
      sceneCount: latestResults.length,
      assetsFound: countAssets(latestResults),
      ranking: replacement.ranking,
      results: latestResults
    });
    setStatus(`Scene ${sceneId} replacement loaded.`);
    persistSession();
  } catch (error) {
    setInvalidStatus(`Could not replace scene ${sceneId}.`);
    renderInlineSceneError(sceneId, error.payload || buildClientErrorPayload(error));
  } finally {
    setButtonIdle(button, 'Replace');
  }
}

async function ensureReviewedScenes() {
  // If the textarea has not changed since the last review, trust the edited
  // in-memory scene list. Otherwise, re-run server validation before fetching.
  if (reviewedScenes.length > 0 && !hasJsonChangedSinceReview()) {
    syncJsonFromReviewedScenes();
    return true;
  }

  await reviewScenes();
  return reviewedScenes.length > 0;
}

function handleSceneEditInput(event) {
  // Event delegation keeps the displayed scene title and query chips editable
  // in place while the hidden JSON payload stays synchronized.
  const field = event.target.closest('[data-scene-field]');

  if (!field) {
    return;
  }

  const sceneId = Number(field.dataset.sceneId);
  const scene = reviewedScenes.find(entry => entry.id === sceneId);

  if (!scene) {
    return;
  }

  if (field.dataset.sceneField === 'sceneText') {
    scene.sceneText = field.textContent;
  } else {
    scene.searchQueries[Number(field.dataset.queryIndex)] = field.textContent;
  }

  syncJsonFromReviewedScenes();
  syncLatestResultsFromReviewedScenes();
  schedulePersistSession();
}

function handleSceneEditClick(event) {
  // Removing a scene reindexes the remaining scenes because the backend
  // requires ids to be sequential starting from 1.
  const removeButton = event.target.closest('[data-remove-scene]');

  if (!removeButton) {
    return;
  }

  const sceneId = Number(removeButton.dataset.removeScene);

  reviewedScenes = reviewedScenes
    .filter(scene => scene.id !== sceneId)
    .map((scene, index) => ({ ...scene, id: index + 1 }));
  latestResults = latestResults
    .filter(scene => scene.id !== sceneId)
    .map((scene, index) => ({ ...scene, id: index + 1 }));
  syncJsonFromReviewedScenes();
  if (latestResults.length > 0) {
    renderResults({
      mediaType: latestMediaType,
      message: 'Scene removed.',
      sceneCount: latestResults.length,
      assetsFound: countAssets(latestResults),
      results: latestResults
    });
  } else {
    renderInitialResultsState();
  }
  setDownloadButtonsDisabled(latestResults.length === 0);
  schedulePersistSession();
}

function handleResultSelectionChange(event) {
  // The selected flag is client-side packaging state. It is only used by the
  // download endpoint when selectedOnly is checked.
  const input = event.target.closest('[data-asset-selection]');

  if (!input) {
    return;
  }

  const sceneId = Number(input.dataset.sceneId);
  const assetId = input.dataset.assetId;

  latestResults = latestResults.map(scene => {
    if (scene.id !== sceneId) {
      return scene;
    }

    return {
      ...scene,
      assets: (scene.assets || []).map(asset => (
        String(asset.id) === assetId ? { ...asset, isSelected: input.checked } : asset
      ))
    };
  });
  schedulePersistSession();
}

function renderSceneEditorState() {
  if (reviewedScenes.length === 0) {
    resultsContainer.innerHTML = `
      <div class="results-state">
        <p class="results-state-title">Ready to fetch results</p>
        <p class="results-state-copy mb-0">Submit a valid scene JSON payload and editable scene rows will appear here.</p>
      </div>
    `;
    return;
  }

  resultsContainer.innerHTML = `
    <div class="results-summary">
      <span class="results-summary-chip">${reviewedScenes.length} scenes ready</span>
      <span class="results-summary-chip">Edit scene text and search queries here</span>
    </div>
    ${reviewedScenes.map(scene => `
      <section class="scene-result" data-scene-result="${scene.id}">
        ${renderSceneEditor(scene)}
      </section>
    `).join('')}
  `;
  resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderLoadingState(mediaType) {
  const mediaDetails = getMediaTypeDetails(mediaType);

  resultsContainer.innerHTML = `
    <div class="results-state">
      <p class="results-state-title">Fetching ${escapeHtml(mediaDetails.pluralLabel)}...</p>
      <p class="results-state-copy mb-0">${escapeHtml(buildLoadingStatusMessage(mediaType))}</p>
    </div>
  `;
}

function renderInitialResultsState() {
  renderSceneEditorState();
}

function renderPersistedResults() {
  if (latestResults.length === 0) {
    if (reviewedScenes.length > 0) {
      renderInitialResultsState();
    }

    return;
  }

  renderResults({
    mediaType: latestMediaType,
    message: 'Restored your last results from this browser.',
    sceneCount: latestResults.length,
    assetsFound: countAssets(latestResults),
    results: latestResults
  });
  setDownloadButtonsDisabled(false);
}

function renderResults(payload) {
  // Rendering is intentionally string-based here because the app has one page
  // and no framework. Every interpolated user/API value goes through escapeHtml
  // inside the render helpers.
  const mediaType = normalizeMediaType(payload.mediaType) || latestMediaType;
  const mediaDetails = getMediaTypeDetails(mediaType);
  const rankingMessage = payload.ranking?.message
    ? `<p class="results-state-copy mb-0">${escapeHtml(payload.ranking.message)}</p>`
    : '';
  const scenesMarkup = (payload.results || []).map(scene => renderSceneResult(scene, mediaType)).join('');

  resultsContainer.innerHTML = `
    <div class="results-summary">
      <span class="results-summary-chip">${Number(payload.sceneCount) || 0} scenes</span>
      <span class="results-summary-chip">${Number(payload.assetsFound) || 0} ${escapeHtml(mediaDetails.resultLabel)} found</span>
      <span class="results-summary-chip">${escapeHtml(payload.message || `Pexels ${mediaDetails.pluralLabel} fetched`)}</span>
    </div>
    ${rankingMessage}
    ${scenesMarkup}
  `;
  resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderSceneResult(scene, mediaType) {
  // A scene result contains the original reviewed scene text, the normalized
  // search queries, candidate count, and the final selected ranked assets.
  const sceneAssets = Array.isArray(scene.assets) ? scene.assets : [];
  const assetMarkup = sceneAssets.length > 0
    ? sceneAssets.map((asset, index) => renderAssetCard(scene, asset, index, mediaType)).join('')
    : `
      <div class="clip-empty">
        <p class="mb-0">No matching ${escapeHtml(getMediaTypeDetails(mediaType).emptyStateLabel)} were returned for this scene yet.</p>
      </div>
    `;

  return `
    <section class="scene-result" data-scene-result="${scene.id}">
      ${renderSceneEditor(scene)}
      <div class="scene-tools">
        <button class="btn btn-outline-light btn-sm" type="button" data-replace-scene="${scene.id}">Replace</button>
        <span class="footer-note">${scene.candidateCount || 0} candidates checked</span>
      </div>
      <div class="scene-inline-error" data-scene-error="${scene.id}" hidden></div>
      <div class="clip-row">${assetMarkup}</div>
    </section>
  `;
}

function renderSceneEditor(scene) {
  return `
    <div class="scene-result-header">
      <div class="scene-title-wrap">
        <h3 class="scene-title">
          <span>Scene ${scene.id}</span>
          <span
            class="editable-scene-text"
            contenteditable="true"
            role="textbox"
            aria-label="Scene ${scene.id} text"
            data-scene-field="sceneText"
            data-scene-id="${scene.id}"
          >${escapeHtml(scene.sceneText)}</span>
        </h3>
        <button class="btn btn-outline-light btn-sm" type="button" data-remove-scene="${scene.id}">Remove</button>
      </div>
      <div class="scene-query-list">
        ${[0, 1].map(index => `
          <span
            class="scene-query-chip"
            contenteditable="true"
            role="textbox"
            aria-label="Scene ${scene.id} search query ${index + 1}"
            data-scene-field="searchQuery"
            data-scene-id="${scene.id}"
            data-query-index="${index}"
          >${escapeHtml(scene.searchQueries?.[index] || '')}</span>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAssetCard(scene, asset, index, mediaType) {
  // Asset cards include a checkbox because downloading every fetched asset is
  // not always desirable. The server receives this isSelected flag later.
  const mediaDetails = getMediaTypeDetails(mediaType);
  const checked = asset.isSelected !== false ? 'checked' : '';

  return `
    <article class="clip-card">
      ${renderAssetPreview(asset, mediaType)}
      <div class="clip-meta">
        <div class="clip-meta-top">
          <label class="asset-select">
            <input
              type="checkbox"
              ${checked}
              data-asset-selection
              data-scene-id="${scene.id}"
              data-asset-id="${escapeHtml(asset.id)}"
            >
            <span>${escapeHtml(buildAssetLabel(mediaType, index))}</span>
          </label>
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
  `;
}

function renderErrorState(payload) {
  const errors = Array.isArray(payload.errors) && payload.errors.length > 0
    ? payload.errors.map(error => `<li>${escapeHtml(error)}</li>`).join('')
    : '<li>No additional error details were provided.</li>';
  const scenes = Array.isArray(payload.scenes) && payload.scenes.length > 0
    ? `<p class="results-state-copy">The server accepted ${payload.scenes.length} normalized scenes before the error occurred.</p>`
    : '';

  resultsContainer.innerHTML = `
    <div class="results-state results-error">
      <p class="results-state-title">${escapeHtml(payload.message || 'Something went wrong.')}</p>
      ${scenes}
      <ul class="results-state-copy mb-0">${errors}</ul>
    </div>
  `;
  resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderInlineSceneError(sceneId, payload) {
  const target = resultsContainer.querySelector(`[data-scene-error="${sceneId}"]`);

  if (!target) {
    return;
  }

  target.hidden = false;
  target.textContent = payload.message || 'Could not fetch a replacement.';
}

function setProgress(steps, percent) {
  progressPanel.hidden = false;
  progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  progressSteps.innerHTML = steps.map(step => (
    `<li class="${escapeHtml(step.state)}">${escapeHtml(step.label)}</li>`
  )).join('');
}

async function downloadAllResults() {
  // Download posts the current rendered result state to the server. The server
  // streams the ZIP back as a blob response, then the browser creates a temporary
  // object URL to trigger the file save.
  if (!Array.isArray(latestResults) || latestResults.length === 0) {
    return;
  }

  let downloadSucceeded = false;

  startDownloadFeedback();

  try {
    const response = await fetch('/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mediaType: latestMediaType,
        results: latestResults,
        options: {
          selectedOnly: selectedOnlyOption.checked,
          includeMetadata: metadataOption.checked,
          includeSceneText: sceneTextOption.checked
        }
      })
    });

    if (!response.ok) {
      let message = 'Failed to prepare the ZIP download.';

      try {
        const payload = await response.json();
        message = payload.error || message;
      } catch (error) {
        // The response may be an HTML/server error; keep the generic message.
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
    downloadSucceeded = true;
    setDownloadStatus('Download started.');
  } catch (error) {
    setDownloadStatus(error.message || 'Failed to download clips.', true);
    alert(error.message || 'Failed to download results.');
  } finally {
    stopDownloadFeedback();
    setButtonIdle(downloadTopButton, 'Download Clips');
    setButtonIdle(downloadBottomButton, 'Download Clips');

    if (downloadSucceeded) {
      setTimeout(clearDownloadStatus, 4000);
    }
  }
}

function startDownloadFeedback() {
  // ZIP creation can take a while because the server must fetch remote media
  // files before the browser sees the final archive. These messages reassure the
  // user without needing server-sent progress events.
  downloadStartedAt = Date.now();
  updateDownloadFeedback('Preparing the ZIP from selected clips.');

  downloadFeedbackTimer = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - downloadStartedAt) / 1000);

    if (elapsedSeconds >= 45) {
      updateDownloadFeedback(`Still working after ${elapsedSeconds}s. Slow Pexels files will be skipped by the server timeout and listed in download-errors.txt.`);
      setStatus(`Download is still preparing after ${elapsedSeconds}s. The server may be waiting on a slow source file.`);
      return;
    }

    if (elapsedSeconds >= 20) {
      updateDownloadFeedback(`Downloading source clips. Elapsed time: ${elapsedSeconds}s.`);
      setStatus('The ZIP is being built from remote Pexels files. Larger clips can take a little while.');
      return;
    }

    if (elapsedSeconds >= 8) {
      updateDownloadFeedback(`Preparing ZIP. Elapsed time: ${elapsedSeconds}s.`);
      setStatus('Preparing the ZIP. The app is downloading selected source files before the browser receives the final file.');
    }
  }, 1000);

  setButtonLoading(downloadTopButton, 'Download Clips');
  setButtonLoading(downloadBottomButton, 'Download Clips');
}

function updateDownloadFeedback(message) {
  setDownloadStatus(message);
}

function stopDownloadFeedback() {
  if (downloadFeedbackTimer) {
    clearInterval(downloadFeedbackTimer);
    downloadFeedbackTimer = null;
  }
}

function setDownloadStatus(message, isError = false) {
  downloadStatusMessages.forEach(element => {
    element.hidden = false;
    element.textContent = message;
    element.classList.toggle('invalid', isError);
  });
}

function clearDownloadStatus() {
  downloadStatusMessages.forEach(element => {
    element.hidden = true;
    element.textContent = '';
    element.classList.remove('invalid');
  });
}

function clearSavedSession() {
  localStorage.removeItem(STORAGE_KEY);
  reviewedScenes = [];
  latestResults = [];
  reviewedScenesJsonSnapshot = '';
  latestMediaType = 'video';
  scenesJson.value = '';
  mediaTypeInputs.forEach(input => {
    input.checked = input.value === latestMediaType;
  });
  selectedOnlyOption.checked = true;
  metadataOption.checked = true;
  sceneTextOption.checked = true;
  progressPanel.hidden = true;
  clearDownloadStatus();
  renderInitialResultsState();
  setDownloadButtonsDisabled(true);
  syncMediaTypeUi();
  setStatus('Saved session cleared.');
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();

  if (!response.ok) {
    const error = new Error(payload.message || 'Request failed.');
    error.payload = payload;
    throw error;
  }

  return payload;
}

function syncJsonFromReviewedScenes() {
  // The textarea remains the visible source of truth. Whenever review edits
  // happen, write the normalized scenes back into it so the user can inspect or
  // copy the exact payload being submitted.
  reviewedScenes = reviewedScenes.map((scene, index) => ({
    id: index + 1,
    sceneText: String(scene.sceneText || '').trim(),
    searchQueries: scene.searchQueries
      .map(query => String(query || '').trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 2)
  }));
  scenesJson.value = JSON.stringify(reviewedScenes, null, 2);
  reviewedScenesJsonSnapshot = scenesJson.value;
}

function syncLatestResultsFromReviewedScenes() {
  if (latestResults.length === 0) {
    return;
  }

  const scenesById = new Map(reviewedScenes.map(scene => [scene.id, scene]));

  latestResults = latestResults.map(result => {
    const reviewedScene = scenesById.get(result.id);

    if (!reviewedScene) {
      return result;
    }

    return {
      ...result,
      sceneText: reviewedScene.sceneText,
      searchQueries: [...reviewedScene.searchQueries]
    };
  });
}

// If the user pastes or types a new JSON payload after reviewing scenes, the
// old reviewedScenes array is no longer trustworthy. This guard makes the
// textarea the source of truth again and prevents "Get Videos" from silently
// using stale reviewed scene data.
function hasJsonChangedSinceReview() {
  return scenesJson.value.trim() !== reviewedScenesJsonSnapshot.trim();
}

function invalidateReviewedScenesIfJsonChanged() {
  if (reviewedScenes.length === 0 || !hasJsonChangedSinceReview()) {
    return;
  }

  reviewedScenes = [];
  latestResults = [];
  reviewedScenesJsonSnapshot = '';
  renderInitialResultsState();
  setDownloadButtonsDisabled(true);
  setStatus('JSON changed. Review or fetch again to use the new scenes.');
}

function markAssetsSelected(results = []) {
  return results.map(scene => ({
    ...scene,
    assets: (scene.assets || []).map(asset => ({ ...asset, isSelected: true }))
  }));
}

function restoreSession() {
  // Saved state makes refreshes less punishing while iterating on a script. Bad
  // or old session JSON is discarded rather than blocking the app from loading.
  try {
    const savedSession = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

    if (savedSession.scenesJson) {
      scenesJson.value = savedSession.scenesJson;
    }

    if (Array.isArray(savedSession.reviewedScenes)) {
      reviewedScenes = savedSession.reviewedScenes;
    }

    if (typeof savedSession.reviewedScenesJsonSnapshot === 'string') {
      reviewedScenesJsonSnapshot = savedSession.reviewedScenesJsonSnapshot;
    }

    if (Array.isArray(savedSession.latestResults)) {
      latestResults = savedSession.latestResults;
    }

    if (normalizeMediaType(savedSession.latestMediaType)) {
      latestMediaType = savedSession.latestMediaType;
      mediaTypeInputs.forEach(input => {
        input.checked = input.value === latestMediaType;
      });
    }

    selectedOnlyOption.checked = savedSession.options?.selectedOnly !== false;
    metadataOption.checked = savedSession.options?.includeMetadata !== false;
    sceneTextOption.checked = savedSession.options?.includeSceneText !== false;
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function persistSession() {
  if (persistSessionTimer) {
    clearTimeout(persistSessionTimer);
    persistSessionTimer = null;
  }

  const session = {
    scenesJson: scenesJson.value,
    reviewedScenes,
    reviewedScenesJsonSnapshot,
    latestResults,
    latestMediaType,
    options: {
      selectedOnly: selectedOnlyOption.checked,
      includeMetadata: metadataOption.checked,
      includeSceneText: sceneTextOption.checked
    }
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function schedulePersistSession() {
  // localStorage writes are synchronous. Debouncing avoids doing a full JSON
  // stringify/write on every keystroke while the user edits scenes.
  if (persistSessionTimer) {
    clearTimeout(persistSessionTimer);
  }

  persistSessionTimer = setTimeout(persistSession, 250);
}

function buildClientErrorPayload(error) {
  return {
    valid: false,
    message: error.message || 'The browser request failed.',
    errors: ['Check your connection, environment variables, and server logs.']
  };
}

function setTemporaryButtonLabel(button, temporaryLabel, idleLabel) {
  button.textContent = temporaryLabel;
  setTimeout(() => {
    button.textContent = idleLabel;
  }, 1800);
}

function setButtonLoading(button, label) {
  if (!button) {
    return;
  }

  button.disabled = true;
  button.innerHTML = `
    <span class="spinner-border spinner-border-sm btn-spinner" aria-hidden="true"></span>
    <span>${escapeHtml(label)}</span>
  `;
}

function setButtonIdle(button, label) {
  if (!button) {
    return;
  }

  button.disabled = false;
  button.textContent = label;
}

function setDownloadButtonsDisabled(isDisabled) {
  downloadTopButton.disabled = isDisabled;
  downloadBottomButton.disabled = isDisabled;
}

function setStatus(message) {
  formStatus.textContent = message;
  formStatus.classList.remove('invalid');
}

function setInvalidStatus(message) {
  formStatus.textContent = message;
  formStatus.classList.add('invalid');
}

function toggleBackToTopButton() {
  if (window.scrollY > 320) {
    backToTopButton.classList.add('is-visible');
  } else {
    backToTopButton.classList.remove('is-visible');
  }
}

function countAssets(results = []) {
  return results.reduce((total, scene) => total + (scene.assets || []).length, 0);
}

function buildLoadingStatusMessage(mediaType = getSelectedMediaType()) {
  const mediaLabel = getMediaTypeDetails(mediaType).pluralLabel;

  if (initialRankingMode === 'heuristic') {
    return `Validating scenes, searching Pexels for ${mediaLabel}, and using heuristic ranking because OpenAI is unavailable.`;
  }

  return `Validating scenes, searching Pexels for ${mediaLabel}, and ranking the results with OpenAI.`;
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

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) {
    return 'Unknown length';
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
