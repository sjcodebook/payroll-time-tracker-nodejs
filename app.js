//jshint esversion:6
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const nl2br = require('nl2br');
const _ = require('lodash');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');

const homeStartingContent =
  'Lacus vel facilisis volutpat est velit egestas dui id ornare. Semper auctor neque vitae tempus quam. Sit amet cursus sit amet dictum sit amet justo. Viverra tellus in hac habitasse. Imperdiet proin fermentum leo vel orci porta. Donec ultrices tincidunt arcu non sodales neque sodales ut. Mattis molestie a iaculis at erat pellentesque adipiscing. Magnis dis parturient montes nascetur ridiculus mus mauris vitae ultricies. Adipiscing elit ut aliquam purus sit amet luctus venenatis lectus. Ultrices vitae auctor eu augue ut lectus arcu bibendum at. Odio euismod lacinia at quis risus sed vulputate odio ut. Cursus mattis molestie a iaculis at erat pellentesque adipiscing.';
const aboutContent =
  'Hac habitasse platea dictumst vestibulum rhoncus est pellentesque. Dictumst vestibulum rhoncus est pellentesque elit ullamcorper. Non diam phasellus vestibulum lorem sed. Platea dictumst quisque sagittis purus sit. Egestas sed sed risus pretium quam vulputate dignissim suspendisse. Mauris in aliquam sem fringilla. Semper risus in hendrerit gravida rutrum quisque non tellus orci. Amet massa vitae tortor condimentum lacinia quis vel eros. Enim ut tellus elementum sagittis vitae. Mauris ultrices eros in cursus turpis massa tincidunt dui.';
const contactContent =
  'Scelerisque eleifend donec pretium vulputate sapien. Rhoncus urna neque viverra justo nec ultrices. Arcu dui vivamus arcu felis bibendum. Consectetur adipiscing elit duis tristique. Risus viverra adipiscing at in tellus integer feugiat. Sapien nec sagittis aliquam malesuada bibendum arcu vitae. Consequat interdum varius sit amet mattis. Iaculis nunc sed augue lacus. Interdum posuere lorem ipsum dolor sit amet consectetur adipiscing elit. Pulvinar elementum integer enim neque. Ultrices gravida dictum fusce ut placerat orci nulla. Mauris in aliquam sem fringilla ut morbi tincidunt. Tortor posuere ac ut consequat semper viverra nam libero.';

const app = express();

app.set('view engine', 'ejs');

app.use(
  bodyParser.urlencoded({
    extended: true
  })
);
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
mongoose.connect(uri, { useNewUrlParser: true, useCreateIndex: true });
const connection = mongoose.connection;
connection.once('open', () => {
  console.log('MongoDB connected');
});

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  username: String,
  displayName: String,
  googleId: String
});

const postSchema = {
  title: String,
  content: String
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

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRETS,
      callbackURL:
        'https://damp-brook-55922.herokuapp.com/auth/google/blogsecret',
      userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
    },
    function(accessToken, refreshToken, profile, cb) {
      console.log(profile);
      User.findOrCreate(
        {
          googleId: profile.id,
          email: profile.emails[0].value,
          displayName: profile.displayName
        },
        function(err, user) {
          return cb(err, user);
        }
      );
    }
  )
);

const Post = mongoose.model('post', postSchema);

app.get('/', function(req, res) {
  if (req.isAuthenticated()) {
    Post.find({ content: { $ne: null } }, function(err, foundPost) {
      res.render('logged', {
        startingContent: homeStartingContent,
        posts: foundPost
      });
    });
  } else {
    Post.find({ content: { $ne: null } }, function(err, foundPost) {
      res.render('home', {
        startingContent: homeStartingContent,
        posts: foundPost
      });
    });
  }
});

app.get(
  '/auth/google',
  passport.authenticate('google', {
    scope: ['email', 'profile']
  })
);

app.get(
  '/auth/google/blogsecret',
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/');
  }
);

app.get('/login', function(req, res) {
  if (req.isAuthenticated()) {
    res.redirect('/');
  } else {
    res.render('login');
  }
});

app.get('/register', function(req, res) {
  if (req.isAuthenticated()) {
    res.redirect('/');
  } else {
    res.render('register');
  }
});

app.get('/logged', function(req, res) {
  if (req.isAuthenticated()) {
    Post.find({ content: { $ne: null } }, function(err, foundPost) {
      res.render('logged', {
        startingContent: homeStartingContent,
        posts: foundPost
      });
    });
  } else {
    res.redirect('/login');
  }
});

app.get('/about', function(req, res) {
  res.render('about', {
    about: aboutContent
  });
});

app.get('/contact', function(req, res) {
  res.render('contact', {
    contact: contactContent
  });
});

app.get('/compose', function(req, res) {
  if (req.isAuthenticated()) {
    res.render('compose');
  } else {
    res.redirect('/login');
  }
});

app.post('/compose', function(req, res) {
  const post = new Post({
    title: req.body.postTitle,
    content: req.body.postBody
  });
  post.save(function(err) {
    if (!err) {
      res.redirect('/');
    }
  });
});

app.get('/posts/:postId', function(req, res) {
  const requestedPostId = req.params.postId;
  if (req.isAuthenticated()) {
    Post.findOne(
      {
        _id: requestedPostId
      },
      function(err, foundPost) {
        if (!err) {
          res.render('loggedpost', {
            postTitle: foundPost.title,
            postBody: nl2br(foundPost.content)
          });
        }
      }
    );
  } else {
    Post.findOne(
      {
        _id: requestedPostId
      },
      function(err, foundPost) {
        if (!err) {
          res.render('post', {
            postTitle: foundPost.title,
            postBody: nl2br(foundPost.content)
          });
        }
      }
    );
  }
});

app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/');
});

app.post('/register', function(req, res) {
  var displayName = req.body.displayName;
  User.register({ username: req.body.username }, req.body.password, function(
    err,
    user
  ) {
    if (err) {
      console.log(err);
      res.redirect('/register');
    } else {
      var userId = user._id;
      User.findOneAndUpdate(
        { _id: userId },
        { $set: { displayName: displayName } },
        function(err, doc) {
          if (err) {
            console.log('Something wrong when updating data!');
          }

          passport.authenticate('local')(req, res, function() {
            res.redirect('/');
          });
        }
      );
    }
  });
});

app.post('/login', function(req, res) {
  const user = new User({
    username: req.body.username,
    password: req.body.password
  });
  req.login(user, function(err) {
    if (err) {
      console.log(err);
    } else {
      passport.authenticate('local', { failureRedirect: '/login' })(
        req,
        res,
        function() {
          res.redirect('/');
        }
      );
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
