require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const { ExpressOIDC } = require('@okta/oidc-middleware');
const Sequelize = require('sequelize')
const epilogue = require('epilogue'), ForbiddenError = epilogue.Errors.ForbiddenError

const app = express();

const port = 3000;


/** Middleware Config **/
// Create session middleware *Required for ExpressOIDC config (OpenID Connect - an authentication layer on top of OAuth 2.0)
app.use(
  session({
    secret: process.env.RANDOM_SECRET_WORD,
    resave: true,
    saveUninitialized: false,
  })
);

// Create new OIDC instance
const oidc = new ExpressOIDC({
  issuer: `${process.env.OKTA_ORG_URL}/oauth2/default`,
  client_id: process.env.OKTA_CLIENT_ID,
  client_secret: process.env.OKTA_CLIENT_SECRET,
  redirect_uri: process.env.REDIRECT_URL,
  scope: 'openid profile',
  routes: {
    callback: {
      path: '/authorization-code/callback',
      defaultRedirect: '/admin',
    },
  },
});

// ExpressOIDC will attach handlers for the /login and /authorization-code/callback routes
app.use(oidc.router); // Checks ensureAuthenticated and isAuthenticated and adds login and callback routes
app.use(cors());
app.use(express.json());


/** Routes Config **/
// Home (User Login) route
app.get('/home', (req, res) => {
  res.send(`<h1>Welcome!!</h1> <a href='/login'>Login</a>`);
});
// Admin route
app.get('/admin', oidc.ensureAuthenticated(), (req, res) => {
  res.send(`<h1>Admin page</h1>`);
});

// Logout and redirect to Home route
app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/home');
});

// Redirect to home
app.get('/', (req, res) => {
  res.redirect('/home');
});


/** Database + Epilogue Config **/
// Setup SQLite
const database = new Sequelize({
  dialect: 'sqlite',
  storage: './db.sqlite',
  operatorsAliases: false,
});

// Define database model for table
const Post = database.define('posts', {
  title: Sequelize.STRING,
  content: Sequelize.TEXT,
});

// Initialize Epilogue w/ Express.js and the database
epilogue.initialize({ app, sequelize: database });

// Create REST resources (Now I can do CRUD operations)
const PostResource = epilogue.resource({
  model: Post,
  endpoints: ['/posts', '/posts/:id'],
});

// Setup Auth checks to all CRUD routes
PostResource.all.auth(function (req, res, context) {
  return new Promise(function (resolve, reject) {
    if (!req.isAuthenticated()) {
      res.status(401).send({ message: 'Unauthorized' });
      resolve(context.stop);
    } else {
      resolve(context.continue);
    }
  });
});

database.sync().then(() => {
  oidc.on('ready', () => {
    app.listen(port, () =>
      console.log(`My Blog App listening on port ${port}!`)
    );
  });
});

oidc.on('error', (err) => {
  // An error occurred while setting up OIDC
  console.log('oidc error: ', err);
});

// Listen for app
// app.listen(port, () => {
//   console.log(`My official blog app is listening on port: ${port}`);
// });
