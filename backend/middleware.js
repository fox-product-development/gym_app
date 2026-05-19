// backend/middleware.js
// Authentication middleware.
// Protects routes by checking the JWT token on every request.
// Any route that needs to be protected imports and uses this.

const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  // Get the token from the request header
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  // Verify the token
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    // Attach the user info to the request so routes can use it
    req.userId = decoded.userId;
    req.username = decoded.username;

    next();
  });
}

module.exports = requireAuth;
