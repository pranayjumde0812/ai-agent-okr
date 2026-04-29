const axios = require("axios");
const config = require("../config/env");

const withAuth = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

const getScheduleDetails = (token) => {
  return axios.get(
    `${config.apiBaseUrl}/setting/score-management/schedule`,
    withAuth(token)
  );
};

const updateScheduleDetails = (token, payload) => {
  return axios.put(
    `${config.apiBaseUrl}/setting/score-management/schedule`,
    payload,
    withAuth(token)
  );
};

const getScoreEditStatus = (token) => {
  return axios.get(
    `${config.apiBaseUrl}/setting/check-score-edit-status`,
    withAuth(token)
  );
};

module.exports = {
  getScheduleDetails,
  updateScheduleDetails,
  getScoreEditStatus,
};
