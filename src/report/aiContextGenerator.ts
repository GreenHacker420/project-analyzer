import fs from 'fs-extra';
import path from 'path';
import { DependencyGraph } from '../graph';

interface AiContextFile {
    path: string;
    kind: string;
    imports: string[];
    importedBy: string[];
    blastRadius: number;
    affectedFiles: number;
    functions: any[];
    classes: any[];
    exports: string[];
}

export async function generateAiContext(
    graph: DependencyGraph,
    analysis: any,
    outputPath: string
): Promise<void> {
    const nodes = graph.getNodes();
    const edges = graph.getEdges();
    const rootPath = detectRootPath(analysis, outputPath);
    const contextFiles: AiContextFile[] = [];

    nodes.forEach((nodeData, nodeId) => {
        const fileAnalysis = analysis.files[nodeId] || {};
        const imports = Array.from(edges.get(nodeId) || []);
        const importedBy: string[] = [];

        edges.forEach((targets, source) => {
            if (targets.has(nodeId)) importedBy.push(source);
        });

        contextFiles.push({
            path: toRelative(rootPath, nodeId),
            kind: getKind(nodeId, nodeData.blastRadius),
            imports: imports.map(file => toRelative(rootPath, file)).sort(),
            importedBy: importedBy.map(file => toRelative(rootPath, file)).sort(),
            blastRadius: nodeData.blastRadius,
            affectedFiles: nodeData.affectedFiles,
            functions: fileAnalysis.functions || [],
            classes: fileAnalysis.classes || [],
            exports: fileAnalysis.exports || []
        });
    });

    contextFiles.sort((a, b) => {
        if (b.blastRadius !== a.blastRadius) return b.blastRadius - a.blastRadius;
        return a.path.localeCompare(b.path);
    });

    const fileIds = new Map<string, number>();
    contextFiles.forEach((file, index) => {
        fileIds.set(file.path, index + 1);
    });

    const edgeCount = Array.from(edges.values()).reduce((total, targets) => total + targets.size, 0);
    const functionCount = contextFiles.reduce((total, file) => total + file.functions.length, 0);
    const classCount = contextFiles.reduce((total, file) => total + file.classes.length, 0);
    const methodCount = contextFiles.reduce((total, file) => {
        return total + file.classes.reduce((classTotal, cls) => {
            const methods = cls.methodDetails || cls.methods || [];
            return classTotal + methods.length;
        }, 0);
    }, 0);

    const delimiter = '\t';
    const lines: string[] = [];
    lines.push('format: toon-code-context-v2');
    lines.push(`root: ${quoteScalar(rootPath)}`);
    lines.push(`fileCount: ${contextFiles.length}`);
    lines.push(`edgeCount: ${edgeCount}`);
    lines.push(`highImpactCount: ${contextFiles.filter(f => f.blastRadius > 5).length}`);
    lines.push(`symbol.functions: ${functionCount}`);
    lines.push(`symbol.classes: ${classCount}`);
    lines.push(`symbol.methods: ${methodCount}`);
    lines.push(`files[${contextFiles.length}\t]{id\tpath\tkind\tbr\taff\tin\tout\texp\tfn\tcls\tdeps\tusers}:`);

    contextFiles.forEach(file => {
        const row = ([
            fileIds.get(file.path) || '-',
            file.path,
            file.kind,
            Number(file.blastRadius.toFixed(2)),
            file.affectedFiles,
            file.importedBy.length,
            file.imports.length,
            list(file.exports),
            formatFunctions(file.functions),
            formatClasses(file.classes),
            listIds(file.imports, fileIds),
            listIds(file.importedBy, fileIds)
        ] as any[]).map(value => quoteCell(value, delimiter)).join(delimiter);
        lines.push(`  ${row}`);
    });

    await fs.writeFile(outputPath, lines.join('\n') + '\n');
}

function detectRootPath(analysis: any, outputPath: string): string {
    const packageJson = Object.keys(analysis.files || {})
        .find(file => path.basename(file) === 'package.json');
    if (packageJson) return path.dirname(packageJson);
    return path.dirname(path.resolve(outputPath));
}

function toRelative(rootPath: string, filePath: string): string {
    const relative = path.relative(rootPath, filePath);
    return normalizePath(relative || path.basename(filePath));
}

function normalizePath(filePath: string): string {
    return filePath.split(path.sep).join('/');
}

function getKind(filePath: string, _blastRadius: number): string {
    const ext = path.extname(filePath).replace('.', '') || 'text';
    if (ext === 'ts' || ext === 'tsx') return 'ts';
    if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return 'js';
    if (ext === 'py') return 'py';
    if (ext === 'json') return 'json';
    if (ext === 'md') return 'md';
    return ext;
}

function formatFunctions(functions: any[]): string {
    return list(functions.map(fn => {
        const params = Array.isArray(fn.params) ? fn.params.map(cleanSymbol).join(',') : '';
        return `${clean(fn.name)}@${fn.line || 0}(${params})`;
    }));
}

function formatClasses(classes: any[]): string {
    return list(classes.map(cls => {
        const methods = cls.methodDetails || (cls.methods || []).map((name: string) => ({ name, line: 0, params: [] }));
        const methodText = methods.map((method: any) => {
            const params = Array.isArray(method.params) ? method.params.map(cleanSymbol).join(',') : '';
            return `${clean(method.name)}@${method.line || 0}(${params})`;
        }).join(',');
        const superClass = cls.superClass ? `^${cleanSymbol(cls.superClass)}` : '';
        return `${clean(cls.name)}${superClass}@${cls.line || 0}(${methodText})`;
    }));
}

function list(values: string[]): string {
    if (!values || values.length === 0) return 'null';
    return values.map(clean).join(';');
}

function listIds(paths: string[], fileIds: Map<string, number>): string {
    if (!paths || paths.length === 0) return 'null';
    return paths.map(file => fileIds.get(file) || clean(file)).join(',');
}

function clean(value: any): string {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .replace(/[|;\n\r]/g, ',')
        .trim();
}

function cleanSymbol(value: any): string {
    return clean(value)
        .replace('{}', 'obj')
        .replace('[]', 'arr')
        .replace(/\s+/g, '_')
        .replace(/[:{}\[\]\t]/g, '_');
}

function quoteScalar(value: any): string {
    return quoteValue(String(value ?? ''), ',');
}

function quoteCell(value: any, delimiter: string): string {
    if (typeof value === 'number') return String(value);
    return quoteValue(String(value ?? 'null'), delimiter);
}

function quoteValue(value: string, delimiter: string): string {
    if (value === 'null') return 'null';

    const mustQuote = (
        value === '' ||
        value.trim() !== value ||
        ['true', 'false', 'null'].includes(value) ||
        /^-/.test(value) ||
        /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value) ||
        /^0\d+$/.test(value) ||
        /[:"\\\[\]{}\n\r\t]/.test(value) ||
        value.includes(delimiter)
    );

    if (!mustQuote) return value;

    return `"${value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')}"`;
}
