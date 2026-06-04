
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

export interface ClassInfo {
    name: string;
    line: number;
    superClass?: string;
    implements?: string[];
    methods: string[];
    doc?: string;
    code?: string;
}

export interface FileAnalysis {
    imports: string[];
    exports: string[];
    functions: FunctionInfo[];
    classes: ClassInfo[];
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
                handleExportDeclaration(path, analysis);
            },
            FunctionDeclaration(path) {
                handleFunctionDeclaration(path, content, analysis);
            },
            ClassDeclaration(path) {
                handleClassDeclaration(path, content, analysis);
            }
        });

    } catch (error: any) {
        console.warn(`⚠️  Parser warning in ${path.basename(filePath)}: ${error.message?.split('\n')[0]}`);
    }

    return analysis;
}

function handleExportDeclaration(path: any, analysis: FileAnalysis) {
    if (path.node.declaration) {
        if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
            analysis.exports.push(path.node.declaration.id.name);
        } else if (t.isVariableDeclaration(path.node.declaration)) {
            path.node.declaration.declarations.forEach((d: any) => {
                if (t.isIdentifier(d.id)) {
                    analysis.exports.push(d.id.name);
                }
            });
        } else if (t.isClassDeclaration(path.node.declaration) && path.node.declaration.id) {
            analysis.exports.push(path.node.declaration.id.name);
        }
    }
}

function handleFunctionDeclaration(path: any, content: string, analysis: FileAnalysis) {
    if (path.node.id && path.node.loc) {
        const start = path.node.loc.start.line - 1;
        const end = path.node.loc.end.line;
        const code = content.split('\n').slice(start, end).join('\n');

        const params = path.node.params.map((p: any) => {
            if (t.isIdentifier(p)) return p.name;
            if (t.isAssignmentPattern(p) && t.isIdentifier(p.left)) return p.left.name;
            return 'arg';
        });

        const doc = path.node.leadingComments
            ? path.node.leadingComments.map((c: any) => c.value.trim()).join('\n')
            : undefined;

        analysis.functions.push({
            name: path.node.id.name,
            line: path.node.loc.start.line,
            params: params,
            doc: doc,
            code: code
        });
    }
}

function handleClassDeclaration(path: any, content: string, analysis: FileAnalysis) {
    if (path.node.id && path.node.loc) {
        const start = path.node.loc.start.line - 1;
        const end = path.node.loc.end.line;
        const code = content.split('\n').slice(start, end).join('\n');

        let superClass: string | undefined = undefined;
        if (path.node.superClass) {
            if (t.isIdentifier(path.node.superClass)) {
                superClass = path.node.superClass.name;
            } else if (t.isMemberExpression(path.node.superClass)) {
                const obj = t.isIdentifier(path.node.superClass.object) ? path.node.superClass.object.name : '';
                const prop = t.isIdentifier(path.node.superClass.property) ? path.node.superClass.property.name : '';
                superClass = obj && prop ? `${obj}.${prop}` : 'Expression';
            } else {
                superClass = 'Expression';
            }
        }

        let implementsList: string[] = [];
        if (path.node.implements && Array.isArray(path.node.implements)) {
            implementsList = path.node.implements.map((impl: any) => {
                if (impl.id && t.isIdentifier(impl.id)) {
                    return impl.id.name;
                }
                if (impl.expression && t.isIdentifier(impl.expression)) {
                    return impl.expression.name;
                }
                return '';
            }).filter(Boolean);
        }

        const methods: string[] = [];
        if (path.node.body && path.node.body.body) {
            path.node.body.body.forEach((member: any) => {
                if (t.isClassMethod(member) || t.isClassPrivateMethod(member)) {
                    if (t.isIdentifier(member.key)) {
                        methods.push(member.key.name);
                    } else if (t.isPrivateName(member.key) && t.isIdentifier(member.key.id)) {
                        methods.push('#' + member.key.id.name);
                    }
                }
            });
        }

        const doc = path.node.leadingComments
            ? path.node.leadingComments.map((c: any) => c.value.trim()).join('\n')
            : undefined;

        analysis.classes.push({
            name: path.node.id.name,
            line: path.node.loc.start.line,
            superClass: superClass,
            implements: implementsList.length > 0 ? implementsList : undefined,
            methods: methods,
            doc: doc,
            code: code
        });
    }
}

