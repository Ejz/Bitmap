const net = require('net');
const helpers = require('./helpers');
const bitmap = require('./bitmap');
const grammar =  require('./grammar');

const commandGrammar = new grammar.Command();

const to_resp = helpers.to_resp;
const from_resp = helpers.from_resp;

const CRLF = '\r\n';
const ERR_PREFIX = 'ERR: ';

const db = {};

const actions = {
    PING: {
        call: () => 'PONG',
    },
    CREATE: {
        call: bitmap.createIndex,
    },
    DROP: {
        call: bitmap.dropIndex,
    },
};

const server = net.createServer(async (socket) => {
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
    let req, command;
    while (true) {
        try {
            req = await from_resp(fread);
        } catch (e) {
            console.log(e.message);
            break;
        }
        try {
            command = commandGrammar.parse(req);
        } catch (e) {
            console.log(e);
            socket.write(to_resp(new Error(ERR_PREFIX + 'Syntax error!')));
            continue;
        }
        try {
            socket.write(to_resp(await actions[command.action].call.apply(null, [command])));
        } catch (e) {
            if (e.message.indexOf(ERR_PREFIX) === 0) {
                socket.write(to_resp(e));
            } else {
                socket.write(to_resp(new Error(ERR_PREFIX + 'Internal error!')));
            }
        }

        // command = new grammar.Command(req)
        // if (!req.length) {
        //     socket.write(to_resp(new Error('Empty command')));
        //     continue;
        // }
        // let cmd = req[0].toUpperCase();
        // if (!commands[cmd]) {
        //     socket.write(to_resp(new Error('Unknown command: ' + cmd)));
        //     continue;
        // }
        // let args = req.splice(1);
        // if (args.length != commands[cmd].args) {
        //     socket.write(to_resp(new Error('Invalid syntax for: ' + cmd)));
        //     continue;
        // }
        // if (req[0] === 'PING') {
            
        // } else if (req[0] === 'QUIT') {
        //     try {
        //         socket.destroy();
        //     } catch (e) {
        //         console.log(e);
        //     }
        //     console.log('quit')
        //     break;
        // } else {
            
        // }
    }
    // req = await helpers.from_rsp(fread, fread);
    // while (true) {
    // }

    // }, () => {

    // })

        // console.log(data);
        // let n = buffer.indexOf(CRLF);
        // while (~n) {
        //     socket.emit('line', buffer.substring(0, n));
        //     buffer = buffer.substring(n + 2);
        //     n = buffer.indexOf(CRLF);
        // }
    // socket.on('line', (line) => {
    //     if (line === 'PING') {
    //         socket.write('PONG' + CRLF)
    //     }
    //     console.log('line:' + line);
    // });
});


    // fromRps(line, client) {
    // }

// export default server;


// function sum(a, b) {
//     return a + b;
// }
module.exports = server;
