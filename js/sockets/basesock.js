'use strict';

// Base's server logic

var Configuration = require('../configuration/configuration');

var moment = require('moment');
var winston = require('winston');

var Database = require('../database/database');

var connBases = require('../server').connBases;
var connClients = require('../server').connClients;
var wlog = require('../server').wl;

var baseMessage = require('../messages/baseMessage');
var clientMessage = require('../messages/clientMessage');

function BaseSock(socket) {
    var self = this;
    self.socket = socket;

    socket.myObj = {
        baseid: null, // once authorized this will hold Base ID
        IDbase: null, // once authorized this will hold IDbase
        timezome: 0, // once authorized this will hold TimeZone for this Base
        TXbase: 0, // once authorized this will hold last sequence id received from Base (integer - 4 bytes)
        dataBuff: new Buffer(0), // buffer for incoming data!
        authTimer: null, // auth timer - connection killer

        tmrSenderTask: null, // timer for task that sends data from queue (stored in MySQL) to Base on socket, one-by-one and waiting for ACK after each transmission in order to send next one
        ip: null,
        ackCallbacks: [], // array of callback functions that will be triggered once "TXserver" gets ACKed or everything fails

        tmrBackoff: null, // backoff timer
        backoffMs: Configuration.base.sock.BACKOFF_MS / 2, // need this here, because it will change (*2) on each successive backof ack from Base
        outOfSyncCnt: 0, // out-of-sync counter
    };

    socket.myObj.ip = socket.remoteAddress;

    connBases.push(socket);
    wlog.info("Connection with Base %s established.", socket.myObj.ip);

    // Start a timeout that will kill this socket in case other party doesn't authorize within Configuration.base.sock.AUTH_TIMEOUT_MS
    if (Configuration.base.sock.AUTH_TIMEOUT_MS > 0) {
        wlog.info("Authorization timeout set to", Configuration.base.sock.AUTH_TIMEOUT_MS / 1000, "sec...");
        socket.myObj.authTimer = setTimeout(function () {
            wlog.info("Authorization timeout, killing connection with Base %s!", socket.myObj.ip);
            socket.destroy();
        }, Configuration.base.sock.AUTH_TIMEOUT_MS);
    }

    // Remove the base from the list when it leaves
    socket.on('end', function () {
        wlog.info("Connection to Base %s closed.", socket.myObj.ip);
        if (socket.myObj.IDbase != null) {
            Database.saveTXbase(socket.myObj.IDbase, socket.myObj.TXbase);
            wlog.info('  ...saved current TXbase (', socket.myObj.TXbase, ') to database.');
        }
        self.informMyClients(false);
        clearTimeout(socket.myObj.tmrSenderTask);
        clearTimeout(socket.myObj.tmrBackoff);

        while (socket.myObj.ackCallbacks.length > 0) {
            var TXserver = socket.myObj.ackCallbacks[0].TXserver;
            var callback = socket.myObj.ackCallbacks[0].callback;

            callback(false, TXserver); // say we failed
            wlog.info('  ...called failure ACK callback for TXserver:', TXserver);

            socket.myObj.ackCallbacks.shift();
        }

        connBases.splice(connBases.indexOf(socket), 1);
    });

    // Error occured on socket?
    socket.on('error', function (e) {
        if (e.code == 'ECONNRESET') {
            wlog.info("Connection to Base %s dropped.", socket.myObj.ip);
            if (socket.myObj.IDbase != null) {
                Database.saveTXbase(socket.myObj.IDbase, socket.myObj.TXbase);
                wlog.info('  ...saved current TXbase (', socket.myObj.TXbase, ') to database.');
            }
            self.informMyClients(false);
            clearTimeout(socket.myObj.tmrSenderTask);
            clearTimeout(socket.myObj.tmrBackoff);

            while (socket.myObj.ackCallbacks.length > 0) {
                var TXserver = socket.myObj.ackCallbacks[0].TXserver;
                var callback = socket.myObj.ackCallbacks[0].callback;

                callback(false, TXserver); // say we failed
                wlog.info('  ...called failure ACK callback for TXserver:', TXserver);

                socket.myObj.ackCallbacks.shift();
            }

            connBases.splice(connBases.indexOf(socket), 1);
        }
        else {
            wlog.error("Error on socket with Base %s", socket.myObj.ip, "error:", e);
        }
    });

    // Handle incoming messages from base.
    socket.on('data', function (data) {
        socket.myObj.dataBuff = Buffer.concat([socket.myObj.dataBuff, data]);
        self.onData();
    });

    // Add to queue and start tx job - parameter is of baseMessage() type
    socket.writeQueued = function (bp, ackCallback) {
        if (!bp) {
            wlog.error("Error in socket.writeQueued(), no parameter provided!");
            return;
        }

        // This will add data to queue and return TXserver assigned to this outgoing packet
        var binaryPackageAsHexString = new Buffer(bp.buildPackage()).toString('hex');
        Database.addTxServer2Base(socket.myObj.IDbase, binaryPackageAsHexString, function (err, result) {
            if (err) {
                wlog.error("Unknown error in Database.addTxServer2Base()!");
                return;
            }

            wlog.info('Added to TX Server2Base queue, TXserver:', result[0][0].oTXserver, 'starting sender...');

            if (ackCallback) {
                socket.myObj.ackCallbacks.push({ "TXserver": result[0][0].oTXserver, "callback": ackCallback });
                wlog.info('  ...added callback to array.');
            }

            self.startQueuedItemsSender();
        });
    };

    // This will send oldest item which is waiting in queue
    socket.startQueuedItemsSender = function () {
        if (socket.myObj.tmrBackoff) {
            wlog.info('Server2Base not executed, Backoff timer still running...');
        }
        else {
            if (socket.myObj.tmrSenderTask == null) {
                socket.myObj.tmrSenderTask = setInterval(function () {
                    Database.getNextTxServer2Base(socket.myObj.IDbase, function (err, result) {
                        if (err) {
                            wlog.info('Server2Base executed, but DATABASE ERROR happened!');
                            clearInterval(socket.myObj.tmrSenderTask);
                            socket.myObj.tmrSenderTask = null;
                            return;
                        }

                        if (result[0][0].oFetched == 0) {
                            wlog.warn('Server2Base executed but no data from DB to send. Strange!');
                            clearInterval(socket.myObj.tmrSenderTask);
                            socket.myObj.tmrSenderTask = null;
                            return;
                        }

                        wlog.info('Server2Base executed, assembling package and sending to Base...');

                        var bp = new baseMessage();
                        bp.extractFrom(new Buffer(result[0][0].oBinaryPackage, 'hex'));
                        var TXserver = new Buffer(4);
                        TXserver.writeUInt32BE(result[0][0].oTXserver, 0);
                        bp.setTXsender(TXserver);

                        socket.write(bp.buildPackage(), 'hex');
                        wlog.info('  ...sent.');

                        // if nothing else unsent in queue, stop this interval
                        if (result[0][0].oMoreInQueue == 0) {
                            wlog.info('Server2Base sender stopped, nothing more to send...');
                            clearInterval(socket.myObj.tmrSenderTask);
                            socket.myObj.tmrSenderTask = null;
                        }
                    });
                }, Configuration.base.sock.SENDER_TASK_MS);
                wlog.info('Server2Base interval-timer started.');
            }
            else {
                wlog.info('Server2Base sender already running...');
            }
        }
    };

};

