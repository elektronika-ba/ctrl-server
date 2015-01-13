'use strict';

var extensions = [];
require("fs").readdirSync('./server_extensions').forEach(function(file) {
    if(file == 'server_extensions.js') return;
    extensions.push(require('./' + file));
});

exports.ext = function(functionName, params) {

	// for each loaded extension, call the appropriate function
    for(var i=0; i<extensions.length; i++) {

        if(functionName == 'onBaseMessage') {
            extensions[i].onBaseMessage(params);
        }
        else if(functionName == 'onBaseSystemMessage') {
            extensions[i].onBaseSystemMessage(params);
        }
        else if(functionName == 'onBaseStatusChange') {
            extensions[i].onBaseStatusChange(params);
        }
        else if(functionName == 'onClientSystemMessage') {
            extensions[i].onClientSystemMessage(params);
        }
        else if(functionName == 'onClientMessage') {
            extensions[i].onClientMessage(params);
        }
        else if(functionName == 'onClientStatusChange') {
            extensions[i].onClientStatusChange(params);
        }

    }

};
