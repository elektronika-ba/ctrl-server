'use strict';

/*
    Binary message for communication between "Base <-> Server"
    <MESSAGE_LEN_2bytes><HEADER_1byte><TX_of_whoever_sends_4bytes><DATA>
*/

var HEADER_SYNC = 0x01; // should other side sync to 0?
var HEADER_ACK = 0x02; // this packet IS ack
var HEADER_PROCESSED = 0x04; // this packet is processed on the other side (not ignored because ID is the same as the previous one received)
var HEADER_OUT_OF_SYNC = 0x08; // if the originator of this package is out of sync?
var HEADER_NOTIFICATION = 0x10; // is notification required with this message (only used if this is not an ACK)
var HEADER_SYSTEM_MESSAGE = 0x20; // is this a system message? (not to be forwarded to Client, or sending a system message to Base)
var HEADER_BACKOFF = 0x40; // if receiver can't buffer anymore data (including the data he is acknowledging to) from sender, he will acknowledge with this bit set

function baseMessage() {
    this.binaryPackage = null;

    this.header = null;
    this.TXsender = null;
    this.data = new Buffer(0);

    this.isExtracted = false;
}

baseMessage.prototype.extractFrom = function (binaryPackage) {
    this.isExtracted = false;

    if (!binaryPackage) {
        return;
    }

    this.binaryPackage = binaryPackage;

    if (binaryPackage.length < 2) {
        return;
    }

    var packageLength = binaryPackage.readUInt16BE(0);

    if (binaryPackage.length < (packageLength + 2)) {
        return;
    }

    // minimum length of entire package is <MSG_LEN_2bytes>+<HEADER_1byte>+<TX_of_whoever_sends_4bytes>
    if (binaryPackage.length < 7) {
        console.log('Warning in baseMessage(), attempt to extract from incomplete binary package.');
        return;
    }

    this.header = binaryPackage.readUInt8(2);
    this.TXsender = new Buffer(4);
    binaryPackage.copy(this.TXsender, 0, 3, 7);

    this.isExtracted = true;

    // has data?
    if (binaryPackage.length > 7) {
        this.data = new Buffer(packageLength - 5);
        binaryPackage.copy(this.data, 0, 7);
    }
};

// getters
baseMessage.prototype.getBinaryPackage = function () {
    return this.binaryPackage;
};

baseMessage.prototype.getIsExtracted = function () {
    return this.isExtracted;
};

baseMessage.prototype.getHeader = function () {
    return this.header;
};

baseMessage.prototype.getTXsender = function () {
    if (this.TXsender === null) {
        return new Buffer(4);
    }

    return this.TXsender;
};

baseMessage.prototype.getData = function () {
    return this.data;
};

baseMessage.prototype.getIsAck = function () {
    if (this.header === null) {
        return false;
    }

    return (this.header & HEADER_ACK);
};

baseMessage.prototype.getIsSystemMessage = function () {
    if (this.header === null) {
        return false;
    }

    return (this.header & HEADER_SYSTEM_MESSAGE);
};

baseMessage.prototype.getBackoff = function () {
    if (this.header === null) {
        return false;
    }

    return (this.header & HEADER_BACKOFF);
};

baseMessage.prototype.getIsNotification = function () {
    if (this.header === null) {
        return false;
    }

    return (this.header & HEADER_NOTIFICATION);
};

baseMessage.prototype.getHasSync = function () {
    if (this.header === null) {
        return false;
    }

    return (this.header & HEADER_SYNC);
};

baseMessage.prototype.getOutOfSync = function () {
    if (this.header === null) {
        return false;
    }

    return (this.header & HEADER_OUT_OF_SYNC);
};

baseMessage.prototype.getIsProcessed = function () {
    if (this.header === null) {
        return false;
    }

    return (this.header & HEADER_PROCESSED);
};

// setters
baseMessage.prototype.setHeader = function (headerValue) {
    if (this.header === null) {
        this.header = 0;
    }

    this.header = headerValue;
};

baseMessage.prototype.setIsAck = function (is) {
    if (this.header === null) {
        this.header = 0;
    }

    if (is) {
        this.header = this.header | HEADER_ACK;
    }
    else {
        this.header = this.header & ~(HEADER_ACK);
    }
};

baseMessage.prototype.setIsSystemMessage = function (is) {
    if (this.header === null) {
        this.header = 0;
    }

    if (is) {
        this.header = this.header | HEADER_SYSTEM_MESSAGE;
    }
    else {
        this.header = this.header & ~(HEADER_SYSTEM_MESSAGE);
    }
};

baseMessage.prototype.setBackoff = function (is) {
    if (this.header === null) {
        this.header = 0;
    }

    if (is) {
        this.header = this.header | HEADER_BACKOFF;
    }
    else {
        this.header = this.header & ~(HEADER_BACKOFF);
    }
};

baseMessage.prototype.setIsNotification = function (is) {
    if (this.header === null) {
        this.header = 0;
    }

    if (is) {
        this.header = this.header | HEADER_NOTIFICATION;
    }
    else {
        this.header = this.header & ~(HEADER_NOTIFICATION);
    }
};

baseMessage.prototype.setHasSync = function (is) {
    if (this.header === null) {
        this.header = 0;
    }

    if (is) {
        this.header = this.header | HEADER_SYNC;
    }
    else {
        this.header = this.header & ~(HEADER_SYNC);
    }
};

baseMessage.prototype.setOutOfSync = function (is) {
    if (this.header === null) {
        this.header = 0;
    }

    if (is) {
        this.header = this.header | HEADER_OUT_OF_SYNC;
    }
    else {
        this.header = this.header & ~(HEADER_OUT_OF_SYNC);
    }
};

baseMessage.prototype.setIsProcessed = function (processed) {
    if (this.header === null) {
        this.header = 0;
    }

    if (processed) {
        this.header = this.header | HEADER_PROCESSED;
    }
    else {
        this.header = this.header & ~(HEADER_PROCESSED);
    }
};

baseMessage.prototype.setTXsender = function (TXsender) {
    this.TXsender = new Buffer(4);
    TXsender.copy(this.TXsender, 0, 0, 4);
};

baseMessage.prototype.clearData = function () {
    this.data = new Buffer(0);
};

baseMessage.prototype.appendData = function (dataValue) {
    this.data = Buffer.concat([this.data, dataValue]);
};

baseMessage.prototype.setData = function (dataValue) {
    this.data = new Buffer(dataValue, 'hex'); // added: ", 'hex'" 30/11/2014
};

baseMessage.prototype.buildPackage = function () {
    if (this.data.length > (65535 - 5)) {
        console.log('Error in baseMessage.buildPackage(), command to long - can not fit!');
        return null;
    }

    if (this.TXsender === null) {
        this.TXsender = new Buffer([0, 0, 0, 0]);
    }
    if (this.header === null) {
        this.header = 0x00;
    }

    var bh = new Buffer(1);
    bh.writeUInt8(this.header, 0);

    var l2 = Buffer.concat([bh, this.TXsender]);

    if (this.data.length !== 0) {
        l2 = Buffer.concat([l2, this.data]);
    }

    var l2Length = new Buffer(2);
    l2Length.writeInt16BE(l2.length, 0);

    return new Buffer.concat([l2Length, l2]);
};

module.exports = baseMessage;
