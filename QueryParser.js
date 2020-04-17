const C = require('./constants');
const _ = require('./helpers');
const Tokenizer = require('./Tokenizer');
const RoaringBitmap = require('./RoaringBitmap');
const cheerio = require('cheerio');

let rules = {
    IDENT: [
        /^@([a-zA-Z_][a-zA-Z0-9_]*)\s*/,
        m => m[1].toLowerCase(),
    ],
    SPECIAL: [
        /^([-:&\|\)\(])\s*/,
        m => m[1],
    ],
    ALL: [
        /^(\*)\s*/,
        m => true,
    ],
    VALUE: [
        /^([^\s@:&\|\)\(]+)\s*/i,
        m => m[1],
    ],
};

class QueryParser {
    constructor() {
        this.tokenizer = new Tokenizer(rules);
    }
    tokenize(string) {
        let tokens = this.tokenizer.tokenize(string);
        if (_.isString(tokens)) {
            return tokens;
        }
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
            $(para).find('value').each((idx, value) => {
                let _ = '<ident value="' + $(ident).attr('value') + '"></ident><colon></colon>';
                $(value).wrap('<para></para>').before(_);
            });
            $(ident).remove();
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
            terms.push({
                value: values[parseInt($(value).attr('id'))],
                field: $(ident).attr('value'),
            });
            $(ident).before('<term id="' + (terms.length - 1) + '"></term>');
            $(ident).remove();
            $(colon).remove();
            $(value).remove();
        });
        $('term,para').next('term,para').each((idx, tag) => {
            $(tag).before('<and></and>');
        });
        if ($('value,ident,colon').length) {
            throw C.QUERY_PARSER_ERROR_INVALID_INPUT;
        }
        html = $.html();
        html = html.replace('<html><head></head><body>', '');
        html = html.replace('</body></html>', '');
        html = html.replace(/<term id="(\S+)"><\/term>/g, ' $1 ');
        html = html.replace(/<and><\/and>/g, ' & ');
        html = html.replace(/<not><\/not>/g, ' - ');
        html = html.replace(/<or><\/or>/g, ' | ');
        html = html.replace(/<(\/?)para>/g, (m, p1) => p1 ? ')' : '(');
        return {infix: html.replace(/\s+/g, ' ').trim(), terms};
        // return htmlparser2.parseDOM(html);
        // .Parser();
        // parser.write();
        // parser.end('');
        // return parser();
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
            throw C.QUERY_PARSER_ERROR_STACK_IS_NOT_EMPTY;
        }
        return stack.pop();
    }
}

module.exports = QueryParser;
