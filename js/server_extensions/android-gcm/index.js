'use strict';

var baseMessage = require('../../messages/baseMessage');
var clientMessage = require('../../messages/clientMessage');

module.exports = {
	// Base sent a System Message to Server. We can see what is sent here.
	onBaseSystemMessage: function(params) {
		// "params" contains:
		// params.IDbase -> sender of this message
		// params.baseid -> sender of this message
		// params.bp -> contents of the message
	},

	// Base sent a Message to Server which is forwarded to all associated Clients.
	// Here we can see if it was forwarded to Client right now, or it is queued on Server.
	onBaseMessage: function(params) {
		// "params" contains:
		// params.IDbase -> sender of this message
		// params.baseid -> sender of this message
		// params.IDclient -> IDclient of Client who is supposed to receive this message from Base
		// params.sent -> boolean saying if this message is sent to Client
		// params.bp -> contents of the message

		// To check if this is a notification-type message, simply do: params.bp.getIsNotification()

		if(!params.sent) {
			console.log('EXT:', 'Sending New Message Android GCM to Client IDclient=', params.IDclient);
		}
	},

	// Base went offline or is now connected.
	// Here we can see if that notification was sent to Client or not because the Client is offline.
	onBaseStatusChange: function(params) {
		// "params" contains:
		// params.IDbase -> sender of this message
		// params.baseid -> sender of this message
		// params.IDclient -> IDclient of Client who is supposed to receive this notification
		// params.sent -> boolean saying if this message is sent to Client
		// params.connected -> boolean saying if Base is now connected or disconnected

		if(!params.sent) {
			console.log('EXT:', 'Sending Base Status Android GCM to Client IDclient=', params.IDclient);
		}
	},

	// Client sent a System Message to Server. We can see what is sent here.
	onClientSystemMessage: function(params) {
		// "params" contains:
		// params.IDclient -> sender of this message
		// params.cm -> contents of the message
	},

	onClientMessage: function(params) {
		// "params" contains:
		// params.IDclient -> sender of this message
		// params.IDbase -> IDbase of Base who is supposed to receive this message from Client
		// params.baseid -> baseid of Base who is supposed to receive this message from Client
		// params.sent -> boolean saying if this message is sent to Base
		// params.cm -> contents of the message

		// To check if this is a notification-type message, simply do: params.cm.getIsNotification()
	},

	// Client went offline or is now connected.
	onClientStatusChange: function(params) {
		// "params" contains:
		// params.IDclient -> sender of this message
		// params.connected -> boolean saying if Client is now connected or disconnected
	}
};
