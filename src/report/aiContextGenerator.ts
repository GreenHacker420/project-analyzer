import fs from 'fs-extra';
import path from 'path';
import { DependencyGraph } from '../graph';

interface ContextFile {
    id: number;
    absolutePath: string;
    relativePath: string;
    language: string;
    blastRadius: number;
    affectedFiles: number;
    inDegree: number;
    outDegree: number;
    analysis: any;
}

interface RouteInfo {
    file: number;
    method: string;
    url: string;
    handler: string | null;
    guards: string | null;
}

interface PrismaInfo {
    models: Array<{ id: number; name: string }>;
    fields: Array<{
        model: number;
        name: string;
        type: string;
        required: boolean;
        list: boolean;
        relation: string | null;
        attrs: string | null;
    }>;
    enums: Array<{ id: number; name: string }>;
    enumValues: Array<{ enum: number; value: string }>;
}

export async function generateAiContext(
    graph: DependencyGraph,
    analysis: any,
    outputPath: string
): Promise<void> {
    const { encode } = await import('@toon-format/toon');
    const nodes = graph.getNodes();
    const edges = graph.getEdges();
    const rootPath = detectRootPath(analysis, outputPath);

    const files: ContextFile[] = Array.from(nodes.values())
        .sort((a, b) => {
            if (b.blastRadius !== a.blastRadius) return b.blastRadius - a.blastRadius;
            return a.id.localeCompare(b.id);
        })
        .map((node, index) => ({
            id: index + 1,
            absolutePath: node.id,
            relativePath: toRelative(rootPath, node.id),
            language: getLanguage(node.id),
            blastRadius: Number(node.blastRadius.toFixed(2)),
            affectedFiles: node.affectedFiles,
            inDegree: node.inDegree,
            outDegree: node.outDegree,
            analysis: analysis.files[node.id] || {}
        }));

    const fileIdByPath = new Map(files.map(file => [file.absolutePath, file.id]));
    const exportsTable: Array<{ file: number; name: string }> = [];
    const functionsTable: Array<{ file: number; name: string; line: number; params: string | null }> = [];
    const typesTable: Array<{ file: number; kind: string; name: string; line: number }> = [];
    const classesTable: Array<{ id: number; file: number; name: string; line: number; extends: string | null }> = [];
    const methodsTable: Array<{ class: number; name: string; line: number; params: string | null }> = [];
    const callsTable: Array<{ file: number; caller: string; callee: string; line: number }> = [];
    const docsTable: Array<{ kind: string; file: number; symbol: string; line: number; text: string }> = [];
    const routesTable: RouteInfo[] = [];

    let classId = 0;

    files.forEach(file => {
        unique(file.analysis.exports || []).forEach(name => {
            exportsTable.push({ file: file.id, name });
        });

        (file.analysis.functions || []).forEach((fn: any) => {
            functionsTable.push({
                file: file.id,
                name: fn.name,
                line: fn.line || 0,
                params: formatParams(fn.params)
            });
            addDoc(docsTable, 'function', file.id, fn.name, fn.line || 0, fn.doc);
        });

        (file.analysis.types || []).forEach((type: any) => {
            typesTable.push({
                file: file.id,
                kind: type.kind,
                name: type.name,
                line: type.line || 0
            });
            addDoc(docsTable, type.kind, file.id, type.name, type.line || 0, type.doc);
        });

        (file.analysis.classes || []).forEach((cls: any) => {
            classId++;
            classesTable.push({
                id: classId,
                file: file.id,
                name: cls.name,
                line: cls.line || 0,
                extends: cls.superClass || null
            });
            addDoc(docsTable, 'class', file.id, cls.name, cls.line || 0, cls.doc);

            const methods = cls.methodDetails || (cls.methods || []).map((name: string) => ({
                name,
                line: 0,
                params: []
            }));

            methods.forEach((method: any) => {
                methodsTable.push({
                    class: classId,
                    name: method.name,
                    line: method.line || 0,
                    params: formatParams(method.params)
                });
                addDoc(docsTable, 'method', file.id, `${cls.name}.${method.name}`, method.line || 0, method.doc);
            });
        });

        (file.analysis.calls || []).forEach((call: any) => {
            if (!call.caller || !call.callee) return;
            callsTable.push({
                file: file.id,
                caller: call.caller,
                callee: call.callee,
                line: call.line || 0
            });
        });

        routesTable.push(...extractRoutes(file, rootPath));
    });

    const edgesTable: Array<{ from: number; to: number }> = [];
    edges.forEach((targets, source) => {
        const from = fileIdByPath.get(source);
        if (!from) return;

        targets.forEach(target => {
            const to = fileIdByPath.get(target);
            if (to) edgesTable.push({ from, to });
        });
    });

    edgesTable.sort((a, b) => a.from - b.from || a.to - b.to);
    callsTable.sort((a, b) => a.file - b.file || a.line - b.line || a.caller.localeCompare(b.caller));
    routesTable.sort((a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method));

    const prisma = extractPrisma(files);
    const testsTable = mapTests(files, edgesTable);

    const indexFileName = `${path.basename(outputPath, path.extname(outputPath))}-index${path.extname(outputPath)}`;
    const detailFileName = path.basename(outputPath);
    const domainsDirName = `${path.basename(outputPath, path.extname(outputPath))}-domains`;
    const context = {
        format: 'toon-code-context-v4',
        root: rootPath,
        indexFile: indexFileName,
        domainsDir: domainsDirName,
        summary: {
            files: files.length,
            edges: edgesTable.length,
            exports: exportsTable.length,
            functions: functionsTable.length,
            types: typesTable.length,
            classes: classesTable.length,
            methods: methodsTable.length,
            calls: callsTable.length,
            routes: routesTable.length,
            prismaModels: prisma.models.length,
            prismaFields: prisma.fields.length,
            prismaEnums: prisma.enums.length,
            tests: testsTable.length,
            docs: docsTable.length,
            highImpactFiles: files.filter(file => file.blastRadius > 5).length
        },
        files: files.map(file => ({
            id: file.id,
            path: file.relativePath,
            language: file.language,
            blastRadius: file.blastRadius,
            affectedFiles: file.affectedFiles,
            inDegree: file.inDegree,
            outDegree: file.outDegree
        })),
        edges: edgesTable,
        exports: exportsTable,
        functions: functionsTable,
        types: typesTable,
        classes: classesTable,
        methods: methodsTable,
        calls: callsTable,
        routes: routesTable,
        prismaModels: prisma.models,
        prismaFields: prisma.fields,
        prismaEnums: prisma.enums,
        prismaEnumValues: prisma.enumValues,
        tests: testsTable,
        docs: docsTable
    };

    const toon = encode(context, {
        delimiter: '\t',
        keyFolding: 'safe'
    });

    await fs.writeFile(outputPath, toon);
    await writeDomainShards({
        encode,
        outputPath,
        rootPath,
        domainsDirName,
        context,
        files,
        edgesTable,
        exportsTable,
        functionsTable,
        typesTable,
        classesTable,
        methodsTable,
        callsTable,
        routesTable,
        testsTable,
        docsTable
    });

    const indexContext = {
        format: 'toon-code-context-index-v1',
        root: rootPath,
        detailFile: detailFileName,
        domainsDir: domainsDirName,
        summary: context.summary,
        files: context.files,
        edges: edgesTable,
        exports: exportsTable,
        routes: routesTable,
        prismaModels: prisma.models,
        prismaEnums: prisma.enums,
        tests: testsTable
    };
    const indexPath = path.join(
        path.dirname(outputPath),
        indexFileName
    );
    const indexToon = encode(indexContext, {
        delimiter: '\t',
        keyFolding: 'safe'
    });
    await fs.writeFile(indexPath, indexToon);
}

