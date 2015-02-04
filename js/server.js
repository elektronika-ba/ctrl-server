'use strict';

// Base's and Client's server
var start_stamp = Math.round(new Date() / 1000);

var Configuration = require('./configuration/configuration');

var tls = require('tls');
var fs = require('fs');
var net = require('net');
var winston = require('winston');
var crypto = require('crypto');
var http = require('http');

// Reset Online status for everyone
var Database = require('./database/database');
Database.resetOnlineStatusForClients();
Database.resetOnlineStatusForBases();

// Array of connected Bases and Clients (sockets)
var connBases = [];
var connClients = [];
exports.connBases = connBases;
exports.connClients = connClients;

// Global exported logger until Base/Client authenticates
var wl = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)(),
      new (winston.transports.File)({ filename: './log/server.json' })
    ]
});
exports.wl = wl;

var ClientSock = require('./sockets/clientsock');
var BaseSock = require('./sockets/basesock');

// Base's server
var srvBase = net.createServer(BaseSock)
	.on('listening', function () {
	    wl.info("Base's Server listening on port: %d.", Configuration.base.srv.PORT + Configuration.version);
	})
	.on('error', function (e) {
	    if (e.code == 'EADDRINUSE') {
	        wl.error("Base's Server address in use, retrying in 1sec...");
	        setTimeout(function () {
	            try {
	                srvBase.close();
                    srvBase.listen(Configuration.base.srv.PORT + Configuration.version); // GO AGAIN!
	            } catch (err) {
	                wl.error("Couldn't restart Base's server:", err);
	            }
	        }, 1000);
	    }
	});
srvBase.maxConnections = Configuration.base.srv.MAX_CONN;
wl.info("Base's Server is starting...");
srvBase.listen(Configuration.base.srv.PORT + Configuration.version); // GO!

// Client's server
var sslOptions = {
    key: fs.readFileSync('./sockets/server.key'),
    cert: fs.readFileSync('./sockets/cert.pem'),
    rejectUnauthorized: false
};

var srvClient = tls.createServer(sslOptions, ClientSock)
	.on('listening', function () {
        wl.info("Client's Server listening on port: %d.", Configuration.client.srv.PORT + Configuration.version);
	})
	.on('error', function (e) {
	    if (e.code == 'EADDRINUSE') {
	        wl.error("Client's Server address in use, retrying in 1sec...");
	        setTimeout(function () {
	            try {
	                srvClient.close();
                    srvClient.listen(Configuration.client.srv.PORT + Configuration.version); // GO AGAIN!
	            } catch (err) {
	                wl.error("Couldn't restart Client's server:", err);
	            }
	        }, 1000);
	    }
	});
srvClient.maxConnections = Configuration.client.srv.MAX_CONN;
wl.info("Client's Server is starting...");
srvClient.listen(Configuration.client.srv.PORT + Configuration.version); // GO!

// All further work is done in BaseSock and ClientSock .js files

// Tiny Status Server
wl.info("Tiny Status Server is starting...");
var tinyStatusServer = http.createServer(function(request, response) {
    console.log("Status Server http request...");
    response.writeHeader(200, {"Content-Type": "text/plain"});

    var answer = {
        'uptime_seconds': Math.round(new Date() / 1000) - start_stamp,
        'online_bases': connBases.length,
        'online_clients': connClients.length,
    };

    response.write(JSON.stringify(answer));
    response.end();
}).listen(Configuration.tinyStatusServer.PORT + Configuration.version);
tinyStatusServer.on('listening', function () {
    wl.info("Tiny Status Server listening on port: %d.", Configuration.tinyStatusServer.PORT + Configuration.version);
});
