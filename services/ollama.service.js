const axios = require("axios");
const config = require("../config/env");

const chatWithModel = async ({ messages, format }) => {
  const response = await axios.post(
    `${config.ollamaBaseUrl}/api/chat`,
    {
      model: config.ollamaModel,
      messages,
      stream: false,
      options: {
        temperature: 0.2,
      },
      ...(format ? { format } : {}),
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
};

module.exports = {
  chatWithModel,
};
