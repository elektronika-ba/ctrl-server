'use strict';

// Creates a client socket connection to CTRL Server and enables sending&receiving messages

var util = require('util');
var EventEmitter = require("events").EventEmitter;
var tls = require('tls');

var TAG = "CtrlClient #";

var clientMessage = require('../../js/messages/clientMessage');

function CtrlClient(serverPort, serverName, sslOptions, logging) {
    this.clientSocket = null;
    this.serverPort = serverPort;
    this.serverName = serverName;
    this.logging = (logging || false);
    this.dataBuff = '';
    this.ctrlAuthorized = false;
    this.TXserver = 0; // for keeping track on what Server is sending us... stored on Server side for convenience!
    this.reconnectCount = 0;
    this.outOfSyncCount = 0;

    this.sslOptions = sslOptions;
    this.sessionOptions = null;

    EventEmitter.call(this);
}
util.inherits(CtrlClient, EventEmitter);

CtrlClient.prototype.connect = function(sessionOptions) {
    if(this.ctrlAuthorized) {
        if(this.logging) console.log(TAG, "Already connected and authorized.");
        return this;
    }

    this.sessionOptions = sessionOptions;
    this.reconnectCount = 0;

    return createSocketConnection(this);
};

var createSocketConnection = function (self) {
    self.reconnectCount++;
    self.ctrlAuthorized = false;

    self.clientSocket = tls.connect(self.serverPort, self.serverName, self.sslOptions, function() {
        this.setKeepAlive(true, 1000);

        if (this.authorized) {
            if(self.logging) console.log(TAG, "Connected to TLS CTRL Server!");
            self.reconnectCount = 0;
            this.setEncoding('ascii');

            ctrlAuthorize(self);
        }
        else {
            if(self.logging) console.log(TAG, "Failed to auth TLS connection:", this.authorizationError);
            self.emit('error', this.authorizationError);
            this.end();
        }
    });

    self.clientSocket.on('error', function (e) {
        // Reconnect automatically
        if (e.code == 'ECONNRESET' || e.code == 'ETIMEDOUT' || e.code == 'ECONNREFUSED') {
            if(self.sessionOptions.reconnectLimit == 0 || self.reconnectCount < self.sessionOptions.reconnectLimit) {
                self.ctrlAuthorized = false;

                setTimeout(function () {
                    if(self.logging) console.log(TAG, "Reconnecting automatically...");
                    createSocketConnection(self);
                }, 1000);
            }
            else {
                if(self.logging) console.log(TAG, "Reconnect limit exceeded, halting!");
            }
        }

        self.emit('error', e.code);
    });

    self.clientSocket.on('data', function (data) {
        self.dataBuff = self.dataBuff + data.replace(/\r/, '');
        parseDataBuff(self);
    });

    return self;
}

CtrlClient.prototype.disconnect = function(callback) {
    if(this.logging) console.log(TAG, "Disconnecting manually, will callback on END...");
    this.clientSocket.end();
    this.ctrlAuthorized = false;

    this.clientSocket.once('end', function() {
        if(callback)
            callback();
    });

    return this;
};

CtrlClient.prototype.sendString = function(dataString, baseIds, isNotification) {
    var dataHex = '';
    for (var i=0; i<dataString.length; i++) {
        dataHex += dataString.charCodeAt(i).toString(16);
    }
    return this.sendHex(dataHex, baseIds, isNotification);
};

CtrlClient.prototype.sendHex = function(dataHex, baseIds, isNotification) {
    if(!this.ctrlAuthorized) {
        return -1;
    }

    var message = {
        "header": {
            "notification": (!(!isNotification)),
        },
        "TXsender": this.sessionOptions.TXclient, // not important if it was notification, but doesn't hurt to be here
        "data": dataHex,
    };

    if(Array.isArray(baseIds)) {
        message['baseid'] = baseIds;
    }

    this.clientSocket.write(JSON.stringify(message) + '\n', 'ascii');

    if(!(!(!isNotification))) {
        this.sessionOptions.TXclient++;
    }

    return this.sessionOptions.TXclient-1;
};

CtrlClient.prototype.reconnect = function() {
    var self = this;

    if(this.logging) console.log(TAG, "Disconnecting manually, waiting for END...");
    this.clientSocket.end();
    this.ctrlAuthorized = false;

    this.clientSocket.once('end', function() {
        if(self.logging) console.log(TAG, "Reconnecting manually, END received.");
        createSocketConnection(self);
    });

    return this;
};

