const axios = require("axios");
const config = require("../config/env");

exports.sendOtp = async (email) => {
  return axios.post(`${config.apiBaseUrl}/auth/sign-in/organization`, { email });
};

exports.verifyOtp = async (email, otp) => {
  return axios.post(`${config.apiBaseUrl}/auth/verify-otp/organization`, {
    email,
    otp,
  });
};

exports.signOut = async (token) => {
  return axios.post(
    `${config.apiBaseUrl}/auth/sign-out`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
};

exports.getCurrentOrganizationProfile = async (token) => {
  return axios.get(`${config.apiBaseUrl}/organization/current-organization`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};
