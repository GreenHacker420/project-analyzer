
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

    constructor(private analysis: ProjectAnalysis) {
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
        const possibleExtensions = ['', '.js', '.ts', '.jsx', '.tsx', '.py'];

        // 1. Check relative imports (starts with .)
        if (importPath.startsWith('.')) {
            for (const ext of possibleExtensions) {
                const resolved = path.resolve(dir, importPath + ext);
                if (this.nodes.has(resolved)) return resolved;

                const indexResolved = path.resolve(dir, importPath, 'index' + ext);
                if (this.nodes.has(indexResolved)) return indexResolved;

                // Python __init__
                const initResolved = path.resolve(dir, importPath, '__init__.py');
                if (this.nodes.has(initResolved)) return initResolved;
            }
        }
        // 2. Check Python module imports (e.g. 'analyzer.scanner' -> 'analyzer/scanner.py')
        else if (!importPath.startsWith('/') && !importPath.startsWith('@')) {
            const pyPath = importPath.replace(/\./g, '/');
            // Try resolving from root (simplified assumption for now, ideally scan PYTHONPATH)
            // We'll try relative first for simple cases, then "absolute" from project root

            // Try relative to current file (Python often allows this implicitly in packages)
            for (const ext of possibleExtensions) {
                const resolved = path.resolve(dir, pyPath + ext);
                if (this.nodes.has(resolved)) return resolved;

                const initResolved = path.resolve(dir, pyPath, '__init__.py');
                if (this.nodes.has(initResolved)) return initResolved;
            }

            // Try from project root (we don't easily know project root here, but we can guess it's where package.json is, 
            // OR we can iterate all nodes to find a match - expensive but correct for "Project" analyzer)
            // A faster way is to map "fileName" -> fullPath in a separate index. 
            // For now, let's skip complex root resolution to keep it simple.
        }
        return null;
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
