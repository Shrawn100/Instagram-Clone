var express = require("express");
var router = express.Router();
const User = require("../models/Users");
//Require the libraries
require("dotenv").config();
const { body, validationResult } = require("express-validator");
const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

/* GET home page. */
router.get("/", function (req, res, next) {
  res.render("index", { title: "Express" });
});

/* ------- Set up JWT middleware ------- */

function verifyAndDecodeToken(req, res, next) {
  // Get auth header value
  const bearerHeader = req.headers["authorization"];

  // Check if bearer is undefined
  if (typeof bearerHeader !== "undefined") {
    // Split header
    const bearer = bearerHeader.split(" ");

    // Get token from array
    const bearerToken = bearer[1];

    // Set the token
    req.token = bearerToken;

    // Verify the token
    jwt.verify(req.token, process.env.SECRET, (err, authData) => {
      if (err) {
        res.sendStatus(403);
      } else {
        req.authData = authData;
        next();
      }
    });
  } else {
    // Forbidden
    res.sendStatus(403);
  }
}

/* ---------- SIGNUP && LOGIN ROUTES --------- */

router.post("/signup", [
  body("name", "Display name must be at least 3 characters")
    .trim()
    .isLength({ min: 3 })
    .escape(),
  body("username", "Username must be at least 3 characters")
    .trim()
    .isLength({ min: 3 })
    .escape(),
  body("password", "Password must be at least 6 characters")
    .trim()
    .isLength({ min: 6 })
    .custom((value, { req }) => {
      if (!/(?=.*[A-Z])/.test(value)) {
        throw new Error("Password must contain at least 1 capital letter");
      }
      if (!/(?=.*\d)/.test(value)) {
        throw new Error("Password must contain at least 1 number");
      }
      return value;
    })
    .escape(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((error) => error.msg);
      return res.json({ message: "Validation failed", errors: errorMessages });
    }

    const { username, password, name } = req.body;
    try {
      // Check if user with the same username already exists
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.json({
          message: "Username already exists. Please pick another one.",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10); // Hash the password using bcrypt

      const newUser = new User({
        name,
        username,
        password: hashedPassword, // Store the hashed password in the database
      });

      await newUser.save(); // Save the new user to the database

      res.json({ message: "User registered successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "An error occurred" });
    }
  },
]);

router.post("/login", [
  body("username", "Invalid username").trim().isLength({ min: 3 }).escape(),
  body("password", "Invalid password").trim().isLength({ min: 6 }).escape(),

  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.json({ message: "Unsuccessful", errors: errors.array() });
    }

    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user) {
      return res.json({ message: "User does not exist" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.json({ message: "Wrong password" });
    }

    jwt.sign(
      { user },
      process.env.SECRET,
      { expiresIn: "12h" },
      (err, token) => {
        res.json({ token });
      }
    );
  }),
]);

/* ---------- USER PROFILE ROUTES --------- */
router.get(
  "/home",
  verifyAndDecodeToken,
  asyncHandler(async (req, res, next) => {
    const userID = req.authData.user._id;

    // Find the user's following list and populate the 'following' field
    const user = await User.findById(userID).populate("following");

    const postsList = [];

    // Iterate through the users the authenticated user is following
    for (const followingUser of user.following) {
      // Iterate through the posts of the following user
      for (const post of followingUser.posts) {
        postsList.push(post);
      }
    }

    // Sort posts by date in descending order (most recent first)
    const sortedPostsList = postsList.sort((a, b) => b.date - a.date);

    res.json({ sortedPostsList });
  })
);
router.get(
  "/profile",
  verifyAndDecodeToken,
  asyncHandler(async (req, res, next) => {
    let userdata = req.authData.user;
    res.json({ userdata });
  })
);

module.exports = router;
