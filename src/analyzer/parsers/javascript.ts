
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import path from 'path';

export interface FileAnalysis {
    imports: string[];
    exports: string[];
    functions: string[];
    classes: string[];
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
            errorRecovery: true, // Continue parsing even if errors found
            plugins: [
                'jsx',
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
                'partialApplication',
                ...(isTs ? ['typescript' as const] : [])
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
                if (path.node.id) {
                    analysis.functions.push(path.node.id.name);
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
