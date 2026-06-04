
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

    // Read and respect .gitignore patterns if available
    let gitignorePatterns: string[] = [];
    try {
        const gitignorePath = path.join(rootPath, '.gitignore');
        if (await fs.pathExists(gitignorePath)) {
            const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
            gitignorePatterns = gitignoreContent
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
                        acc.push(`**/${pattern}`);
                        acc.push(`**/${pattern}/**`);
                    }
                    return acc;
                }, []);
        }
    } catch (error) {
        console.warn('Warning: Could not parse .gitignore file:', error);
    }

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
        '**/.pnpm-store/**'
    ];

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

