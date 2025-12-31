import { parsePython } from '../src/analyzer/parsers/python';

describe('Python Parser', () => {

    it('should parse imports correctly', () => {
        const code = `
import os
from flask import Flask
import numpy as np
        `;
        const result = parsePython(code, 'test.py');
        expect(result.imports).toContain('os');
        expect(result.imports).toContain('flask');
        expect(result.imports).toContain('numpy');
    });

    it('should parse functions', () => {
        const code = `
def my_function():
    pass
        `;
        const result = parsePython(code, 'test.py');
        expect(result.functions).toHaveLength(1);
        expect(result.functions[0].name).toBe('my_function');
        expect(result.exports).toContain('my_function');
    });

    it('should parse classes', () => {
        const code = `class MyClass:`;
        const result = parsePython(code, 'test.py');
        expect(result.classes).toContain('MyClass');
        expect(result.exports).toContain('MyClass');
    });
});
