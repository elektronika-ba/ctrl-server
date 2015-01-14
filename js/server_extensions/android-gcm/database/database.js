'use strict';

// Database related stuff

var mysql = require('mysql');

var ServerConfiguration = require('../../../configuration/configuration');
var Configuration = require('../configuration/configuration');

var pool = mysql.createPool({
    host: ServerConfiguration.mySQL.HOST,
    user: ServerConfiguration.mySQL.USER,
    password: ServerConfiguration.mySQL.PASS,
    database: Configuration.mySQL.DB,
    supportBigNumbers: true,
    bigNumberStrings: true,
});

exports.updateAndroidRegId = function (IDclient, regId, callback) {
    var sql = "INSERT INTO device (IDclient, regid) VALUES (CAST(? AS UNSIGNED), ?) ON DUPLICATE KEY UPDATE regid = ?";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query(sql, [IDclient, regId, regId], function (err, result) {
            connection.release();

            if (err) { console.log('updateAndroidRegId() error:', err); callback(true); return; }
            callback(false, result);
        });
    });
};

exports.deleteAndroidDevice = function (regid, callback) {
    var sql = "DELETE FROM device WHERE regid = ?";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query(sql, [regid], function (err, result) {
            connection.release();

            if (err) { console.log('deleteAndroidDevice() error:', err); callback(true); return; }
            callback(false, result);
        });
    });
};

exports.getClientRegId = function (IDclient, callback) {
    var sql = "SELECT regid FROM device WHERE IDclient = CAST(? AS UNSIGNED)";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query(sql, [IDclient], function (err, rows, columns) {
            connection.release();

            if (err) { console.log('getClientRegId() error:', err); callback(true); return; }
            callback(false, rows, columns);
        });
    });
};

exports.changeAndroidRegId = function (newRegid, currentRegid, callback) {
    var sql = "UPDATE device SET regid=? WHERE regid=?";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query(sql, [newRegid, currentRegid], function (err, result) {
            connection.release();

            if (err) { console.log('changeAndroidRegId() error:', err); callback(true); return; }
            callback(false, result);
        });
    });
};