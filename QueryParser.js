const C = require('./constants');
const _ = require('./helpers');

let TT = {
    KW: 'KW',
    IDENT: 'IDENT',
    NUMERIC: 'NUMERIC',
    VALUE: 'VALUE',
    END: 'END',
    SPECIAL: 'SPECIAL',
    OPEN: 'OPEN',
    CLOSE: 'CLOSE',
};

let COMMAND_PARSER_ERROR_EXPECT = {
    [TT.KW]: C.COMMAND_PARSER_ERROR_EXPECT_KW,
    [TT.IDENT]: C.COMMAND_PARSER_ERROR_EXPECT_IDENT,
    [TT.NUMERIC]: C.COMMAND_PARSER_ERROR_EXPECT_NUMERIC,
    [TT.VALUE]: C.COMMAND_PARSER_ERROR_EXPECT_VALUE,
    [TT.END]: C.COMMAND_PARSER_ERROR_EXPECT_END,
    [TT.SPECIAL]: C.COMMAND_PARSER_ERROR_EXPECT_SPECIAL,
    [TT.OPEN]: C.COMMAND_PARSER_ERROR_EXPECT_OPEN,
    [TT.CLOSE]: C.COMMAND_PARSER_ERROR_EXPECT_CLOSE,
};

let TYPES = Object.entries(C.TYPES).map(([k, v]) => v);

let KW = [
    'PING', 'CREATE', 'DROP', 'LIST', 'ADD', 'STAT', 'RENAME',
    'FIELDS', 'VALUES',
    'MIN', 'MAX',
    'SEPARATOR',
    ...TYPES,
];

let COMMAND_PARSER_TOKENS = {
    [TT.KW]: [
        new RegExp('^(' + KW.join('|') + ')\\s+', 'i'),
        m => m[1].toUpperCase(),
    ],
    [TT.IDENT]: [
        /^("|)([a-zA-Z_][a-zA-Z0-9_]*)\1\s+/i,
        m => m[2].toLowerCase(),
    ],
    [TT.NUMERIC]: [
        /^('|)([+-]?\d+)\1\s+/i,
        m => _.toInteger(m[2]),
    ],
    [TT.VALUE]: [
        /^'([^']*)'\s+/i,
        m => m[1],
    ],
};

let QUERY_PARSER_TOKENS = {
    [TT.IDENT]: [
        /^@\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*/i,
        m => m[1].toLowerCase(),
    ],
    [TT.SPECIAL]: [
        /^([:\|&])\s*/i,
        m => m[1],
    ],
    [TT.OPEN]: [
        /^\(\s*/i,
        m => true,
    ],
    [TT.CLOSE]: [
        /^\)\s*/i,
        m => true,
    ],
    [TT.VALUE]: [
        /^(?:"([^"]*)"|([a-z0-9_-]+)|([+-]?\d+))\s*/i,
        m => [m[1], m[2], m[3]].find(v => v !== undefined),
    ],
};

function tokenize(query, tt) {
    query = String(query).trim();
    query = query == '' ? '' : query + ' ';
    let tokens = [];
    let entries = Object.entries(tt);
    w: while (query.length) {
        for (let [type, [regex, normalize]] of entries) {
            let m = query.match(regex);
            if (m) {
                let value = normalize(m);
                if (value !== undefined) {
                    query = query.substring(m[0].length);
                    tokens.push({type, value});
                    continue w;
                }
            }
        }
        return C.E(C.TOKENIZE_ERROR);
    }
    tokens.push({type: TT.END, value: true});
    return tokens;
}

