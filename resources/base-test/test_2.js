'use strict';

var net = require('net');
var baseMessage = require('../../js/messages/baseMessage');
var crypto = require('crypto');

var HOST = '78.47.48.138'; // www.ctrl.ba
//var HOST = '127.0.0.1';
var PORT = 8001;

var authorized = false;
var TXserver = 0;
var TXbase = 1;
var tmrSimulator = null;
var aes128Key = new Buffer([0x06,0x2f,0x1c,0x1b,0x30,0xc5,0x3f,0xcd,0x51,0x17,0x5a,0x56,0x20,0x9d,0xf6,0x00]);
var authPhase = 1;
var client = new net.Socket();

client.connect(PORT, HOST, function () {
    console.log('Base connected to: ' + HOST + ':' + PORT);

    client.setKeepAlive(2500);

    // authorize now
    setTimeout(function () {
        // login
        var msg = new baseMessage();
        msg.setData(new Buffer([
        	0xd3,0xfe,0xf1,0x93,0x16,0x95,0x65,0x2b,0x73,0x3d,0xd9,0x30,0xad,0xda,0x3e,0xa0
        ]));
        var aaa = msg.buildEncryptedMessage(new Buffer([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), crypto.randomBytes(16));
        client.write(aaa, 'hex');
        console.log('< Sent auth request - Phase 1');
    }, 500);
});

// Add a 'data' event handler for the client socket. data is what the server sent to this socket
client.on('data', function (data) {
    var bp = new baseMessage();
    bp.extractFrom(data);
    if (!bp.getIsExtracted()) {
		console.log('%% nije extraktovan paket.');
	}
	else {
		bp.unpackAsEncryptedMessage(aes128Key);

		// parsing authorization communication?
		if(!authorized) {
			//console.log('RX:', bp.getBinaryPackage().toString('hex'));

			if(authPhase == 1) {
				// parse it
				var chall = new Buffer(16);
				bp.getData().copy(chall, 0);

				// send response to his challenge, which is just 16 random bytes followed by "chall" we got from Server
				var resp = new Buffer(32);

				// stupid random number generator for challenge value
				for(var i=0; i<4; i++) {
					var nr = Math.floor((Math.random() * 0xFFFFFFFF) + 1);
					resp.writeUInt32LE(nr, i*4);
				}

				chall.copy(resp, 16, 0);

				var msg = new baseMessage();
				msg.setIsSync(true); // Tell server to re-sync, we have nothing pending for him (in this example)
				msg.setData(resp);
				var aaa = msg.buildEncryptedMessage(aes128Key, crypto.randomBytes(16));
				client.write(aaa, 'hex');

				console.log('< Sent auth request - Phase 2');

				// now if socket doesn't get disconnected after a few seconds, we will get another message with NO data.
				// we should only see if there is SYNC set in Header so that we re-sync!

				authPhase++;
			}
			else if(authPhase == 2) {
				console.log('Authorized!');

				authorized = true;

				var keep = new baseMessage();
				keep.setIsSystemMessage(true);
				keep.setIsNotification(true);
				keep.setData(new Buffer('02','hex'));
				var aaa = keep.buildEncryptedMessage(aes128Key, crypto.randomBytes(16));
				client.write(aaa, 'hex');

				if(bp.getIsSync()) {
					TXserver = 0;
				}

                // start a simulator that will send some stuff to Clients
                tmrSimulator = setInterval(simulator, 10000);
			}
		}
		// not authentication communication
		else {
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
						console.log('  ...Error: Server sent out-of-sync data! Expected:', (TXserver + 1), 'but I got:', bp.getTXsender());
					}
					else {
						bpAck.setIsProcessed(true);
						TXserver++; // next package we will receive should be +1 of current value, so lets ++
					}

                    client.write(bpAck.buildEncryptedMessage(aes128Key, crypto.randomBytes(16)), 'hex');
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

						// lets see what we got here, it can be a server-stored-variable or timestamp.
						console.log(bp.getData()); // too lazy, just print it to console
					}
					else {
						console.log('  ...fresh data!');
						console.log(bp.getData());

						// do something with data we received from Server!
					} // not system message
				} // processed
			}
		} // not authentication communication
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
    bp.setTXsender(TXbase);
    bp.setData(new Buffer('ABCDEFABCDEFABCDEFABCDEFABCDEF','hex'));

    var aaa = bp.buildEncryptedMessage(aes128Key, crypto.randomBytes(16));

	console.log(aaa);
    client.write(aaa, 'hex');

    TXbase++;

	/*
    // request server-stored-variable
    var bp = new baseMessage();
    bp.setIsSystemMessage(true);
    bp.setIsNotification(true);
    //bp.setData(new Buffer('05AABBCCDD','hex'));
    bp.setData(new Buffer('06','hex'));
    var aaa = bp.buildEncryptedMessage(aes128Key, crypto.randomBytes(16));
    client.write(aaa, 'hex');
    console.log('> Variable Req sent.');
    */
}
