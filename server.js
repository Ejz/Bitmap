const net = require('net');
const helpers = require('./helpers');
const bitmap = require('./bitmap');
const C = require('./constants');

const toResp = helpers.toResp;
const fromResp = helpers.fromResp;
const to = helpers.to;

const server = net.createServer(async (socket) => {
    let fread = helpers.freader(socket);
    let connected = new Date();
    let res, err;
    let client = socket.remoteAddress;
    console.log(`Connected: ${client};`);
    while (true) {
        [res, err] = await to(fromResp(fread));
        if (err) {
            let alive = Number(new Date()) - Number(connected);
            console.log(`Client: ${client}; Error: ${err}; Alive: ${alive};`);
            break;
        }
        [res, err] = await to(bitmap.execute(res));
        if (err) {
            err = C.IS_ERROR(err) ? err : C.INTERNAL_ERROR;
            socket.write(toResp(new Error(err)));
        } else {
            socket.write(toResp(res));
        }
    }
});

module.exports = server;
