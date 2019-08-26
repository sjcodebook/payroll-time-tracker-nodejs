//jshint esversion:6
require('dotenv').config();
const express = require('express');
const ejs = require('ejs');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const findOrCreate = require('mongoose-findorcreate');
const date = require('date-and-time');

const aboutContent = 'This is a payroll login hours tracker application';

let nameUser = '';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.set('view engine', 'ejs');

app.use(express.static('public'));

app.use(
  session({
    secret: 'the little secret.',
    resave: false,
    saveUninitialized: false
  })
);

app.use(passport.initialize());
app.use(passport.session());

const uri = process.env.ATLAS_URI;
mongoose.connect(uri, {
  useNewUrlParser: true,
  useCreateIndex: true,
  useFindAndModify: false
});
const connection = mongoose.connection;
connection.once('open', () => {
  console.log('MongoDB connected');
});

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  }
});

const postSchema = {
  username: String,
  entry: String,
  rawEntry: Number,
  exit: String,
  rawExit: Number,
  duration: String,
  complete: Boolean
};

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model('user', userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

const Post = mongoose.model('post', postSchema);

app.get('/', function(req, res) {
  if (req.isAuthenticated()) {
    res.redirect('/logged');
  } else {
    res.render('login');
  }
});

app.get('/all-entries', function(req, res) {
  if (req.isAuthenticated()) {
    Post.find().exec(function(err, doc) {
      res.render('all-entries', {
        finalDoc: doc
      });
    });
  } else {
    res.redirect('/');
  }
});

app.get('/fail-attempt', function(req, res) {
  res.render('fail-attempt');
});

app.get('/register', function(req, res) {
  if (req.isAuthenticated()) {
    res.redirect('/logged');
  } else {
    res.render('register');
  }
});

app.get('/logged', function(req, res) {
  if (req.isAuthenticated()) {
    Post.find({ username: nameUser }).exec(function(err, doc) {
      const finalDoc = doc;
      if (err) {
        console.log(err);
      } else if (Array.isArray(doc) && doc.length) {
        const arr = doc[doc.length - 1];
        Post.findById(arr._id, function(err, doc) {
          if (err) {
            console.log(err);
          } else if (doc.complete === true) {
            res.render('loggedFull', {
              username: nameUser,
              finalDoc: finalDoc
            });
          } else {
            res.render('logged', {
              username: nameUser,
              finalDoc: finalDoc
            });
          }
        });
      } else {
        // array is empty
        res.render('loggedFull', {
          username: nameUser,
          finalDoc: finalDoc
        });
      }
    });
  } else {
    res.redirect('/');
  }
});

app.get('/about', function(req, res) {
  res.render('about', {
    about: aboutContent
  });
});

app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/');
});

app.get('/logEntry', function(req, res) {
  if (req.isAuthenticated()) {
    const t = new Date();
    const now = date.format(t, 'YYYY/MM/DD HH:mm:ss');
    const rawNow = Date.now();
    const post = new Post({
      username: nameUser,
      entry: now,
      rawEntry: rawNow,
      complete: false
    });
    post.save(function(err) {
      if (err) {
        console.log(err);
      }
      res.redirect('/logged');
    });
  } else {
    res.redirect('/');
  }
});

app.get('/logExit', function(req, res) {
  if (req.isAuthenticated()) {
    const t = new Date();
    const now = date.format(t, 'YYYY/MM/DD HH:mm:ss');
    const rawNow = Date.now();

    function convertMS(milliseconds) {
      var day, hour, minute, seconds;
      seconds = Math.floor(milliseconds / 1000);
      minute = Math.floor(seconds / 60);
      seconds = seconds % 60;
      hour = Math.floor(minute / 60);
      minute = minute % 60;
      day = Math.floor(hour / 24);
      hour = hour % 24;
      return {
        day: day,
        hour: hour,
        minute: minute,
        seconds: seconds
      };
    }

    Post.find({ username: nameUser }).exec(function(err, doc) {
      if (err) {
        console.log(err);
      }
      const obj = doc[doc.length - 1];
      let dur = convertMS(rawNow - obj.rawEntry);
      const timeStr = dur.hour + ':' + dur.minute + ':' + dur.seconds;

      Post.findOneAndUpdate(
        { _id: obj._id },
        {
          $set: {
            exit: now,
            rawExit: rawNow,
            complete: true,
            duration: timeStr
          }
        },
        { new: true } // return updated post
      ).exec(function(err, post) {
        if (err) {
          console.log(err);
        }
        res.redirect('/');
      });
    });
  } else {
    res.redirect('/');
  }
});

app.post('/register', function(req, res) {
  User.register({ username: req.body.username }, req.body.password, function(
    err,
    user
  ) {
    if (err) {
      res.render('fail-register', {
        message: err.message
      });
    } else {
      res.render('success-register');
    }
  });
});

app.post('/', function(req, res) {
  const user = new User({
    username: req.body.username,
    password: req.body.password
  });
  User.find({ username: req.body.username }).exec(function(err, doc) {
    if (Array.isArray(doc) && doc.length) {
      req.login(user, function(err) {
        if (err) {
          console.log(err);
        } else {
          passport.authenticate('local', { failureRedirect: '/fail-attempt' })(
            req,
            res,
            function() {
              nameUser = req.body.username;
              res.redirect('/logged');
            }
          );
        }
      });
    } else {
      res.render('not-found');
    }
  });
});

let port = process.env.PORT;
if (port == null || port == '') {
  port = 3000;
}

app.listen(port, function() {
  console.log('Server started');
});
