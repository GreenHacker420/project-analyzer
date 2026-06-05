
import glob from 'fast-glob';
import path from 'path';
import fs from 'fs-extra';
import { isTextFile } from '../utils/fileUtils';

export interface ScanOptions {
    path: string;
    ignore?: string[];
}

export async function scanProject(options: ScanOptions): Promise<string[]> {
    const rootPath = path.resolve(options.path);

    const defaultIgnore = [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/out/**',
        '**/.git/**',
        '**/.next/**',
        '**/.nuxt/**',
        '**/.venv/**',
        '**/venv/**',
        '**/.env*',
        '**/__pycache__/**',
        '**/coverage/**',
        '**/.cache/**',
        '**/.sass-cache/**',
        '**/.turbo/**',
        '**/.docusaurus/**',
        '**/yarn-error.log',
        '**/npm-debug.log',
        '**/pnpm-debug.log',
        '**/.pnpm-store/**',
        '**/analysis-report.json',
        '**/analysis-report.html',
        '**/ai-context.md',
        '**/ai-context-*.md',
        '**/ai-context-domains/**',
        '**/project-summary.md'
    ];

    // Read and respect .gitignore patterns recursively if available
    let gitignorePatterns: string[] = [];
    try {
        const gitignoreFiles = await glob('**/.gitignore', {
            cwd: rootPath,
            dot: true,
            absolute: true,
            ignore: defaultIgnore
        });

        for (const gitignorePath of gitignoreFiles) {
            const relDir = path.relative(rootPath, path.dirname(gitignorePath));
            const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
            const patterns = gitignoreContent
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'))
                .reduce((acc: string[], line) => {
                    let pattern = line;
                    if (pattern.startsWith('/')) {
                        pattern = pattern.slice(1);
                    }
                    if (pattern.endsWith('/')) {
                        pattern = pattern.slice(0, -1);
                    }
                    if (pattern) {
                        const prefix = relDir ? `${relDir}/` : '';
                        acc.push(`**/${prefix}${pattern}`);
                        acc.push(`**/${prefix}${pattern}/**`);
                    }
                    return acc;
                }, []);
            gitignorePatterns.push(...patterns);
        }
    } catch (error) {
        console.warn('Warning: Could not parse .gitignore files:', error);
    }

    const entries = await glob('**/*', {
        cwd: rootPath,
        dot: false,
        absolute: true,
        ignore: [
            ...defaultIgnore,
            ...gitignorePatterns,
            ...(options.ignore || [])
        ],
        onlyFiles: true
    });

    // Filter for text files only (or meaningful code files)
    return entries.filter(isTextFile);
}