class QueryParser {
    constructor() {
    }
    throw(err) {
        throw C.E(err);
    }
    parse(query, options = {}) {
        let tokens = tokenize(query, QUERY_PARSER_TOKENS);
        if (_.isString(tokens)) {
            return tokens;
        }
        if (options.justTokenize) {
            return tokens;
        }
        this.tokens = tokens;
        let values = [];
        let idents = [];
        let opened = 0;
        let max = 1;
        let string = this.tokens.map(({type, value}) => {
            if (type == TT.END) {
                return '';
            }
            if (type == TT.VALUE) {
                values.push(value);
                return (values.length - 1) + 'VALUE';
            }
            if (type == TT.IDENT) {
                idents.push(value);
                return (idents.length - 1) + 'IDENT';
            }
            if (type == TT.OPEN) {
                opened++;
                max++;
                return opened + '(';
            }
            if (type == TT.CLOSE) {
                opened--;
                if (opened < 0) {
                    this.throw(C.QUERY_PARSER_ERROR_BROKEN_PARENTHESES);
                }
                idents.push(value);
                return (opened + 1) + ')';
            }
            if (type == TT.SPECIAL) {
                return value;
            }
            return value;
        }).join(' ').trim();
        if (opened > 0) {
            this.throw(C.QUERY_PARSER_ERROR_BROKEN_PARENTHESES);
        }
        if (/(\||&|:) \d+\)/.test(string)) {
            this.throw(C.QUERY_PARSER_ERROR_GENERAL);
        }
        let dump;
        let terms = [];
        do {
            dump = string;
            string = string.replace(/: (\d+)IDENT/g, (m, p1) => {

            });
            string = string.replace(/k/g, (m, p1) => {
                terms.push(1);
            });
            string = string.replace(/: (\d+IDENT|\d+VALUE)/g, (m, p1) => {
                return `: ${max}( ${p1} ${max++})`;
            });
            // string = string.replace(/@ (\d+)\( (.*?) \1\)/g, `: ${max++}( $1 ${max})`);
        } while (string != dump);
        if (options.justFlatten) {
            return string;
        }
    }
    // infixToPostfix = function(infix) {
    //     var outputQueue = "";
    //     var operatorStack = [];
    //     var operators = {
    //         "^": {
    //             precedence: 4,
    //             associativity: "Right"
    //         },
    //         "/": {
    //             precedence: 3,
    //             associativity: "Left"
    //         },
    //         "*": {
    //             precedence: 3,
    //             associativity: "Left"
    //         },
    //         "+": {
    //             precedence: 2,
    //             associativity: "Left"
    //         },
    //         "-": {
    //             precedence: 2,
    //             associativity: "Left"
    //         }
    //     }
    //     infix = infix.replace(/\s+/g, "");
    //     infix = infix.split(/([\+\-\*\/\^\(\)])/).clean();
    //     for(var i = 0; i < infix.length; i++) {
    //         var token = infix[i];
    //         if(token.isNumeric()) {
    //             outputQueue += token + " ";
    //         } else if("^*/+-".indexOf(token) !== -1) {
    //             var o1 = token;
    //             var o2 = operatorStack[operatorStack.length - 1];
    //             while("^*/+-".indexOf(o2) !== -1 && ((operators[o1].associativity === "Left" && operators[o1].precedence <= operators[o2].precedence) || (operators[o1].associativity === "Right" && operators[o1].precedence < operators[o2].precedence))) {
    //                 outputQueue += operatorStack.pop() + " ";
    //                 o2 = operatorStack[operatorStack.length - 1];
    //             }
    //             operatorStack.push(o1);
    //         } else if(token === "(") {
    //             operatorStack.push(token);
    //         } else if(token === ")") {
    //             while(operatorStack[operatorStack.length - 1] !== "(") {
    //                 outputQueue += operatorStack.pop() + " ";
    //             }
    //             operatorStack.pop();
    //         }
    //     }
    //     while(operatorStack.length > 0) {
    //         outputQueue += operatorStack.pop() + " ";
    //     }
    //     return outputQueue;
    // }
}

