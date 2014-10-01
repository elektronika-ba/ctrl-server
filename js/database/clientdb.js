'use strict';

var pool = require('./database').pool;

// For Client Socket
//////////////////////////////////////////

exports.markUnackedTxServer2Client = function (IDclient, callback) {
    var sql = "UPDATE txserver2client SET sent = 0 WHERE acked = 0 AND IDclient = CAST(? AS UNSIGNED)";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query(sql, [IDclient], function (err, result) {
            connection.release();

            if (err) { console.log('markUnackedTxServer2Client() error:', err); callback(true); return; }
            callback(false, result);
        });
    });
};

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

exports.authClient = function (authToken, remoteAddress, limit, minutes, callback) {
    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query("CALL spAuthClient(?,?,?,?)", [authToken, remoteAddress, limit, minutes], function (err, result) {
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

exports.getBasesOfClient = function (IDclient, callback) {
    var sql = "SELECT b.IDbase, b.baseid FROM base_client bc JOIN base b ON b.IDbase=bc.IDbase WHERE bc.IDclient=CAST(? AS UNSIGNED)";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query(sql, [IDclient], function (err, rows, columns) {
            connection.release();

            if (err) { console.log('getBasesOfClient() error:', err); callback(true); return; }
            callback(false, rows, columns);
        });
    });
};
