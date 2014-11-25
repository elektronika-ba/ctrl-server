'use strict';

var net = require('net');
var baseMessage = require('../../js/messages/baseMessage');

//var HOST = '78.47.48.138';
var HOST = '127.0.0.1';
var PORT = 8001;

var authorized = false;
var TXserver = 0;
var TXbase = 1;
var tmrSimulator = null;

var client = new net.Socket();

client.connect(PORT, HOST, function () {
    console.log('Base connected to: ' + HOST + ':' + PORT);

    client.setKeepAlive(2500);

    // authorize now
    setTimeout(function () {
        // login
        var msg = new baseMessage();
        msg.setHasSync(true);
        msg.setData(new Buffer([0xaa, 0xcc, 0xa5, 0x39, 0xd1, 0x59, 0xa7, 0xca, 0x30, 0x0a, 0xee, 0x98, 0xde, 0xda, 0x7e, 0x92]));
        //msg.setData(new Buffer([0x39, 0x87, 0xa6, 0x30, 0x09, 0x79, 0x5b, 0xe8, 0x1f, 0xc9, 0x3e, 0xd3, 0x28, 0x52, 0xf8, 0xed]));
        client.write(msg.buildPackage(), 'hex');
        console.log('< Sent auth request');
    }, 500);
});

// Add a 'data' event handler for the client socket. data is what the server sent to this socket
client.on('data', function (data) {
    var bp = new baseMessage();
    bp.extractFrom(data);

    if (bp.getIsExtracted()) {

        if (bp.getIsAck()) {
            console.log('> Got ACK, header:', bp.getHeader(), 'TXsender:', bp.getTXsender());
        }
        else {
            console.log('> Got DATA, header:', bp.getHeader(), 'TXsender:', bp.getTXsender());

            // acknowledge immediatelly (but only if this is not a notification)
            var bpAck = new baseMessage();
            bpAck.setIsAck(true);
            bpAck.setTXsender(bp.getTXsender());

            // not a notification? ACKnowledge
            if(!bp.getIsNotification()) {
                if (bp.getTXsender() <= TXserver) {
                    bpAck.setIsProcessed(false);
                    console.log('  ...Warning: re-transmitted command, not processed!');
                }
                else if (bp.getTXsender() > (TXserver + 1)) {
                    // SYNC PROBLEM! Client sent higher than we expected! This means we missed some previous Message!
                    // This part should be handled on Clients side.
                    // Client should flush all data (NOT A VERY SMART IDEA) and re-connect. Re-sync should naturally occur
                    // then in auth procedure as there would be nothing pending in queue to send to Server.

                    bpAck.setIsOutOfSync(true);
                    bpAck.setIsProcessed(false);
                    console.log('  ...Error: Server sent out-of-sync data! Expected:', (TXserver + 1), 'but I got:', cm.getTXsender());
                }
                else {
                    bpAck.setIsProcessed(true);
                    TXserver++; // next package we will receive should be +1 of current value, so lets ++
                }

                client.write(bpAck.buildPackage(), 'hex');
                console.log('  ...ACK sent back for TXsender:', bp.getTXsender());
            }
            else {
                bpAck.setIsProcessed(true); // we need this for bellow code to execute
                console.log('  ...didn\'t ACK because this was a notification.');
            }

            if (bpAck.getIsProcessed()) {
                // system messages from Server?
                if (bp.getIsSystemMessage()) {
                    console.log('  ...system message received!');

                    // we only get here when server replies to our authentication request

                    // is this a reply on our reply authorization request? (must be...)
                    if(!authorized) {
                        console.log('  ...got authorization reply.');
                        var authReply = bp.getData();

                        if(authReply.readUInt8(0) == 0) {
                            console.log('  ...CTRL Authorized!');
                            authorized = true;

                            // start a simulator that will send some stuff to all Clients
                            tmrSimulator = setInterval(simulator, 5000);

                            if(bp.getHasSync()) {
                                console.log('  ...server wants us to re-sync!');
                                TXserver = 0;
                            }
                        }
                        else {
                            console.log('  ...CTRL Authorization FAILED!');
                        }
                    }
                    // this is a system message we got since now we are logged in
                    else {
                        console.log('Error: System messages not implemented on base while logged in!');
                    }
                }
                else {
                    console.log('  ...fresh data!');
                    console.log(bp.getData());

                    // do something with data we received from Server!
                } // not system message
            } // processed
        }
    }
    else {
        console.log('%% nije extraktovan paket.');
    }

    // Close the client socket completely
    //client.destroy();
});

// Add a 'close' event handler for the client socket
client.on('close', function () {
    console.log('Connection closed');
});

client.on('error', function (err) {
    console.log('Socket error: ', err);
});

function simulator() {
    console.log('Sending data to all associated Clients on my CTRL account. TXsender:', TXbase);

    var bp = new baseMessage();

    var TXsender = new Buffer(4);
    TXsender.writeUInt32BE(TXbase, 0);
    bp.setTXsender(TXsender);

    bp.setData(new Buffer('ABCDEF','hex'));

    client.write(bp.buildPackage(), 'hex');

    TXbase++;
}
