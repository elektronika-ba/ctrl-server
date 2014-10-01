'use strict';

// Database related stuff

var Configuration = require('../configuration/configuration');

var mysql = require('mysql');

var pool = mysql.createPool({
    host: Configuration.mySQL.HOST,
    user: Configuration.mySQL.USER,
    password: Configuration.mySQL.PASS,
    database: Configuration.mySQL.DB,
    supportBigNumbers: true,
    bigNumberStrings: true,
});

exports.pool = pool;

// NOTE: moved functions to basedb.js and clientdb.js
