
import { ProjectAnalysis } from '../analyzer';
import path from 'path';

export interface GraphNode {
    id: string; // File path
    inDegree: number;
    outDegree: number;
    blastRadius: number; // Percentage of finding affected
    affectedFiles: number;
}

export class DependencyGraph {
    private nodes: Map<string, GraphNode> = new Map();
    private edges: Map<string, Set<string>> = new Map(); // From -> Set<To>
    private reverseEdges: Map<string, Set<string>> = new Map(); // To -> Set<From>
    private projectRoot: string;
    private pathAliases: Array<{ prefix: string; target: string }> = [];

    constructor(private analysis: ProjectAnalysis) {
        this.projectRoot = this.detectProjectRoot();
        this.pathAliases = this.loadPathAliases();
        this.buildGraph();
        this.calculateMetrics();
    }

    private buildGraph() {
        // strict node handling
        Object.keys(this.analysis.files).forEach(file => {
            this.nodes.set(file, {
                id: file,
                inDegree: 0,
                outDegree: 0,
                blastRadius: 0,
                affectedFiles: 0
            });
            this.edges.set(file, new Set());
            this.reverseEdges.set(file, new Set());
        });

        Object.entries(this.analysis.files).forEach(([filePath, fileData]) => {
            fileData.imports.forEach(importPath => {
                const resolvedPath = this.resolveImport(filePath, importPath);
                if (resolvedPath && this.nodes.has(resolvedPath)) {
                    this.addEdge(filePath, resolvedPath);
                }
            });
        });
    }

    private resolveImport(sourceFile: string, importPath: string): string | null {
        const dir = path.dirname(sourceFile);

        // 1. Check relative imports (starts with .)
        if (importPath.startsWith('.')) {
            return this.resolveCandidate(path.resolve(dir, importPath));
        }

        // 2. Check TypeScript/JavaScript path aliases from tsconfig/jsconfig.
        for (const alias of this.pathAliases) {
            if (importPath.startsWith(alias.prefix)) {
                const suffix = importPath.slice(alias.prefix.length);
                const resolved = this.resolveCandidate(path.resolve(alias.target, suffix));
                if (resolved) return resolved;
            }
        }

        // 3. Check Python module imports (e.g. 'analyzer.scanner' -> 'analyzer/scanner.py')
        if (!importPath.startsWith('/') && !importPath.startsWith('@')) {
            const pyPath = importPath.replace(/\./g, '/');
            // Try resolving from root (simplified assumption for now, ideally scan PYTHONPATH)
            // We'll try relative first for simple cases, then "absolute" from project root

            // Try relative to current file (Python often allows this implicitly in packages)
            const resolved = this.resolveCandidate(path.resolve(dir, pyPath));
            if (resolved) return resolved;

            // Try from project root (we don't easily know project root here, but we can guess it's where package.json is, 
            // OR we can iterate all nodes to find a match - expensive but correct for "Project" analyzer)
            // A faster way is to map "fileName" -> fullPath in a separate index. 
            // For now, let's skip complex root resolution to keep it simple.
        }
        return null;
    }

    private detectProjectRoot(): string {
        const packageJson = Object.keys(this.analysis.files)
            .find(file => path.basename(file) === 'package.json');

        if (packageJson) {
            return path.dirname(packageJson);
        }

        const files = Object.keys(this.analysis.files);
        if (files.length === 0) return process.cwd();

        return files
            .map(file => path.dirname(file))
            .reduce((common, current) => this.commonPath(common, current));
    }

    private loadPathAliases(): Array<{ prefix: string; target: string }> {
        const aliases: Array<{ prefix: string; target: string }> = [];
        const configFile = Object.entries(this.analysis.files)
            .find(([file]) => ['tsconfig.json', 'jsconfig.json'].includes(path.basename(file)));

        if (!configFile || !configFile[1].content) return aliases;

        try {
            const config = JSON.parse(configFile[1].content);
            const compilerOptions = config.compilerOptions || {};
            const baseUrl = compilerOptions.baseUrl || '.';
            const paths = compilerOptions.paths || {};
            const configDir = path.dirname(configFile[0]);
            const basePath = path.resolve(configDir, baseUrl);

            Object.entries(paths).forEach(([aliasPattern, targets]) => {
                if (!Array.isArray(targets) || targets.length === 0) return;

                const aliasPrefix = aliasPattern.replace(/\*.*$/, '');
                const targetPrefix = String(targets[0]).replace(/\*.*$/, '');
                if (!aliasPrefix || !targetPrefix) return;

                aliases.push({
                    prefix: aliasPrefix,
                    target: path.resolve(basePath, targetPrefix)
                });
            });
        } catch (error: any) {
            console.warn(`⚠️  Failed to parse path aliases: ${error.message || error}`);
        }

        return aliases;
    }

    private resolveCandidate(basePath: string): string | null {
        const possibleExtensions = ['', '.js', '.ts', '.jsx', '.tsx', '.json', '.cjs', '.mjs', '.py'];
        const candidates = new Set<string>();

        candidates.add(basePath);

        const ext = path.extname(basePath);
        if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') {
            const withoutExt = basePath.slice(0, -ext.length);
            ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].forEach(replacement => {
                candidates.add(withoutExt + replacement);
            });
        }

        for (const ext of possibleExtensions) {
            candidates.add(basePath + ext);
            candidates.add(path.join(basePath, 'index' + ext));
        }

        candidates.add(path.join(basePath, '__init__.py'));

        for (const candidate of candidates) {
            const resolved = path.resolve(candidate);
            if (this.nodes.has(resolved)) return resolved;
        }

        return null;
    }

    private commonPath(a: string, b: string): string {
        const aParts = path.resolve(a).split(path.sep);
        const bParts = path.resolve(b).split(path.sep);
        const commonParts: string[] = [];

        for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
            if (aParts[i] !== bParts[i]) break;
            commonParts.push(aParts[i]);
        }

        return commonParts.length === 1 && commonParts[0] === ''
            ? path.sep
            : commonParts.join(path.sep) || path.sep;
    }

    private addEdge(from: string, to: string) {
        if (!this.edges.get(from)?.has(to)) {
            this.edges.get(from)?.add(to);
            this.reverseEdges.get(to)?.add(from);

            const fromNode = this.nodes.get(from)!;
            const toNode = this.nodes.get(to)!;

            fromNode.outDegree++;
            toNode.inDegree++;
        }
    }

    private calculateMetrics() {
        this.nodes.forEach(node => {
            const dependents = this.getAllDependents(node.id);
            node.affectedFiles = dependents.size;
            node.blastRadius = (dependents.size / this.nodes.size) * 100;
        });
    }

    private getAllDependents(nodeId: string): Set<string> {
        const dependents = new Set<string>();
        const queue = [nodeId];
        const visited = new Set<string>([nodeId]);

        while (queue.length > 0) {
            const current = queue.shift()!;
            const incoming = this.reverseEdges.get(current);
            if (incoming) {
                incoming.forEach(src => {
                    if (!visited.has(src)) {
                        visited.add(src);
                        dependents.add(src);
                        queue.push(src);
                    }
                });
            }
        }
        return dependents;
    }

    public getTopBlastRadius(limit: number = 5): GraphNode[] {
        return Array.from(this.nodes.values())
            .sort((a, b) => b.blastRadius - a.blastRadius)
            .slice(0, limit);
    }

    public getNodes(): Map<string, GraphNode> {
        return this.nodes;
    }

    public getEdges(): Map<string, Set<string>> {
        return this.edges;
    }
}
