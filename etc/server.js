const http = require('http');
const createServer = require('../server');

process.on('uncaughtException', console.log);
process.on('unhandledRejection', console.log);

let argv = process.argv.slice(2);

createServer({
    port: argv[0],
    host: argv[1],
}).listen();
