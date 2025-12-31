
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import path from 'path';

export interface FunctionInfo {
    name: string;
    line: number;
    params: string[];
    doc?: string;
    code?: string;
}

export interface FileAnalysis {
    imports: string[];
    exports: string[];
    functions: FunctionInfo[];
    classes: string[];
    content?: string;
    language?: string;
    size?: number;
}

export function parseJS(content: string, filePath: string): FileAnalysis {
    const analysis: FileAnalysis = {
        imports: [],
        exports: [],
        functions: [],
        classes: []
    };

    try {
        const isTs = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
        const ast = parse(content, {
            sourceType: 'module',
            errorRecovery: true,
            plugins: [
                'jsx',
                'typescript',
                'asyncGenerators',
                'bigInt',
                'classProperties',
                'classPrivateProperties',
                'classPrivateMethods',
                'decorators-legacy',
                'doExpressions',
                'dynamicImport',
                'exportDefaultFrom',
                'exportNamespaceFrom',
                'functionBind',
                'functionSent',
                'importMeta',
                'logicalAssignment',
                'nullishCoalescingOperator',
                'numericSeparator',
                'objectRestSpread',
                'optionalCatchBinding',
                'optionalChaining',
                'partialApplication'
            ]
        });

        traverse(ast, {
            ImportDeclaration(path) {
                analysis.imports.push(path.node.source.value);
            },
            ExportNamedDeclaration(path) {
                if (path.node.declaration) {
                    if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
                        analysis.exports.push(path.node.declaration.id.name);
                    } else if (t.isVariableDeclaration(path.node.declaration)) {
                        path.node.declaration.declarations.forEach(d => {
                            if (t.isIdentifier(d.id)) {
                                analysis.exports.push(d.id.name);
                            }
                        });
                    } else if (t.isClassDeclaration(path.node.declaration) && path.node.declaration.id) {
                        analysis.exports.push(path.node.declaration.id.name);
                    }
                }
            },
            FunctionDeclaration(path) {
                if (path.node.id && path.node.loc) {
                    const start = path.node.loc.start.line - 1;
                    const end = path.node.loc.end.line;
                    const code = content.split('\n').slice(start, end).join('\n');

                    const params = path.node.params.map(p => {
                        if (t.isIdentifier(p)) return p.name;
                        if (t.isAssignmentPattern(p) && t.isIdentifier(p.left)) return p.left.name;
                        return 'arg';
                    });

                    const doc = path.node.leadingComments
                        ? path.node.leadingComments.map(c => c.value.trim()).join('\n')
                        : undefined;

                    analysis.functions.push({
                        name: path.node.id.name,
                        line: path.node.loc.start.line,
                        params: params,
                        doc: doc,
                        code: code
                    });
                }
            },
            ClassDeclaration(path) {
                if (path.node.id) {
                    analysis.classes.push(path.node.id.name);
                }
            }
        });

    } catch (error: any) {
        console.warn(`⚠️  Parser warning in ${path.basename(filePath)}: ${error.message?.split('\n')[0]}`);
    }

    return analysis;
}
