const net = require('net');
const helpers = require('./helpers');

const toResp = helpers.toResp;
const fromResp = helpers.fromResp;

class Client {
    constructor(port) {
        this.socket = new net.Socket();
        this.socket.connect(port);
        this.fread = helpers.freader(this.socket);
    }

    send(message) {
        this.socket.write(toResp(message));
        return fromResp(this.fread);
    }

    end() {
        this.socket.end();
        delete this.fread;
    }
}

module.exports = Client;
