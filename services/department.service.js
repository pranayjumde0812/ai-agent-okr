const axios = require("axios");
const config = require("../config/env");

const getDepartments = (token) => {
  return axios.get(`${config.apiBaseUrl}/dashboard/departments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
};

module.exports = { getDepartments };
