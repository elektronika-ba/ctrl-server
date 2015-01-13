'use strict';

var baseMessage = require('../../messages/baseMessage');
var clientMessage = require('../../messages/clientMessage');

module.exports = {
  onBaseReceive: function(params) {
    // todo
    // params.IDbase, params.baseid, params.bp
    // console.log(params.IDbase, params.baseid, params.bp);
  },

  onBaseStatusChange: function(params) {
    // todo
    // params.IDbase, params.baseid, params.connected
  },

  onClientReceive: function(params) {
    // todo
    // params.IDclient, params.bp
  },

  onClientStatusChange: function(params) {
    // todo
    // params.IDclient, params.connected
  }
};
