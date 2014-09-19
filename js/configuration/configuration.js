'use strict';

var Configuration = {

    version: 0,                             // only whole numbers here! this increases the port number for both base and client sockets!

    // MySQL Database Connection
    //--------------------------
    mySQL: {
        HOST: '127.0.0.1',
        USER: 'root',
        PASS: '',
        DB: 'ctrl_0v4',
    },

    // Base Socket Server related
    //-----------------------------
    base: {
        // Server Setup
        srv: {
            PORT: 8000,                     // starting port number. actual port number is this value + version!
            MAX_CONN: 1000,
        },

        // Socket Setup
        sock: {
            KEEPALIVE_MS: 5000,    			// keep-alive connection timeout
            AUTH_TIMEOUT_MS: 0,             // authorization timeout after connection establishment (0 disables timeout)
            SENDER_TASK_MS: 500,            // task that writes data to Base on socket (timer exists only because we don't want to flush Base with pending data all at once)
            ON_DATA_THROTTLING_MS: 50,      // throttling of received commands

            MAX_AUTH_ATTEMPTS: 5,			// how many failed auth attempts are allowed?
            MAX_AUTH_ATTEMPTS_MINUTES: 5,	// ...in this duration (minutes)?

            BACKOFF_MS: 3000,				// initial backoff period (milliseconds) - will increment by *2 on each successive backoff reply from Base

            OUT_OF_SYNC_CNT_MAX: 5,         // how many out of sync messages should we receive before flushing the txserver2base queue and dropping the connection?
        },
    },

    // Client Socket Server related
    //-----------------------------
    client: {
        // Server Setup
        srv: {
            PORT: 9000,                     // starting port number. actual port number is this value + version!
            MAX_CONN: 3000,
        },

        // Socket Setup
        sock: {
            KEEPALIVE_MS: 10000,   			// keep-alive connection timeout
            AUTH_TIMEOUT_MS: 5000,          // authorization timeout after connection establishment
            SENDER_TASK_MS: 500,            // task that writes data to Client on socket (timer exists only because we don't want to flush Client with pending data all at once)
            ON_DATA_THROTTLING_MS: 100,     // throttling of received commands

            MAX_AUTH_ATTEMPTS: 10,			// how many failed auth attempts are allowed?
            MAX_AUTH_ATTEMPTS_MINUTES: 5,	// ...in this duration (minutes)?

            OUT_OF_SYNC_CNT_MAX: 5,         // how many out of sync messages should we receive before flushing the txserver2client queue and dropping the connection?
        },
    },

};

module.exports = Configuration;
