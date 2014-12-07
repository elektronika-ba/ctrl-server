'use strict';

// Client's server logic

var Configuration = require('../configuration/configuration');

var moment = require('moment');
var winston = require('winston');

var Database = require('../database/clientdb');

var connBases = require('../server').connBases;
var connClients = require('../server').connClients;
var wlog = require('../server').wl;

var baseMessage = require('../messages/baseMessage');
var clientMessage = require('../messages/clientMessage');

function ClientSock(socket) {
    var self = this;
    self.socket = socket;

    socket.myObj = {
        IDclient: null, // once authorized this will hold IDclient as String object! (JavaScript can't handle MySQL's BIGINT numbers, so we use them as Strings)
        TXclient: 0, // once authorized this will hold last sequence id received from Client (integer - 4 bytes)

        dataBuff: '', // because encoding is ascii, this is not a Buffer object, but simply a String-buffer
        onDataTimer: null, // is timer that will call self.onData() currently active?
        authTimer: null, // auth timer - connection killer

        tmrSenderTask: null, // timer for task that sends data from queue (stored in MySQL) to Base on socket, one-by-one
        ip: null,
        outOfSyncCnt: 0, // out-of-sync counter

        wlog: null, // used for logging after logged-in :)
    };

    socket.setEncoding('ascii');

    socket.setKeepAlive(true, Configuration.client.sock.KEEP_ALIVE_MS);
    socket.myObj.ip = socket.remoteAddress;

    connClients.push(socket);
    wlog.info('Connection with Client %s established.', socket.myObj.ip);

    // Start a timeout that will kill this socket in case other party doesn't authorize within Configuration.base.sock.AUTH_TIMEOUT_MS
    if (Configuration.client.sock.AUTH_TIMEOUT_MS > 0) {
        wlog.info("Authorization timeout set to", Configuration.client.sock.AUTH_TIMEOUT_MS / 1000, "sec...");
        socket.myObj.authTimer = setTimeout(function () {
            wlog.info("Authorization timeout, killing connection with Client %s!", socket.myObj.ip);
            socket.destroy();
        }, Configuration.client.sock.AUTH_TIMEOUT_MS);
    }

    // Handle incoming messages from base.
    socket.on('data', function (data) {
        socket.myObj.dataBuff = socket.myObj.dataBuff + data.replace(/\r/, '');
        self.onData();
    });

    // Remove the client from the list when it leaves
    socket.on('end', function () {
        wlog.info('Connection to Client %s closed.', socket.myObj.ip);
        if (socket.myObj.IDclient != null) {
            Database.saveTXclient(socket.myObj.IDclient, socket.myObj.TXclient);
            Database.clientOnlineStatus(socket.myObj.IDclient, 0);
            socket.myObj.wlog.info('  ...saved current TXclient (', socket.myObj.TXclient, ') and OnlineStatus to database.');
        }
        clearTimeout(socket.myObj.tmrSenderTask);
        clearTimeout(socket.myObj.authTimer); // added on 25-11-2014

        connClients.splice(connClients.indexOf(socket), 1);
    });

    // Error occured on socket?
    socket.on('error', function (e) {
        if (e.code == 'ECONNRESET' || e.code == 'ETIMEDOUT') {
            wlog.info("Connection to Client %s dropped.", socket.myObj.ip);
            if (socket.myObj.IDclient != null) {
                Database.saveTXclient(socket.myObj.IDclient, socket.myObj.TXclient);
                Database.clientOnlineStatus(socket.myObj.IDclient, 0);
                socket.myObj.wlog.info('  ...saved current TXclient (', socket.myObj.TXclient, ') and OnlineStatus to database.');
            }
            clearTimeout(socket.myObj.tmrSenderTask);
            clearTimeout(socket.myObj.authTimer); // added on 25-11-2014

            connClients.splice(connClients.indexOf(socket), 1);
        }
        else {
            wlog.error("Error on socket with Client %s", socket.myObj.ip, "error:", e);
        }
    });

    // This will send oldest item which is waiting in queue
    socket.startQueuedItemsSender = function () {
        if (socket.myObj.tmrSenderTask == null) {
            socket.myObj.tmrSenderTask = setInterval(function () {
                Database.getNextTxServer2Client(socket.myObj.IDclient, function (err, result) {
                    if (err) {
                        socket.myObj.wlog.info('Server2Client executed, but DATABASE ERROR happened!');
                        clearInterval(socket.myObj.tmrSenderTask);
                        socket.myObj.tmrSenderTask = null;
                        return;
                    }

                    if (result[0][0].oFetched == 0) {
                        socket.myObj.wlog.warn('Server2Client executed but no data from DB to send. Strange!');
                        clearInterval(socket.myObj.tmrSenderTask);
                        socket.myObj.tmrSenderTask = null;
                        return;
                    }

                    socket.myObj.wlog.info('Server2Client executed, assembling JSON and sending to Client...');

                    var jsAsString = result[0][0].oJsonPackage;
                    var js = null;

                    try {
                        js = JSON.parse(jsAsString);
                    } catch (err) {
                        socket.myObj.wlog.warn('Server2Client failed while parsing JSON:', jsAsString, 'Error:', err);
                        return;
                    }

                    js.TXsender = result[0][0].oTXserver; // put TXseRVER value into TXseNDER property

                    socket.write(JSON.stringify(js) + '\n', 'ascii');
                    socket.myObj.wlog.info('  ...sent.');

                    // if nothing else unsent in queue, stop this interval
                    if (result[0][0].oMoreInQueue == 0) {
                        socket.myObj.wlog.info('Server2Client sender stopped, nothing more to send...');
                        clearInterval(socket.myObj.tmrSenderTask);
                        socket.myObj.tmrSenderTask = null;
                    }
                });
            }, Configuration.client.sock.SENDER_TASK_MS);
            socket.myObj.wlog.info('Server2Client timer started.');
        }
        else {
            socket.myObj.wlog.info('Server2Client sender already running...');
        }
    };
};