function extractRoutes(file: ContextFile, rootPath: string): RouteInfo[] {
    if (!/\.(routes|route)\.[tj]sx?$|\/routes\//.test(file.relativePath)) return [];
    const content = readContent(file);
    if (!content.includes('fastify.')) return [];

    const rows: RouteInfo[] = [];
    const methodPattern = /fastify\.(get|post|put|patch|delete|head|options)\s*\(\s*(['"`])([^'"`]+)\2/g;
    let match: RegExpExecArray | null;
    while ((match = methodPattern.exec(content))) {
        const method = match[1].toUpperCase();
        const routePath = match[3];
        const argsTail = sliceFastifyRouteBlock(content, match.index);
        rows.push({
            file: file.id,
            method,
            url: joinUrl(inferRoutePrefix(file.relativePath), routePath),
            handler: extractHandler(argsTail),
            guards: extractGuards(argsTail)
        });
    }

    const routeObjectPattern = /fastify\.route\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
    while ((match = routeObjectPattern.exec(content))) {
        const body = match[1];
        const methodMatch = body.match(/method\s*:\s*(['"`])([^'"`]+)\1/i);
        const urlMatch = body.match(/(?:url|path)\s*:\s*(['"`])([^'"`]+)\1/i);
        if (!methodMatch || !urlMatch) continue;
        rows.push({
            file: file.id,
            method: methodMatch[2].toUpperCase(),
            url: joinUrl(inferRoutePrefix(file.relativePath), urlMatch[2]),
            handler: extractHandler(body),
            guards: extractGuards(body)
        });
    }

    return rows;
}

function sliceFastifyRouteBlock(content: string, startIndex: number): string {
    const routeMethods = ['.get', '.post', '.put', '.patch', '.delete', '.head', '.options', '.route', '.register'];
    const nextIndexes = routeMethods
        .map(method => content.indexOf(`fastify${method}`, startIndex + 8))
        .filter(index => index > startIndex);
    const nextIndex = nextIndexes.length > 0 ? Math.min(...nextIndexes) : content.length;
    return content.slice(startIndex, nextIndex);
}

function inferRoutePrefix(relativePath: string): string {
    const normalized = relativePath.split(path.sep).join('/');
    const routeMatch = normalized.match(/src\/routes\/([^/]+)\//);
    if (routeMatch) return `/${routeMatch[1]}`;

    const moduleMatch = normalized.match(/src\/modules\/([^/]+)\/([^/]+)\.routes\.ts$/);
    if (!moduleMatch) return '';

    const domain = moduleMatch[1];
    const fileName = moduleMatch[2];
    if (fileName.includes('.admin') && domain !== 'admin') return `/admin/${domain}`;
    return `/${domain}`;
}

function joinUrl(prefix: string, routePath: string): string {
    const left = prefix === '/' ? '' : prefix.replace(/\/$/, '');
    const right = routePath.startsWith('/') ? routePath : `/${routePath}`;
    return `${left}${right}` || '/';
}

function extractHandler(text: string): string | null {
    const controllerCall = text.match(/([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)\s*\(/g);
    if (controllerCall) {
        const candidate = controllerCall
            .map(value => value.replace(/\s*\($/, ''))
            .find(value => !value.startsWith('fastify.') && !value.startsWith('reply.') && !value.startsWith('request.'));
        if (candidate) return candidate;
    }

    const handlerProp = text.match(/handler\s*:\s*([A-Za-z_$][\w$.]*)/);
    return handlerProp?.[1] || null;
}

function extractGuards(text: string): string | null {
    const names = new Set<string>();
    if (/\badminReadOnly\b/.test(text)) names.add('adminReadOnly');
    if (/\badminMutating\b/.test(text)) names.add('adminMutating');
    const preHandler = text.match(/preHandler\s*:\s*(\[[^\]]+\]|[A-Za-z_$][\w$.]*)/);
    if (preHandler) {
        const raw = preHandler[1];
        raw.match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?/g)?.forEach(name => names.add(name));
    }
    if (/authorizeAdmin/.test(text)) names.add('authorizeAdmin');
    if (/authenticate/.test(text)) names.add('authenticate');
    if (/requireVerifiedEmailForRequest/.test(text)) names.add('requireVerifiedEmailForRequest');
    if (/enforceAdminOrigin/.test(text)) names.add('enforceAdminOrigin');
    return names.size > 0 ? Array.from(names).join(',') : null;
}

function extractPrisma(files: ContextFile[]): PrismaInfo {
    const prismaFile = files.find(file => file.relativePath.endsWith('prisma/schema.prisma'));
    if (!prismaFile) return { models: [], fields: [], enums: [], enumValues: [] };

    const content = readContent(prismaFile);
    const modelBlocks = Array.from(content.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g));
    const modelNames = new Set(modelBlocks.map(match => match[1]));
    const models = modelBlocks.map((match, index) => ({ id: index + 1, name: match[1] }));
    const modelIdByName = new Map(models.map(model => [model.name, model.id]));
    const fields: PrismaInfo['fields'] = [];

    modelBlocks.forEach(match => {
        const modelName = match[1];
        const modelId = modelIdByName.get(modelName);
        if (!modelId) return;

        match[2].split(/\r?\n/).forEach(rawLine => {
            const line = rawLine.trim();
            if (!line || line.startsWith('//') || line.startsWith('@@') || line.startsWith('@')) return;
            const parts = line.split(/\s+/);
            if (parts.length < 2) return;
            const [name, rawType, ...attrsParts] = parts;
            const attrs = attrsParts.join(' ');
            const baseType = rawType.replace(/[?\[\]]/g, '');
            const relation = modelNames.has(baseType) || attrs.includes('@relation') ? baseType : null;
            fields.push({
                model: modelId,
                name,
                type: rawType,
                required: !rawType.endsWith('?'),
                list: rawType.endsWith('[]'),
                relation,
                attrs: attrs || null
            });
        });
    });

    const enums: PrismaInfo['enums'] = [];
    const enumValues: PrismaInfo['enumValues'] = [];
    Array.from(content.matchAll(/enum\s+(\w+)\s*\{([\s\S]*?)\n\}/g)).forEach((match, index) => {
        const enumId = index + 1;
        enums.push({ id: enumId, name: match[1] });
        match[2].split(/\r?\n/).forEach(rawLine => {
            const value = rawLine.trim().split(/\s+/)[0];
            if (!value || value.startsWith('//') || value.startsWith('@')) return;
            enumValues.push({ enum: enumId, value });
        });
    });

    return { models, fields, enums, enumValues };
}

function mapTests(
    files: ContextFile[],
    edgesTable: Array<{ from: number; to: number }>
): Array<{ file: number; target: number; symbols: string | null }> {
    const fileById = new Map(files.map(file => [file.id, file]));
    const rows: Array<{ file: number; target: number; symbols: string | null }> = [];

    files
        .filter(file => isTestFile(file.relativePath))
        .forEach(testFile => {
            const directTargets = edgesTable
                .filter(edge => edge.from === testFile.id)
                .map(edge => edge.to);

            directTargets.forEach(targetId => {
                const target = fileById.get(targetId);
                if (!target) return;
                rows.push({
                    file: testFile.id,
                    target: targetId,
                    symbols: inferTestedSymbols(testFile, target)
                });
            });
        });

    return rows.sort((a, b) => a.file - b.file || a.target - b.target);
}

function inferTestedSymbols(testFile: ContextFile, targetFile: ContextFile): string | null {
    const content = readContent(testFile);
    const names = [
        ...(targetFile.analysis.functions || []).map((fn: any) => fn.name),
        ...(targetFile.analysis.classes || []).map((cls: any) => cls.name),
        ...(targetFile.analysis.types || []).map((type: any) => type.name),
        ...(targetFile.analysis.exports || [])
    ];
    const matched = unique(names).filter(name => {
        if (!name || name.length < 2) return false;
        return new RegExp(`\\b${escapeRegExp(name)}\\b`).test(content);
    });
    return matched.length > 0 ? matched.join(',') : null;
}

function isTestFile(relativePath: string): boolean {
    return /(^|\/)(test|tests)\//.test(relativePath) || /\.(test|spec)\.[tj]sx?$/.test(relativePath);
}

async function writeDomainShards(params: {
    encode: any;
    outputPath: string;
    rootPath: string;
    domainsDirName: string;
    context: any;
    files: ContextFile[];
    edgesTable: Array<{ from: number; to: number }>;
    exportsTable: Array<{ file: number; name: string }>;
    functionsTable: Array<{ file: number; name: string; line: number; params: string | null }>;
    typesTable: Array<{ file: number; kind: string; name: string; line: number }>;
    classesTable: Array<{ id: number; file: number; name: string; line: number; extends: string | null }>;
    methodsTable: Array<{ class: number; name: string; line: number; params: string | null }>;
    callsTable: Array<{ file: number; caller: string; callee: string; line: number }>;
    routesTable: RouteInfo[];
    testsTable: Array<{ file: number; target: number; symbols: string | null }>;
    docsTable: Array<{ kind: string; file: number; symbol: string; line: number; text: string }>;
}) {
    const domains = collectDomains(params.files);
    const outputDir = path.join(path.dirname(params.outputPath), params.domainsDirName);
    await fs.ensureDir(outputDir);

    for (const domain of domains) {
        const domainFileIds = new Set(
            params.files
                .filter(file => fileDomain(file.relativePath) === domain)
                .map(file => file.id)
        );
        if (domainFileIds.size === 0) continue;

        const classIds = new Set(params.classesTable.filter(row => domainFileIds.has(row.file)).map(row => row.id));
        const shard = {
            format: 'toon-code-domain-v1',
            root: params.rootPath,
            domain,
            summary: {
                files: domainFileIds.size,
                edges: params.edgesTable.filter(edge => domainFileIds.has(edge.from) || domainFileIds.has(edge.to)).length,
                functions: params.functionsTable.filter(row => domainFileIds.has(row.file)).length,
                classes: params.classesTable.filter(row => domainFileIds.has(row.file)).length,
                routes: params.routesTable.filter(row => domainFileIds.has(row.file)).length,
                tests: params.testsTable.filter(row => domainFileIds.has(row.file) || domainFileIds.has(row.target)).length
            },
            files: params.context.files.filter((row: any) => domainFileIds.has(row.id)),
            edges: params.edgesTable.filter(edge => domainFileIds.has(edge.from) || domainFileIds.has(edge.to)),
            exports: params.exportsTable.filter(row => domainFileIds.has(row.file)),
            functions: params.functionsTable.filter(row => domainFileIds.has(row.file)),
            types: params.typesTable.filter(row => domainFileIds.has(row.file)),
            classes: params.classesTable.filter(row => domainFileIds.has(row.file)),
            methods: params.methodsTable.filter(row => classIds.has(row.class)),
            calls: params.callsTable.filter(row => domainFileIds.has(row.file)),
            routes: params.routesTable.filter(row => domainFileIds.has(row.file)),
            tests: params.testsTable.filter(row => domainFileIds.has(row.file) || domainFileIds.has(row.target)),
            docs: params.docsTable.filter(row => domainFileIds.has(row.file))
        };

        const shardToon = params.encode(shard, {
            delimiter: '\t',
            keyFolding: 'safe'
        });
        await fs.writeFile(path.join(outputDir, `${domain}.toon`), shardToon);
    }
}

function detectRootPath(analysis: any, outputPath: string): string {
    const packageJson = Object.keys(analysis.files || {})
        .find(file => path.basename(file) === 'package.json');
    if (packageJson) return path.dirname(packageJson);
    return path.dirname(path.resolve(outputPath));
}

function toRelative(rootPath: string, filePath: string): string {
    const relative = path.relative(rootPath, filePath);
    return (relative || path.basename(filePath)).split(path.sep).join('/');
}

function getLanguage(filePath: string): string {
    const ext = path.extname(filePath).replace('.', '') || 'text';
    if (ext === 'ts' || ext === 'tsx') return 'ts';
    if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return 'js';
    return ext;
}

function formatParams(params: any): string | null {
    if (!Array.isArray(params) || params.length === 0) return null;
    return params.map((param: any) => {
        return String(param)
            .replace('{}', 'obj')
            .replace('[]', 'arr')
            .replace(/\s+/g, '_');
    }).join(',');
}

function unique(values: any[]): string[] {
    return Array.from(new Set(values.map(value => String(value))));
}

function addDoc(
    docsTable: Array<{ kind: string; file: number; symbol: string; line: number; text: string }>,
    kind: string,
    file: number,
    symbol: string,
    line: number,
    doc: any
) {
    const text = summarizeDoc(doc);
    if (!text) return;
    docsTable.push({ kind, file, symbol, line, text });
}

function summarizeDoc(doc: any): string | null {
    if (!doc) return null;
    const text = String(doc)
        .replace(/@\w+[^@]*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return null;

    const sentence = text.match(/^(.{1,240}?[.!?])(?:\s|$)/)?.[1] || text.slice(0, 240);
    return sentence.trim();
}

function readContent(file: ContextFile): string {
    if (typeof file.analysis.content === 'string') return file.analysis.content;
    try {
        return fs.readFileSync(file.absolutePath, 'utf-8');
    } catch {
        return '';
    }
}

function collectDomains(files: ContextFile[]): string[] {
    return unique(files.map(file => fileDomain(file.relativePath)).filter(Boolean))
        .sort((a, b) => a.localeCompare(b));
}

function fileDomain(relativePath: string): string {
    const normalized = relativePath.split(path.sep).join('/');
    const moduleMatch = normalized.match(/src\/modules\/([^/]+)\//);
    if (moduleMatch) return moduleMatch[1];

    const routeMatch = normalized.match(/src\/routes\/([^/]+)\//);
    if (routeMatch) return routeMatch[1];

    const testModuleMatch = normalized.match(/test\/modules\/([^/]+)\//);
    if (testModuleMatch) return testModuleMatch[1];

    const testLibMatch = normalized.match(/test\/lib\/([^/.]+)/);
    if (testLibMatch) return testLibMatch[1];

    const libMatch = normalized.match(/src\/lib\/([^/.]+)/);
    if (libMatch) return libMatch[1];

    return '';
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
