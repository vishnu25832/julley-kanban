
function notFound(req, res, next) {
    res.status(404).json({
      success: false,
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
  }

  function errorHandler(error, req, res, next) {
    console.error(error);

    const statusCode = error.statusCode || 500;

    res.status(statusCode).json({
      success: false,
      message:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : error.message || "Internal server error",
    });
  }

  module.exports = {
    notFound,
    errorHandler,
  };