ClientSock.prototype.onData = function () {
    var self = this;
    var socket = self.socket;

    var jsonData = null;

    clearTimeout(socket.myObj.onDataTimer);

    if (socket.myObj.dataBuff != null && socket.myObj.dataBuff.indexOf('\n') > -1) {
        var jsonLines = socket.myObj.dataBuff.split('\n');
        var oneJsonLine = jsonLines[0];
        socket.myObj.dataBuff = socket.myObj.dataBuff.slice(oneJsonLine.length + '\n'.length);

        try {
            jsonData = JSON.parse(oneJsonLine);
        } catch (err) {
            if (socket.myObj.IDclient != null) {
                socket.myObj.wlog.warn('Error in onData() while parsing JSON:', oneJsonLine, 'Error:', err);
            }
            else {
                wlog.warn('Error in onData() while parsing JSON:', oneJsonLine, 'Error:', err);
            }
        }
    }
    else {
        return;
    }

    var cm = new clientMessage();
    cm.extractFrom(jsonData);
    self.cm = cm;

    if (cm.getIsExtracted()) {

        // if unauthorized try authorizing with this received message!
        if (socket.myObj.IDclient == null) {
            self.doAuthorize();
        }
        else {
            // handle received ACK
            if (cm.getIsAck()) {
                socket.myObj.wlog.info('Processing Client\'s ACK for our TXserver:', cm.getTXsender());
                Database.ackTxServer2Client(socket.myObj.IDclient, cm.getTXsender(), function (err, result) {
                    if (err) {
                        return;
                    }

                    if (result[0][0].oAcked) {
                        socket.myObj.wlog.info('  ...acked on TXserver:', cm.getTXsender());
                    }
                    else {
                        socket.myObj.wlog.warn('  ...couldn\'t not ACK on TXserver:', cm.getTXsender(), ', strange! Hm...');
                    }

                    if (cm.getIsOutOfSync()) {
                        socket.myObj.wlog.error('  ...ERROR: ACKed but Client told me OUT-OF-SYNC!');

                        if (socket.myObj.outOfSyncCnt >= Configuration.client.sock.OUT_OF_SYNC_CNT_MAX) {
                            socket.myObj.wlog.error('  ...Will flush queue and destroy socket...');

                            // STOP SENDING
                            clearInterval(socket.myObj.tmrSenderTask); // stop sender of pending items
                            socket.myObj.tmrSenderTask = null; // don't forget this!

                            // FLUSH PENDING MESSAGES QUEUE
                            Database.flushClientQueue(socket.myObj.IDclient, function (err) {
                                if (err) {
                                    socket.myObj.wlog.error('Unknown error in Database.flushClientQueue()!');
                                }

                                // DISCONNECT (kill socket)
                                socket.myObj.wlog.error('Socket destroyed because of out-of-sync!');
                                socket.end();
                                socket.destroy();
                            });
                        }
                        else {
                            socket.myObj.outOfSyncCnt++;
                            socket.myObj.wlog.info('  ...will re-send unacknowledged queue items. Increased flush-counter to:', socket.myObj.outOfSyncCnt, '/', Configuration.client.sock.OUT_OF_SYNC_CNT_MAX, '!');

                            self.resendUnackedItems();
                        }
                    }
                    else {
                        socket.myObj.outOfSyncCnt = 0;
                    }
                });
            }
            else {
                socket.myObj.wlog.info('Processing Client\'s data...');

                // acknowledge immediatelly (but only if client is authorized and if this is not a notification)
                var jsAck = new clientMessage();
                jsAck.setIsAck(true);
                jsAck.setTXsender(cm.getTXsender());

                if (!cm.getIsNotification()) {
                    if (cm.getTXsender() <= socket.myObj.TXclient) {
                        jsAck.setIsProcessed(false);
                        socket.myObj.wlog.warn('  ...Warning: re-transmitted command, not processed!');
                    }
                    else if (cm.getTXsender() > (socket.myObj.TXclient + 1)) {
                        // SYNC PROBLEM! Client sent higher than we expected! This means we missed some previous Message!
                        // This part should be handled on Clients side.
                        // Client should flush all data (NOT A VERY SMART IDEA) and re-connect. Re-sync should naturally occur
                        // then in auth procedure as there would be nothing pending in queue to send to Server.

                        jsAck.setIsOutOfSync(true);
                        jsAck.setIsProcessed(false);
                        socket.myObj.wlog.error('  ...Error: Client sent out-of-sync data! Expected:', (socket.myObj.TXclient + 1), 'but I got:', cm.getTXsender());
                    }
                    else {
                        jsAck.setIsProcessed(true);
                        socket.myObj.TXclient++; // next package we will receive should be +1 of current value, so lets ++
                    }

                    socket.write(JSON.stringify(jsAck.buildMessage()) + '\n', 'ascii');
                    socket.myObj.wlog.info('  ...ACK sent back for TXsender:', cm.getTXsender());
                }
                else {
                    jsAck.setIsProcessed(true); // we need this for bellow code to execute
                    socket.myObj.wlog.info('  ...didn\'t ACK because this was a notification.');
                }

                if (jsAck.getIsProcessed()) {
                    // system messages are not forwarded to our Base
                    if (cm.getIsSystemMessage()) {
                        socket.myObj.wlog.info('  ...system message received, parsing...');

                        var d = cm.getData();

                        // process system messages
                        if (("type" in d) && d.type == 'pull_unacked') {
                            socket.myObj.wlog.info('  ...will re-start pending items sender for all unacknowledged items.');

                            self.resendUnackedItems();
                        }
                            /*
                            else if (("type" in d) && d.type == 'something_else') {
                                // something else...
                            }
                            */
                        else {
                            socket.myObj.wlog.info('  ...unknown system message:', d, ', ignored.');
                        }
                    }
                    else {
                        socket.myObj.wlog.info('  ...fresh data, will forward to my Base...');

                        try {
                            new Buffer(cm.getData(), 'hex');
                        } catch (err) {
                            socket.myObj.wlog.warn('  ...Warning, data provided is not a HEX string!');
                        }

                        var bp = new baseMessage();
                        bp.setIsNotification(cm.getIsNotification());
                        bp.setDataFromHexString(cm.getData());
                        var binaryPackageAsHexString = bp.buildPlainMessage().toString('hex');

                        // daj sve njegove baze
                        Database.getBasesOfClient(socket.myObj.IDclient, function (err, rows, columns) {
                            if (err) {
                                return;
                            }

                            if (rows.length <= 0) {
                                return;
                            }

                            var targetedBaseIds = cm.getBaseId();
                            var notFoundBaseIds = targetedBaseIds.slice(0, targetedBaseIds.length); // copy array
                            var rowsLength = rows.length;
                            var basesLength = connBases.length;
                            for (var i = 0; i < rowsLength; i++) {

                                // if baseid didn't arrive, or it was empty or it is the targetted one
                                if (targetedBaseIds.length <= 0 || targetedBaseIds.indexOf(rows[i].baseid) >= 0) {

                                    notFoundBaseIds.splice(rows[i].baseid, 1);

                                    (function (IDbase) {
                                        // no point in inserting notifications into database since they are not acknowledged/re-transmitted, right? just pipe it to the "other side"
                                        if (bp.getIsNotification()) {
                                            socket.myObj.wlog.info('  ...this is a Notification, sending right now on Bases\'s (', IDbase, ') socket...');

                                            // pronadji njegov socket
                                            var fBaseSockets = connBases.filter(function (item) {
                                                return (item.myObj.IDbase == IDbase && item.myObj.authorized == true);
                                            });

                                            if (fBaseSockets.length == 1) {
                                                fBaseSockets[0].write(bp.buildEncryptedMessage(fBaseSockets[0].myObj.aes128Key, fBaseSockets[0].myObj.random16bytes), 'hex');
                                                fBaseSockets[0].myObj.wlog.info('  ...sent (piped).');

                                                bp.getBinaryPackage().copy(fBaseSockets[0].myObj.random16bytes, 0, bp.getBinaryPackage().length-16); // prepare IV for next encryption
                                            }
                                            else if (fBaseSockets.length > 1) {
                                                socket.myObj.wlog.info('  ...found more than one socket for IDbase=', IDbase, 'which is a pretty improbable situation!');
                                            }
                                            else {
                                                socket.myObj.wlog.info('  ...IDbase=', IDbase, 'is offline, will not get this Notification.');
                                            }
                                        }
                                            // not a notification, lets insert into database and trigger senging
                                        else {
                                            // insert message into database for this base and trigger sending if it is online
                                            Database.addTxServer2Base(IDbase, binaryPackageAsHexString, function (err, result) {
                                                if (err) {
                                                    socket.myObj.wlog.info('Error in Database.addTxServer2Base, for IDbase=', IDbase);
                                                    return;
                                                }

                                                socket.myObj.wlog.info('  ...added to IDbase=', IDbase, ' queue...');

                                                // pronadji njegov socket (ako je online) i pokreni mu slanje
                                                var fBaseSockets = connBases.filter(function (item) {
                                                    return (item.myObj.IDbase == IDbase && item.myObj.authorized == true);
                                                });

                                                if (fBaseSockets.length == 1) {
                                                    socket.myObj.wlog.info('  ...triggering queued items sender for IDbase=', IDbase, '...');
                                                    fBaseSockets[0].startQueuedItemsSender();
                                                }
                                                else if (fBaseSockets.length > 1) {
                                                    socket.myObj.wlog.info('  ...found more than one socket for IDbase=', IDbase, 'which is a pretty improbable situation!');
                                                }

                                            });
                                        }
                                    })(rows[i].IDbase);

                                } // if baseid is targetted one

                            } // for each IDbase...

                            if (notFoundBaseIds.length > 0) {
                                socket.myObj.wlog.info('Client targeted', notFoundBaseIds.length, 'illegal BaseIDs:', notFoundBaseIds.join(','));
                            }

                        }); // Database.getBasesOfClient()
                    } // not system message
                } // processed
            } // not an ACK
        } // authorized
    }

    // Call us again after ~ms (throttling received commands) if we got more \n-terminated instructions in buffer to parse
    if (socket.myObj.dataBuff.indexOf('\n') > -1) {
        socket.myObj.onDataTimer = setTimeout(function () {
            self.onData();
        }, Configuration.client.sock.ON_DATA_THROTTLING_MS);
    }
};

