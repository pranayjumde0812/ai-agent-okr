const axios = require("axios");
const config = require("../config/env");

const createObjective = (token, name, description) => {
  return axios.post(
    `${config.apiBaseUrl}/objective`,
    [
      {
        objectiveName: name,
        description: description || "Created via Telegram",
      },
    ],
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
};

const getObjectives = (token) => {
  return axios.get(`${config.apiBaseUrl}/objective`, {
    headers: { Authorization: `Bearer ${token}` },
  });
};

module.exports = { createObjective, getObjectives };
