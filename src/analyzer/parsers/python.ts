
import { FileAnalysis } from './javascript';

export function parsePython(content: string, filePath: string): FileAnalysis {
    const analysis: FileAnalysis = {
        imports: [],
        exports: [],
        functions: [],
        classes: []
    };

    const lines = content.split('\n');

    // Regex patterns for Python parsing
    // Note: This does not resolve complex ASTs but captures common patterns.
    const importRegex = /^(?:from|import)\s+([\w\.]+)/; // Matches 'import x' or 'from x import y'
    const defRegex = /^\s*def\s+([a-zA-Z_]\w*)/;         // Matches function definitions
    const classRegex = /^\s*class\s+([a-zA-Z_]\w*)(?:\(([^)]+)\))?:/;     // Matches class definitions and base classes

    lines.forEach((line, index) => {
        // Imports
        const importMatch = line.match(importRegex);
        if (importMatch) {
            analysis.imports.push(importMatch[1]);
        }

        // Functions
        const defMatch = line.match(defRegex);
        if (defMatch) {
            analysis.functions.push({
                name: defMatch[1],
                line: index + 1,
                params: [], // Regex parser doesn't extract params yet
                doc: undefined,
                code: undefined
            });
            // Python functions at module level are exports
            analysis.exports.push(defMatch[1]);
        }

        // Classes
        const classMatch = line.match(classRegex);
        if (classMatch) {
            const className = classMatch[1];
            const parentClasses = classMatch[2] ? classMatch[2].split(',').map(s => s.trim()) : [];
            analysis.classes.push({
                name: className,
                line: index + 1,
                superClass: parentClasses.length > 0 ? parentClasses.join(', ') : undefined,
                methods: [] // Heuristic parser doesn't scan methods yet
            });
            analysis.exports.push(className);
        }
    });

    return analysis;
}
