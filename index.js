//jshint esversion:6
require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require('express-session');
const passport = require("passport");
const path=require("path");
const crypto=require("crypto");
const multer=require("multer");
const GridFsStorage=require("multer-gridfs-storage");
const Grid=require("gridfs-stream");
const methodOverride=require("method-override");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy=require('passport-facebook').Strategy;
const findOrCreate = require('mongoose-findorcreate');

const app = express();

app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(methodOverride("_method"));

app.use(session({
  secret: "Nanatsu no Taizai.",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

const mongoURI = "mongodb+srv://admin-ashish:test123@cluster0-sufhd.mongodb.net/enactusDB";

mongoose.connect("mongodb+srv://admin-ashish:test123@cluster0-sufhd.mongodb.net/enactusDB", {useNewUrlParser: true,useUnifiedTopology: true});
mongoose.set("useCreateIndex", true);
conn=mongoose.connection;

const userSchema = new mongoose.Schema ({
  name:String,
  username: String,
  address:String,
  facebookId: String
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "https://polar-plains-13717.herokuapp.com/auth/facebook/downloads"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ facebookId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));

let gfs;

conn.once('open', () => {
  gfs = Grid(conn.db, mongoose.mongo);
  gfs.collection('uploads');
});

const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(16, (err, buf) => {
        if (err) {
          return reject(err);
        }
        const filename = buf.toString('hex') + path.extname(file.originalname);
        const fileInfo = {
          filename: filename,
          bucketName: 'uploads'
        };
        resolve(fileInfo);
      });
    });
  }
});
const upload = multer({ storage });

app.get('/downloads', (req, res) => {
  gfs.files.find().toArray((err, files) => {

    if (!files || files.length === 0) {
      res.render('downloads', { files: false });
    } else {
      files.map(file => {
        if (
          file.contentType === 'image/jpeg' ||
          file.contentType === 'image/png'
        ) {
          file.isImage = true;
        } else {
          file.isImage = false;
        }
      });
      res.render('downloads', { files: files });
    }
  });
});

app.post('/upload', upload.single('file'), (req, res) => {

  res.redirect('/downloads');
});

app.get('/files', (req, res) => {
  gfs.files.find().toArray((err, files) => {

    if (!files || files.length === 0) {
      return res.status(404).json({
        err: 'No files exist'
      });
    }

    return res.json(files);
  });
});

app.get('/files/:filename', (req, res) => {
  gfs.files.findOne({ filename: req.params.filename }, (err, file) => {

    if (!file || file.length === 0) {
      return res.status(404).json({
        err: 'No file exists'
      });
    }

    return res.json(file);
  });
});

app.get('/image/:filename', (req, res) => {
  gfs.files.findOne({ filename: req.params.filename }, (err, file) => {
    if (!file || file.length === 0) {
      return res.status(404).json({
        err: 'No file exists'
      });
    }

    if (file.contentType === 'image/jpeg' || file.contentType === 'image/png') {
      const readstream = gfs.createReadStream(file.filename);
      readstream.pipe(res);
    } else {
      res.status(404).json({
        err: 'Not an image'
      });
    }
  });
});

app.delete('/files/:id', (req, res) => {
  gfs.remove({ _id: req.params.id, root: 'uploads' }, (err, gridStore) => {
    if (err) {
      return res.status(404).json({ err: err });
    }

    res.redirect('/downloads');
  });
});


app.get("/signup", function(req, res){
  res.render("signup");
});
app.get('/auth/facebook',
  passport.authenticate('facebook'));

app.get('/auth/facebook/downloads',
  passport.authenticate('facebook', { failureRedirect: '/' }),
  function(req, res) {
    res.redirect('/downloads');
  });
// app.get("/auth/google",
//   passport.authenticate('google', { scope: ["profile"] })
// );

// app.get("/auth/google/secrets",
//   passport.authenticate('google', { failureRedirect: "/login" }),
//   function(req, res) {
//     // Successful authentication, redirect
//     res.redirect("/secrets");
//   });
//
app.get("/", function(req, res){
  res.render("signin");
});



//
// app.get("/submit", function(req, res){
//   if (req.isAuthenticated()){
//     res.render("submit");
//   } else {
//     res.redirect("/login");
//   }
// });

app.get("/logout", function(req, res){
  req.logout();
  res.redirect("/");
});

app.post("/signup", function(req, res){

  User.register({username: req.body.username}, req.body.password, function(err, user){
    if (err) {
      console.log(err);
      res.redirect("/signup");
    } else {
      user.name=req.body.name;
      user.address=req.body.address;
      user.username=req.body.username;
      user.save();
      passport.authenticate("local")(req, res, function(){
        res.redirect("/downloads");
      });
    }
  });

});

app.post("/", function(req, res){

  const user = new User({
    username: req.body.username,
    password: req.body.password
  });

  req.login(user, function(err){
    if (err) {
      console.log(err);
      res.redirect("/");
    } else {
      passport.authenticate("local")(req, res, function(){
        res.redirect("/downloads");
      });
    }
  });

});




let port=process.env.PORT;

if(port==null||port==""){
  port=3000;
}


app.listen(port, function() {
  console.log("Server started Succesfully.");
});