class CommandParser {
    constructor() {
        this.numeric2expect = {
            [C.TYPES.INTEGER]: this.expectNumeric.bind(this),
            [C.TYPES.DATE]: this.expectDate.bind(this),
            [C.TYPES.DATETIME]: this.expectDateTime.bind(this),
        };
    }
    throw(err) {
        // console.log(this.command);
        // console.log(this.tokens);
        throw C.E(err);
        // if (_.isFunction(err)) {
        //     err = err(...args);
        // }
        // let l1 = this.copy.length;
        // let l2 = this.tokens.length;
        // let j = arr => arr.map(_ => _.value).join(' ');
        // let dbg = j(this.copy.slice(0, l1 - l2)) + ' --> ' + j(this.copy.slice(l1 - l2));
        // err = err.trim() + '\n' + dbg.trim() + '\n';
    }
    parse(query) {
        let tokens = tokenize(query, COMMAND_PARSER_TOKENS);
        if (_.isString(tokens)) {
            return tokens;
        }
        this.command = {};
        this.tokens = tokens;
        this.copy = [...this.tokens];
        try {
            this.command.action = this.expectKeyword();
            switch (this.command.action) {
                case 'PING':
                case 'LIST':
                    this.expectEnd();
                    return this.command;
                case 'STAT':
                    this.command.index = this.tryIdent();
                    this.expectEnd();
                    return this.command;
                case 'ADD':
                    this.command.index = this.expectIdent();
                    this.command.id = this.expectPositiveNumeric();
                    this.command.values = Object.create(null);
                    if (this.tryEnd()) {
                        return this.command;
                    }
                    this.expectKeyword('VALUES');
                    while (true) {
                        let ident = this.tryIdent();
                        if (!ident) {
                            break;
                        }
                        if (this.command.values[ident]) {
                            this.throw(C.COMMAND_PARSER_ERROR_DUPLICATE_FIELDS);
                        }
                        if (ident == C.BITMAP_ID) {
                            this.throw(C.COMMAND_PARSER_ERROR_ID_IS_RESERVED);
                        }
                        let v = this.tryNumeric();
                        v = v === undefined ? this.expectValue() : v;
                        this.command.values[ident] = v;
                    }
                    this.expectEnd();
                    return this.command;
                case 'DROP':
                    this.command.index = this.expectIdent();
                    this.expectEnd();
                    return this.command;
                case 'CREATE':
                    this.command.index = this.expectIdent();
                    this.command.fields = Object.create(null);
                    if (this.tryEnd()) {
                        return this.command;
                    }
                    this.expectKeyword('FIELDS');
                    while (true) {
                        let ident = this.tryIdent();
                        if (!ident) {
                            break;
                        }
                        if (this.command.fields[ident]) {
                            this.throw(C.COMMAND_PARSER_ERROR_DUPLICATE_FIELDS);
                        }
                        if (ident == C.BITMAP_ID) {
                            this.throw(C.COMMAND_PARSER_ERROR_ID_IS_RESERVED);
                        }
                        let type = this.expectFieldType();
                        let field = {type};
                        if (C.IS_NUMERIC(field.type)) {
                            field.min = C.INTEGER_DEFAULT_MIN;
                            field.max = C.INTEGER_DEFAULT_MAX;
                            do {
                                let kw = this.tryKeyword(['MIN', 'MAX']);
                                if (!kw) {
                                    break;
                                }
                                field[kw.toLowerCase()] = this.numeric2expect[field.type]();
                            } while (true);
                            if (field.min > field.max) {
                                this.throw(C.COMMAND_PARSER_ERROR_MIN_MAX);
                            }
                        } else if (field.type == C.TYPES.ARRAY) {
                            field.separator = ',';
                            if (this.tryKeyword('SEPARATOR')) {
                                field.separator = this.expectValue();
                            }
                        }
                        this.command.fields[ident] = field;
                    }
                    this.expectEnd();
                    return this.command;
                case 'RENAME':
                    this.command.index = this.expectIdent();
                    this.command.name = this.expectIdent();
                    if (this.command.index == this.command.name) {
                        this.throw(C.COMMAND_PARSER_ERROR_RENAME_TO_SAME_NAME);
                    }
                    this.expectEnd();
                    return this.command;
                default:
                    return this.command;
            }
        } catch (e) {
            return e;
        }
    }
    expect(tt, value) {
        let token = this.tokens.shift();
        if (token.type != tt) {
            this.throw(COMMAND_PARSER_ERROR_EXPECT[tt]);
        }
        if (
            value !== undefined &&
            !(_.isArray(value) ? value.includes(token.value) : value == token.value)
        ) {
            this.throw(C.COMMAND_PARSER_ERROR_EXPECT_CERTAIN_VALUE, value);
        }
        return token.value;
    }
    try(tt, value) {
        let token = this.tokens[0];
        if (
            token.type == tt &&
            (
                value === undefined ||
                (_.isArray(value) ? value.includes(token.value) : value == token.value)
            )
        ) {
            this.tokens.shift();
            return token.value;
        }
        return undefined;
    }
    expectKeyword(value) {
        return this.expect(TT.KW, value);
    }
    expectIdent(value) {
        return this.expect(TT.IDENT, value);
    }
    expectNumeric(value) {
        return this.expect(TT.NUMERIC, value);
    }
    expectValue(value) {
        let v = this.tryNumeric(value);
        return v === undefined ? this.expect(TT.VALUE, value) : String(v);
    }
    expectEnd() {
        return this.expect(TT.END);
    }
    expectPositiveNumeric(value) {
        let v = this.expectNumeric(value);
        if (v < 1) {
            this.throw(C.COMMAND_PARSER_ERROR_EXPECT_POSITIVE_NUMERIC);
        }
        return v;
    }
    expectDate(value) {
        let v = this.expectValue(value);
        v = _.toDateInteger(v);
        if (v === undefined) {
            this.throw(C.COMMAND_PARSER_ERROR_EXPECT_DATE);
        }
        return v;
    }
    expectDateTime(value) {
        let v = this.expectValue(value);
        v = _.toDateTimeInteger(v);
        if (v === undefined) {
            this.throw(C.COMMAND_PARSER_ERROR_EXPECT_DATETIME);
        }
        return v;
    }
    tryKeyword(value) {
        return this.try(TT.KW, value);
    }
    tryIdent(value) {
        return this.try(TT.IDENT, value);
    }
    tryNumeric(value) {
        return this.try(TT.NUMERIC, value);
    }
    tryEnd() {
        return this.try(TT.END);
    }
    expectFieldType() {
        let type = this.expect(TT.KW);
        if (!TYPES.includes(type)) {
            this.throw(C.COMMAND_PARSER_ERROR_UNKNOWN_FIELD_TYPE);
        }
        return type;
    }
}

