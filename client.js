const net = require('net');
const helpers = require('./helpers');

const CRLF = '\r\n';

const to_resp = helpers.to_resp;
const from_resp = helpers.from_resp;

class Client {
    constructor(port) {
        this.socket = new net.Socket();
        this.socket.connect(port);
    }
    send(message) {
        message = to_resp(message);
        this.socket.write(message);
        let socket = this.socket;
        let buffer = '';
        let fread = (size) => new Promise((resolve, reject) => {
            function cb_data(data) {
                if (data !== undefined) {
                    buffer += data.toString();
                }
                let n = buffer.indexOf(CRLF);
                let undef = size === undefined;
                if (
                    (!undef && buffer.length >= size) ||
                    (undef && ~n)
                ) {
                    let s = undef ? n + 2 : size;
                    let result = buffer.substring(0, s);
                    buffer = buffer.substring(s);
                    finalize();
                    resolve(result);
                }
            }
            function cb_end() {
                finalize();
                reject(new Error('Connection is closed!'));
            }
            function finalize() {
                socket.off('data', cb_data);
                socket.off('end', cb_end);
            }
            socket.on('data', cb_data);
            socket.on('end', cb_end);
            cb_data();
        });
        return new Promise(async (resolve, reject) => {
            let req;
            try {
                req = await from_resp(fread);
            } catch (e) {
                return reject(e);
            }
            resolve(req);
        });
    }
    end() {
        this.socket.end();
    }
}

module.exports = Client;
