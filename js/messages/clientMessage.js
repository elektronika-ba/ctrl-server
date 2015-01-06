'use strict';

/*
    JSON message for communication between "Client <-> Server"
*/

function clientMessage() {
    this.jsonData = {
        "header": {
            "ack": false,
            "sync": false,
            "processed": false,
            "out_of_sync": false,
            "notification": false,
            "system_message": false,
            "backoff": false,
        },

        "TXsender": 0,

        "baseid": [],

        "data": {}, // changed from null to {} on 25-11-2014
    };

    this.isExtracted = false;
}

clientMessage.prototype.buildMessage = function () {
    return this.jsonData;
};

clientMessage.prototype.extractFrom = function (jd) {
    if (jd == null || !jd || jd == null || (typeof jd != "object")) {
        this.isExtracted = false;
        console.log('Warning in extractFrom(), provided parameter is not an object!');
    }
    else {
        if (!("header" in jd) || (typeof jd.header != "object")) {
            jd.header = {};
        }

        var harr = ["ack", "sync", "processed", "out_of_sync", "notification", "system_message", "backoff"];
        for (var aim = 0; aim < harr.length; aim++) {
            if ((harr[aim] in jd.header) && (typeof jd.header[harr[aim]] == "boolean")) {
                this.jsonData.header[harr[aim]] = jd.header[harr[aim]];
            }
        }

        if (("TXsender" in jd) && (typeof jd.TXsender == "number")) {
            this.jsonData.TXsender = jd.TXsender;
        }
        else {
            console.log('Warning in extractFrom(), extracted TXsender is not a number! Using default.');
        }

        if (("baseid" in jd) && (typeof jd.baseid == "string")) {
            this.jsonData.baseid = [jd.baseid];
        }
        else if (("baseid" in jd) && (Array.isArray(jd.baseid))) {
            this.jsonData.baseid = jd.baseid;
        }

        if (("data" in jd) && ((typeof jd.data == "string") || (typeof jd.data == "object"))) {
            this.jsonData.data = jd.data;
        }
        /*else {
            console.log('Warning in extractFrom(), extracted Data is not a String nor Object! Using default.');
        }*/

        this.isExtracted = true;
    };
}

clientMessage.prototype.getIsExtracted = function () {
    return this.isExtracted;
};


clientMessage.prototype.setIsAck = function (is) {
    this.jsonData.header.ack = is;
};

clientMessage.prototype.getIsAck = function () {
    return this.jsonData.header.ack;
};


clientMessage.prototype.setIsSystemMessage = function (is) {
    this.jsonData.header.system_message = is;
};

clientMessage.prototype.getIsSystemMessage = function () {
    return this.jsonData.header.system_message;
};


clientMessage.prototype.setIsSync = function (is) {
    this.jsonData.header.sync = is;
};

clientMessage.prototype.getIsSync = function () {
    return this.jsonData.header.sync;
};


clientMessage.prototype.setIsProcessed = function (is) {
    this.jsonData.header.processed = is;
};

clientMessage.prototype.getIsProcessed = function () {
    return this.jsonData.header.processed;
};


clientMessage.prototype.setIsOutOfSync = function (is) {
    this.jsonData.header.out_of_sync = is;
};

clientMessage.prototype.getIsOutOfSync = function () {
    return this.jsonData.header.out_of_sync;
};


clientMessage.prototype.setIsNotification = function (is) {
    this.jsonData.header.notification = is;
};

clientMessage.prototype.getIsNotification = function () {
    return this.jsonData.header.notification;
};


clientMessage.prototype.setTXsender = function (txs) {
    if (typeof txs == 'number') {
        this.jsonData.TXsender = txs;
    }
    else {
        console.log('Warning in clientMessage(), provided TXsender is not a number!');
    }
};

clientMessage.prototype.getTXsender = function () {
    return this.jsonData.TXsender;
};

clientMessage.prototype.setBaseId = function (baseid) {
    if (typeof baseid == 'string') {
        this.jsonData.baseid = [baseid];
    }
    else if (Array.isArray(baseid)) {
        this.jsonData.baseid = baseid;
    }
    else {
        console.log('Warning in clientMessage(), provided baseid is not a string!');
    }
};

clientMessage.prototype.getBaseId = function () {
    return this.jsonData.baseid;
};

clientMessage.prototype.setData = function (ct) {
    if (typeof ct == 'string') {

        try {
            new Buffer(ct, 'hex');
        } catch (err) {
            console.log('Warning in clientMessage(), provided Data is not a hexadecimal string!');
            return;
        }

        this.jsonData.data = ct;
    }
    else {
        console.log('Warning in clientMessage(), provided Data is not a string!');
    }
};

clientMessage.prototype.setDataAsObject = function (ct) {
    if (typeof ct == 'object') {
        this.jsonData.data = ct;
    }
    else {
        console.log('Warning in clientMessage(), provided Data is not na object!');
    }
};

clientMessage.prototype.getData = function () {
    return this.jsonData.data;
};

module.exports = clientMessage;
