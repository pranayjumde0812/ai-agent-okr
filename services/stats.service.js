const axios = require("axios");
const config = require("../config/env");

const withAuth = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

const normalizeRole = (role = "") => String(role || "").trim().toUpperCase();

const buildRoleAwareStatsPath = (role, managementPath, departmentPath) => {
  return normalizeRole(role) === "DEPARTMENT" ? departmentPath : managementPath;
};

const getYearFilters = (token, role) => {
  const path = buildRoleAwareStatsPath(
    role,
    "/stats/year-filter",
    "/stats/department/year-filter"
  );

  return axios.get(`${config.apiBaseUrl}${path}`, withAuth(token));
};

const getObjectiveGrowth = (token, { year, quarter, role }) => {
  const path = buildRoleAwareStatsPath(
    role,
    `/stats/objective-growth/${year}/${quarter}`,
    `/stats/department/objective-growth/${year}/${quarter}`
  );

  return axios.get(`${config.apiBaseUrl}${path}`, withAuth(token));
};

const getDepartmentGrowth = (token, { year, quarter }) => {
  return axios.get(
    `${config.apiBaseUrl}/stats/department-growth/${year}/${quarter}`,
    withAuth(token)
  );
};

const getYearlyGrowth = (token, { year, role }) => {
  const path = buildRoleAwareStatsPath(
    role,
    `/stats/yearly-growth/${year}`,
    `/stats/department/yearly-growth/${year}`
  );

  return axios.get(`${config.apiBaseUrl}${path}`, withAuth(token));
};

module.exports = {
  getYearFilters,
  getObjectiveGrowth,
  getDepartmentGrowth,
  getYearlyGrowth,
};
