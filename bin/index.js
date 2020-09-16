#!/usr/bin/env node

var createServer = require('../server');

process.on('uncaughtException', console.log);
process.on('unhandledRejection', console.log);

let [port, host] = process.argv.slice(2);

createServer({port, host}).listen();
