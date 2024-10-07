const jwt = require("jsonwebtoken");
const db = require("../config/db"); // Adjust this path as necessary

const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) {
    console.log("No token provided"); // Log if no token is found
    return res.sendStatus(401); // Unauthorized
  }

  console.log("Token:", token); // Log the received token

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log("JWT Verify Error:", err); // Log the error
      return res.sendStatus(403); // Forbidden
    }

    // Check if the token has been revoked
    db.query(
      "SELECT revoked FROM sessions WHERE token = ?",
      [token],
      (err, results) => {
        if (err) {
          console.log("Database Query Error:", err); // Log DB error
          return res.status(500).json({ error: err.message });
        }

        if (results.length === 0 || results[0].revoked) {
          console.log("Token has been revoked"); // Log revoked token
          return res.sendStatus(403); // Forbidden
        }

        req.user = user; // Save user info in the request object
        next();
      }
    );
  });
};

module.exports = { authenticateToken };
