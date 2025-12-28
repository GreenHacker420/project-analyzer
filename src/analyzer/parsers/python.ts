
import { FileAnalysis } from './javascript';

export function parsePython(content: string, filePath: string): FileAnalysis {
    const analysis: FileAnalysis = {
        imports: [],
        exports: [],
        functions: [],
        classes: []
    };

    const lines = content.split('\n');

    // Regex patterns
    const importRegex = /^(?:from|import)\s+([\w\.]+)/;
    const defRegex = /^\s*def\s+([a-zA-Z_]\w*)/;
    const classRegex = /^\s*class\s+([a-zA-Z_]\w*)/;
    const assignRegex = /^([a-zA-Z_]\w*)\s*=/; // Global assignments

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
            analysis.classes.push(classMatch[1]);
            analysis.exports.push(classMatch[1]);
        }
    });

    return analysis;
}
