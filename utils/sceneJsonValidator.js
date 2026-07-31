function validateScenesJson(rawInput) {
  if (!rawInput || !rawInput.trim()) {
    return {
      valid: false,
      message: 'Paste the JSON output from ChatGPT before continuing.',
      errors: ['Missing JSON input.']
    };
  }

  let parsedInput;
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

  const errors = [];

  parsedInput.forEach((scene, index) => {
    const sceneNumber = index + 1;

    if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
      errors.push(`Scene ${sceneNumber} must be an object.`);
      return;
    }

    if (!Number.isInteger(scene.id)) {
      errors.push(`Scene ${sceneNumber} id must be an integer.`);
    } else if (scene.id !== sceneNumber) {
      errors.push(`Scene ${sceneNumber} id must be ${sceneNumber}.`);
    }

    if (typeof scene.sceneText !== 'string' || !scene.sceneText.trim()) {
      errors.push(`Scene ${sceneNumber} sceneText must be a non-empty string.`);
    }

    if (!Array.isArray(scene.searchQueries)) {
      errors.push(`Scene ${sceneNumber} searchQueries must be an array.`);
      return;
    }

    if (scene.searchQueries.length === 0) {
      errors.push(`Scene ${sceneNumber} searchQueries must contain at least one query.`);
    }

    if (scene.searchQueries.length > 2) {
      errors.push(`Scene ${sceneNumber} searchQueries can contain at most 2 queries.`);
    }

    scene.searchQueries.forEach((query, queryIndex) => {
      const label = `Scene ${sceneNumber} searchQueries[${queryIndex}]`;

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
    errors
  };
}

module.exports = { validateScenesJson };
