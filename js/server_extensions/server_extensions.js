'use strict';

var extensions = [];
require("fs").readdirSync('./server_extensions').forEach(function(file) {
    if(file == 'server_extensions.js') return;
    extensions.push(require('./' + file));
});

exports.exec = function(functionName, params) {
    for(var i=0; i<extensions.length; i++) {
        if(functionName == 'onBaseReceive') {
            extensions[i].onBaseReceive(params);
        }
        else if(functionName == 'onBaseStatusChange') {
            extensions[i].onBaseStatusChange(params);
        }
        else if(functionName == 'onClientReceive') {
            extensions[i].onClientReceive(params);
        }
        else if(functionName == 'onClientStatusChange') {
            extensions[i].onClientStatusChange(params);
        }
    }
};
