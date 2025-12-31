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

    it('should parse classes', () => {
        const code = `class MyClass {}`;
        const result = parseJS(code, 'test.ts');
        expect(result.classes).toContain('MyClass');
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
});
