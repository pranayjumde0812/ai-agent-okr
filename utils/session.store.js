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

module.exports = {
  setSession,
  getSession,
  clearStep,
};
