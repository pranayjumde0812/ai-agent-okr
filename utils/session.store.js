const fs = require("fs");
const path = require("path");
const config = require("../config/env");

const sessions = {};
const sessionStoreDir = path.dirname(config.sessionStorePath);
const sessionTtlMs = config.sessionTtlHours * 60 * 60 * 1000;

const ensureStoreDir = () => {
  fs.mkdirSync(sessionStoreDir, { recursive: true });
};

const persistSessions = () => {
  ensureStoreDir();
  fs.writeFileSync(config.sessionStorePath, JSON.stringify(sessions, null, 2));
};

const isExpired = (session) => {
  if (!session?.updatedAt) {
    return false;
  }

  return Date.now() - session.updatedAt > sessionTtlMs;
};

const pruneExpiredSessions = () => {
  let changed = false;

  Object.entries(sessions).forEach(([userId, session]) => {
    if (isExpired(session)) {
      delete sessions[userId];
      changed = true;
    }
  });

  if (changed) {
    persistSessions();
  }
};

const loadSessions = () => {
  try {
    if (!fs.existsSync(config.sessionStorePath)) {
      return;
    }

    const raw = fs.readFileSync(config.sessionStorePath, "utf8");
    const parsed = JSON.parse(raw);

    Object.assign(sessions, parsed);
    pruneExpiredSessions();
  } catch (error) {
    console.error("SESSION LOAD ERROR:", error.message);
  }
};

const touchSession = (userId) => {
  sessions[userId] = {
    ...sessions[userId],
    updatedAt: Date.now(),
  };
};

const setSession = (userId, data) => {
  sessions[userId] = {
    ...sessions[userId],
    ...data,
  };

  touchSession(userId);
  persistSessions();
};

const getSession = (userId) => {
  const session = sessions[userId];

  if (!session) {
    return undefined;
  }

  if (isExpired(session)) {
    delete sessions[userId];
    persistSessions();
    return undefined;
  }

  return session;
};

const clearStep = (userId) => {
  if (!sessions[userId]) {
    return;
  }

  delete sessions[userId].step;
  touchSession(userId);
  persistSessions();
};

const appendHistory = (userId, role, content) => {
  if (!sessions[userId]) {
    sessions[userId] = {};
  }

  const history = sessions[userId].history || [];

  history.push({ role, content, at: Date.now() });
  sessions[userId].history = history.slice(-12);
  touchSession(userId);
  persistSessions();
};

const getHistory = (userId) => {
  return getSession(userId)?.history || [];
};

const clearSession = (userId) => {
  if (!sessions[userId]) {
    return;
  }

  delete sessions[userId];
  persistSessions();
};

const getSessionStats = () => {
  pruneExpiredSessions();

  return {
    activeSessions: Object.keys(sessions).length,
    ttlHours: config.sessionTtlHours,
    storePath: config.sessionStorePath,
  };
};

loadSessions();

module.exports = {
  setSession,
  getSession,
  clearStep,
  appendHistory,
  getHistory,
  clearSession,
  getSessionStats,
};
