
import path from 'path';
import { readFileSafe } from '../utils/fileUtils';
import { parseJS, FileAnalysis } from './parsers/javascript';
import { parsePython } from './parsers/python';

export interface ProjectAnalysis {
    fileCount: number;
    files: Record<string, FileAnalysis>;
    dependencies: Record<string, string>;
}

export async function analyzeFiles(filePaths: string[]): Promise<ProjectAnalysis> {
    const analysis: ProjectAnalysis = {
        fileCount: filePaths.length,
        files: {},
        dependencies: {}
    };

    for (const filePath of filePaths) {
        const content = await readFileSafe(filePath);
        if (content === null) continue; // Skip if read failed

        const ext = path.extname(filePath);
        const basename = path.basename(filePath);
        let fileResult: FileAnalysis = { imports: [], exports: [], functions: [], classes: [] };

        // Dependency Parsing
        if (basename === 'package.json') {
            try {
                const pkg = JSON.parse(content);
                const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
                Object.assign(analysis.dependencies, deps);
            } catch (e) {
                console.warn(`⚠️  Failed to parse package.json: ${e}`);
            }
        } else if (basename === 'requirements.txt') {
            const lines = content.split('\n');
            lines.forEach(line => {
                const parts = line.split('==');
                if (parts.length > 0 && parts[0].trim()) {
                    analysis.dependencies[parts[0].trim()] = parts[1]?.trim() || 'latest';
                }
            });
        }

        // Code Level Analysis
        if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
            fileResult = parseJS(content, filePath);
            fileResult.language = 'javascript';
        } else if (['.py'].includes(ext)) {
            fileResult = parsePython(content, filePath);
            fileResult.language = 'python';
        } else if (['.json'].includes(ext)) {
            fileResult.language = 'json';
        } else if (['.md', '.txt'].includes(ext)) {
            fileResult.language = 'markdown';
        } else {
            fileResult.language = 'text';
        }

        // Store Content + Meta
        fileResult.content = content;
        fileResult.size = content.length;

        analysis.files[filePath] = fileResult;
    }

    return analysis;
}
