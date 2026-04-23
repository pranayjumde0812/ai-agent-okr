const fs = require("fs");
const path = require("path");

const ENV_FILE_PATH = path.join(__dirname, "..", ".env");

const stripWrappingQuotes = (value) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
};

const loadEnvFile = () => {
  if (!fs.existsSync(ENV_FILE_PATH)) {
    return;
  }

  const fileContent = fs.readFileSync(ENV_FILE_PATH, "utf8");
  const lines = fileContent.split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();

    if (!key || process.env[key]) {
      continue;
    }

    process.env[key] = stripWrappingQuotes(rawValue);
  }
};

loadEnvFile();

const getRequiredValue = (key) => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const config = {
  port: Number(process.env.PORT || 6000),
  apiBaseUrl: process.env.API_BASE_URL || "http://127.0.0.1:3000/v1",
  telegramBotToken: getRequiredValue("TELEGRAM_BOT_TOKEN"),
};

module.exports = config;
