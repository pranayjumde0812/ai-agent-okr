const axios = require("axios");
const config = require("../config/env");

const withAuth = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

const createObjective = (token, name, description) => {
  return axios.post(
    `${config.apiBaseUrl}/objective`,
    [
      {
        objectiveName: name,
        description: description || "Created via Telegram",
      },
    ],
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