function parseCommand(command) {
    return new CommandParser().parse(command);
}

function parseQuery(query, options) {
    return new QueryParser().parse(query, options);
}

module.exports = {
    parseCommand,
    parseQuery,
};
// tokenizeCommand,


// function 




// const grammar = {
//     lex: {
//         rules: [
//             ['\\d{4}-\\d{2}-\\d{2}\\b', 'return "DATE";'],
//             ['([+-]\\s*)?[0-9]+\\b', 'return "INTEGER";'],
//             ['\\s+', '/* */'],
//             ['[Mm][Ii][Nn]\\b', 'return "KW_MIN";'],
//             ['[Mm][Aa][Xx]\\b', 'return "KW_MAX";'],
//             ['@@[a-zA-Z_][a-zA-Z0-9_]*\\b', 'return "FOREIGNKEY";'],
//             ['@[a-zA-Z_][a-zA-Z0-9_]*\\b', 'return "IDENT";'],
//             ['\\*', 'return "*";'],
//             ['\\|', 'return "|";'],
//             ['\\(', 'return "(";'],
//             ['\\)', 'return ")";'],
//             ['\\[', 'return "[";'],
//             ['\\]', 'return "]";'],
//             ['&', 'return "&";'],
//             ['-', 'return "-";'],
//             ['\\^', 'return "^";'],
//             [':', 'return ":";'],
//             [',', 'return ",";'],
//             ['".*?"', 'return "VALUE";'],
//             ['[a-zA-Z0-9_\\.]+', 'return "VALUE";'],
//             ['$', 'return "EOF";'],
//         ],
//     },
//     operators: [
//         ['left', '|'],
//         ['left', '&'],
//         ['left', '-'],
//     ],
//     bnf: {
//         expressions: [
//             ['e EOF', 'return $1'],
//         ],
//         e: [
//             ['( e )', '$$ = $2'],
//             ['IDENT : values', '$$ = {field: $1.substring(1).toLowerCase(), values: $3}'],
//             ['FOREIGNKEY : e', '$$ = {fk: $1.substring(2).toLowerCase(), values: $3}'],
//             ['values', '$$ = {values: $1}'],
//             ['e & e', '$$ = {op: $2, queries: [$1, $3]}'],
//             ['e e', '$$ = {op: "&", queries: [$1, $2]}'],
//             ['e | e', '$$ = {op: $2, queries: [$1, $3]}'],
//             ['- e', '$$ = {op: $1, queries: [$2]}'],
//         ],
//         values: [
//             ['value', '$$ = [$1]'],
//             ['( _values )', '$$ = $2'],
//         ],
//         _values: [
//             // ['_values & value', '$$ = $1.concat($3)'],
//             // ['_values value', '$$ = $1.concat($2)'],
//             ['_values | value', '$$ = $1.concat($3)'],
//             ['value', '$$ = [$1]'],
//         ],
//         value: [
//             ['^ value', '$$ = "^" + $2'],
//             ['( value )', '$$ = $2'],
//             ['INTEGER', '$$ = parseInt($1)'],
//             ['DATE', '$$ = $1'],
//             ['VALUE', '$$ = $1.replace(/"/g, "")'],
//             ['*', '$$ = $1'],
//             ['KW_MIN', '$$ = "MIN"'],
//             ['KW_MAX', '$$ = "MAX"'],
//             ['[ INTEGER , INTEGER ]', '$$ = [parseInt($2), parseInt($4)]'],
//             ['[ DATE , DATE ]', '$$ = [$2, $4]'],
//             ['[ INTEGER , KW_MAX ]', '$$ = [parseInt($2), "MAX"]'],
//             ['[ INTEGER , KW_MIN ]', '$$ = [parseInt($2), "MIN"]'],
//             ['[ KW_MIN , INTEGER ]', '$$ = ["MIN", parseInt($4)]'],
//             ['[ KW_MAX , INTEGER ]', '$$ = ["MAX", parseInt($4)]'],
//             ['[ KW_MIN , KW_MAX ]', '$$ = ["MIN", "MAX"]'],
//             ['[ KW_MAX , KW_MIN ]', '$$ = ["MAX", "MIN"]'],
//         ],
//     },
// };

