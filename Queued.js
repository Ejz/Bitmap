var _ = require('./helpers');

class Queued {
    constructor() {
        this.bus = [];
        this.queued = {};
    }

    push(...args) {
        for (let elem of args) {
            let {id, index} = elem;
            this.bus.push(elem);
            this.queued[index] = this.queued[index] || {};
            this.queued[index][id] = this.queued[index][id] || [];
            this.queued[index][id].push(elem);
        }
    }

    length(...args) {
        if (!args.length) {
            return this.bus.length;
        }
        let [index] = args;
        index = this.queued[index] || {};
        if (args.length == 1) {
            return Object.keys(index).reduce((a, c) => a + index[c].length, 0);
        }
        let [, id] = args;
        return (index[id] || []).length;
    }

    has(...args) {
        return !!this.length(...args);
    }

    clear(...args) {
        if (!args.length) {
            this.bus = [];
            this.queued = {};
            return;
        }
        let [index] = args;
        if (!this.queued[index]) {
            return;
        }
        if (args.length == 1) {
            delete this.queued[index];
            this.bus = this.bus.filter(e => e.index != index);
            return;
        }
        let [, id] = args;
        if (this.queued[index][id]) {
            delete this.queued[index][id];
            this.bus = this.bus.filter(e => e.index != index || e.id != id);
        }
    }

    shift() {
        let elem = this.bus.shift();
        if (!elem) return;
        let {index, id} = elem;
        this.queued[index][id].shift();
        if (!this.queued[index][id].length) {
            delete this.queued[index][id];
        }
        return elem;
    }
}

module.exports = Queued;
