'use strict';

var tls = require('tls');
var fs = require('fs');
var sys = require('sys');
var net = require('net');

var clientMessage = require('../../js/messages/clientMessage');

var connectToVersion = 1;
var authToken = 'gln42XbaSAWBQlc9f2lGqHzX2SAsaE9gRnbHbcJTDulkHpkNgx';
var TXserver = 0;
var TXclient = 1;
var dataBuff = '';
var authorized = false; // not to be confused with tls authorization. this is CTRL authorization
var tmrSimulator = null;

// read TXserver from file to continue from where we stopped last time
// lets hope it reads before we connect bellow :)
fs.readFile('./TXserver.txt', function(err, data) {
	if(err) {
		console.log('No TXserver.txt file, will start from 0.');
		TXserver = 0;
	}
	else {
		TXserver = parseInt(data);
		console.log('Continuing TXserver:', TXserver);
	}
});

var sslOptions = {
    cert: fs.readFileSync('./ctrlba_cert.pem'),
    ca: fs.readFileSync('./ctrlba_cert.pem'),
    rejectUnauthorized: false
};

var client = this;

// Connect to TLS CTRL Server
client.socket = tls.connect(9000 + connectToVersion, 'ctrl.ba', sslOptions, function() {
    client.socket.setKeepAlive(true, 1000);

    if (client.socket.authorized) {
        console.log("Connected to TLS CTRL Server!");

        client.socket.setEncoding('ascii');

        doAuthorize(client.socket);
    }
    else {
        //Something may be wrong with your certificates
        console.log("Failed to auth TLS connection: ", client.socket.authorizationError);
        client.socket.end();
    }
});

client.socket.on('data', function (data) {
    dataBuff = dataBuff + data.replace(/\r/, '');
    onData();
});

function onData(socket) {
    var jsonData = null;

    if (dataBuff != null && dataBuff.indexOf('\n') > -1) {
        var jsonLines = dataBuff.split('\n');
        var oneJsonLine = jsonLines[0];
        dataBuff = dataBuff.slice(oneJsonLine.length + '\n'.length);

        try {
            jsonData = JSON.parse(oneJsonLine);
        } catch (err) {
            console.log('Error in onData() while parsing JSON:', oneJsonLine, 'Error:', err);
        }
    }
    else {
        return;
    }

    var cm = new clientMessage();
    cm.extractFrom(jsonData);

    if (cm.getIsExtracted()) {
        // handle received ACK
        if (cm.getIsAck()) {
            console.log('Processing Server\'s ACK for our TXclient:', cm.getTXsender());

            // nothing...
        }
        else {
            console.log('Processing Server\'s data...');

            // acknowledge immediatelly (but only if this is not a notification)
            var jsAck = new clientMessage();
            jsAck.setIsAck(true);
            jsAck.setTXsender(cm.getTXsender());

            if (!cm.getIsNotification()) {
                if (cm.getTXsender() <= TXserver) {
                    jsAck.setIsProcessed(false);
                    console.log('  ...Warning: re-transmitted command, not processed!');
                }
                else if (cm.getTXsender() > (TXserver + 1)) {
                    // SYNC PROBLEM! Client sent higher than we expected! This means we missed some previous Message!
                    // This part should be handled on Clients side.
                    // Client should flush all data (NOT A VERY SMART IDEA) and re-connect. Re-sync should naturally occur
                    // then in auth procedure as there would be nothing pending in queue to send to Server.

                    jsAck.setIsOutOfSync(true);
                    jsAck.setIsProcessed(false);
                    console.log('  ...Error: Server sent out-of-sync data! Expected:', (TXserver + 1), 'but I got:', cm.getTXsender());
                }
                else {
                    jsAck.setIsProcessed(true);
                    TXserver++; // next package we will receive should be +1 of current value, so lets ++

					fs.writeFile('TXserver.txt', TXserver, {'encoding': 'ascii'}, function (err) {
						if(err) {
							console.log('Local error: Could not save TXserver to file...');
						}
					});
                }

                client.socket.write(JSON.stringify(jsAck.buildMessage()) + '\n', 'ascii');
                console.log('  ...ACK sent back for TXsender:', cm.getTXsender());
            }
            else {
                jsAck.setIsProcessed(true); // we need this for bellow code to execute
                console.log('  ...didn\'t ACK because this was a notification.');
            }

            if (jsAck.getIsProcessed()) {
                // system messages are not forwarded to our Base
                if (cm.getIsSystemMessage()) {
                    console.log('  ...system message received!');

                    // we only get here when server replies to our authentication request

                    // is this a reply on our reply authorization request? (must be...)
                    if(!authorized) {
                        console.log('  ...got authorization reply.');
                        var authReply = cm.getData();
                        if("result" in authReply && authReply.result == 0 && "type" in authReply && authReply.type == 'authentication_response') {
                            authorized = true;
                            console.log('  ...CTRL Authorized: ', authReply.description);

                            if(cm.getIsSync()) {
                                console.log('  ...server wants us to re-sync!');
                                TXserver = 0;
                            }

                            // start a simulator that will send some stuff to Base
                            tmrSimulator = setInterval(simulator, 5000);
                        }
                        else {
							console.log('  ...Wrong auth code :(');
						}
                    }
                    // this is a system message we got since now we are logged in
                    else {
                        var msg = cm.getData();
                        // it must have "type" object
                        if("type" in msg) {
                            if(msg.type == 'base_connection_status') {
                                console.log('  ...Base connection status.');
                                var status = (msg.connected) ? 'Online' : 'Offline';
                                console.log('  ...Base', msg.baseid ,'is', status);
                            }
                        }
                    }
                }
                else {
                    console.log('  ...fresh data!');
                    console.log(cm.getData());

                    // do something with data we received from Server!
                } // not system message
            } // processed
        } // not an ACK

    }

    if (dataBuff.indexOf('\n') > -1) {
        onData();
    }
};

client.socket.on('error', function (err) {
    console.log("CLIENT ERROR: ", err);
});

function doAuthorize(socket) {
    if(!socket) {
        console.log("Error, socket disconnected!?");
        return;
    }

    console.log('Authorizing...');

    TXclient = 1; // we will re-sync the Server bellow
    var authCommand = { "header": {"sync": true}, "data": {"auth_token": authToken} };
    socket.write(JSON.stringify(authCommand) + '\n', 'ascii');
}

function simulator() {
    console.log('Sending data to all associated Bases on my CTRL account. TXsender:', TXclient);

    // Note: we can send data to a targeted Base, but lets send to all for this example...

	// synchronized message example
	/*
    var authCommand = { "header": {"notification": true}, "TXsender": TXclient, "data": "010203040506070809" };
    client.socket.write(JSON.stringify(authCommand) + '\n', 'ascii');
    TXclient++;
    */

    // notification message example
    var authCommand = { "header": {"notification": true}, "TXsender": 0, "data": "010203040506070809" };
    client.socket.write(JSON.stringify(authCommand) + '\n', 'ascii');
}
