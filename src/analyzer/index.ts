
import path from 'path';
import { readFileSafe } from '../utils/fileUtils';
import { parseJS, FileAnalysis } from './parsers/javascript';
import { parsePython } from './parsers/python';

export interface ProjectAnalysis {
    fileCount: number;
    files: Record<string, FileAnalysis>;
}

export async function analyzeFiles(filePaths: string[]): Promise<ProjectAnalysis> {
    const analysis: ProjectAnalysis = {
        fileCount: filePaths.length,
        files: {}
    };

    for (const filePath of filePaths) {
        const content = await readFileSafe(filePath);
        if (!content) continue;

        const ext = path.extname(filePath);
        let fileResult: FileAnalysis = { imports: [], exports: [], functions: [], classes: [] };

        if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
            fileResult = parseJS(content, filePath);
        } else if (['.py'].includes(ext)) {
            fileResult = parsePython(content, filePath);
        } else {
            // TODO: Add generic regex parser
        }

        analysis.files[filePath] = fileResult;
    }

    return analysis;
}
