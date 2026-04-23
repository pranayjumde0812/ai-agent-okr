const sessions = {};

const setSession = (userId, data) => {
  sessions[userId] = {
    ...sessions[userId],
    ...data,
  };
};

const getSession = (userId) => {
  return sessions[userId];
};

const clearStep = (userId) => {
  if (!sessions[userId]) {
    return;
  }

  delete sessions[userId].step;
};

const appendHistory = (userId, role, content) => {
  if (!sessions[userId]) {
    sessions[userId] = {};
  }

  const history = sessions[userId].history || [];

  history.push({ role, content });
  sessions[userId].history = history.slice(-12);
};

const getHistory = (userId) => {
  return sessions[userId]?.history || [];
};

module.exports = {
  setSession,
  getSession,
  clearStep,
  appendHistory,
  getHistory,
};