ClientSock.prototype.resendUnackedItems = function () {
    var self = this;
    var socket = self.socket;

    // stop sender for now
    clearInterval(socket.myObj.tmrSenderTask);
    socket.myObj.tmrSenderTask = null;

    // mark unacknowledged items as unsent (unmark sent bit)
    Database.markUnackedTxServer2Client(socket.myObj.IDclient, function (err) {
        if (err) {
            socket.myObj.wlog.error('Unknown error in Database.markUnackedTxServer2Client!');
            return;
        }

        socket.myObj.wlog.info('  ...starting queued items sender of all unacknowledged items...');

        // start pending items sender and we are done
        socket.startQueuedItemsSender();
    });
}

ClientSock.prototype.doAuthorize = function () {
    var self = this;
    var socket = self.socket;
    var cm = self.cm;
    var cmd = cm.getData();

    if (socket.myObj.IDclient != null) {
        socket.myObj.wlog.warn('Client attempted to re-authorize, request ignored!');
        return;
    }

    if (!("auth_token" in cmd)) {
        wlog.warn('Error in doAuthorize(), missing auth_token parameter!');
        return;
    }

    Database.authClient(cmd.auth_token, socket.myObj.ip, Configuration.client.sock.MAX_AUTH_ATTEMPTS, Configuration.client.sock.MAX_AUTH_ATTEMPTS_MINUTES, function (err, result) {
        if (err) {
            wlog.error('Unknown error in Database.authClient()!');

            socket.end();
            socket.destroy();
            return;
        }

        if (result[0][0].oAuthorized == 1) {
            clearTimeout(socket.myObj.authTimer);

            wlog.info('  ...authorized as IDclient =', result[0][0].oIDclient);

            // kill all potentially already existing connections of this Client
            // (if TCP error happens and keep-alive is not used, then connection might remain active so we must destroy it)
            var oIDclient = result[0][0].oIDclient;
            var fMyConns = connClients.filter(function (item) {
                return (oIDclient == item.myObj.IDclient);
            });
            // there should be maximum one existing connection here, but lets loop it just to make sure we close them all
            for (var b = 0; b < fMyConns.length; b++) {
                wlog.info('  ...found already existing connection to', fMyConns[b].myObj.ip, ', continuing its TXclient (', fMyConns[b].myObj.TXclient, '). Destroying it now!');
                result[0][0].oTXclient = fMyConns[b].myObj.TXclient; // this will be assigned for each previous socket connection in loop so it will hold the value of last one. doesn't matter really...
                fMyConns[b].myObj.IDclient = null;
                fMyConns[b].destroy();
            }

            wlog.info('  ...stopping logging in this file.');

            // instantiate logger for this IDclient
            socket.myObj.wlog = new (winston.Logger)({
                transports: [
			      new (winston.transports.Console)(),
			      new (winston.transports.File)({ filename: './log/clientsock/' + result[0][0].oIDclient + '.json' })
                ]
            });

            socket.myObj.IDclient = result[0][0].oIDclient;

            socket.myObj.wlog.info('Client', cmd.auth_token.toString(), ' (', socket.myObj.ip, ') authorized.');

            // is other side forcing us to re-sync?
            if (cm.getIsSync() == true) {
                socket.myObj.TXclient = 0;
                socket.myObj.wlog.info('  ...re-syncing TXclient to: 0.');
            }
            else {
                socket.myObj.TXclient = result[0][0].oTXclient;
                socket.myObj.wlog.info('  ...re-loading TXclient:', result[0][0].oTXclient);
            }

            var jsAns = new clientMessage();
            jsAns.setIsNotification(true);
            jsAns.setIsSystemMessage(true);
            var cmdRes = {};
            cmdRes.result = 0;
            cmdRes.type = "authentication_response";
            cmdRes.description = 'Logged in.';
            jsAns.setDataAsObject(cmdRes);

            // should we force other side to re-sync?
            if (result[0][0].oForceSync == 1) {
                jsAns.setIsSync(true);
                socket.myObj.wlog.info('  ...forcing Client to re-sync because I don\'t have anything pending for him.');
            }

            socket.write(JSON.stringify(jsAns.buildMessage()) + '\n', 'ascii');

            self.sendBasesStatusNotification();
            Database.clientOnlineStatus(socket.myObj.IDclient, 1);

            // something pending for Client? (oForceSync is 0 if there is something pending in DB)
            if (result[0][0].oForceSync == 0) {
                socket.myObj.wlog.info('  ...there is pending data for Client, starting sender...');
                socket.startQueuedItemsSender();
            }
        }
        else {
            wlog.warn('Client (', socket.myObj.ip, ') failed to authorize.');

            socket.myObj.IDclient = null;
            socket.myObj.TXclient = 0;

            var jsAns = new clientMessage();
            jsAns.setIsNotification(true);
            jsAns.setIsSystemMessage(true);
            var cmdRes = {};

            cmdRes.type = "authentication_response";

            if (result[0][0].oTooMany == 1) {
                cmdRes.result = 2;
                cmdRes.description = 'Too many failed authentication requests.';
            }
            else {
                cmdRes.result = 1;
                cmdRes.description = 'Wrong auth_token.';
            }

            wlog.warn('  ...reason:', cmdRes.description);

            jsAns.setDataAsObject(cmdRes);

            socket.write(JSON.stringify(jsAns.buildMessage()) + '\n', 'ascii');
        }
    });
};

