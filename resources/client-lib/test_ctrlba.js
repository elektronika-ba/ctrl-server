'use strict';

var tls = require('tls');
var fs = require('fs');

var sslOptions = {
    cert: fs.readFileSync('./cert/ctrlba_cert.pem'),
    ca: fs.readFileSync('./cert/ctrlba_cert.pem'),
    rejectUnauthorized: false
};

var CtrlClient = require('./client-lib');

var ctrlClient = new CtrlClient(9001, 'ctrl.ba', sslOptions, false);

var sessionOptions = {
    'authToken': 't8wxTwpXmQwz3PGWCyMQQE8gKTYPkfHEd54YriKEZ86SMCEf3i',
    'TXclient': 1, // starting sequence, will be incremented within the library
    'reconnectLimit': 0, // 0 = infinity
    'outOfSyncLimit': 3,
};
ctrlClient.connect(sessionOptions);

ctrlClient.on('auth_response', function(response) {
    if(response == 0) {
        console.log('AUTHORIZED TO CTRL!');
    }
    else if(response == 1) {
        console.log('ERR, WRONG AUTH TOKEN. OFFLINE.');
    }
    else if(response == 2) {
        console.log('ERR, TOO MANY AUTH ATTEMPTS. OFFLINE.');
    }
});

ctrlClient.on('base_event', function(baseId, connected, baseName) {
    console.log('BASE EVENT:', baseId, 'is:', connected, 'named:', baseName);
});

ctrlClient.on('base_data', function(baseId, isNotification, dataString, dataHex) {
    console.log('BASE DATA:', dataString, '(0x', dataHex, '), got from:', baseId);
});

ctrlClient.on('ack', function(TXclient, outOfSync, processed) {
    if(outOfSync) {
        console.log('OUT OF SYNC for', TXclient);
    }
    else if(!processed) {
        console.log('NOT PROCESSED BY SERVER (RETANSMISSION)');
    }
    else {
        console.log('ACK for TXclient:', TXclient);
    }
});

ctrlClient.on('error', function(error) {
    console.log('SOCKET ERROR:', error);
});

// sending task...
var sender = setInterval(function() { //000000000000FFFF, lampa: 0013A20040B35BCF, mali: 0013A20040B82524
	// 8 ABCDEF01 001 005 0013A20040B3243A 0950 0500 0
    var TXclient = ctrlClient.sendString("0013A20040B35BCF4003000\r"); // OFF
    //var TXclient = ctrlClient.sendString("0013A20040B35BCF4102000\r"); // ON
    //var TXclient = ctrlClient.sendString("000000000000FFFF8ABCDEF010010050013A20040B3243A095005000\r"); // SETUP ALL LAMPS - BROADCAST SETUP

    if(TXclient > 0) {
        console.log('SENT WITH TXclient:', TXclient);
        // we will get ACK event on this TXclient value when Server ACKs
        // and if we didn't sent a notification! we know that...
    }
    else {
        console.log('DIDNT SEND DATA :(');
    }

}, 5000);

/*
var sender2 = setInterval(function() {
    var TXclient = ctrlClient.sendString("000000000000FFFF4005120\r");

    if(TXclient > 0) {
        console.log('SENT WITH TXclient:', TXclient);
        // we will get ACK event on this TXclient value when Server ACKs
        // and if we didn't sent a notification! we know that...
    }
    else {
        console.log('DIDNT SEND DATA :(');
    }

}, 7500);
*/
/*
// task to kill app after some time...
setTimeout(function() {
        console.log('DISCONNECTING :)');
        clearTimeout(sender);

        // bye bye...
        ctrlClient.disconnect(function() {
            console.log('DISCONNECTED! BYE...');
        });
}, 10000);
*/
