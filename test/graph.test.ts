import path from 'path';
import { DependencyGraph } from '../src/graph';
import { ProjectAnalysis } from '../src/analyzer';

const file = (root: string, relativePath: string) => path.join(root, relativePath);

const emptyFile = (imports: string[] = [], content = '') => ({
    imports,
    exports: [],
    functions: [],
    classes: [],
    content
});

describe('DependencyGraph', () => {
    it('resolves TypeScript path aliases from tsconfig paths', () => {
        const root = path.join(__dirname, 'temp-graph-alias');
        const app = file(root, 'src/app.ts');
        const service = file(root, 'src/modules/users/users.service.ts');
        const packageJson = file(root, 'package.json');
        const tsconfig = file(root, 'tsconfig.json');

        const analysis: ProjectAnalysis = {
            fileCount: 4,
            dependencies: {},
            files: {
                [packageJson]: emptyFile(),
                [tsconfig]: emptyFile([], JSON.stringify({
                    compilerOptions: {
                        baseUrl: '.',
                        paths: { '@/*': ['src/*'] }
                    }
                })),
                [app]: emptyFile(['@/modules/users/users.service.js']),
                [service]: emptyFile()
            }
        };

        const graph = new DependencyGraph(analysis);
        expect(graph.getEdges().get(app)?.has(service)).toBe(true);
    });

    it('does not treat external scoped packages as path aliases', () => {
        const root = path.join(__dirname, 'temp-graph-scoped-package');
        const app = file(root, 'src/app.ts');
        const packageJson = file(root, 'package.json');
        const tsconfig = file(root, 'tsconfig.json');

        const analysis: ProjectAnalysis = {
            fileCount: 3,
            dependencies: {},
            files: {
                [packageJson]: emptyFile(),
                [tsconfig]: emptyFile([], JSON.stringify({
                    compilerOptions: {
                        baseUrl: '.',
                        paths: { '@/*': ['src/*'] }
                    }
                })),
                [app]: emptyFile(['@fastify/autoload'])
            }
        };

        const graph = new DependencyGraph(analysis);
        expect(graph.getEdges().get(app)?.size).toBe(0);
    });

    it('adds edges for Fastify autoload runtime-loaded directories', () => {
        const root = path.join(__dirname, 'temp-graph-autoload');
        const app = file(root, 'src/app.ts');
        const routes = file(root, 'src/routes/users/index.ts');
        const plugins = file(root, 'src/plugins/support.ts');
        const packageJson = file(root, 'package.json');

        const analysis: ProjectAnalysis = {
            fileCount: 4,
            dependencies: {},
            files: {
                [packageJson]: emptyFile(),
                [app]: emptyFile(
                    ['@fastify/autoload'],
                    `
                        await fastify.register(AutoLoad, { dir: join(__dirname, 'plugins') });
                        await fastify.register(AutoLoad, { dir: join(__dirname, 'routes') });
                    `
                ),
                [routes]: emptyFile(),
                [plugins]: emptyFile()
            }
        };

        const graph = new DependencyGraph(analysis);
        expect(graph.getEdges().get(app)?.has(routes)).toBe(true);
        expect(graph.getEdges().get(app)?.has(plugins)).toBe(true);
    });

    it('resolves multiple TypeScript path aliases for nested sub-projects correctly', () => {
        const root = path.join(__dirname, 'temp-multi-graph');
        const adminApp = file(root, 'admin/src/app.ts');
        const adminService = file(root, 'admin/src/services/admin.service.ts');
        const adminTsconfig = file(root, 'admin/tsconfig.json');

        const backendApp = file(root, 'backend/src/app.ts');
        const backendService = file(root, 'backend/src/services/backend.service.ts');
        const backendTsconfig = file(root, 'backend/tsconfig.json');

        const analysis: ProjectAnalysis = {
            fileCount: 6,
            dependencies: {},
            files: {
                [adminTsconfig]: emptyFile([], JSON.stringify({
                    compilerOptions: {
                        baseUrl: '.',
                        paths: { '@/*': ['src/*'] }
                    }
                })),
                [adminApp]: emptyFile(['@/services/admin.service.js']),
                [adminService]: emptyFile(),
                [backendTsconfig]: emptyFile([], JSON.stringify({
                    compilerOptions: {
                        baseUrl: '.',
                        paths: { '@/*': ['src/*'] }
                    }
                })),
                [backendApp]: emptyFile(['@/services/backend.service.js']),
                [backendService]: emptyFile()
            }
        };

        const graph = new DependencyGraph(analysis);
        expect(graph.getEdges().get(adminApp)?.has(adminService)).toBe(true);
        expect(graph.getEdges().get(backendApp)?.has(backendService)).toBe(true);
        
        // Ensure no cross-pollution of aliases
        expect(graph.getEdges().get(adminApp)?.has(backendService)).toBe(false);
        expect(graph.getEdges().get(backendApp)?.has(adminService)).toBe(false);
    });
});
