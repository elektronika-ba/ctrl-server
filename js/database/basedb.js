'use strict';

var pool = require('./database').pool;

// For Base Socket
//////////////////////////////////////////

exports.baseOnlineStatus = function (IDbase, online) {
    var sql = "UPDATE base SET online=?, last_online=NOW() WHERE IDbase=CAST(? AS UNSIGNED) LIMIT 1";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); return; }

        connection.query(sql, [online, IDbase], function (err, result) {
            connection.release();

            if (err) { console.log('baseOnlineStatus() error:', err); return; }
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

exports.markUnackedTxServer2Base = function (IDbase, callback) {
    var sql = "UPDATE txserver2base SET sent = 0 WHERE acked = 0 AND IDbase = CAST(? AS UNSIGNED)";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query(sql, [IDbase], function (err, result) {
            connection.release();

            if (err) { console.log('markUnackedTxServer2Base() error:', err); callback(true); return; }
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

exports.authBase = function (baseid, encryptedBaseid, remoteAddress, limit, minutes, callback) {
    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query("CALL spAuthBase(?,?,?,?,?)", [baseid, encryptedBaseid, remoteAddress, limit, minutes], function (err, result) {
            connection.release();

            if (err) { console.log('authBase() error:', err); callback(true); return; }
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
    var sql = "SELECT bc.IDclient FROM base_client bc WHERE bc.IDbase=CAST(? AS UNSIGNED)";

    pool.getConnection(function (err, connection) {
        if (err) { console.log('MySQL connection pool error:', err); callback(true); return; }

        connection.query(sql, [IDbase], function (err, rows, columns) {
            connection.release();

            if (err) { console.log('getClientsOfBase() error:', err); callback(true); return; }
            callback(false, rows, columns);
        });
    });
};

