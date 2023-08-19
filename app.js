var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
//Require cors
const cors = require("cors");
//require mongoose
const mongoose = require("mongoose");
//require dotenv
require("dotenv").config();

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");

var app = express();

//Implement cors
app.use(cors());

//Connect to mongoose (mongoDB)
mongoose.set("strictQuery", false);
async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
}
main().catch((err) => console.log(err));

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/users", usersRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;

/* 
---------------------- Things to do-------------------

So what I need to do is, use the jwt library
then I need to refactor the code where Im doing the try{jwt.verify}
into a seperate middleware. I can set the authdata to req.authData=authData

I think that will work because in the other jwt verifyToken middleware, we
set the req.token = bearerToken; So that means that we can create req.x=y
and then be able to access it further down.

^^^ Yeah we definitely can, because in this code :

router.get(
  "/author",
  verifyToken,  
  asyncHandler(async (req, res, next) => {
    try {
      jwt.verify(req.token, process.env.SECRET, async (err, authData) => {
        if (err) {
          res.sendStatus(403);
        } else {
          let authorsBlogs = await Blog.find({
            author: authData.user._id,
          })
            .sort({ date: -1 })
            .populate("author")
            .exec();

          res.json(authorsBlogs);
        }
      });
    } catch (error) {
      res.sendStatus(403);
    }
  })
);
We are calling the verifyToken, and then straight after we are 
accessing the token in jwt.verify

that means if we refactor jwt.verify and set authData to req.authData
Then we wont have to have that huge block of code and it will look 
nice.
Because all we are really trying to access from jwt.verify is the
authData to begin with.



*/
