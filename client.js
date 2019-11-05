const net = require('net');
const _ = require('./helpers');

class Client {
    constructor(port) {
        this.socket = new net.Socket();
        this.socket.connect(port);
        this.fread = _.freader(this.socket);
    }

    send(message) {
        this.socket.write(_.toResp(message));
        return _.fromResp(this.fread);
    }

    end() {
        this.socket.end();
        delete this.fread;
    }
}

module.exports = Client;
