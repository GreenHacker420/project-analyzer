
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
    kind?: string;
}

export interface MethodInfo {
    name: string;
    line: number;
    params: string[];
    kind?: string;
}

export interface ClassInfo {
    name: string;
    line: number;
    superClass?: string;
    implements?: string[];
    methods: string[];
    methodDetails?: MethodInfo[];
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
            VariableDeclarator(path) {
                handleVariableFunction(path, content, analysis);
            },
            ObjectMethod(path) {
                handleObjectMethod(path, content, analysis);
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
        addFunction(analysis, {
            name: path.node.id.name,
            line: path.node.loc.start.line,
            params: getParamNames(path.node.params),
            doc: getLeadingDoc(path.node),
            code: getNodeCode(path.node, content),
            kind: path.node.async ? 'async function' : 'function'
        });
    }
}

function handleVariableFunction(path: any, content: string, analysis: FileAnalysis) {
    const node = path.node;
    if (!t.isIdentifier(node.id) || !node.init || !node.loc) return;
    if (!t.isArrowFunctionExpression(node.init) && !t.isFunctionExpression(node.init)) return;

    addFunction(analysis, {
        name: node.id.name,
        line: node.loc.start.line,
        params: getParamNames(node.init.params),
        doc: getLeadingDoc(node) || getLeadingDoc(path.parent),
        code: getNodeCode(path.parent, content),
        kind: t.isArrowFunctionExpression(node.init) ? 'arrow' : 'function expression'
    });
}

function handleObjectMethod(path: any, content: string, analysis: FileAnalysis) {
    const node = path.node;
    if (!node.loc) return;
    const name = getPropertyName(node.key);
    if (!name) return;

    addFunction(analysis, {
        name,
        line: node.loc.start.line,
        params: getParamNames(node.params),
        doc: getLeadingDoc(node),
        code: getNodeCode(node, content),
        kind: node.async ? 'async object method' : 'object method'
    });
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
        const methodDetails: MethodInfo[] = [];
        if (path.node.body && path.node.body.body) {
            path.node.body.body.forEach((member: any) => {
                const isMethod = t.isClassMethod(member) || t.isClassPrivateMethod(member);
                const isArrowProperty = (
                    (t.isClassProperty(member) || t.isClassPrivateProperty(member)) &&
                    member.value &&
                    (t.isArrowFunctionExpression(member.value) || t.isFunctionExpression(member.value))
                );

                if (isMethod || isArrowProperty) {
                    const name = getPropertyName(member.key);
                    if (!name) return;
                    const params = isMethod
                        ? member.params
                        : (member.value && (t.isArrowFunctionExpression(member.value) || t.isFunctionExpression(member.value)))
                            ? member.value.params
                            : [];
                    const kind = isArrowProperty ? 'property' : ('kind' in member ? member.kind : 'method');

                    methods.push(name);
                    methodDetails.push({
                        name,
                        line: member.loc?.start.line || 0,
                        params: getParamNames(params),
                        kind
                    });
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
            methodDetails: methodDetails,
            doc: doc,
            code: code
        });
    }
}

function addFunction(analysis: FileAnalysis, fn: FunctionInfo) {
    const exists = analysis.functions.some(existing => existing.name === fn.name && existing.line === fn.line);
    if (!exists) {
        analysis.functions.push(fn);
    }
}

function getParamNames(params: any[]): string[] {
    return params.map((p: any) => {
        if (t.isIdentifier(p)) return p.name;
        if (t.isAssignmentPattern(p) && t.isIdentifier(p.left)) return p.left.name;
        if (t.isRestElement(p) && t.isIdentifier(p.argument)) return `...${p.argument.name}`;
        if (t.isObjectPattern(p)) return '{}';
        if (t.isArrayPattern(p)) return '[]';
        if (t.isTSParameterProperty(p) && t.isIdentifier(p.parameter)) return p.parameter.name;
        return 'arg';
    });
}

function getPropertyName(key: any): string {
    if (t.isIdentifier(key)) return key.name;
    if (t.isStringLiteral(key) || t.isNumericLiteral(key)) return String(key.value);
    if (t.isPrivateName(key) && t.isIdentifier(key.id)) return '#' + key.id.name;
    return '';
}

function getLeadingDoc(node: any): string | undefined {
    return node?.leadingComments
        ? node.leadingComments.map((c: any) => c.value.trim()).join('\n')
        : undefined;
}

function getNodeCode(node: any, content: string): string | undefined {
    if (!node?.loc) return undefined;
    const start = node.loc.start.line - 1;
    const end = node.loc.end.line;
    return content.split('\n').slice(start, end).join('\n');
}
