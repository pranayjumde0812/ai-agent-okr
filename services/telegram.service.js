const axios = require("axios");
const config = require("../config/env");

const normalizeTelegramText = (text) => {
  return String(text || "")
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const sendMessage = async (chatId, text) => {
  await axios.post(
    `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
    {
      chat_id: chatId,
      text: normalizeTelegramText(text),
    }
  );
};

const sendMenu = async (chatId) => {
  await axios.post(
    `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
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

const sendHelpMessage = async (chatId) => {
  await sendMessage(
    chatId,
    "💡 Commands:\n\n1. Send email to login\n2. Enter OTP\n3. create objective: Name | Description\n4. get objectives\n5. get profile\n6. get departments"
  );
};

module.exports = {
  sendMessage,
  sendMenu,
  sendHelpMessage,
  normalizeTelegramText,
};
