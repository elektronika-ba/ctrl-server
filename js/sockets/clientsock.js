'use strict';

// Client's server logic

var Configuration = require('../configuration/configuration');

var moment = require('moment');
var winston = require('winston');

var Database = require('../database/database');

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
        IDbase: null, // once authorized this will hold IDbase of the Base this client is associated to. This is just to speed up some functions in code, so that we don't need to execute query and ask for IDbase on some requests
        baseid: null, // once authorized this will hold baseID of the Base this client is associated to. This is just to speed up some functions in code, so that we don't need to execute query and ask for baseID on some requests
        timezone: 0, // once authorized this will hold timezone of the Base this client is associated to. This is just to speed up some functions in code, so that we don't need to execute query and ask for timezone on some requests
        TXclient: 0, // once authorized this will hold last sequence id received from Client (integer - 4 bytes)
        dataBuff: '', // because encoding is ascii, this is not a Buffer object, but simply a String-buffer
        onDataTimer: null, // is timer that will call self.onData() currently active?
        authTimer: null, // auth timer - connection killer

        tmrSenderTask: null, // timer for task that sends data from queue (stored in MySQL) to Base on socket, one-by-one and waiting for ACK after each transmission in order to send next one
        ip: null,
        ackCallbacks: [], // array of callback functions that will be triggered once "TXserver" gets ACKed or everything fails
        outOfSyncCnt: 0, // out-of-sync counter
    };

    socket.setEncoding('ascii');

    socket.setKeepAlive(true, Configuration.client.sock.KEEP_ALIVE_MS);
    socket.myObj.ip = socket.remoteAddress;

    connClients.push(socket);
    wlog.info('Connection with Client %s established.', socket.myObj.ip);

    // Start a timeout that will kill this socket in case other party doesn't authorize within Configuration.client.sock.AUTH_TIMEOUT_MS
    socket.myObj.authTimer = setTimeout(function () {
        wlog.info('Authorization timeout, killing connection with Client %s!', socket.myObj.ip);
        socket.destroy();
    }, Configuration.client.sock.AUTH_TIMEOUT_MS);

    // Handle incoming messages from base.
    socket.on('data', function (data) {
        socket.myObj.dataBuff = socket.myObj.dataBuff + data.replace(/\r/, '');
        self.onData();
    });

    // Remove the client from the list when it leaves
    socket.on('end', function () {
        wlog.info('Connection to Client %s closed.', socket.myObj.ip);
        if (socket.myObj.IDclient != null) {
            Database.saveTXclient(socket.myObj.IDbase, socket.myObj.TXclient);
            wlog.info('  ...saved current TXclient (', socket.myObj.TXclient, ') to database.');
        }
        clearTimeout(socket.myObj.tmrSenderTask);

        while (socket.myObj.ackCallbacks.length > 0) {
            var TXserver = socket.myObj.ackCallbacks[0].TXserver;
            var callback = socket.myObj.ackCallbacks[0].callback;

            callback(false, TXserver); // say we failed
            wlog.info('  ...called failure ACK callback for TXserver:', TXserver);

            socket.myObj.ackCallbacks.shift();
        }

        connClients.splice(connClients.indexOf(socket), 1);
    });

    // Error occured on socket?
    socket.on('error', function (e) {
        if (e.code == 'ECONNRESET') {
            wlog.info("Connection to Client %s dropped.", socket.myObj.ip);
            if (socket.myObj.IDclient != null) {
                Database.saveTXclient(socket.myObj.IDbase, socket.myObj.TXclient);
                wlog.info('  ...saved current TXclient (', socket.myObj.TXclient, ') to database.');
            }
            clearTimeout(socket.myObj.tmrSenderTask);

            while (socket.myObj.ackCallbacks.length > 0) {
                var TXserver = socket.myObj.ackCallbacks[0].TXserver;
                var callback = socket.myObj.ackCallbacks[0].callback;

                callback(false, TXserver); // say we failed
                wlog.info('  ...called failure ACK callback for TXserver:', TXserver);

                socket.myObj.ackCallbacks.shift();
            }

            connClients.splice(connClients.indexOf(socket), 1);
        }
        else {
            wlog.error("Error on socket with Client %s", socket.myObj.ip, "error:", e);
        }
    });

    // Add to queue and start tx job - parameter is JSON object
    socket.writeQueued = function (js, ackCallback) {
        if (!js) {
            wlog.error("Error in socket.writeQueued(), no parameter provided!");
            return;
        }

        var jsonPackageAsString = JSON.stringify(js.buildMessage());

        // This will add data to queue and return TXserver assigned to this outgoing packet
        Database.addTxServer2Client(socket.myObj.IDclient, jsonPackageAsString, function (err, result) {
            if (err) {
                wlog.error("Unknown error in Database.addTxServer2Client()!");
                return;
            }

            wlog.info('Added to TX Server2Client queue, TXserver:', result[0][0].oTXserver, 'starting sender...');

            if (ackCallback) {
                socket.myObj.ackCallbacks.push({ "TXserver": result[0][0].oTXserver, "callback": ackCallback });
                wlog.info('  ...added callback to array.');
            }

            self.startQueuedItemsSender();
        });
    };

    // This will send oldest item which is waiting in queue
    socket.startQueuedItemsSender = function () {
        if (socket.myObj.tmrSenderTask == null) {
            socket.myObj.tmrSenderTask = setInterval(function () {

                Database.getNextTxServer2Client(socket.myObj.IDclient, function (err, result) {
                    if (err) {
                        return;
                    }

                    if (result[0][0].oFetched == 0) {
                        wlog.warn('Server2Client executed but no data from DB to send. Strange!');
                        return;
                    }

                    wlog.info('Server2Client executed, assembling JSON and sending to Client...');

                    var jsAsString = result[0][0].oJsonPackage;
                    var js = null;

                    try {
                        js = JSON.parse(jsAsString);
                    } catch (err) {
                        wlog.warn('Server2Client failed while parsing JSON:', jsAsString, 'Error:', err);
                        return;
                    }

                    js.TXsender = result[0][0].oTXserver; // put TXseRVER value into TXseNDER property

                    socket.write(JSON.stringify(js) + '\n', 'ascii');
                    wlog.info('  ...sent.');

                    // if nothing else unsent in queue, stop this interval
                    if (result[0][0].oMoreInQueue == 0) {
                        wlog.info('Server2Client sender stopped, nothing more to send...');
                        clearInterval(socket.myObj.tmrSenderTask);
                        socket.myObj.tmrSenderTask = null;
                    }
                });

            }, Configuration.client.sock.SENDER_TASK_MS);
            wlog.info('Server2Client timer started.');
        }
        else {
            wlog.info('Server2Client sender already running...');
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
            wlog.warn('Error in onData() while parsing JSON:', oneJsonLine, 'Error:', err);
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
            self.cmdAuthorize();
        }
        else {
            // handle received ACK
            if (cm.getIsAck()) {
                wlog.info('Processing Client\'s ACK for our TXserver:', cm.getTXsender());
                Database.ackTxServer2Client(socket.myObj.IDclient, cm.getTXsender(), function (err, result) {
                    if (err) {
                        return;
                    }

                    if (result[0][0].oAcked) {
                        wlog.info('  ...acked on TXserver:', cm.getTXsender());
                    }
                    else {
                        wlog.warn('  ...couldn\'t not ACK on TXserver:', cm.getTXsender(), ', strange! Hm...');
                    }

                    var fAckCallbacks = socket.myObj.ackCallbacks.filter(function (item) {
                        return (item.TXserver == cm.getTXsender());
                    });

                    if (fAckCallbacks.length == 1) {
                        wlog.info('  ...calling ACK callback function.');
                        fAckCallbacks[0].callback(true, fAckCallbacks[0].TXserver); // call it and say it is ACKed, and pass TXserver in case callback needs it...
                    }
                    else if (fAckCallbacks.length > 1) {
                        wlog.error('  ...not calling ACK callback function because there is more than one. DEVELOPER ERROR? CHECK ME!.');
                    }

                    if (cm.getIsOutOfSync()) {
                        wlog.error('  ...ERROR: ACKed but Client told me OUT-OF-SYNC!');

                        if (socket.myObj.outOfSyncCnt >= Configuration.client.sock.OUT_OF_SYNC_CNT_MAX) {
                            wlog.error('  ...Will flush queue and destroy socket...');

                            // STOP SENDING
                            clearInterval(socket.myObj.tmrSenderTask); // stop sender of pending items
                            socket.myObj.tmrSenderTask = null; // don't forget this!

                            // FLUSH PENDING MESSAGES QUEUE
                            Database.flushClientQueue(socket.myObj.IDclient, function (err) {
                                if (err) {
                                    wlog.error('Unknown error in Database.flushClientQueue()!');
                                }

                                // DISCONNECT (kill socket)
                                wlog.error('Socket destroyed for IDclient=', socket.myObj.IDclient, 'because of out-of-sync!');
                                socket.end();
                                socket.destroy();
                            });
                        }
                        else {
                            socket.myObj.outOfSyncCnt++;
                            wlog.info('  ...will re-send unacknowledged queue items. Increased flush-counter to:', socket.myObj.outOfSyncCnt, '/', Configuration.client.sock.OUT_OF_SYNC_CNT_MAX, '!');

                            self.resendUnackedItems();
                        }
                    }
                    else {
                        socket.myObj.outOfSyncCnt = 0;
                    }
                });
            }
            else {
                wlog.info('Processing Client\'s data...');

                // acknowledge immediatelly (but only if client is authorized and if this is not a notification)
                var jsAck = new clientMessage();
                jsAck.setIsAck(true);
                jsAck.setTXsender(cm.getTXsender());

                if (!cm.getIsNotification()) {
                    if (cm.getTXsender() <= socket.myObj.TXclient) {
                        jsAck.setIsProcessed(false);
                        wlog.warn('  ...Warning: re-transmitted command, not processed!');
                    }
                    else if (cm.getTXsender() > (socket.myObj.TXclient + 1)) {
                        jsAck.setIsOutOfSync(true); // SYNC PROBLEM! Client sent higher than we expected! This means we missed some previous Message! This part should be handled on Client's side. Client should flush all data (NOT A VERY SMART IDEA) and re-connect. Re-sync should naturally occur then in auth procedure as there would be nothing pending in queue to send to Server.
                        jsAck.setIsProcessed(false);
                        wlog.error('  ...Error: Client sent out-of-sync data! Expected:', (socket.myObj.TXclient + 1), 'but I got:', cm.getTXsender());
                    }
                    else {
                        jsAck.setIsProcessed(true);
                        socket.myObj.TXclient++; // next package we will receive should be +1 of current value, so lets ++
                    }

                    socket.write(JSON.stringify(jsAck.buildMessage()) + '\n', 'ascii');
                    wlog.info('  ...ACK sent back for TXsender:', cm.getTXsender());
                }
                else {
                    jsAck.setIsProcessed(true); // we need this for bellow code to execute
                    wlog.info('  ...didn\'t ACK because this was AUTH command from Client, or Client is not authorized, or this was a notification.');
                }

                if (jsAck.getIsProcessed()) {
                    // system messages are not forwarded to our Base
                    if (cm.getIsSystemMessage()) {
                        wlog.info('  ...system message received, parsing...');

                        var d = cm.getData();

                        // process system messages
                        if (("type" in d) && d.type == 'pull_unacked') {
                            wlog.info('  ...will re-start pending items sender for all unacknowledged items.');

                            self.resendUnackedItems();
                        }
                            /*
                            if (("type" in d) && d.type == 'something_else') {
                                // something else...
                            }
                            */
                        else {
                            wlog.info('  ...unknown system message:', d, ', ignored.');
                        }
                    }
                    else {
                        wlog.info('  ...fresh data, will forward to my Base...');

                        try {
                            new Buffer(cm.getData(), 'hex');
                        } catch (err) {
                            wlog.warn('  ...Warning, data provided is not a HEX string!');
                        }

                        var bp = new baseMessage();
                        bp.setData(cm.getData());

                        // insert message into database for this base and trigger sending if it is online
                        var binaryPackageAsHexString = new Buffer(bp.buildPackage()).toString('hex');
                        Database.addTxServer2Base(socket.myObj.IDbase, binaryPackageAsHexString, function (err, result) {
                            if (err) {
                                wlog.info('Error in Database.addTxServer2Base, for IDbase=', socket.myObj.IDbase);
                                return;
                            }

                            wlog.info('  ...added to IDbase=', socket.myObj.IDbase, ' queue...');

                            // pronadji njegov socket (ako je online) i pokreni mu slanje
                            var fBaseSockets = connBases.filter(function (item) {
                                return (item.myObj.IDbase == socket.myObj.IDbase);
                            });

                            if (fBaseSockets.length == 1) {
                                wlog.info('  ...triggering queued items sender for IDbase=', socket.myObj.IDbase, '...');
                                fBaseSockets[0].startQueuedItemsSender();
                            }
                            else if (fBaseSockets.length > 1) {
                                wlog.info('  ...found more than one socket for IDbase=', socket.myObj.IDbase, 'which is a pretty improbable situation!');
                            }

                        });
                    }
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
            wlog.error('Unknown error in Database.markUnackedTxServer2Client!');
            return;
        }

        wlog.info('  ...starting queued items sender of all unacknowledged items...');

        // start pending items sender and we are done
        self.startQueuedItemsSender();
    });
}