// class Grammar {
//     constructor() {
//         let hash = _.md5(JSON.stringify(grammar));
//         let target = path.resolve(__dirname + '/tmp', hash + '.js');
//         if (!fs.existsSync(target)) {
//             let parser = new jison.Parser(grammar);
//             fs.writeFileSync(target, parser.generate());
//         }
//         this.parser = require(target);
//         this.strings = [];
//         this.actions = /^[A-Z]*$/;
//         this.types = C.TYPES;
//         this.idents = /^[a-z_][a-z0-9_]*$/;
//         this.getIdent = () => {
//             let string = this.getValue();
//             string = string.toLowerCase();
//             if (!this.idents.test(string)) {
//                 throw 'Invalid identifier: ' + string;
//             }
//             return string;
//         };
//         this.getInteger = () => {
//             let string = this.getValue();
//             let integer = Number(string);
//             if (_.isInteger(integer)) {
//                 return integer;
//             }
//             throw 'Invalid INTEGER: ' + string;
//         };
//         this.getPositiveInteger = () => {
//             let integer = this.getInteger();
//             if (integer > 0) {
//                 return integer;
//             }
//             throw 'Non-positive integer values';
//         };
//         this.getPositiveOrZeroInteger = () => {
//             let integer = this.getInteger();
//             if (integer >= 0) {
//                 return integer;
//             }
//             throw 'Negative integer values';
//         };
//         this.getType = () => {
//             let string = this.getValue();
//             string = string.toUpperCase();
//             if (!this.types.includes(string)) {
//                 throw 'Invalid type: ' + string;
//             }
//             return string;
//         };
//         this.getValues = (n) => {
//             let values = [];
//             if (this.strings.length < n) {
//                 throw 'Unexpected END!';
//             }
//             for (let i = 0; i < n; i++) {
//                 values.push(String(this.strings.shift()));
//             }
//             return values;
//         };
//         this.getValue = () => {
//             return this.getValues(1)[0];
//         };
//     }

//     getAction() {
//         let string = this.getValue();
//         string = string.toUpperCase();
//         if (!this.actions.test(string)) {
//             throw 'Invalid action: ' + string;
//         }
//         return string;
//     }

//     getCharacter() {
//         let string = this.getValue();
//         if (string.length != 1) {
//             throw _.sprintf(C.EXPECTED_SINGLE_CHARACTER_ERROR, string);
//         }
//         return string;
//     }

