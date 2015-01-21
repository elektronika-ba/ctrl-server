'use strict';

// A way to enable/disable this Server Extension even when it is included in the /server_extensions/ directory
var EXTENSION_ENABLED = false;

var Configuration = require('./configuration/configuration');

var gcm = require('node-gcm');
var gcmsender = new gcm.Sender(Configuration.gcmApiKey);

var winston = require('winston');

// Logger
var wlog = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)(),
      // Logger is first loaded from ../../server.js so the path is relative to it!
      new (winston.transports.File)({ filename: './server_extensions/android-gcm/log/log.json' })
    ]
});

// Our custom Database functions
var Database = require('./database/database');

// Database functions borrowed from Server that we might need
//var ServerClientDatabase = require('../../database/clientdb');
//var ServerBaseDatabase = require('../../database/basedb');

// Entry points for this Server Extension
module.exports = {
    // Used by ../server_extensions.js
    isEnabled: function () {
        return EXTENSION_ENABLED;
    },

    // Base sent a System Message to Server. We can see what is sent here.
    onBaseSystemMessage: function (params) {
        // "params" contains:
        // params.IDbase -> sender of this message
        // params.baseid -> sender of this message
        // params.bp -> contents of the message
    },

    // Base sent a Message to Server which is forwarded to all associated Clients.
    // This function is called for each Client that is supposed to receive it.
    // Here we can see if it was forwarded to Client right now, or it is queued on Server.
    onBaseMessage: function (params) {
        // "params" contains:
        // params.IDbase -> sender of this message
        // params.baseid -> sender of this message
        // params.IDclient -> IDclient of Client who is supposed to receive this message from Base
        // params.sent -> boolean saying if this message is sent to Client
        // params.bp -> contents of the message as Base sent it (in baseMessage.js format)
        // params.cm -> contens of the message as is being forwarded to Client (in clientMessage.js format)
        // To check if this is a notification-type message, simply do: params.bp.getIsNotification()

        if (!params.sent) {

			Database.getBaseClientConfig(params.IDbase, params.IDclient, function (err, rows, columns) {
				if (err) {
					wlog.error("Database Error in getBaseClientConfig()!");
					return;
				}

				// If option is > 0 then it is disabled!
				if (rows[0].disable_new_data_event > 0) {
					wlog.info('Disabled New Message Android GCM to IDclient=', params.IDclient, 'for IDbase=', params.IDbase);
					return;
				}

				wlog.info('Sending New Message Android GCM to Client IDclient=', params.IDclient);

				var gcmmessage = new gcm.Message({
					collapseKey: 'tickle',
					delayWhileIdle: true,
					timeToLive: 3,
					data: { 'what': 'tickle-tickle', 'why': 'onBaseMessage', 'baseid': params.baseid.toString('hex') }
				});

				notifyClient(params.IDclient, gcmmessage);
			});
        }
    },

    // Base went offline or is now connected.
    // Here we can see if that notification was sent to Client or not because the Client is offline.
    onBaseStatusChange: function (params) {
        // "params" contains:
        // params.IDbase -> sender of this message
        // params.baseid -> sender of this message
        // params.IDclient -> IDclient of Client who is supposed to receive this notification
        // params.sent -> boolean saying if this message is sent to Client
        // params.connected -> boolean saying if Base is now connected or disconnected

        if (!params.sent) {
			Database.getBaseClientConfig(params.IDbase, params.IDclient, function (err, rows, columns) {
				if (err) {
					wlog.error("Database Error in getBaseClientConfig()!");
					return;
				}

				// If option is > 0 then it is disabled!
				if (rows[0].disable_status_change_event > 0) {
					wlog.info('Disabled Base Status Android GCM to IDclient=', params.IDclient, ' for IDbase=', params.IDbase);
					return;
				}

				wlog.info('Sending Base Status Android GCM to Client IDclient=', params.IDclient);

				var gcmmessage = new gcm.Message({
					collapseKey: 'tickle',
					delayWhileIdle: true,
					timeToLive: 3,
					data: { 'what': 'tickle-tickle', 'why': 'onBaseStatusChange', 'baseid': params.baseid.toString('hex'), 'connected': params.connected }
				});

				notifyClient(params.IDclient, gcmmessage);
			});
        }
    },

    // Client sent a System Message to Server. We can see what is sent here.
    onClientSystemMessage: function (params) {
        // "params" contains:
        // params.IDclient -> sender of this message
        // params.cm -> contents of the message

        var d = params.cm.getData();

        // Android Client sent us his Device RegId. Lets update it to Database
        if (("type" in d) && d.type == 'ext_android_gcm_myregid') {
            if (("regid" in d) && (typeof d.regid == "string")) {
                wlog.info("Adding/Updating Android regId:", d.regid, ", for IDclient=", params.IDclient);
                Database.updateAndroidRegId(params.IDclient, d.regid, function (err) {
                    if (err) {
                        wlog.error("Database Error in updateAndroidRegId()!");
                        return;
                    }
                });
            }
        }
    },

    // Client sent a Message to Server which is forwarded to all targeted Bases.
    // This function is called for each Base that is supposed to receive it.
    // Here we can see if it was forwarded to Base right now, or it is queued on Server.
    onClientMessage: function (params) {
        // "params" contains:
        // params.IDclient -> sender of this message
        // params.IDbase -> IDbase of Base who is supposed to receive this message from Client
        // params.baseid -> baseid of Base who is supposed to receive this message from Client
        // params.sent -> boolean saying if this message is sent to Base
        // params.cm -> contents of the message as Client sent it (in clientMessage.js format).
        // Note: there is no message in baseMessage.js format, but can be added if required.
        // To check if this is a notification-type message, simply do: params.cm.getIsNotification()
    },

    // Client went offline or is now connected.
    onClientStatusChange: function (params) {
        // "params" contains:
        // params.IDclient -> sender of this message
        // params.connected -> boolean saying if Client is now connected or disconnected
    }
};

