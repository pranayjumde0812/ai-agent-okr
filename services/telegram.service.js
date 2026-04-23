const axios = require("axios");

const BOT_TOKEN = "bot8679641024:AAG3D2LqDrGFSUk013uPZfJVy3Frye8h0Dc";

const sendMessage = async (chatId, text) => {
  await axios.post(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      chat_id: chatId,
      text,
    }
  );
};

const sendMenu = async (chatId) => {
  await axios.post(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      chat_id: chatId,
      text: "Choose an option:",
      reply_markup: {
        keyboard: [
          ["👤 View Profile"],
          ["🎯 Create Objective"]
        ],
        resize_keyboard: true
      }
    }
  );
};

module.exports = {
  sendMessage,
  sendMenu,
};