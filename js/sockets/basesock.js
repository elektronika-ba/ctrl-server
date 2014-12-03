'use strict';

// Base's server logic

var Configuration = require('../configuration/configuration');

var moment = require('moment');
var winston = require('winston');
var crypto = require('crypto');

var Database = require('../database/basedb');

var connBases = require('../server').connBases;
var connClients = require('../server').connClients;
var wlog = require('../server').wl;

var baseMessage = require('../messages/baseMessage');
var clientMessage = require('../messages/clientMessage');

function BaseSock(socket) {
    var self = this;
    self.socket = socket;

    socket.myObj = {
        IDbase: null, // once authorized this will hold IDbase
        baseid: null, // once authorized this will hold Base ID
        timezome: 0, // once authorized this will hold TimeZone for this Base
        TXbase: 0, // once authorized this will hold last sequence id received from Base (integer - 4 bytes)
        aes128Key: new Buffer([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), // once authorized this will hold crypt key used to talk to Base. Until then, encyrption key is all zeroes and communication is encrypted using this key

        dataBuff: new Buffer(0), // buffer for incoming data!
        authTimer: null, // auth timer - connection killer
        random16bytes: new Buffer(16), // this holds 16 bytes of previous encrypted data we sent to be used as IV for next encryption

        tmrSenderTask: null, // timer for task that sends data from queue (stored in MySQL) to Base on socket, one-by-one
        ip: null,

        tmrBackoff: null, // backoff timer
        backoffMs: Configuration.base.sock.BACKOFF_MS / 2, // need this here, because it will change (*2) on each successive backof ack from Base
        outOfSyncCnt: 0, // out-of-sync counter

        wlog: null, // used for logging after logged-in :)
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
            Database.baseOnlineStatus(socket.myObj.IDbase, 0);
            socket.myObj.wlog.info('  ...saved current TXbase (', socket.myObj.TXbase, ') and OnlineStatus to database.');
        }
        self.informMyClients(false);
        clearTimeout(socket.myObj.tmrSenderTask);
        clearTimeout(socket.myObj.tmrBackoff);
        clearTimeout(socket.myObj.authTimer); // added on 25-11-2014

        connBases.splice(connBases.indexOf(socket), 1);
    });

    // Error occured on socket?
    socket.on('error', function (e) {
        if (e.code == 'ECONNRESET' || e.code == 'ETIMEDOUT') {
            wlog.info("Connection to Base %s dropped.", socket.myObj.ip);
            if (socket.myObj.IDbase != null) {
                Database.saveTXbase(socket.myObj.IDbase, socket.myObj.TXbase);
                Database.baseOnlineStatus(socket.myObj.IDbase, 0);
                socket.myObj.wlog.info('  ...saved current TXbase (', socket.myObj.TXbase, ') and OnlineStatus to database.');
            }
            self.informMyClients(false);
            clearTimeout(socket.myObj.tmrSenderTask);
            clearTimeout(socket.myObj.tmrBackoff);
            clearTimeout(socket.myObj.authTimer); // added on 25-11-2014

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

    // This will send oldest item which is waiting in queue
    socket.startQueuedItemsSender = function () {
        if (socket.myObj.tmrBackoff) {
            socket.myObj.wlog.info('Server2Base not executed, Backoff timer still running...');
        }
        else {
            if (socket.myObj.tmrSenderTask == null) {
                socket.myObj.tmrSenderTask = setInterval(function () {
                    Database.getNextTxServer2Base(socket.myObj.IDbase, function (err, result) {
                        if (err) {
                            socket.myObj.wlog.info('Server2Base executed, but DATABASE ERROR happened!');
                            clearInterval(socket.myObj.tmrSenderTask);
                            socket.myObj.tmrSenderTask = null;
                            return;
                        }

                        if (result[0][0].oFetched == 0) {
                            socket.myObj.wlog.warn('Server2Base executed but no data from DB to send. Strange!');
                            clearInterval(socket.myObj.tmrSenderTask);
                            socket.myObj.tmrSenderTask = null;
                            return;
                        }

                        socket.myObj.wlog.info('Server2Base executed, assembling package and sending to Base...');

                        var bp = new baseMessage();
                        bp.extractFrom(new Buffer(result[0][0].oBinaryPackage, 'hex'));
                        bp.unpackAsPlainMessage();
                        bp.setTXsender(result[0][0].oTXserver);

                        socket.write(bp.buildEncryptedMessage(socket.myObj.aes128Key, socket.myObj.random16bytes), 'hex');
                        socket.myObj.wlog.info('  ...sent.');

                        bp.getBinaryPackage().copy(socket.myObj.random16bytes, 0, bp.getBinaryPackage().length-16); // prepare IV for next encryption

                        // if nothing else unsent in queue, stop this interval
                        if (result[0][0].oMoreInQueue == 0) {
                            socket.myObj.wlog.info('Server2Base sender stopped, nothing more to send...');
                            clearInterval(socket.myObj.tmrSenderTask);
                            socket.myObj.tmrSenderTask = null;
                        }
                    });
                }, Configuration.base.sock.SENDER_TASK_MS);
                socket.myObj.wlog.info('Server2Base interval-timer started.');
            }
            else {
                socket.myObj.wlog.info('Server2Base sender already running...');
            }
        }
    };
};

BaseSock.prototype.onData = function () {
    var self = this;
    var socket = self.socket;

    if (socket.myObj.dataBuff == null) return;

    clearTimeout(socket.myObj.onDataTimer);

    // try extracting received binary stream "bp"
    var bp = new baseMessage();
    self.bp = bp;
    if (bp.extractFrom(socket.myObj.dataBuff)) {
        socket.myObj.dataBuff = socket.myObj.dataBuff.slice(bp.getBinaryPackageLength());

        // unpack must succeed for message to be processed further
        if (bp.unpackAsEncryptedMessage(socket.myObj.aes128Key)) {
            // if unauthorized try authorizing with this received message!
            if (socket.myObj.IDbase == null) {
                self.doAuthorize();
            }
            else {
                // handle received ACK
                if (bp.getIsAck()) {
                    socket.myObj.wlog.info('Processing Base\'s ACK for our TXserver:', bp.getTXsender());

                    if (bp.getIsBackoff()) {
                        clearInterval(socket.myObj.tmrSenderTask); // stop sender of pending items
                        socket.myObj.tmrSenderTask = null; // don't forget this!

                        socket.myObj.backoffMs = socket.myObj.backoffMs * 2;
                        socket.myObj.wlog.info('  ...didn\'t ACK on TXserver', bp.getTXsender(), ', Base wants me to Backoff! (Delay:', socket.myObj.backoffMs, 'ms).');

                        // mark this TXserver from txserver2base as NOT sent (sent = 0) so that we can take it again after backoff expires!!!
                        Database.markUnsentTxServer2Base(socket.myObj.IDbase, bp.getTXsender(), function (err) {
                            if (err) {
                                return;
                            }

                            socket.myObj.wlog.info('Marked our Server2Base TXserver', bp.getTXsender(), ', as unsent, started Backoff timer...');

                            // set backoff timer, and when it executes it will resume sender. in case we get additional ACK before it triggers, it will be restarted but with double time
                            clearTimeout(socket.myObj.tmrBackoff);
                            socket.myObj.tmrBackoff = setTimeout(function () {
                                socket.myObj.tmrBackoff = null;
                                socket.myObj.wlog.info('Backoff timer expired, starting sender again...');
                                socket.startQueuedItemsSender(); // resume sender
                            }, socket.myObj.backoffMs);
                        });
                    }
                    else {
                        Database.ackTxServer2Base(socket.myObj.IDbase, bp.getTXsender(), function (err, result) {
                            if (err) {
                                return;
                            }

                            socket.myObj.backoffMs = Configuration.base.sock.BACKOFF_MS / 2; // reload default/initial backoff duration

                            if (result[0][0].oAcked) {
                                socket.myObj.wlog.info('  ...ACKed on TXserver:', bp.getTXsender());
                            }
                            else {
                                socket.myObj.wlog.warn('  ...couldn\'t not ACK on TXserver:', bp.getTXsender(), ', strange! Hm...');
                            }

                            if (bp.getIsOutOfSync()) {
                                socket.myObj.wlog.error('  ...ERROR: ACKed but Base told me OUT-OF-SYNC!');

                                if (socket.myObj.outOfSyncCnt >= Configuration.base.sock.OUT_OF_SYNC_CNT_MAX) {
                                    socket.myObj.wlog.error('  ...Will flush queue and destroy socket...');

                                    // STOP SENDING
                                    clearInterval(socket.myObj.tmrSenderTask); // stop sender of pending items
                                    socket.myObj.tmrSenderTask = null; // don't forget this!

                                    // FLUSH PENDING MESSAGES QUEUE
                                    Database.flushBaseQueue(socket.myObj.IDbase, function (err) {
                                        if (err) {
                                            socket.myObj.wlog.error('Unknown error in Database.flushBaseQueue()!');
                                        }

                                        // DISCONNECT (kill socket)
                                        socket.myObj.wlog.error('Socket destroyed because of out-of-sync!');
                                        socket.end();
                                        socket.destroy();
                                    });
                                }
                                else {
                                    socket.myObj.outOfSyncCnt++;
                                    socket.myObj.wlog.info('  ...will re-send unacknowledged queue items. Increased flush-counter to:', socket.myObj.outOfSyncCnt, '/', Configuration.base.sock.OUT_OF_SYNC_CNT_MAX, '!');

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
                    socket.myObj.wlog.info('Processing Base\'s data...');

                    // acknowledge immediatelly (but only if base is authorized and if this is not a notification)
                    var bpAck = new baseMessage();
                    bpAck.setIsAck(true);
                    bpAck.setTXsender(bp.getTXsender());

                    if (!bp.getIsNotification()) {
                        if (bp.getTXsender() <= socket.myObj.TXbase) {
                            bpAck.setIsProcessed(false);
                            socket.myObj.wlog.warn('  ...Warning: re-transmitted command, not processed!');
                        }
                        else if (bp.getTXsender() > (socket.myObj.TXbase + 1)) {
                            // SYNC PROBLEM! Base sent higher than we expected! This means we missed some previous Message!
                            // This part should be handled on Bases' side.
                            // Base should flush all data (NOT A VERY SMART IDEA) and re-connect. Re-sync should naturally occur
                            // then in auth procedure as there would be nothing pending in queue to send to Server.

                            bpAck.setIsOutOfSync(true);
                            bpAck.setIsProcessed(false);
                            socket.myObj.wlog.error('  ...Error: Base sent out-of-sync data! Expected:', (socket.myObj.TXbase + 1), 'but I got:', bp.getTXsender());
                        }
                        else {
                            bpAck.setIsProcessed(true);
                            socket.myObj.TXbase++; // next package we will receive should be +1 of current value, so lets ++
                        }

                        socket.write(bpAck.buildEncryptedMessage(socket.myObj.aes128Key, socket.myObj.random16bytes), 'hex');
                        socket.myObj.wlog.info('  ...ACK sent back for TXsender:', bp.getTXsender());

                        bp.getBinaryPackage().copy(socket.myObj.random16bytes, 0, bp.getBinaryPackage().length - 16); // prepare IV for next encryption
                    }
                    else {
                        bpAck.setIsProcessed(true); // we need this for bellow code to execute
                        socket.myObj.wlog.info('  ...didn\'t ACK because this was a notification.');
                    }

                    if (bpAck.getIsProcessed()) {
                        // system messages are not forwarded to our Clients
                        if (bp.getIsSystemMessage()) {
                            socket.myObj.wlog.info('  ...system message received, parsing...');

                            // process system messages
                            if (bp.getData().toString('hex') == '01') {
                                socket.myObj.wlog.info('  ...will re-start pending items sender for all unacknowledged items.');

                                self.resendUnackedItems();
                            }
                            else if (bp.getData().toString('hex') == '02') {
                                socket.myObj.wlog.info('  ...enabling KEEP ALIVE.');

                                socket.setKeepAlive(true, Configuration.base.sock.KEEP_ALIVE_MS);
                            }
                            else if (bp.getData().toString('hex') == '03') {
                                socket.myObj.wlog.info('  ...disabling KEEP ALIVE.');

                                socket.setKeepAlive(false);
                            }
                                /*
                                else if (bp.getData().toString('hex') == '04') {
                                    // something else...
                                }
                                */
                            else {
                                socket.myObj.wlog.info('  ...unknown system message:', bp.getData().toString('hex'), ', ignored.');
                            }
                        }
                        else {
                            socket.myObj.wlog.info('  ...fresh data, will forward to my Clients...');

                            // forward message to all Clients of this Base
                            Database.getClientsOfBase(socket.myObj.IDbase, function (err, rows, columns) {
                                if (err) {
                                    return;
                                }

                                if (rows.length <= 0) {
                                    socket.myObj.wlog.info('No Clients associated with Base (', socket.myObj.IDbase, ') yet! Strange...');
                                    return;
                                }

                                var cm = new clientMessage();
                                cm.setIsNotification(bp.getIsNotification());
                                cm.setData(bp.getData().toString('hex'));
                                var jsonPackageAsString = JSON.stringify(cm.buildMessage());

                                var rowsLength = rows.length;
                                var clientsLength = connClients.length;
                                var offlineIDclients = [];
                                for (var i = 0; i < rowsLength; i++) {

                                    // insert message into database for this client and trigger sending if he is online
                                    (function (IDclient) {
                                        // no point in inserting notifications into database since they are not acknowledged/re-transmitted, right? just pipe it to the "other side"
                                        if (cm.getIsNotification()) {
                                            socket.myObj.wlog.info('  ...this is a Notification, sending right now on Client\'s (', IDclient, ') socket...');

                                            // pronadji njegov socket
                                            var fClientSockets = connClients.filter(function (item) {
                                                return (item.myObj.IDclient == IDclient);
                                            });

                                            if (fClientSockets.length == 1) {
                                                fClientSockets[0].write(jsonPackageAsString + '\n', 'ascii');
                                                fClientSockets[0].myObj.wlog.info('  ...sent (piped).');
                                            }
                                            else if (fClientSockets.length > 1) {
                                                socket.myObj.wlog.info('  ...found more than one socket for IDclient=', IDclient, 'which is a pretty improbable situation!');
                                            }
                                            else {
                                                socket.myObj.wlog.info('  ...IDclient=', IDclient, 'is offline, will not get this Notification.');
                                            }
                                        }
                                            // not a notification, lets insert into database and trigger senging
                                        else {
                                            Database.addTxServer2Client(IDclient, jsonPackageAsString, function (err, result) {
                                                if (err) {
                                                    socket.myObj.wlog.info('Error in Database.addTxServer2Client, for IDclient=', IDclient);
                                                    return;
                                                }

                                                socket.myObj.wlog.info('  ...added to IDclient=', IDclient, ' queue...');

                                                // pronadji njegov socket (ako je online) i pokreni mu slanje
                                                var fClientSockets = connClients.filter(function (item) {
                                                    return (item.myObj.IDclient == IDclient);
                                                });

                                                if (fClientSockets.length == 1) {
                                                    socket.myObj.wlog.info('  ...triggering queued items sender for IDclient=', IDclient, '...');
                                                    fClientSockets[0].startQueuedItemsSender();
                                                }
                                                else if (fClientSockets.length > 1) {
                                                    socket.myObj.wlog.info('  ...found more than one socket for IDclient=', IDclient, 'which is a pretty improbable situation!');
                                                }
                                            });
                                        }
                                    })(rows[i].IDclient);

                                } // for each client...
                            }); // Database.getClientsOfBase()
                        } // forwarding data to clients, not a system message
                    } // yes, is processed
                } // processing received data, this is not an ACK
            } // authorized...
        } // is CMAC valid?
        else {
			if (socket.myObj.IDbase != null) {
            	socket.myObj.wlog.info('  ...CMAC validation failed. Message discarded!');
			}
			else {
				wlog.info('  ...CMAC validation failed. Message discarded!');
			}
        }
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
            socket.myObj.wlog.error('Unknown error in Database.markUnackedTxServer2Base!');
            return;
        }

        socket.myObj.wlog.info('  ...starting queued items sender of all unacknowledged items...');

        // start pending items sender and we are done
        socket.startQueuedItemsSender();
    });
}

BaseSock.prototype.doAuthorize = function () {
    var self = this;
    var socket = self.socket;
    var bp = self.bp;
    var authBytes = bp.getData();

    // authBytes contains:
    // 16 bytes of baseId
    // 32 bytes containing 16 random bytes that can be discarded (after decryption) and 16 bytes of baseId, which when decrypted must match provided baseId (the very first 16 bytes of authBytes)

    if (socket.myObj.IDbase != null) {
        socket.myObj.wlog.warn('Base attempted to re-authorize, request ignored!');
        return;
    }

    if (authBytes.length != 48) {
        wlog.info('Error in doAuthorize(), didn\'t get required 48 bytes of command to continue (', authBytes.length, ').');
        return;
    }

    var baseid = new Buffer(16);
    authBytes.copy(baseid, 0, 0, 16);
    var encryptedBaseId = new Buffer(32);
    authBytes.copy(encryptedBaseId, 0, 16);

    encryptedBaseId.copy(socket.myObj.random16bytes, 0, 0, 16); // prepare IV for next encryption (will be used in case this Base gets authorized)

    Database.authBasePhase1(baseid.toString('hex'), socket.myObj.ip, Configuration.base.sock.MAX_AUTH_ATTEMPTS, Configuration.base.sock.MAX_AUTH_ATTEMPTS_MINUTES, function (err, result) {
        if (err) {
            wlog.error('Unknown error in Database.authBasePhase1()!');

            socket.end();
            socket.destroy();
            return;
        }

        // provided baseid exists in database (and auth limit not exceeded)?
        if (result[0][0].oOK == 1) {
            socket.myObj.aes128Key = new Buffer(result[0][0].oCryptKey, 'hex');
            socket.myObj.timezone = result[0][0].oTimezone;
            socket.myObj.baseid = baseid.toString('hex');
            var dbTXbase = result[0][0].oTXbase;
            var dbIDbase = result[0][0].oIDbase;

            // Decrypt and compare if last 16 bytes are in fact "baseid" we expect. This time use the "crypt_key" of provided "baseid"
            var decipher = crypto.createDecipheriv('aes-128-cbc', socket.myObj.aes128Key, new Buffer([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
            decipher.setAutoPadding(false);
            var decrypted = decipher.update(encryptedBaseId, 'hex', 'hex'); //.final('hex') not required?

			// !!!!!!!!! IMPORTANT TODO: MAKE CHALLANGE-RESPONSE AUTHENTICATION

            // compare/verify
            var unpackedBaseid = new Buffer(16);
            new Buffer(decrypted, 'hex').copy(unpackedBaseid, 0, 16);
            if (unpackedBaseid.toString('hex') != baseid.toString('hex')) {
                socket.myObj.baseid = null;
                socket.myObj.IDbase = null;
                socket.myObj.aes128Key = null;

                wlog.info('Base', baseid.toString('hex'), 'authorization error, decrypted BaseID does not match!');

                // log auth attempt
                Database.authBaseError(baseid.toString('hex'), socket.myObj.ip);

                var bpAns = new baseMessage();
                bpAns.setIsNotification(true); // da ispostujemo protokol jer ne zahtjevamo ACK nazad
                bpAns.setIsSystemMessage(true); // da ispostujemo protokol jer ovaj podatak nije od Klijenta nego od Servera
                bpAns.setDataFromHexString('01'); // ERROR! Wrong encrypted baseid value

                // answer but with default AES-128 key (all zeroes)
                socket.write(bpAns.buildEncryptedMessage(new Buffer([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), socket.myObj.random16bytes), 'hex');
            }
            else {
                Database.authBasePhase2(dbIDbase, function (err, result) {
                    if (err) {
                        wlog.error('Unknown error in Database.authBasePhase2()!');

                        socket.end();
                        socket.destroy();
                        return;
                    }

                    clearTimeout(socket.myObj.authTimer);

                    wlog.info('  ...authorized as IDbase =', dbIDbase);

                    // kill all potentially already existing connections of this Base
                    // (if TCP error happens and keep-alive is not used, then connection might remain active so we must destroy it)
                    var fMyConns = connBases.filter(function (item) {
                        return (dbIDbase == item.myObj.IDbase);
                    });
                    // there should be maximum one existing connection here, but lets loop it just to make sure we close them all
                    for (var b = 0; b < fMyConns.length; b++) {
                        wlog.info('  ...found already existing connection at', fMyConns[b].myObj.ip, ', continuing its TXbase (', fMyConns[b].myObj.TXbase, '). Destroying it now!');
                        dbTXbase = fMyConns[b].myObj.TXbase; // this will be assigned for each previous socket connection in loop so it will hold the value of last one. doesn't matter really...
                        fMyConns[b].myObj.baseid = null;
                        fMyConns[b].myObj.IDbase = null;
                        fMyConns[b].destroy(); // NOTE: this will trigger an error on socket error listener...
                    }

                    wlog.info('  ...stopping logging in this file.');

                    // this marks socket as "authenticated"
                    socket.myObj.IDbase = dbIDbase;

                    // instantiate logger for this IDbase
                    socket.myObj.wlog = new (winston.Logger)({
                        transports: [
						  new (winston.transports.Console)(),
						  new (winston.transports.File)({ filename: './log/basesock/' + socket.myObj.IDbase + '.json' })
                        ]
                    });

                    socket.myObj.wlog.info('Base', baseid.toString('hex'), '(', socket.myObj.ip, ') authorized.');

                    // is other side forcing us to re-sync?
                    if (bp.getIsSync()) {
                        socket.myObj.TXbase = 0;
                        socket.myObj.wlog.info('  ...re-syncing TXbase to: 0.');
                    }
                    else {
                        socket.myObj.TXbase = dbTXbase;
                        socket.myObj.wlog.info('  ...re-loading TXbase:', dbTXbase);
                    }

                    var bpAns = new baseMessage();
                    bpAns.setIsNotification(true); // da ispostujemo protokol jer ne zahtjevamo ACK nazad
                    bpAns.setIsSystemMessage(true); // da ispostujemo protokol jer ovaj podatak nije od Klijenta nego od Servera
                    bpAns.setDataFromHexString('00'); // OK!

                    // should we force other side to re-sync?
                    if (result[0][0].oForceSync == 1) {
                        bpAns.setIsSync(true);
                        socket.myObj.wlog.info('  ...forcing Base to re-sync because I don\'t have anything pending for it.');
                    }

                    // answer but with default AES-128 key (all zeroes)
                    socket.write(bpAns.buildEncryptedMessage(new Buffer([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), socket.myObj.random16bytes), 'hex');

                    self.informMyClients(true);
                    Database.baseOnlineStatus(socket.myObj.IDbase, 1);

                    // something pending for Base? (oForceSync is 0 if there is something pending in DB)
                    if (result[0][0].oForceSync == 0) {
                        socket.myObj.wlog.info('  ...there is pending data for Base, starting sender...');
                        socket.startQueuedItemsSender();
                    }
                });
            }
        }
        else {
            socket.myObj.baseid = null;
            socket.myObj.IDbase = null;
            socket.myObj.aes128Key = null;

            wlog.info('Base', baseid.toString('hex'), 'authorization error, non-existing BaseID!');

            // log auth attempt
            Database.authBaseError(baseid.toString('hex'), socket.myObj.ip);

            var bpAns = new baseMessage();
            bpAns.setIsNotification(true); // da ispostujemo protokol jer ne zahtjevamo ACK nazad
            bpAns.setIsSystemMessage(true); // da ispostujemo protokol jer ovaj podatak nije od Klijenta nego od Servera
            bpAns.setDataFromHexString('01'); // ERROR! Wrong baseid provided

            // answer but with default AES-128 key (all zeroes)
            socket.write(bpAns.buildEncryptedMessage(new Buffer([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), socket.myObj.random16bytes), 'hex');
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
            "baseid": socket.myObj.baseid,
            "type": "base_connection_status",
            "connected": connected,
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
                socket.myObj.wlog.info('  ...sending Base connection status notification to IDclient=', IDclient, '...');
                fClientSockets[0].write(jsonPackageAsString + '\n', 'ascii'); // send right away
            }
            else if (fClientSockets.length > 1) {
                socket.myObj.wlog.info('  ...found more than one socket for IDclient=', IDclient, 'which is a pretty improbable situation!');
            }

        }
    });
};

module.exports = function (socket) {
    return new BaseSock(socket);
};
