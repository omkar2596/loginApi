// index.js
const express = require("express");
const authRoutes = require("./routes/auth");

const app = express();
app.use(express.json());

app.use("/auth", authRoutes); // Mount the auth routes

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
