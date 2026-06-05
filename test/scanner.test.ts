import fs from 'fs-extra';
import path from 'path';
import { scanProject } from '../src/scanner';

describe('Project Scanner Ignore List', () => {
    const tempDir = path.join(__dirname, 'temp-scan-test');

    beforeEach(async () => {
        await fs.ensureDir(tempDir);
        // Create valid text files in source
        await fs.outputFile(path.join(tempDir, 'src/index.ts'), 'console.log("hello");');
        await fs.outputFile(path.join(tempDir, 'src/components/button.tsx'), 'export const Button = () => null;');
    });

    afterEach(async () => {
        await fs.remove(tempDir);
    });

    it('should scan source files but ignore default waste files', async () => {
        // Create waste files/directories
        await fs.outputFile(path.join(tempDir, 'node_modules/dep/index.js'), 'module.exports = {};');
        await fs.outputFile(path.join(tempDir, '.venv/lib/site-packages/package/__init__.py'), '# init');
        await fs.outputFile(path.join(tempDir, 'venv/bin/activate'), '# activate script');
        await fs.outputFile(path.join(tempDir, '.next/server/pages/index.js'), 'export default () => null;');
        await fs.outputFile(path.join(tempDir, 'dist/bundle.js'), 'console.log("dist");');
        await fs.outputFile(path.join(tempDir, 'build/index.html'), '<html></html>');
        await fs.outputFile(path.join(tempDir, '.git/config'), '[core]\nrepositoryformatversion = 0');

        const files = await scanProject({ path: tempDir });
        const relativeFiles = files.map(f => path.relative(tempDir, f)).sort();

        // Should find source files
        expect(relativeFiles).toContain(path.join('src', 'index.ts'));
        expect(relativeFiles).toContain(path.join('src', 'components', 'button.tsx'));

        // Should NOT find waste files/folders
        expect(relativeFiles).not.toContain(path.join('node_modules', 'dep', 'index.js'));
        expect(relativeFiles).not.toContain(path.join('.venv', 'lib', 'site-packages', 'package', '__init__.py'));
        expect(relativeFiles).not.toContain(path.join('venv', 'bin', 'activate'));
        expect(relativeFiles).not.toContain(path.join('.next', 'server', 'pages', 'index.js'));
        expect(relativeFiles).not.toContain(path.join('dist', 'bundle.js'));
        expect(relativeFiles).not.toContain(path.join('build', 'index.html'));
        expect(relativeFiles).not.toContain(path.join('.git', 'config'));
    });

    it('should ignore generated Projectify report artifacts', async () => {
        await fs.outputFile(path.join(tempDir, 'analysis-report.json'), '{}');
        await fs.outputFile(path.join(tempDir, 'analysis-report.html'), '<html></html>');
        await fs.outputFile(path.join(tempDir, 'ai-context.md'), '# context');
        await fs.outputFile(path.join(tempDir, 'ai-context-index.md'), '# index');
        await fs.outputFile(path.join(tempDir, 'project-summary.md'), '# summary');

        const files = await scanProject({ path: tempDir });
        const relativeFiles = files.map(f => path.relative(tempDir, f));

        expect(relativeFiles).not.toContain('analysis-report.json');
        expect(relativeFiles).not.toContain('analysis-report.html');
        expect(relativeFiles).not.toContain('ai-context.md');
        expect(relativeFiles).not.toContain('ai-context-index.md');
        expect(relativeFiles).not.toContain('project-summary.md');
    });

    it('should respect custom ignore options', async () => {
        await fs.outputFile(path.join(tempDir, 'src/custom-ignored.ts'), 'console.log("custom");');

        const files = await scanProject({ 
            path: tempDir,
            ignore: ['**/custom-ignored.ts']
        });
        const relativeFiles = files.map(f => path.relative(tempDir, f));

        expect(relativeFiles).toContain(path.join('src', 'index.ts'));
        expect(relativeFiles).not.toContain(path.join('src', 'custom-ignored.ts'));
    });

    it('should respect .gitignore patterns', async () => {
        await fs.outputFile(path.join(tempDir, 'src/git-ignored.ts'), 'console.log("git-ignored");');
        await fs.outputFile(path.join(tempDir, '.gitignore'), 'src/git-ignored.ts\n# some comment\n');

        const files = await scanProject({ path: tempDir });
        const relativeFiles = files.map(f => path.relative(tempDir, f));

        expect(relativeFiles).toContain(path.join('src', 'index.ts'));
        expect(relativeFiles).not.toContain(path.join('src', 'git-ignored.ts'));
    });
});
