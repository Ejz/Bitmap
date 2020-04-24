const createClient = require('../client');

process.on('uncaughtException', console.log);
process.on('unhandledRejection', console.log);

let argv = process.argv.slice(2);

let client = createClient({
    port: argv[0],
    host: argv[1],
});

client.connect().then(res => {
    client.question();
}).catch(res => {
    console.log(String(res));
});