BaseSock.prototype.onData = function () {
    var self = this;
    var socket = self.socket;

    if (socket.myObj.dataBuff == null) return;

    clearTimeout(socket.myObj.onDataTimer);

    var bp = new baseMessage();
    bp.extractFrom(socket.myObj.dataBuff);
    self.bp = bp;

    if (bp.getIsExtracted()) {
        socket.myObj.dataBuff = socket.myObj.dataBuff.slice(bp.getBinaryPackage().length);

        // if unauthorized try authorizing with this received message!
        if (socket.myObj.IDbase == null) {
            self.cmdAuthorize();
        }
        else {
            // handle received ACK
            if (bp.getIsAck()) {
                wlog.info('Processing Base\'s ACK for our TXserver:', bp.getTXsender().readUInt32BE(0));

                if (bp.getBackoff()) {
                    clearInterval(socket.myObj.tmrSenderTask); // stop sender of pending items
                    socket.myObj.tmrSenderTask = null; // don't forget this!

                    socket.myObj.backoffMs = socket.myObj.backoffMs * 2;
                    wlog.info('  ...didn\'t ACK on TXserver', bp.getTXsender().readUInt32BE(0), ', Base wants me to Backoff! (Delay:', socket.myObj.backoffMs, 'ms).');

                    // mark this TXserver from txserver2base as NOT sent (sent = 0) so that we can take it again after backoff expires!!!
                    Database.markUnsentTxServer2Base(socket.myObj.IDbase, bp.getTXsender().readUInt32BE(0), function (err) {
                        if (err) {
                            return;
                        }

                        wlog.info('Marked our Server2Base TXserver', bp.getTXsender().readUInt32BE(0), ', as unsent, started Backoff timer...');

                        // set backoff timer, and when it executes it will resume sender. in case we get additional ACK before it triggers, it will be restarted but with double time
                        clearTimeout(socket.myObj.tmrBackoff);
                        socket.myObj.tmrBackoff = setTimeout(function () {
                            socket.myObj.tmrBackoff = null;
                            wlog.info('Backoff timer expired, starting sender again...');
                            socket.startQueuedItemsSender(); // resume sender
                        }, socket.myObj.backoffMs);
                    });
                }
                else {
                    Database.ackTxServer2Base(socket.myObj.IDbase, bp.getTXsender().readUInt32BE(0), function (err, result) {
                        if (err) {
                            return;
                        }

                        socket.myObj.backoffMs = Configuration.base.sock.BACKOFF_MS / 2; // reload default/initial backoff duration

                        if (result[0][0].oAcked) {
                            wlog.info('  ...ACKed on TXserver:', bp.getTXsender().readUInt32BE(0));
                        }
                        else {
                            wlog.warn('  ...couldn\'t not ACK on TXserver:', bp.getTXsender().readUInt32BE(0), ', strange! Hm...');
                        }

                        var fAckCallbacks = socket.myObj.ackCallbacks.filter(function (item) {
                            return (item.TXserver == bp.getTXsender().readUInt32BE(0));
                        });

                        if (fAckCallbacks.length == 1) {
                            wlog.info('  ...calling ACK callback function.');
                            fAckCallbacks[0].callback(true, fAckCallbacks[0].TXserver); // call it and say it is ACKed, and pass TXserver in case callback needs it...
                        }
                        else if (fAckCallbacks.length > 1) {
                            wlog.error('  ...not calling ACK callback function because there is more than one. DEVELOPER ERROR? CHECK ME!.');
                        }

                        if (bp.getOutOfSync()) {
                            wlog.error('  ...ERROR: ACKed but Base told me OUT-OF-SYNC!');

                            if (socket.myObj.outOfSyncCnt >= Configuration.base.sock.OUT_OF_SYNC_CNT_MAX) {
                                wlog.error('  ...Will flush queue and destroy socket...');

                                // STOP SENDING
                                clearInterval(socket.myObj.tmrSenderTask); // stop sender of pending items
                                socket.myObj.tmrSenderTask = null; // don't forget this!

                                // FLUSH PENDING MESSAGES QUEUE
                                Database.flushBaseQueue(socket.myObj.IDbase, function (err) {
                                    if (err) {
                                        wlog.error('Unknown error in Database.flushBaseQueue()!');
                                    }

                                    // DISCONNECT (kill socket)
                                    wlog.error('Socket destroyed for IDbase=', socket.myObj.IDbase, 'because of out-of-sync!');
                                    socket.end();
                                    socket.destroy();
                                });
                            }
                            else {
                                socket.myObj.outOfSyncCnt++;
                                wlog.info('  ...will re-send unacknowledged queue items. Increased flush-counter to:', socket.myObj.outOfSyncCnt, '/', Configuration.base.sock.OUT_OF_SYNC_CNT_MAX, '!');

                                self.resendUnackedItems();
                            }
                        }
                        else {
                            socket.myObj.outOfSyncCnt = 0;
                        }
                    });
                }
            }
                // not an ACK
            else {
                wlog.info('Processing Base\'s data...');

                // acknowledge immediatelly (but only if base is authorized and if this is not a notification)
                var bpAck = new baseMessage();
                bpAck.setIsAck(true);
                bpAck.setTXsender(bp.getTXsender());

                if (!bp.getIsNotification()) {
                    if (bp.getTXsender().readUInt32BE(0) <= socket.myObj.TXbase) {
                        bpAck.setIsProcessed(false);
                        wlog.warn('  ...Warning: re-transmitted command, not processed!');
                    }
                    else if (bp.getTXsender().readUInt32BE(0) > (socket.myObj.TXbase + 1)) {
                        // SYNC PROBLEM! Base sent higher than we expected! This means we missed some previous Message!
                        // This part should be handled on Bases' side.
                        // Base should flush all data (NOT A VERY SMART IDEA) and re-connect. Re-sync should naturally occur
                        // then in auth procedure as there would be nothing pending in queue to send to Server.

                        bpAck.setOutOfSync(true);
                        bpAck.setIsProcessed(false);
                        wlog.error('  ...Error: Base sent out-of-sync data! Expected:', (socket.myObj.TXbase + 1), 'but I got:', bp.getTXsender().readUInt32BE(0));
                    }
                    else {
                        bpAck.setIsProcessed(true);
                        socket.myObj.TXbase++; // next package we will receive should be +1 of current value, so lets ++
                    }

                    socket.write(bpAck.buildPackage(), 'hex');
                    wlog.info('  ...ACK sent back for TXsender:', bp.getTXsender().readUInt32BE(0));
                }
                else {
                    bpAck.setIsProcessed(true); // we need this for bellow code to execute
                    wlog.info('  ...didn\'t ACK because this was a low-priority message (notification).');
                }

                if (bpAck.getIsProcessed()) {
                    // system messages are not forwarded to our Clients
                    if (bp.getIsSystemMessage()) {
                        wlog.info('  ...system message received, parsing...');

                        // process system messages
                        if (bp.getData().toString('hex') == '01') {
                            wlog.info('  ...will re-start pending items sender for all unacknowledged items.');

                            self.resendUnackedItems();
                        }
                        else if (bp.getData().toString('hex') == '02') {
                            wlog.info('  ...enabling KEEP ALIVE.');

                            socket.setKeepAlive(true, Configuration.base.sock.KEEP_ALIVE_MS);
                        }
                        else if (bp.getData().toString('hex') == '03') {
                            wlog.info('  ...disabling KEEP ALIVE.');

                            socket.setKeepAlive(false);
                        }
                            /*
                            else if (bp.getData().toString('hex') == '03') {
                                // something else...
                            }
                            */
                        else {
                            wlog.info('  ...unknown system message:', bp.getData().toString('hex'), ', ignored.');
                        }
                    }
                    else {
                        wlog.info('  ...fresh data, will forward to my Clients...');

                        // forward message to all Clients of this Base
                        Database.getClientsOfBase(socket.myObj.IDbase, function (err, rows, columns) {
                            if (err) {
                                return;
                            }

                            if (rows.length <= 0) {
                                wlog.info('No Clients associated with Base (', socket.myObj.IDbase, ') yet! Strange...');
                                return;
                            }

                            var cm = new clientMessage();
                            cm.setData(bp.getData().toString('hex'));
                            var jsonPackageAsString = JSON.stringify(cm.buildMessage());

                            var rowsLength = rows.length;
                            var clientsLength = connClients.length;
                            var offlineIDclients = [];
                            for (var i = 0; i < rowsLength; i++) {

                                // insert message into database for this client and trigger sending if he is online
                                (function (IDclient) {
                                    Database.addTxServer2Client(IDclient, jsonPackageAsString, function (err, result) {
                                        if (err) {
                                            wlog.info('Error in Database.addTxServer2Client, for IDclient=', IDclient);
                                            return;
                                        }

                                        wlog.info('  ...added to IDclient=', IDclient, ' queue...');

                                        // pronadji njegov socket (ako je online) i pokreni mu slanje
                                        var fClientSockets = connClients.filter(function (item) {
                                            return (item.myObj.IDclient == IDclient);
                                        });

                                        if (fClientSockets.length == 1) {
                                            wlog.info('  ...triggering queued items sender for IDclient=', IDclient, '...');
                                            fClientSockets[0].startQueuedItemsSender();
                                        }
                                        else if (fClientSockets.length > 1) {
                                            wlog.info('  ...found more than one socket for IDclient=', IDclient, 'which is a pretty improbable situation!');
                                        }
                                    });
                                })(rows[i].IDclient);

                            }
                        });

                    } // forwarding data to clients, not a system message
                } // yes, is processed
            } // processing received data, this is not an ACK
        } // authorized...
    }

    // Call us again after Xms (throttling received commands) if we have something else in queue waiting to be parsed after parsing this current command
    if (bp.getIsExtracted() && socket.myObj.dataBuff.length > 0) {
        socket.myObj.onDataTimer = setTimeout(function () {
            self.onData();
        }, Configuration.base.sock.ON_DATA_THROTTLING_MS);
    }
};

