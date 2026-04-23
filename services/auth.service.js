const axios = require("axios");

const BASE_URL = "http://localhost:3000/v1";

exports.sendOtp = async (email) => {
  return axios.post(`${BASE_URL}/auth/sign-in/organization`, { email });
};

exports.verifyOtp = async (email, otp) => {
  return axios.post(`${BASE_URL}/auth/verify-otp/organization`, {
    email,
    otp,
  });
};


// const axios = require("axios");

// const BASE_URL = "http://127.0.0.1:3000/v1";

// const sendOtp = (email) => {
//   return axios.post(`${BASE_URL}/auth/sign-in/organization`, { email });
// };

// const verifyOtp = (email, otp) => {
//   return axios.post(`${BASE_URL}/auth/verify-otp/organization`, {
//     email,
//     otp,
//   });
// };

// const getProfile = (token) => {
//   return axios.get(`${BASE_URL}/organization/profile`, {
//     headers: { Authorization: `Bearer ${token}` },
//   });
// };

// module.exports = {
//   sendOtp,
//   verifyOtp,
//   getProfile,
// };