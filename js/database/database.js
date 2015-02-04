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

exports.resetOnlineStatusForClients = function () {
    var sql = "UPDATE client SET online=0";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); return; }

        connection.query(sql, [], function (err, result) {
            connection.release();

            if (err) { console.log('resetOnlineStatusForClients() error:', err); return; }
        });
    });
};

exports.resetOnlineStatusForBases = function () {
    var sql = "UPDATE base SET online=0";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); return; }

        connection.query(sql, [], function (err, result) {
            connection.release();

            if (err) { console.log('resetOnlineStatusForBases() error:', err); return; }
        });
    });
};

// NOTE: other functions can be found to basedb.js and clientdb.js
