const axios = require("axios");
const config = require("../config/env");

const withAuth = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

const createObjective = (token, name, description) => {
  const objectives = Array.isArray(name)
    ? name
    : [
        {
          objectiveName: name,
          description: description || "Created via Telegram",
        },
      ];

  return axios.post(
    `${config.apiBaseUrl}/objective`,
    objectives,
    withAuth(token)
  );
};

const getObjectives = (token) => {
  return axios.get(`${config.apiBaseUrl}/objective`, withAuth(token));
};

const createKeyResult = (token, payload) => {
  return axios.post(
    `${config.apiBaseUrl}${config.keyResultApiPath}`,
    payload,
    withAuth(token)
  );
};

const updateObjectiveProgress = (token, payload) => {
  return axios.patch(
    `${config.apiBaseUrl}${config.objectiveProgressApiPath}`,
    payload,
    withAuth(token)
  );
};

module.exports = {
  createObjective,
  getObjectives,
  createKeyResult,
  updateObjectiveProgress,
};
