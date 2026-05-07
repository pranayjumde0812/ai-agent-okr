const axios = require("axios");
const config = require("../config/env");

const normalizeTelegramText = (text) => {
  return String(text || "")
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const sendMessage = async (chatId, text, options = {}) => {
  const payload = {
    chat_id: chatId,
    text: normalizeTelegramText(text),
    ...(options.reply_markup ? { reply_markup: options.reply_markup } : {}),
  };

  try {
    await axios.post(
      `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
      payload
    );
  } catch (error) {
    const telegramDescription =
      error?.response?.data?.description || error?.message || "Unknown Telegram error";

    if (options.reply_markup) {
      console.error("TELEGRAM SEND ERROR WITH MARKUP:", telegramDescription);
      console.error(
        "TELEGRAM MARKUP PAYLOAD:",
        JSON.stringify(options.reply_markup)
      );

      await axios.post(
        `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
        {
          chat_id: chatId,
          text: normalizeTelegramText(
            `${text}\n\nButtons could not be shown, so you can reply manually.`
          ),
        }
      );
      return;
    }

    throw error;
  }
};

const answerCallbackQuery = async (callbackQueryId, text = "") => {
  await axios.post(
    `https://api.telegram.org/bot${config.telegramBotToken}/answerCallbackQuery`,
    {
      callback_query_id: callbackQueryId,
      ...(text ? { text: normalizeTelegramText(text) } : {}),
    }
  );
};

const clearInlineKeyboard = async (chatId, messageId) => {
  await axios.post(
    `https://api.telegram.org/bot${config.telegramBotToken}/editMessageReplyMarkup`,
    {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [],
      },
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
  answerCallbackQuery,
  clearInlineKeyboard,
  sendMessage,
  sendMenu,
  sendHelpMessage,
  normalizeTelegramText,
};