//     tryKeyword(kw) {
//         if (this.strings.length && String(this.strings[0]).toUpperCase() == kw) {
//             this.strings.shift();
//             return true;
//         }
//         return false;
//     }

//     tryKeywords(...kws) {
//         for (let i = 0, l = kws.length; i < l; i++) {
//             if (this.tryKeyword(kws[i])) {
//                 return i;
//             }
//         }
//     }

//     expectKeyword(kw) {
//         let value = this.getValue();
//         if (value.toUpperCase() != kw) {
//             throw 'Unexpected keyword: ' + value;
//         }
//     }

//     parse(strings, ...args) {
//         let command = {};
//         let pos = 0;
//         strings = _.castToArray(strings, ...args);
//         this.strings = strings;
//         while (this.strings.length) {
//             if (!command.action) {
//                 command.action = this.getAction();
//                 continue;
//             }
//             if (['PING', 'LIST', 'SAVEALL'].includes(command.action)) {
//                 throw _.sprintf(C.INVALID_COMMAND_ARGUMENTS_ERROR, command.action);
//             }
//             if (!command.index) {
//                 command.index = this.getIdent();
//                 continue;
//             }
//             if (['DROP', 'STAT', 'SAVE'].includes(command.action)) {
//                 throw _.sprintf(C.INVALID_COMMAND_ARGUMENTS_ERROR, command.action);
//             }
//             if (command.action == 'CREATE' && !command.fields) {
//                 command.fields = [];
//                 command.persist = this.tryKeyword('PERSIST');
//                 if (!this.tryKeyword('FIELDS')) {
//                     continue;
//                 }
//                 while (this.strings.length) {
//                     let field = {field: this.getIdent(), type: this.getType()};
//                     if (field.type == C.TYPE_INTEGER) {
//                         field.min = 0;
//                         field.max = (3 ** 20) - 1;
//                         if (this.tryKeyword('MIN')) {
//                             field.min = this.getInteger();
//                         }
//                         if (this.tryKeyword('MAX')) {
//                             field.max = this.getInteger();
//                         }
//                         if (field.min > field.max) {
//                             throw _.sprintf(C.INVALID_MIN_MAX_ERROR, field.field);
//                         }
//                     } else if (field.type == C.TYPE_DATE) {
//                         field.min = 0;
//                         field.max = (3 ** 10) - 1;
//                     } else if (field.type == C.TYPE_DATETIME) {
//                         field.min = 0;
//                         field.max = (3 ** 20) - 1;
//                     } else if (field.type == C.TYPE_FOREIGNKEY) {
//                         field.fk = this.getIdent();
//                     } else if (field.type == C.TYPE_ARRAY) {
//                         field.separator = ',';
//                         if (this.tryKeyword('SEPARATOR')) {
//                             field.separator = this.getCharacter();
//                         }
//                     } else if ([C.TYPE_FULLTEXT, C.TYPE_TRIPLETS].includes(field.type)) {
//                         field.noStopwords = this.tryKeyword('NOSTOPWORDS');
//                     }
//                     command.fields.push(field);
//                 }
//                 if (!command.fields.length) {
//                     throw 'No Fields Mentioned!';
//                 }
//                 continue;
//             }
//             if (command.action == 'ADD' && !command.id) {
//                 command.id = this.getPositiveInteger();
//                 continue;
//             }
//             if (command.action == 'ADD' && !command.values) {
//                 command.values = [];
//                 this.expectKeyword('VALUES');
//                 while (this.strings.length) {
//                     let value = {field: this.getIdent(), value: this.getValue()};
//                     command.values.push(value);
//                 }
//                 if (!command.values.length) {
//                     throw 'No Values Mentioned!';
//                 }
//                 continue;
//             }
//             if (command.action == 'SEARCH' && !command.limit) {
//                 command.limit = [0, 100];
//                 command.query = this.getValue();
//                 let query = this.parseQuery(command.query);
//                 if (query === undefined) {
//                     throw _.sprintf(C.QUERY_SYNTAX_ERROR, command.query);
//                 }
//                 command.query = query;
//                 if (this.tryKeyword('SORTBY')) {
//                     command.sortby = this.getIdent();
//                     command.desc = !!this.tryKeywords('ASC', 'DESC');
//                 }
//                 if (this.tryKeyword('WITHCURSOR')) {
//                     command.withCursor = true;
//                 } else if (this.tryKeyword('LIMIT')) {
//                     let [off, lim] = [0, this.getPositiveOrZeroInteger()];
//                     if (this.strings.length) {
//                         [off, lim] = [lim, this.getPositiveOrZeroInteger()];
//                     }
//                     command.limit = [off, lim];
//                 }
//                 command.appendFk = [];
//                 while (this.tryKeyword('APPENDFK')) {
//                     command.appendFk.push(this.getIdent());
//                 }
//                 command.appendPos = this.tryKeyword('APPENDPOS');
//                 continue;
//             }
//             if (command.action == 'CURSOR' && !command.limit) {
//                 this.expectKeyword('LIMIT');
//                 command.limit = this.getPositiveInteger();
//                 continue;
//             }
//             if (command.action == 'RENAME' && !command.name) {
//                 command.name = this.getIdent();
//                 continue;
//             }
//             throw _.sprintf(C.SYNTAX_ERROR, this.strings.join(' '));
//         }
//         return command;
//     }

