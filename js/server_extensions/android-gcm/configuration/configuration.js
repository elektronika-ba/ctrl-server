'use strict';

var Configuration = {

    // MySQL Database Name (The connection parameters are the same as for Server)
    //--------------------------
    mySQL: {
        DB: 'ctrl_1v0_ext_android_gcm',
    },

    // Google Cloud Messaging AUTH API KEY
    gcmApiKey: 'THIS IS TOP SECRET, MY FRIEND :)',

    gcmTimeToLive: 60*60*96, // 96 hours

};

module.exports = Configuration;
