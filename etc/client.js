const createClient = require('../client');

process.on('uncaughtException', console.log);
process.on('unhandledRejection', console.log);

let client = createClient();
client.connect(...process.argv.slice(2)).then(res => {
	client.question();
}).catch(res => {
	console.log(String(res));
});
