const axios = require("axios");
const config = require("../config/env");
const sessionStore = require("../utils/session.store");

const getBackendHealth = async () => {
  try {
    const response = await axios.get(config.apiBaseUrl, {
      timeout: 3000,
      validateStatus: () => true,
    });

    return {
      ok: response.status < 500,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.code || error.message,
    };
  }
};

const getOllamaHealth = async () => {
  try {
    const response = await axios.get(`${config.ollamaBaseUrl}/api/tags`, {
      timeout: 3000,
    });

    const models = response.data.models || [];
    const modelNames = models.map((model) => model.name);

    return {
      ok: true,
      configuredModelAvailable: modelNames.includes(config.ollamaModel),
      modelCount: modelNames.length,
      modelNames,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.code || error.message,
      configuredModelAvailable: false,
      modelCount: 0,
      modelNames: [],
    };
  }
};

const getSystemHealth = async () => {
  const [backend, ollama] = await Promise.all([
    getBackendHealth(),
    getOllamaHealth(),
  ]);

  return {
    ok: backend.ok && ollama.ok && ollama.configuredModelAvailable,
    backend,
    ollama,
    sessions: sessionStore.getSessionStats(),
    config: {
      apiBaseUrl: config.apiBaseUrl,
      ollamaBaseUrl: config.ollamaBaseUrl,
      ollamaModel: config.ollamaModel,
      keyResultApiPath: config.keyResultApiPath,
      objectiveProgressApiPath: config.objectiveProgressApiPath,
    },
  };
};

module.exports = {
  getSystemHealth,
};
