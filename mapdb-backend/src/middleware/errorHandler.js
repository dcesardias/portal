export function errorHandler(err, _req, res, _next) {
    console.error('Error:', err.message);
    res.status(500).json({
        error: err.message,
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
}
//# sourceMappingURL=errorHandler.js.map