BaseSock.prototype.resendUnackedItems = function () {
    var self = this;
    var socket = self.socket;

    // stop sender for now
    clearInterval(socket.myObj.tmrSenderTask);
    socket.myObj.tmrSenderTask = null;

    // mark unacknowledged items as unsent (unmark sent bit)
    Database.markUnackedTxServer2Base(socket.myObj.IDbase, function (err) {
        if (err) {
            wlog.error('Unknown error in Database.markUnackedTxServer2Base!');
            return;
        }

        wlog.info('  ...starting queued items sender of all unacknowledged items...');

        // start pending items sender and we are done
        self.startQueuedItemsSender();
    });
}

BaseSock.prototype.cmdAuthorize = function () {
    var self = this;
    var socket = self.socket;
    var bp = self.bp;
    var baseid = bp.getData();

    if (socket.myObj.IDbase != null) {
        wlog.warn('Base attempted to re-authorize, request ignored!');
        return;
    }

    if (baseid.length != 16) {
        wlog.info("Error in cmdAuthorize(), didn't get required 16 bytes of command to continue.");
        return;
    }

    Database.authBase(baseid.toString('hex'), socket.myObj.ip, Configuration.base.sock.MAX_AUTH_ATTEMPTS, Configuration.base.sock.MAX_AUTH_ATTEMPTS_MINUTES, function (err, result) {
        if (err) {
            wlog.error('Unknown error in Database.authBase()!');

            socket.end();
            socket.destroy();
            return;
        }

        if (result[0][0].oAuthorized == 1) {
            clearTimeout(socket.myObj.authTimer);

            wlog.info('  ...authorized as IDbase =', result[0][0].oIDbase, ', stopping logging in this file.');

            // instantiate logger for this IDbase
            wlog = new (winston.Logger)({
                transports: [
			      new (winston.transports.Console)(),
			      new (winston.transports.File)({ filename: './log/basesock/' + result[0][0].oIDbase + '.json' })
                ]
            });

            socket.myObj.baseid = baseid.toString('hex');
            socket.myObj.IDbase = result[0][0].oIDbase;
            socket.myObj.timezone = result[0][0].oTimezone;
            wlog.info('Base', baseid.toString('hex'), 'authorized.');

            // is other side forcing us to re-sync?
            if (bp.getHasSync()) {
                socket.myObj.TXbase = 0;
                wlog.info('  ...re-syncing TXbase to: 0.');
            }
            else {
                socket.myObj.TXbase = result[0][0].oTXbase;
                wlog.info('  ...re-loading TXbase from DB:', socket.myObj.TXbase);
            }

            var bpAns = new baseMessage();
            bpAns.setIsNotification(true); // da ispostujemo protokol jer ne zahtjevamo ACK nazad
            bpAns.setIsSystemMessage(true); // da ispostujemo protokol jer ovaj podatak nije od Klijenta nego od Servera
            bpAns.setData(new Buffer([0x00], 'hex')); // OK!

            // should we force other side to re-sync?
            if (result[0][0].oForceSync == 1) {
                bpAns.setHasSync(true);
                wlog.info('  ...forcing Base to re-sync because I don\'t have anything pending for it.');
            }

            socket.write(bpAns.buildPackage(), 'hex');

            self.informMyClients(true);

            // something pending for Base? (oForceSync is 0 if there is something pending in DB)
            if (result[0][0].oForceSync == 0) {
                wlog.info('  ...there is pending data for Base, starting sender...');
                socket.startQueuedItemsSender();
            }
        }
        else {
            socket.myObj.baseid = null;
            socket.myObj.IDbase = null;
            socket.myObj.timezone = 0;

            wlog.info('Base', baseid.toString('hex'), 'authorization error.');

            var bpAns = new baseMessage();
            bpAns.setIsNotification(true); // da ispostujemo protokol jer ne zahtjevamo ACK nazad
            bpAns.setIsSystemMessage(true); // da ispostujemo protokol jer ovaj podatak nije od Klijenta nego od Servera
            bpAns.setData(new Buffer([0x01], 'hex')); // ERROR!

            socket.write(bpAns.buildPackage(), 'hex');
        }
    });
};

