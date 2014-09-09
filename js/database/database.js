'use strict';

// Database related work

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

// For Base Socket
//////////////////////////////////////////

exports.flushBaseQueue = function (IDbase, callback) {
    var sql = "DELETE FROM txserver2base WHERE IDbase=CAST(? AS UNSIGNED)";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query(sql, [IDbase], function (err, result) {
            connection.release();

            if (err) { console.log('flushBaseQueue() error:', err); callback(true); return; }
            callback(false);
        });
    });
};

exports.markUnsentTxServer2Base = function (IDbase, TXserver, callback) {
    var sql = "UPDATE txserver2base SET sent = 0 WHERE IDbase = CAST(? AS UNSIGNED) AND TXserver = ? LIMIT 1";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query(sql, [IDbase, TXserver], function (err, result) {
            connection.release();

            if (err) { console.log('markUnsentTxServer2Base() error:', err); callback(true); return; }
            callback(false, result);
        });
    });
};

exports.getNextTxServer2Base = function (IDbase, callback) {
    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query("CALL spGetNextTxServer2Base(?)", [IDbase], function (err, result) {
            connection.release();

            if (err) { console.log('getNextTxServer2Base() error:', err); callback(true); return; }
            callback(false, result);
        });
    });
};

exports.authBase = function (baseid, remoteAddress, limit, minutes, callback) {
    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query("CALL spAuthBase(?,?,?,?)", [baseid, remoteAddress, limit, minutes], function (err, result) {
            connection.release();

            if (err) { console.log('authBase() error:', err); callback(true); return; }
            callback(false, result);
        });
    });
};

exports.addTxServer2Base = function (IDbase, binaryPackageAsHexString, callback) {
    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query("CALL spAddTxServer2Base(?,?)", [IDbase, binaryPackageAsHexString], function (err, result) {
            connection.release();

            if (err) { console.log('addTxServer2Base() error:', err); callback(true); return; }
            callback(false, result);
        });
    });
};

exports.ackTxServer2Base = function (IDbase, TXserver, callback) {
    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query("CALL spAckTxServer2Base(?,?)", [IDbase, TXserver], function (err, result) {
            connection.release();

            if (err) { console.log('ackTxServer2Base() error:', err); callback(true); return; }
            callback(false, result);
        });
    });
};

exports.saveTXbase = function (IDbase, TXbase) {
    var sql = "UPDATE base SET TXbase=? WHERE IDbase=CAST(? AS UNSIGNED) LIMIT 1";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); return; }

        connection.query(sql, [TXbase, IDbase], function (err, result) {
            connection.release();

            if (err) { console.log('saveTXbase() error:', err); return; }
        });
    });
};

exports.getClientsOfBase = function (IDbase, callback) {
    var sql = "SELECT c.IDclient FROM client c JOIN base b ON b.IDbase=c.IDbase WHERE b.IDbase=CAST(? AS UNSIGNED)";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query(sql, [IDbase], function (err, rows, columns) {
            connection.release();

            if (err) { console.log('getClientsOfBase() error:', err); callback(true); return; }
            callback(false, rows, columns);
        });
    });
};

// For Client Socket
//////////////////////////////////////////

exports.flushClientQueue = function (IDclient, callback) {
    var sql = "DELETE FROM txserver2client WHERE IDclient=CAST(? AS UNSIGNED)";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query(sql, [IDclient], function (err, result) {
            connection.release();

            if (err) { console.log('flushClientQueue() error:', err); callback(true); return; }
            callback(false);
        });
    });
};

exports.authClient = function (username, password, remoteAddress, limit, minutes, callback) {
    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query("CALL spAuthClient(?,?,?,?,?)", [username, password, remoteAddress, limit, minutes], function (err, result) {
            connection.release();

            if (err) { console.log('authClient() error:', err); callback(true); return; }
            callback(false, result);
        });
    });
};

exports.addTxServer2Client = function (IDclient, jsonPackageAsString, callback) {
    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query("CALL spAddTxServer2Client(?,?)", [IDclient, jsonPackageAsString], function (err, result) {
            connection.release();

            if (err) { console.log('addTxServer2Client() error:', err); callback(true); return; }
            callback(false, result);
        });
    });
};

exports.getNextTxServer2Client = function (IDclient, callback) {
    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query("CALL spGetNextTxServer2Client(?)", [IDclient], function (err, result) {
            connection.release();

            if (err) { console.log('getNextTxServer2Client() error:', err); callback(true); return; }
            callback(false, result);
        });
    });
};

exports.ackTxServer2Client = function (IDclient, TXserver, callback) {
    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query("CALL spAckTxServer2Client(?,?)", [IDclient, TXserver], function (err, result) {
            connection.release();

            if (err) { console.log('ackTxServer2Client() error:', err); callback(true); return; }
            callback(false, result);
        });
    });
};

exports.saveTXclient = function (IDclient, TXclient) {
    var sql = "UPDATE client SET TXclient=? WHERE IDclient=CAST(? AS UNSIGNED) LIMIT 1";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); return; }

        connection.query(sql, [TXclient, IDclient], function (err, result) {
            connection.release();

            if (err) { console.log('saveTXclient() error:', err); return; }
        });
    });
};
