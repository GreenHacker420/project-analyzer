
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { scanProject } from './scanner';
import { analyzeFiles } from './analyzer';
import { DependencyGraph } from './graph';
import { CodeIntelligence } from './ai';

const program = new Command();

program
    .name('projectify')
    .description('Projectify - Autonomous Code Analysis & Visualization')
    .version('2.0.0');

program
    .argument('[path]', 'Project path to analyze', '.')
    .option('--no-ai', 'Skip AI analysis')
    .option('--summary', 'Generate full project summary')
    .action(async (projectPath, options) => {
        try {
            console.log(chalk.blue(`🚀 Starting analysis for: ${projectPath}`));

            // 1. Scan
            console.log(chalk.yellow('scanning files...'));
            const files = await scanProject({ path: projectPath });
            console.log(chalk.green(`found ${files.length} files.`));

            // 2. Analyze
            console.log(chalk.yellow('parsing codebase...'));
            const analysis = await analyzeFiles(files);

            // 3. Build Graph
            console.log(chalk.yellow('building dependency graph...'));
            const graph = new DependencyGraph(analysis);
            const topRisks = graph.getTopBlastRadius(5);

            console.log(chalk.bold.underline('\n🔥 Top Blast Radius Risks:'));
            topRisks.forEach(node => {
                console.log(
                    `${chalk.cyan(path.basename(node.id))} : ${chalk.red(node.blastRadius.toFixed(1) + '%')} impact (${node.affectedFiles} files)`
                );
            });

            // 4. AI Analysis
            let ai: CodeIntelligence | null = null;
            if (options.ai) {
                const apiKey = process.env.OPENAI_API_KEY;
                if (!apiKey) {
                    console.log(chalk.red('\n⚠️  OPENAI_API_KEY not found. Skipping AI analysis.'));
                } else {
                    console.log(chalk.blue('\n🧠 Running AI Insight Analysis...'));
                    ai = new CodeIntelligence(apiKey);

                    // Analyze the highest risk file
                    if (topRisks.length > 0) {
                        const riskiest = topRisks[0];
                        console.log(chalk.gray(`Analyzing ${path.basename(riskiest.id)}...`));
                        const insight = await ai.analyzeBlastRadius(riskiest);
                        console.log(chalk.white(insight));
                    }
                }
            }

            // 5. Save Report
            const reportPath = path.resolve('analysis-report.json');
            await fs.writeJSON(reportPath, {
                timestamp: new Date(),
                files: analysis.fileCount,
                topRisks,
                fullAnalysis: analysis
            }, { spaces: 2 });
            console.log(chalk.green(`\n✅ JSON Report saved to ${reportPath}`));

            const htmlPath = path.resolve('analysis-report.html');
            const { generateHtmlReport } = require('./report/htmlGenerator');
            await generateHtmlReport(projectPath, analysis, graph, htmlPath);
            console.log(chalk.green(`✅ HTML Graph saved to ${htmlPath}`));

            // 6. Advanced Project Summary
            if (options.ai && options.summary && ai) {
                console.log(chalk.blue('\n🧠 Generating Project Summary...'));
                const fileList = Object.keys(analysis.files);
                const summary = await ai.generateProjectSummary(analysis.fileCount, topRisks, fileList);
                console.log(chalk.white(chalk.bold('\nProject Overview:\n') + summary));

                // Add to report
                const summaryPath = path.resolve('project-summary.md');
                await fs.writeFile(summaryPath, summary);
                console.log(chalk.green(`✅ Summary saved to ${summaryPath}`));
            }

        } catch (error) {
            console.error(chalk.red('Analysis failed:'), error);
            process.exit(1);
        }
    });

program.parse();
