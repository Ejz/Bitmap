//
const bitmap = {};

function createIndex({index, fields}) {
    return new Promise((resolve, reject) => {
        if (bitmap[index]) {
            return reject(new Error('ERR: Already exists: ' + index));
        }
        let f = {};
        fields.forEach((field) => {
            f[field.field] = {type: field.type};
        });
        bitmap[index] = {fields: f};
        return resolve('CREATED');
    });
}

function addRecordToIndex({index, fields}) {
    return new Promise((resolve, reject) => {
        if (bitmap[index]) {
            return reject(new Error('ERR: Already exists: ' + index));
        }
        let f = {};
        fields.forEach((field) => {
            f[field.field] = {type: field.type};
        });
        bitmap[index] = {fields: f};
        return resolve('CREATED');
    });
}

function dropIndex({index}) {
    return new Promise((resolve, reject) => {
        if (!bitmap[index]) {
            return reject(new Error('ERR: Not exists: ' + index));
        }
        delete bitmap[index];
        return resolve('DROPPED');
    });
}

module.exports = {
    createIndex,
    dropIndex,
};
