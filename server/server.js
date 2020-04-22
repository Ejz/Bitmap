const createServer = require('../server');

process.on('uncaughtException', console.log);
process.on('unhandledRejection', console.log);

let server = createServer();
server.listen(...process.argv.slice(1));