//     parseQuery(string) {
//         try {
//             return this.parser.parse(string);
//         } catch (e) {
//             return undefined;
//         }
//     }
// }

//     while (!name) {
                    //         if (name in this.command.fields) {
                    //             this.throw(COMMAND_PARSER_ERRORS.DUPLICATE_FIELDS);
                    //         }
                    //         let type = this.expectFieldType();
                    //         let field = {type};
                    //         if (field.type == C.BITMAP_FIELD_TYPES.INTEGER) {
                    //             field.min = C.BITMAP_INTEGER_FIELD_DEFAULT_MIN;
                    //             field.max = C.BITMAP_INTEGER_FIELD_DEFAULT_MAX;
                    //             do {
                    //                 let len = this.tokens.length;
                    //                 if (this.optional([TT_KW], 'min')) {
                    //                     field.min = this.expect([TT_NUMERIC]);
                    //                 }
                    //                 if (this.optional([TT_KW], 'max')) {
                    //                     field.max = this.expect([TT_NUMERIC]);
                    //                 }
                    //             } while (this.tokens.length != len);
                    //             if (field.min > field.max) {
                    //                 field.name = name;
                    //                 this.throw(C.COMMAND_PARSER_ERROR_MIN_MAX, field);
                    //             }
                    //         }
                    //         this.command.fields[name] = field;
                    //     }
                    // }
                    // do {
                    //     let len = this.tokens.length;
                        
                    // } while (this.tokens.length != len);
                    // createEnd:
                        // while (this.strings.length) {
                        //     let field = {field: this.getIdent(), type: this.getType()};
                        //     if (field.type == C.TYPE_INTEGER) {
                        //         field.min = 0;
                        //         field.max = (3 ** 20) - 1;
                        //         if (this.tryKeyword('MIN')) {
                        //             field.min = this.getInteger();
                        //         }
                        //         if (this.tryKeyword('MAX')) {
                        //             field.max = this.getInteger();
                        //         }
                        //         if (field.min > field.max) {
                        //             throw _.sprintf(C.INVALID_MIN_MAX_ERROR, field.field);
                        //         }
                        //     } else if (field.type == C.TYPE_DATE) {
                        //         field.min = 0;
                        //         field.max = (3 ** 10) - 1;
                        //     } else if (field.type == C.TYPE_DATETIME) {
                        //         field.min = 0;
                        //         field.max = (3 ** 20) - 1;
                        //     } else if (field.type == C.TYPE_FOREIGNKEY) {
                        //         field.fk = this.getIdent();
                        //     } else if (field.type == C.TYPE_ARRAY) {
                        //         field.separator = ',';
                        //         if (this.tryKeyword('SEPARATOR')) {
                        //             field.separator = this.getCharacter();
                        //         }
                        //     } else if ([C.TYPE_FULLTEXT, C.TYPE_TRIPLETS].includes(field.type)) {
                        //         field.noStopwords = this.tryKeyword('NOSTOPWORDS');
                        //     }
                        //     command.fields.push(field);
                        // }
                        // if (!command.fields.length) {
                        //     throw 'No Fields Mentioned!';
                        // }
