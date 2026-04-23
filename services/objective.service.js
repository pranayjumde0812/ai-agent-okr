const axios = require("axios");

const BASE_URL = "http://127.0.0.1:3000/v1";

const createObjective = (token, name, description) => {
  return axios.post(
    `${BASE_URL}/objective`,
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

module.exports = { createObjective };