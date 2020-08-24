const C = require('./constants');
const _ = require('./helpers');
const Tokenizer = require('./Tokenizer');
const RoaringBitmap = require('./RoaringBitmap');
const cheerio = require('cheerio');

let rules = {
    FK: [
        /^@@([a-zA-Z_][a-zA-Z0-9_]*)\s*/,
        m => m[1].toLowerCase(),
    ],
    IDENT: [
        /^@([a-zA-Z_][a-zA-Z0-9_]*)\s*/,
        m => m[1].toLowerCase(),
    ],
    // : - colon
    // & - AND
    // | - OR
    // () - para
    // - - negation
    // ~ - prefix
    SPECIAL: [
        /^([:&\|\)\(~-])\s*/,
        m => m[1],
    ],
    ALL: [
        /^(\*)\s*/,
        m => true,
    ],
    NUMERIC: [
        /^([0-9]+\.[0-9]+)\s*/i,
        m => m[1],
    ],
    VALUE: [
        /^([a-zA-Z_0-9]+)\s*/i,
        m => m[1],
    ],
    ENTER_QUOTE_MODE: [
        /^"/,
        function (m) {
            this.mode = 'QUOTE';
            return '';
        },
    ],
    EXIT_QUOTE_MODE: [
        /^"\s*/,
        function (m) {
            this.mode = undefined;
            return '';
        },
        'QUOTE',
    ],
    QUOTED_VALUE: [
        /^([^"\\]+|\\"|\\\\|\\)/,
        m => m[1],
        'QUOTE',
    ],
    RANGE1: [
        /^\[([^\]]*)\]\s*/i,
        m => m[1],
    ],
    RANGE2: [
        /^(>=|<=|>|<)\s*/i,
        m => m[1],
    ],
};

