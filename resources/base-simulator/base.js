'use strict';

var net = require('net');
var baseMessage = require('../../js/messages/baseMessage');

//var HOST = '78.47.48.138';
var HOST = '127.0.0.1';
var PORT = 8000;

var client = new net.Socket();

client.connect(PORT, HOST, function () {
    console.log('CONNECTED TO: ' + HOST + ':' + PORT);

    client.setKeepAlive(5000);

    setTimeout(function () {
        // login
        var msg = new baseMessage();
        msg.setHasSync(true);
        //
        //msg.setData(new Buffer([0xaa, 0xcc, 0xa5, 0x39, 0xd1, 0x59, 0xa7, 0xca, 0x30, 0x0a, 0xee, 0x98, 0xde, 0xda, 0x7e, 0x92]));
        msg.setData(new Buffer([0x39, 0x87, 0xa6, 0x30, 0x09, 0x79, 0x5b, 0xe8, 0x1f, 0xc9, 0x3e, 0xd3, 0x28, 0x52, 0xf8, 0xed]));
        client.write(msg.buildPackage(), 'hex');
        console.log('< Sent auth request');
    }, 500);

    /*
	setTimeout( function() {
		// send delivery report
		var msg = new Buffer([0,11, 0,1, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 1]);
    	client.write( msg );
    	console.log('poslao delivery report');
	}, 5000);
	*/
/*
    setTimeout(function () {
        // send new data from some node 1/1

        // data from 1/1 node
        var msg = new baseMessage();
        msg.setTXsender(new Buffer([0, 0, 0, 1]));
        msg.setCommandType(baseCommandType.REMOTE);
        msg.setCommand(new Buffer([0x01, 0x01, 0x01, 0x01,0x02,0x03,0x04]));
        client.write(msg.buildPackage(), 'hex');
        console.log('< Sent high priority REMOTE command, TXbase: 1');

    }, 4000);
*/

/*
    setTimeout(function () {
        // send new data from some node 1/1

        // data from 1/1 node
        var msg = new baseMessage();
        msg.setTXsender(new Buffer([0, 0, 0, 2]));
        msg.setCommandType(baseCommandType.REMOTE);
        msg.setCommand(new Buffer([1, 1, 0x01, 1,2,3,4]));
        client.write(msg.buildPackage(), 'hex');
        console.log('< Sent high priority REMOTE command, TXbase: 2');

    }, 6000);
*/
});

// Add a 'data' event handler for the client socket
// data is what the server sent to this socket
client.on('data', function (data) {
    var bp = new baseMessage();
    bp.extractFrom(data);

    if (bp.getIsExtracted()) {

        if (bp.getIsAck()) {
            console.log('> Got ACK, header:', bp.getHeader(), 'TXsender:', bp.getTXsender());
        }
        else {
            console.log('> Got DATA, header:', bp.getHeader(), 'TXsender:', bp.getTXsender());
            /*// send ACK
            var ack = new baseMessage();
            ack.setIsAck(true);

						// simuliraj pun buffer na bazi
						if(bp.getCommandType() == baseCommandType.REMOTE)
						{
							//ack.setBackoff(true);
						}

            ack.setTXsender(bp.getTXsender());

            if (bp.getCommandType() != baseCommandType.AUTH) {
                client.write(ack.buildPackage(), 'hex');
                console.log('< Sent ACK back, id:', ack.getTXsender());
            }

            console.log('> Got Command (TXsender:', bp.getTXsender(), ')', 'type:', bp.getCommandType());
            console.log('  command: ', bp.getCommand());*/
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

client.on('error', function () {
    console.log('SOCKET ERRRRR MAN!');
});