ClientSock.prototype.sendBasesStatusNotification = function () {
    var self = this;
    var socket = self.socket;

    if (socket.myObj.IDclient == null) return;

    Database.getBasesOfClient(socket.myObj.IDclient, function (err, rows, columns) {
        if (err) {
            return;
        }

        if (rows.length <= 0) {
            return;
        }

        var rowsLength = rows.length;
        var basesLength = connBases.length;
        for (var i = 0; i < rowsLength; i++) {
            var IDbase = rows[i].IDbase;
            var baseid = rows[i].baseid;

            var foundConnected = false;

            var fBaseSockets = connBases.filter(function (item) {
                return (item.myObj.IDbase == IDbase);
            });

            if (fBaseSockets.length > 0) {
                foundConnected = true;
            }

            var jsNotif = new clientMessage();
            jsNotif.setIsNotification(true);
            jsNotif.setIsSystemMessage(true);

            var ccm = {};
            ccm.type = "base_connection_status";
            ccm.connected = foundConnected;
            ccm.baseid = baseid.toString('hex');
            jsNotif.setDataAsObject(ccm);

            var jsonPackageAsString = JSON.stringify(jsNotif.buildMessage());

            socket.write(jsonPackageAsString + '\n', 'ascii'); // send right away
        }
    });
};

module.exports = function (socket) {
    return new ClientSock(socket);
};