class QueryParser {
    constructor() {
        this.tokenizer = new Tokenizer(rules);
    }
    tokenize(string) {
        let tokens = this.tokenizer.tokenize(string);
        let extoken, value;
        tokens = tokens.filter(token => {
            switch (token.type) {
                case 'ENTER_QUOTE_MODE':
                    value = [];
                    return false;
                case 'QUOTED_VALUE':
                    value.push(token.value);
                    return false;
                case 'RANGE1':
                    let excFrom = false, from, to, excTo = false;
                    let parts = token.value.split(',').slice(0, 2).map(v => v.trim());
                    if (parts.length == 2) {
                        [from, to] = parts;
                        if (from.length && from[0] == '(') {
                            excFrom = true;
                            from = from.replace(/^\(\s*/, '');
                        }
                        if (to.length && to[to.length - 1] == ')') {
                            excTo = true;
                            to = to.replace(/\s*\)$/, '');
                        }
                        from = ['', 'min'].includes(from.toLowerCase()) ? 'min' : from;
                        to = ['', 'max'].includes(to.toLowerCase()) ? 'max' : to;
                    } else {
                        [from] = parts;
                        if (from == '') {
                            throw new C.QueryParserError(C.QUERY_PARSER_ERROR_INVALID_INPUT);
                        }
                        let _ = from.toLowerCase();
                        from = ['min', 'max'].includes(_) ? _ : from;
                        to = from;
                    }
                    token.value = [excFrom, from, to, excTo];
                    token.type = 'VALUE';
                    return true;
                case 'EXIT_QUOTE_MODE':
                    token.type = 'VALUE';
                    token.value = value.join('').replace(/\\("|\\)/g, '$1');
                    //
                case 'NUMERIC':
                    token.type = 'VALUE';
                    //
                case 'VALUE':
                    if (extoken && extoken.type == 'SPECIAL' && extoken.value == '~') {
                        extoken.type = 'VALUE';
                        extoken.value = {value: token.value, prefixSearch: true};
                        return false;
                    }
                    if (extoken && extoken.type == 'RANGE2') {
                        let v = extoken.value;
                        let less = ~v.indexOf('<');
                        token.value = [
                            v == '>',
                            less ? 'min' : token.value,
                            less ? token.value : 'max',
                            v == '<',
                        ];
                        extoken.type = 'SPECIAL';
                        extoken.value = ':';
                        return true;
                    }
                default:
                    extoken = token;
                    return true;
            }
        });
        return tokens;
    }
    tokens2terms(tokens) {
        let values = [];
        let terms = [null];
        let html = tokens.map(({type, value}) => {
            if (type == 'VALUE') {
                values.push(value);
                return '<value id="' + (values.length - 1) + '"></value>';
            }
            if (type == 'IDENT') {
                return '<ident value="' + value + '"></ident>';
            }
            if (type == 'FK') {
                return '<fk value="' + value + '"></fk>';
            }
            if (type == 'ALL') {
                return '<term id="*"></term>';
            }
            switch (value) {
                case ':':
                    return '<colon></colon>';
                case '&':
                    return '<and></and>';
                case '-':
                    return '<not></not>';
                case '|':
                    return '<or></or>';
                case '(':
                    return '<para>';
                case ')':
                    return '</para>';
            }
            return '';
        }).join('');
        let $ = cheerio.load(html);
        $('ident').each((idx, ident) => {
            let colon = ident.next;
            if (!colon || colon.name != 'colon') {
                return;
            }
            let para = colon.next;
            if (!para || para.name != 'para') {
                return;
            }
            ident = $(ident);
            $(para).find('value').each((idx, value) => {
                let _ = '<ident value="' + ident.attr('value') + '"></ident><colon></colon>';
                $(value).wrap('<para></para>').before(_);
            });
            ident.remove();
            $(colon).remove();
        });
        $('ident').each((idx, ident) => {
            let colon = ident.next;
            if (!colon || colon.name != 'colon') {
                return;
            }
            let value = colon.next;
            if (!value || value.name != 'value') {
                return;
            }
            ident = $(ident);
            colon = $(colon);
            value = $(value);
            terms.push({
                value: values[parseInt(value.attr('id'))],
                field: ident.attr('value'),
            });
            ident.before('<term id="' + (terms.length - 1) + '"></term>');
            ident.remove();
            colon.remove();
            value.remove();
        });
        $('value').each((idx, value) => {
            value = $(value);
            terms.push({
                value: values[parseInt(value.attr('id'))],
                field: undefined,
            });
            value.before('<term id="' + (terms.length - 1) + '"></term>');
            value.remove();
        });
        $('term,para').next('term,para').each((idx, tag) => {
            $(tag).before('<and></and>');
        });
        $('fk').each((idx, fk) => {
            let colon = fk.next;
            if (!colon || colon.name != 'colon') {
                return;
            }
            let smth = colon.next;
            if (!smth || !['term', 'para'].includes(smth.name)) {
                return;
            }
            fk = $(fk);
            terms.push({
                value: this.infix2postfix(this.html2infix($.html(smth))),
                fk: fk.attr('value'),
            });
            fk.before('<term id="' + (terms.length - 1) + '"></term>');
            fk.remove();
            $(colon).remove();
            $(smth).remove();
        });
        if ($('value,ident,colon').length) {
            throw new C.QueryParserError(C.QUERY_PARSER_ERROR_INVALID_INPUT);
        }
        html = $.html();
        html = html.replace('<html><head></head><body>', '');
        html = html.replace('</body></html>', '');
        return {infix: this.html2infix(html), terms};
    }
    html2infix(html) {
        html = html.replace(/<term id="(\S+)"><\/term>/g, ' $1 ');
        html = html.replace(/<and><\/and>/g, ' & ');
        html = html.replace(/<not><\/not>/g, ' - ');
        html = html.replace(/<or><\/or>/g, ' | ');
        html = html.replace(/<(\/?)para>/g, (m, p1) => p1 ? ')' : '(');
        html = html.replace(/\s+/g, ' ').trim();
        return html;
    }
    infix2postfix(infix) {
        let output = [];
        let stack = [];
        let operators = {
            '-': 4,
            '&': 3,
            '|': 2,
        };
        infix = infix.replace(/\s+/g, '').split(/([-\|&\(\)])/).filter(v => v != '');
        for (let token of infix) {
            if (token == '*' || parseInt(token) > 0) {
                output.push(token);
                continue;
            }
            if (~'&|-'.indexOf(token)) {
                let o1 = token;
                let o2 = stack[stack.length - 1];
                while (~'&|-'.indexOf(o2) && operators[o1] <= operators[o2]) {
                    output.push(stack.pop());
                    o2 = stack[stack.length - 1];
                }
                stack.push(o1);
            } else if (token == '(') {
                stack.push(token);
            } else if (token == ')') {
                while (stack[stack.length - 1] !== '(') {
                    output.push(stack.pop());
                }
                stack.pop();
            }
        }
        while (stack.length > 0) {
            output.push(stack.pop());
        }
        return output.join(' ');
    }
    resolve(postfix, terms, getBitmap) {
        let stack = [];
        for (let part of postfix.split(' ')) {
            if (part == '*') {
                stack.push(getBitmap('*'));
                continue;
            }
            let a, b, p = parseInt(part);
            if (p > 0) {
                stack.push(getBitmap(terms[p]));
                continue;
            }
            switch (part) {
                case '&':
                    a = stack.pop();
                    b = stack.pop();
                    stack.push(RoaringBitmap.and(a, b));
                    break;
                case '|':
                    a = stack.pop();
                    b = stack.pop();
                    stack.push(RoaringBitmap.or(a, b));
                    break;
                case '-':
                    a = stack.pop();
                    stack.push(RoaringBitmap.andNot(getBitmap('*'), a));
                    break;
            }
        }
        if (stack.length > 1) {
            throw new C.QueryParserError(C.QUERY_PARSER_ERROR_STACK_IS_NOT_EMPTY);
        }
        return stack.pop();
    }
}

module.exports = QueryParser;
