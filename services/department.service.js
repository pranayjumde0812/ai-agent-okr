const axios = require("axios");
const config = require("../config/env");

const withAuth = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

const normalizeRole = (role = "") => String(role || "").trim().toUpperCase();

const getDepartments = (token) => {
  return axios.get(`${config.apiBaseUrl}/dashboard/departments`, withAuth(token));
};

const createDepartmentObjective = (token, payload) => {
  return axios.post(
    `${config.apiBaseUrl}/department-objective/add-department-objective`,
    {
      organizationObjectiveId: payload.organizationObjectiveId,
      ...(payload.departmentId ? { departmentId: payload.departmentId } : {}),
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

const getCurrentDepartment = (token) => {
  return axios.get(
    `${config.apiBaseUrl}/dashboard/current-department`,
    withAuth(token)
  );
};

const getCurrentDepartmentObjectives = (token) => {
  return axios.get(
    `${config.apiBaseUrl}/dashboard/current-department/objectives`,
    withAuth(token)
  );
};

const getDepartmentObjectiveKeyResults = (token, departmentObjectiveId, role) => {
  const normalizedRole = normalizeRole(role);
  const path =
    normalizedRole === "DEPARTMENT"
      ? `/dashboard/dept-objective/${departmentObjectiveId}/key-results`
      : `/dashboard/department-objective/${departmentObjectiveId}/key-results`;

  return axios.get(`${config.apiBaseUrl}${path}`, withAuth(token));
};

const addWeightageToKeyResult = (token, keyResultId, payload) => {
  return axios.put(
    `${config.apiBaseUrl}/dashboard/add-weightage/key-result/${keyResultId}`,
    payload,
    withAuth(token)
  );
};

const updateCurrentScoreForKeyResult = (token, keyResultId, payload) => {
  return axios.put(
    `${config.apiBaseUrl}/dashboard/current-score/key-result/${keyResultId}`,
    payload,
    withAuth(token)
  );
};

const getDepartmentObjectivesForDepartment = (token, departmentId, role = "MANAGEMENT") => {
  return axios.get(
    departmentId
      ? `${config.apiBaseUrl}/department-objective?departmentId=${departmentId}`
      : `${config.apiBaseUrl}/department-objective`,
    withAuth(token)
  );
};

module.exports = {
  getDepartments,
  createDepartmentObjective,
  getDepartmentObjectives,
  createDepartmentTaskKeyResult,
  getCurrentDepartment,
  getCurrentDepartmentObjectives,
  getDepartmentObjectiveKeyResults,
  getDepartmentObjectivesForDepartment,
  addWeightageToKeyResult,
  updateCurrentScoreForKeyResult,
};
