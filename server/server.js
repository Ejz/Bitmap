const server = require('../server');

process.on('uncaughtException', console.log);
process.on('unhandledRejection', console.log);
server.listen(61000);
