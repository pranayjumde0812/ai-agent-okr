const axios = require("axios");
const config = require("../config/env");

const LOGIN_MODE = {
  ORGANIZATION: "organization",
  DEPARTMENT: "department",
};

const normalizeLoginMode = (loginAs = "") => {
  const normalized = String(loginAs || "").trim().toLowerCase();

  if (["department", "dept", "team"].includes(normalized)) {
    return LOGIN_MODE.DEPARTMENT;
  }

  return LOGIN_MODE.ORGANIZATION;
};

const postAuth = (path, payload) => {
  return axios.post(`${config.apiBaseUrl}${path}`, payload);
};

const sendOtp = async (email, loginAs = "auto") => {
  const normalizedLoginMode = String(loginAs || "").trim().toLowerCase();

  if (normalizedLoginMode === "auto") {
    try {
      const response = await postAuth("/auth/sign-in/organization", { email });
      return {
        response,
        loginMode: LOGIN_MODE.ORGANIZATION,
      };
    } catch (organizationError) {
      const response = await postAuth("/auth/sign-in/department", { email });
      return {
        response,
        loginMode: LOGIN_MODE.DEPARTMENT,
      };
    }
  }

  const loginMode = normalizeLoginMode(loginAs);
  const path =
    loginMode === LOGIN_MODE.DEPARTMENT
      ? "/auth/sign-in/department"
      : "/auth/sign-in/organization";

  const response = await postAuth(path, { email });
  return { response, loginMode };
};

const verifyOtp = async (email, otp, loginAs = LOGIN_MODE.ORGANIZATION) => {
  const loginMode = normalizeLoginMode(loginAs);
  const path =
    loginMode === LOGIN_MODE.DEPARTMENT
      ? "/auth/verify-otp/department"
      : "/auth/verify-otp/organization";

  const response = await postAuth(path, {
    email,
    otp,
  });

  return { response, loginMode };
};

const signOut = async (token) => {
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

const getCurrentOrganizationProfile = async (token) => {
  return axios.get(`${config.apiBaseUrl}/organization/current-organization`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

const getProfileDetails = async (token, role = "MANAGEMENT") => {
  const normalizedRole = String(role || "").trim().toUpperCase();
  const path =
    normalizedRole === "DEPARTMENT"
      ? "/department/profile-details"
      : "/organization/profile-details";

  return axios.get(`${config.apiBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

module.exports = {
  LOGIN_MODE,
  sendOtp,
  verifyOtp,
  signOut,
  getCurrentOrganizationProfile,
  getProfileDetails,
};
