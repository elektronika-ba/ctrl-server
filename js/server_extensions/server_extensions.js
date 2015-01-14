'use strict';

// This will load all Server Extensions found in this directory.

var extensions = [];
require("fs").readdirSync('./server_extensions').forEach(function(file) {
    if(file == 'server_extensions.js') return;
    //console.log('EXT: Loading extension:', file);
    extensions.push(require('./' + file + '/index.js'));
});

exports.ext = function(functionName, params) {

	// for each loaded extension, call the appropriate function
    for(var i=0; i<extensions.length; i++) {

        if(!extensions[i].isEnabled()) continue;

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
