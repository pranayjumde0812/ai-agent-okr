const getErrorMessage = (error) => {
  const payload = error?.response?.data;

  return String(
    payload?.message ||
      payload?.error ||
      payload?.details?.message ||
      error?.message ||
      ""
  ).toLowerCase();
};

const isAuthExpiredError = (error) => {
  const status = error?.response?.status;
  const message = getErrorMessage(error);

  return (
    status === 401 ||
    message.includes("token expired") ||
    message.includes("jwt expired") ||
    message.includes("unauthorized")
  );
};

module.exports = {
  isAuthExpiredError,
};
