var express = require("express");
var router = express.Router();
const User = require("../models/Users");
const Message = require("../models/Messages");
const path = require("path"); // Import the path module
//Require the libraries
require("dotenv").config();
const { body, validationResult } = require("express-validator");
const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const multer = require("multer");
const Post = require("../models/Posts");

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
    console.log("not allowed");
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

/* ---------- Multer ROUTES --------- */

// Set up multer middleware

const fileStorageEngine = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../images"));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "--" + file.originalname);
  },
});

const upload = multer({ storage: fileStorageEngine });

router.post(
  "/upload",
  upload.array("images", 5),
  verifyAndDecodeToken,
  asyncHandler(async (req, res, next) => {
    let fileNameArray = [];
    req.files.forEach((file) => {
      console.log(file.filename);
      fileNameArray.push(file.filename);
    });
    console.log(req.body.caption);
    const newPost = new Post({
      creator: req.authData.user._id,
      content: fileNameArray,
      caption: req.body.caption,
    });
    await newPost.save();

    res.send("Multiple Files Upload Success");
  })
);

/* DM Routes */

// List all DM conversations for the current user, including the most recent message
router.get(
  "/inbox",
  verifyAndDecodeToken,
  asyncHandler(async (req, res) => {
    const currentUserId = req.authData.user._id; // Get the current user's ID from the request parameters

    // Find all unique combinations of sender and receiver, which represent DM conversations involving the current user
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: mongoose.Types.ObjectId(currentUserId) },
            { receiver: mongoose.Types.ObjectId(currentUserId) },
          ],
        },
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$sender", mongoose.Types.ObjectId(currentUserId)] },
              "$receiver",
              "$sender",
            ],
          },
        },
      },
    ]);

    // Add user information and most recent message to each conversation
    const conversationsWithRecentMessages = await Promise.all(
      conversations.map(async (conversation) => {
        const otherUserId = conversation._id;
        const otherUser = await User.findById(otherUserId); // Assuming you have a User model

        // Find the most recent message in the conversation
        const mostRecentMessage = await Message.find({
          $or: [
            {
              sender: mongoose.Types.ObjectId(currentUserId),
              receiver: otherUserId,
            },
            {
              sender: otherUserId,
              receiver: mongoose.Types.ObjectId(currentUserId),
            },
          ],
        })
          .sort({ timestamp: -1 })
          .limit(1);

        return {
          _id: otherUserId,
          username: otherUser.username, // Include any other user information you want
          mostRecentMessage: mostRecentMessage[0], // Include the most recent message
        };
      })
    );
    res.json(conversationsWithRecentMessages);
  })
);

// Get the full message history for a specific conversation
router.get(
  "/conversation/:id",
  verifyAndDecodeToken,
  asyncHandler(async (req, res) => {
    const conversationId = req.params.id; // This ID represents a conversation between two users

    // Find all messages for the given conversation
    const messages = await Message.find({
      $or: [{ sender: conversationId }, { receiver: conversationId }],
    })
      .sort({ timestamp: 1 }) // Sort messages by timestamp in ascending order
      .populate("sender") // Populate the sender field with user information
      .populate("receiver"); // Populate the receiver field with user information

    res.json(messages);
  })
);

module.exports = router;