BaseSock.prototype.informMyClients = function (connected) {
    var self = this;
    var socket = self.socket;

    if (socket.myObj.IDbase == null) return;

    Database.getClientsOfBase(socket.myObj.IDbase, function (err, rows, columns) {
        if (err) {
            return;
        }

        if (rows.length <= 0) {
            return;
        }

        var cm = new clientMessage();
        cm.setIsNotification(true);
        cm.setIsSystemMessage(true);
        var ccm = {
            "type": "base_connection_status",
            "connected": connected,
            "baseid": socket.myObj.baseid,
        };
        cm.setDataAsObject(ccm);

        var jsonPackageAsString = JSON.stringify(cm.buildMessage());

        var rowsLength = rows.length;
        var clientsLength = connClients.length;
        for (var i = 0; i < rowsLength; i++) {
            var IDclient = rows[i].IDclient;

            // pronadji njegov socket (ako je online) i posalji mu status kao notifikaciju odmah
            var fClientSockets = connClients.filter(function (item) {
                return (item.myObj.IDclient == IDclient);
            });

            if (fClientSockets.length == 1) {
                wlog.info('  ...sending Base connection status notification to IDclient=', IDclient, '...');
                fClientSockets[0].write(jsonPackageAsString + '\n', 'ascii'); // send right away
            }
            else if (fClientSockets.length > 1) {
                wlog.info('  ...found more than one socket for IDclient=', IDclient, 'which is a pretty improbable situation!');
            }

        }
    });
};

module.exports = function (socket) {
    return new BaseSock(socket);
};