// Private functions of this Extension
function notifyClient(IDclient, gcmmessage) {

    // Get regId of this IDclient
    Database.getClientRegId(IDclient, function (err, rows, columns) {
        if (err) {
            wlog.error("Database Error in getClientsRegId()!");
            return;
        }

        // No Android regId for this Client? Maybe he is not Android Client after all...
        if (rows.length <= 0) {
            return;
        }

        // We get just one record for each IDclient...
        // Note: It would be best if we could send just one GCM request for each Client that will
        // receve this notification, but we get called for each Client so this is not possible.
        // It can be made possible but then we would need to check wether each Client is actually
        // connected to Server or not, and then make a decision to send or not to send him a GCM.
        // Maybe it should be done that way... TODO!

        var regids = [
        	rows[0].regid.toString()
        ];

        // Params: message-literal, registrationIds-array, No. of retries, callback-function
        gcmsender.send(gcmmessage, regids, 3, function (err, result) {
            if (err) {
                wlog.error('Error in gcmsender.send()', err, result);
                return;
            }

            wlog.info('GCM Request OK, handling response...');

            for (var i = 0; i < result.results.length; i++) {
                if (result.results[i].error == 'InvalidRegistration' || result.results[i].error == 'MissingRegistration') {
                    wlog.info('GCM said', result.results[i].error, ', will delete Android regId:', regids[i].toString());

                    Database.deleteAndroidDevice(regids[i], function (err, result) {
                        if (err) {
                            wlog.error("Database Error in deleteAndroidDevice()!");
                            return;
                        }
                    });
                }

                if (("registration_id" in result.results[i])) {
                    Database.changeAndroidRegId(result.results[i].registration_id, regids[i], function (err, result) {
                        if (err) {
                            wlog.error("Database Error in changeAndroidRegId()!");
                            return;
                        }
                    });
                }
            }
        });

    });
}
