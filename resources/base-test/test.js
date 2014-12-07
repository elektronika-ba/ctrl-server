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
var aes128Key = new Buffer([0x20,0x6a,0xad,0xf2,0x7b,0xfe,0xb3,0x31,0xd8,0xcb,0xb2,0x70,0xd3,0x7e,0x45,0x8b]);
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
        	0xaa, 0xcc, 0xa5, 0x39, 0xd1, 0x59, 0xa7, 0xca, 0x30, 0x0a, 0xee, 0x98, 0xde, 0xda, 0x7e, 0x93,
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
			console.log('RX:', bp.getBinaryPackage().toString('hex'));

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

				if(bp.getIsSync()) {
					TXserver = 0;
				}
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
						console.log('  ...system message received! Dont know what to do here...');
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
    bp.setData(new Buffer('ABCDEF','hex'));

    var aaa = bp.buildEncryptedMessage(aes128Key, crypto.randomBytes(16));

	console.log(aaa);
    client.write(aaa, 'hex');

    TXbase++;
}