var processClientMessage = function (cm, self) {
    // Handle received ACK
    if (cm.getIsAck()) {

        self.emit('ack', cm.getTXsender(), cm.getIsOutOfSync(), cm.getIsProcessed());

        if (cm.getIsOutOfSync()) {
            if(self.logging) console.log(TAG, "ACKed but server told me OUT-OF-SYNC!");
            if (self.outOfSyncCount >= self.sessionOptions.outOfSyncLimit-1) {
                self.outOfSyncCount = 0;
                self.sessionOptions.TXclient = 1; // re-start

                if(self.logging) console.log(TAG, "Out-Of-Sync error, re-connecting the socket!");

                // re-connect socket
                self.reconnect();
            }
            else {
                self.outOfSyncCount++;
                if(self.logging) console.log(TAG, "Out-Of-Sync counter: " + self.outOfSyncCount + "/" + self.sessionOptions.outOfSyncLimit + "!");
            }
        }
    }
    else {
        // Acknowledge immediatelly (but only if this is not a notification)
        var jsAck = new clientMessage();
        jsAck.setIsAck(true);
        jsAck.setTXsender(cm.getTXsender());

        if (!cm.getIsNotification()) {
            if (cm.getTXsender() <= self.TXserver) {
                jsAck.setIsProcessed(false);
                if(self.logging) console.log(TAG, 'Warning: re-transmitted command, not processed!');
            }
            else if (cm.getTXsender() > (self.TXserver + 1)) {
                // SYNC PROBLEM! Client sent higher than we expected! This means we missed some previous Message!
                // This part should be handled on Clients side.
                // Client should flush all data (NOT A VERY SMART IDEA) and re-connect. Re-sync should naturally occur
                // then in auth procedure as there would be nothing pending in queue to send to Server.

                jsAck.setIsOutOfSync(true);
                jsAck.setIsProcessed(false);
                if(self.logging) console.log(TAG, 'Error: Server sent out-of-sync data! Expected:', (self.TXserver + 1), 'but I got:', cm.getTXsender());
            }
            else {
                jsAck.setIsProcessed(true);
                self.TXserver++; // next package we will receive should be +1 of current value, so lets ++

                // Save TXserver sequence on Server :)
                var ssTXserver = { 'TXserver': self.TXserver };
                jsAck.setDataAsObject(ssTXserver);
                jsAck.setIsSaveTXserver(true);
            }

            self.clientSocket.write(JSON.stringify(jsAck.buildMessage()) + '\n', 'ascii');
            if(self.logging) console.log(TAG, 'ACK sent back for TXsender:', cm.getTXsender());
        }
        else {
            jsAck.setIsProcessed(true); // we need this for bellow code to execute
            if(self.logging) console.log(TAG, 'Didn\'t ACK because this was a notification.');
        }

        if (jsAck.getIsProcessed()) {
            // system messages are not forwarded to our Base
            if (cm.getIsSystemMessage()) {
                if(self.logging) console.log(TAG, 'System message received!');

                var msg = cm.getData();
                // it must have "type" object
                if("type" in msg) {
                    if(msg.type == 'base_connection_status') {
                        self.emit('base_event', msg.baseid, msg.connected, msg.basename);
                    }
                }
            }
            else {
                if(self.logging) console.log(TAG, 'Fresh data!');

                var dataHex = cm.getData();
                var dataString = '';
                var dataHexBuff = new Buffer(dataHex, 'hex');
                for (var i=0; i<dataHexBuff.length; i++) {
                    dataString += String.fromCharCode(dataHexBuff[i]);
                }

                self.emit('base_data', cm.getBaseId(), cm.getIsNotification(), dataString, dataHex);
            } // not system message
        } // processed
    } // not an ACK
};

var parseDataBuff = function (self) {
    while(self.dataBuff != null && self.dataBuff.indexOf('\n') > -1) {
        var jsonLines = self.dataBuff.split('\n');
        var oneJsonLine = jsonLines[0];
        self.dataBuff = self.dataBuff.slice(oneJsonLine.length + '\n'.length);

        try {
            var jsonData = JSON.parse(oneJsonLine);

            var cm = new clientMessage();
            cm.extractFrom(jsonData);
            if (cm.getIsExtracted()) {
                if(self.ctrlAuthorized) {
                    processClientMessage(cm, self);
                }
                else {
                    processCtrlAuthResponse(cm, self);
                }
            }

        } catch (err) {
            if(self.logging) console.log(TAG, 'Error in parseDataBuff() while parsing JSON:', oneJsonLine, 'Error:', err);
        }
    }
};

var processCtrlAuthResponse = function (cm, self) {
    var data = cm.getData();

    if (("type" in data) && data.type == "authentication_response" && ("result" in data) && ("TXserver" in data)) {

        // authorized?
        if (data.result == 0) {
            self.ctrlAuthorized = true;

            if (cm.getIsSync()) {
                self.TXserver = 0;
            }
            else {
                // Read Server-Stored TXServer value Server is sending us
                self.TXserver = data.TXserver;
            }
        }

        self.emit('auth_response', data.result);
    }

};

var ctrlAuthorize = function (self) {
    var authCommand = {
        'header': {
            'sync': (self.sessionOptions.TXclient == 1)
        },
        'data': {
            'auth_token': self.sessionOptions.authToken
        }
    };

    self.clientSocket.write(JSON.stringify(authCommand) + '\n', 'ascii');
};

module.exports = CtrlClient;
