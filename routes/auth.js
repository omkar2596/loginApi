// routes/auth.js
const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const db = require("../config/db");
const transporter = require("../config/mail");

const router = express.Router();
const { authenticateToken } = require("../middleware/authMiddleware"); // Import the middleware for logout
const jwt = require("jsonwebtoken");

// Password complexity function
const passwordComplexity = (password) => {
  const regex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return regex.test(password);
};

// Register
// {
//     "username": "omkar",
//     "password": "Password123!",
//     "email": "ombulbule.ob@gmail.com",
//     "firstName": "sJohn",
//     "lastName": "Doe",
//     "mobile": "1234567890"
// }

router.post("/register", async (req, res) => {
  const { username, password, email, firstName, lastName, mobile } = req.body;

  if (!username || !password || !email || !firstName || !lastName || !mobile) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (!passwordComplexity(password)) {
    return res.status(400).json({
      message: "Password must be complex.",
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  db.query(
    "INSERT INTO users (username, password, email, firstName, lastName, mobile) VALUES (?, ?, ?, ?, ?, ?)",
    [username, hashedPassword, email, firstName, lastName, mobile],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: "User registered successfully" });
    }
  );
});

// Login endpoint

// {
//     "username": "omkar",
//     "password": "Password123!"
// }

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  // Check if the user exists
  db.query(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, results) => {
      if (err) return res.status(500).json({ error: err.message });

      const user = results[0];
      if (!user)
        return res.status(401).json({ message: "Invalid credentials" });

      // Check if account is locked
      if (user.locked_until && new Date() < new Date(user.locked_until)) {
        return res
          .status(403)
          .json({ message: "Account is locked. Try again later." });
      }

      // Validate password
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        // Increment login attempts
        db.query(
          "UPDATE users SET login_attempts = login_attempts + 1 WHERE id = ?",
          [user.id],
          (err) => {
            if (err) return res.status(500).json({ error: err.message });

            // Lock the account if attempts exceed a threshold (e.g., 5)
            if (user.login_attempts + 1 >= 5) {
              const lockTime = new Date(Date.now() + 10 * 60 * 1000); // Lock for 10 minutes
              db.query("UPDATE users SET locked_until = ? WHERE id = ?", [
                lockTime,
                user.id,
              ]);
              return res.status(403).json({
                message:
                  "Account locked due to too many failed login attempts.",
              });
            }

            return res.status(401).json({ message: "Invalid credentials" });
          }
        );
      } else {
        // Reset login attempts on successful login
        db.query(
          "UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = ?",
          [user.id]
        );

        // Generate JWT token
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
          expiresIn: "1h",
        });
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

        // Store the session in the database
        db.query(
          "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
          [user.id, token, expiresAt],
          (err) => {
            if (err) return res.status(500).json({ error: err.message });

            res.json({ message: "Login successful", token });
          }
        );
      }
    }
  );
});

// Forgot Password
// {
//     "email": "omkarbulbule25@gmail.com"
// }

router.post("/forgot-password", (req, res) => {
  const { email } = req.body;

  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0)
      return res.status(404).json({ message: "Email not found" });

    const user = results[0];
    const token = crypto.randomBytes(20).toString("hex");
    const expiration = new Date(Date.now() + 3600000);

    db.query(
      "UPDATE users SET reset_token = ?, token_expires = ? WHERE email = ?",
      [token, expiration, email],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });

        const resetLink = `http://localhost:3000/reset-password?token=${token}`;

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: "Password Reset Request",
          text: `Hello ${user.firstName},\n\nYou requested a password reset. Click the link to reset your password: ${resetLink}\n\nBest regards,\nYour Application Team`,
        };

        transporter.sendMail(mailOptions, (error) => {
          if (error) return res.status(500).json({ error: error.message });
          res.json({ message: "Password reset email sent" });
        });
      }
    );
  });
});

// Reset Password

// {
//     "token": "235c1a691578f84e0b1f663a95e86c85f22caf73",  // Replace with the token received in the email
//     "newPassword": "NewPassword123!!"
// }
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  db.query(
    "SELECT * FROM users WHERE reset_token = ? AND token_expires > ?",
    [token, new Date()],
    async (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0)
        return res.status(400).json({ message: "Invalid or expired token" });

      const user = results[0];
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      db.query(
        "UPDATE users SET password = ?, reset_token = NULL, token_expires = NULL WHERE id = ?",
        [hashedPassword, user.id],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: "Password has been reset successfully" });
        }
      );
    }
  );
});

// Logout endpoint
// Logout endpoint
router.post("/logout", (req, res) => {
  const authHeader = req.headers["authorization"]; // Corrected to get the Authorization header
  const token = authHeader && authHeader.split(" ")[1]; // Extract the token from "Bearer <token>"

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Check if the token exists in the sessions table and revoke it
  db.query(
    "UPDATE sessions SET revoked = TRUE WHERE token = ?",
    [token],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });

      if (results.affectedRows === 0) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      res.json({ message: "Logout successful" });
    }
  );
});

// Protected Route Example just check for logout or not
router.get("/protected-route", authenticateToken, (req, res) => {
  res.json({ message: "This is a protected route!", user: req.user });
});

module.exports = router;