ClientSock.prototype.cmdAuthorize = function () {
    var self = this;
    var socket = self.socket;
    var cm = self.cm;
    var cmd = cm.getData();

    if (socket.myObj.IDclient != null) {
        wlog.warn('Client attempted to re-authorize, request ignored!');
        return;
    }

    if (!("username" in cmd) || !("password" in cmd)) {
        wlog.warn('Error in cmdAuthorize(), missing username/password parameters!');
        return;
    }

    Database.authClient(cmd.username, cmd.password, socket.remoteAddress, Configuration.client.sock.MAX_AUTH_ATTEMPTS, Configuration.client.sock.MAX_AUTH_ATTEMPTS_MINUTES, function (err, result) {
        if (err) {
            wlog.error('Unknown error in Database.authClient()!');

            socket.end();
            socket.destroy();
            return;
        }

        if (result[0][0].oAuthorized == 1) {
            clearTimeout(socket.myObj.authTimer);

            wlog.info('  ...authorized as IDclient =', result[0][0].oIDclient, ', stopping logging in this file.');

            // instantiate logger for this IDclient
            wlog = new (winston.Logger)({
                transports: [
			      new (winston.transports.Console)(),
			      new (winston.transports.File)({ filename: './log/clientsock/' + result[0][0].oIDclient + '.json' })
                ]
            });

            socket.myObj.IDbase = result[0][0].oIDbase;
            socket.myObj.IDclient = result[0][0].oIDclient;
            socket.myObj.baseid = result[0][0].oBaseid;
            socket.myObj.timezone = result[0][0].oTimezone;
            socket.myObj.TXclient = result[0][0].oTXclient;

            wlog.info('Client', cmd.username.toString(), 'authorized, his IDbase is:', socket.myObj.IDbase, '.');

            // is other side forcing us to re-sync?
            if (cm.getIsSync() == true) {
                socket.myObj.TXclient = 0;
                wlog.info('  ...re-syncing TXclient to: 0.');
            }
            else {
                socket.myObj.TXclient = result[0][0].oTXclient;
                wlog.info('  ...re-loading TXclient from DB:', socket.myObj.TXclient);
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
                wlog.info('  ...forcing Client to re-sync because I don\'t have anything pending for him.');
            }

            socket.write(JSON.stringify(jsAns.buildMessage()) + '\n', 'ascii');

            self.sendBaseStatusNotification();

            // something pending for Client? (oForceSync is 0 if there is something pending in DB)
            if (result[0][0].oForceSync == 0) {
                wlog.info('  ...there is pending data for Client, starting sender...');
                socket.startQueuedItemsSender();
            }
        }
        else {
            wlog.warn('Client (', socket.myObj.ip, ') failed to authorize.');

            socket.myObj.IDbase = null;
            socket.myObj.IDclient = null;
            socket.myObj.baseid = null;
            socket.myObj.timezone = 0;
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
                cmdRes.description = 'Wrong username/password.';
            }

            wlog.warn('  ...reason:', cmdRes.description);

            jsAns.setDataAsObject(cmdRes);

            socket.write(JSON.stringify(jsAns.buildMessage()) + '\n', 'ascii');
        }
    });
};

ClientSock.prototype.sendBaseStatusNotification = function () {
    var self = this;
    var socket = self.socket;

    var foundConnected = false;

    var fBaseSockets = connBases.filter(function (item) {
        return (item.myObj.IDbase == socket.myObj.IDbase);
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
    ccm.baseid = socket.myObj.baseid;
    jsNotif.setDataAsObject(ccm);

    var jsonPackageAsString = JSON.stringify(jsNotif.buildMessage());

    socket.write(jsonPackageAsString + '\n', 'ascii'); // send right away
};

module.exports = function (socket) {
    return new ClientSock(socket);
};
