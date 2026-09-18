const errorHandler = (err, req, res, next) => {
  console.error(`[Error Handler] ${req.method} ${req.url} ->`, err.stack || err.message);

  const status = err.status || 500;
  const isDev = process.env.NODE_ENV === 'development';

  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.status(status).json({
      error: err.message || 'Internal Server Error',
      status,
      stack: isDev ? err.stack : undefined
    });
  }

  res.status(status).render(status === 404 ? 'errors/404' : 'errors/500', {
    title: `${status} - ${status === 404 ? 'Resource Not Found' : 'System Error'}`,
    error: isDev ? err : {},
    message: err.message || 'An unexpected error occurred while processing your circulation request.'
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).render('errors/404', {
    title: '404 - Page Not Found',
    message: `The requested path "${req.originalUrl}" does not exist in the library catalogue or circulation system.`
  });
};

module.exports = {
  errorHandler,
  notFoundHandler
};
