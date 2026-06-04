import { parseJS } from '../src/analyzer/parsers/javascript';

describe('JavaScript Parser', () => {

    it('should parse imports correctly', () => {
        const code = `
            import { foo } from './bar';
            import React from 'react';
        `;
        const result = parseJS(code, 'test.ts');
        expect(result.imports).toContain('./bar');
        expect(result.imports).toContain('react');
    });

    it('should parse exported functions', () => {
        const code = `
            export function myFunc(a, b) { return a + b; }
        `;
        const result = parseJS(code, 'test.ts');
        expect(result.exports).toContain('myFunc');
        expect(result.functions).toHaveLength(1);
        expect(result.functions[0].name).toBe('myFunc');
        expect(result.functions[0].params).toEqual(['a', 'b']);
    });

    it('should parse classes with extends, implements, methods, docs and code', () => {
        const code = `
            /**
             * My custom controller class
             */
            class MyClass extends BaseController implements IController {
                constructor() {
                    super();
                }
                index(req, res) {
                    return 'index';
                }
                #privateMethod() {
                    return 'private';
                }
            }
        `;
        const result = parseJS(code, 'test.ts');
        expect(result.classes).toHaveLength(1);
        const cls = result.classes[0];
        expect(cls.name).toBe('MyClass');
        expect(cls.superClass).toBe('BaseController');
        expect(cls.implements).toEqual(['IController']);
        expect(cls.methods).toContain('constructor');
        expect(cls.methods).toContain('index');
        expect(cls.methods).toContain('#privateMethod');
        expect(cls.doc).toContain('My custom controller class');
        expect(cls.code).toContain('class MyClass extends BaseController');
    });

    it('should parse variable exports', () => {
        const code = `export const myVar = 1;`;
        const result = parseJS(code, 'test.ts');
        expect(result.exports).toContain('myVar');
    });

    it('should extract doc comments', () => {
        const code = `
            /**
             * This is a test function
             */
            function test() {}
        `;
        const result = parseJS(code, 'test.ts');
        expect(result.functions[0].doc).toContain('This is a test function');
    });

    it('should parse arrow functions, function expressions and object methods', () => {
        const code = `
            export const arrowHandler = async (request, reply) => reply.send();
            const namedExpression = function (value = 1) { return value; };
            const controller = {
                list(req, reply) {
                    return reply.send();
                }
            };
        `;
        const result = parseJS(code, 'test.ts');
        expect(result.functions.map(fn => fn.name)).toEqual(expect.arrayContaining([
            'arrowHandler',
            'namedExpression',
            'list'
        ]));
        expect(result.functions.find(fn => fn.name === 'arrowHandler')?.params).toEqual(['request', 'reply']);
    });

    it('should parse class property methods with line details', () => {
        const code = `
            class Controller {
                handle = async (request, reply) => reply.send();
            }
        `;
        const result = parseJS(code, 'test.ts');
        expect(result.classes[0].methods).toContain('handle');
        expect(result.classes[0].methodDetails?.[0]).toMatchObject({
            name: 'handle',
            params: ['request', 'reply']
        });
    });
});
