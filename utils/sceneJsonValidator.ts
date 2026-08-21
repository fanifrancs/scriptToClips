import type { Scene, ValidationResult } from './types';

// The validator is shared by both the review step and the final fetch step.
// Keeping validation in one file means the browser and backend do not drift
// into slightly different ideas of what a "valid scene" means.
export function validateScenesJson(rawInput: unknown): ValidationResult {
  // The validator returns one consistent response shape for success and failure
  // so routes can pass validationResult directly back to the browser.
  if (typeof rawInput !== 'string' || !rawInput.trim()) {
    return {
      valid: false,
      message: 'Paste the JSON output from ChatGPT before continuing.',
      errors: ['Missing JSON input.']
    };
  }

  let parsedInput: unknown;
  try {
    parsedInput = JSON.parse(rawInput);
  } catch (error) {
    return {
      valid: false,
      message: 'The submitted text is not valid JSON.',
      errors: ['JSON parsing failed. Make sure the payload is a valid JSON array.']
    };
  }

  if (!Array.isArray(parsedInput)) {
    return {
      valid: false,
      message: 'The JSON payload must be an array of scene objects.',
      errors: ['Expected a top-level JSON array.']
    };
  }

  if (parsedInput.length === 0) {
    return {
      valid: false,
      message: 'The JSON array is empty.',
      errors: ['Add at least one scene object to continue.']
    };
  }

  const errors: string[] = [];

  parsedInput.forEach((scene, index) => {
    const sceneNumber = index + 1;

    // Scene ids must be sequential because the UI uses them as stable labels
    // and replacement targets. Allowing arbitrary ids would make reorder/remove
    // operations more confusing.
    if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
      errors.push(`Scene ${sceneNumber} must be an object.`);
      return;
    }

    const sceneRecord = scene as Record<string, unknown>;

    if (!Number.isInteger(sceneRecord.id)) {
      errors.push(`Scene ${sceneNumber} id must be an integer.`);
    } else if (sceneRecord.id !== sceneNumber) {
      errors.push(`Scene ${sceneNumber} id must be ${sceneNumber}.`);
    }

    if (typeof sceneRecord.sceneText !== 'string' || !sceneRecord.sceneText.trim()) {
      errors.push(`Scene ${sceneNumber} sceneText must be a non-empty string.`);
    }

    if (!Array.isArray(sceneRecord.searchQueries)) {
      errors.push(`Scene ${sceneNumber} searchQueries must be an array.`);
      return;
    }

    if (sceneRecord.searchQueries.length === 0) {
      errors.push(`Scene ${sceneNumber} searchQueries must contain at least one query.`);
    }

    if (sceneRecord.searchQueries.length > 2) {
      errors.push(`Scene ${sceneNumber} searchQueries can contain at most 2 queries.`);
    }

    sceneRecord.searchQueries.forEach((query, queryIndex) => {
      const label = `Scene ${sceneNumber} searchQueries[${queryIndex}]`;

      // Lowercase/trim rules make duplicate query detection and Pexels caching
      // predictable. Users get explicit feedback instead of silent cleanup when
      // the pasted JSON does not follow the prompt.
      if (typeof query !== 'string' || !query.trim()) {
        errors.push(`${label} must be a non-empty string.`);
        return;
      }

      if (query !== query.trim()) {
        errors.push(`${label} must not have leading or trailing spaces.`);
      }

      if (query !== query.toLowerCase()) {
        errors.push(`${label} must be lowercase.`);
      }
    });
  });

  return {
    valid: errors.length === 0,
    message: errors.length === 0
      ? 'JSON is valid and matches the expected scene format.'
      : 'JSON is not valid for the expected scene format.',
    sceneCount: parsedInput.length,
    errors,
    scenes: errors.length === 0 ? normalizeScenes(parsedInput as Scene[]) : []
  };
}

// Normalization trims display text and lowercases query values after validation
// confirms that the user supplied a safe shape. The app stores and submits this
// normalized version so the final media request is predictable.
export function normalizeScenes(scenes: Array<Partial<Scene>> = []): Scene[] {
  return scenes.map((scene, index) => ({
    id: index + 1,
    sceneText: String(scene.sceneText || '').trim(),
    searchQueries: (scene.searchQueries || [])
      .map(query => String(query || '').trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 2)
  }));
}
