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

module.exports = {
  setSession,
  getSession,
};


// const sessions = {};

// module.exports = {
//   getSession: (userId) => sessions[userId],
//   setSession: (userId, data) => {
//     sessions[userId] = { ...sessions[userId], ...data };
//   },
//   clearStep: (userId) => {
//     if (sessions[userId]) sessions[userId].step = null;
//   },
// };