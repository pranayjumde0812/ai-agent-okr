const axios = require("axios");
const config = require("../config/env");

const withAuth = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

const getDepartments = (token) => {
  return axios.get(`${config.apiBaseUrl}/dashboard/departments`, withAuth(token));
};

const createDepartmentObjective = (token, payload) => {
  return axios.post(
    `${config.apiBaseUrl}/department-objective/add-department-objective`,
    {
      organizationObjectiveId: payload.organizationObjectiveId,
      departmentObjective: payload.departmentObjective,
      description: payload.description || "",
    },
    withAuth(token)
  );
};

const getDepartmentObjectives = (token, departmentId) => {
  const url = departmentId
    ? `${config.apiBaseUrl}/department-objective?departmentId=${departmentId}`
    : `${config.apiBaseUrl}/department-objective`;
  return axios.get(url, withAuth(token));
};

const createDepartmentTaskKeyResult = (token, payload) => {
  return axios.post(
    `${config.apiBaseUrl}/key-result/add-key-result`,
    {
      departmentObjectiveId: payload.departmentObjectiveId,
      task: payload.task,
      keyResult: payload.keyResult,
    },
    withAuth(token)
  );
};

module.exports = {
  getDepartments,
  createDepartmentObjective,
  getDepartmentObjectives,
  createDepartmentTaskKeyResult,
};
