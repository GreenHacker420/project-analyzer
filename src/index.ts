import { Command } from 'commander';
import inquirer = require('inquirer');
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { scanProject } from './scanner';
import { analyzeFiles } from './analyzer';
import { DependencyGraph } from './graph';
import * as dotenv from 'dotenv';

// Load env from current working directory
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { CodeIntelligence, AiProviderType } from './ai';
import { GitService } from './utils/gitUtils';

const program = new Command();

program
    .name('projectify')
    .description('Projectify - Autonomous Code Analysis & Visualization')
    .version('2.1.6')
    .argument('[path]', 'Project path to analyze', '.')
    .option('--no-ai', 'Skip AI analysis')
    .option('--summary', 'Generate full project summary')
    .option('--provider <type>', 'AI Provider (openai, gemini, ollama)')
    .option('--model <name>', 'Model name (optional)')
    .option('--ignore <patterns>', 'Comma-separated list of additional glob patterns to ignore')
    .option('--all', 'Analyze all files and folders without interactive prompt')
    .action(async (projectPath, options) => {
        try {
            console.log(chalk.blue(`🚀 Starting analysis for: ${projectPath}`));

            // 1. Scan
            console.log(chalk.yellow('scanning files...'));
            const scanOptions: any = { path: projectPath };
            if (options.ignore) {
                scanOptions.ignore = options.ignore.split(',').map((p: string) => p.trim());
            }
            let files = await scanProject(scanOptions);
            console.log(chalk.green(`found ${files.length} files.`));

            if (files.length === 0) {
                console.log(chalk.red('No files found to analyze.'));
                process.exit(1);
            }

            // Filter files/directories interactively
            if (!options.all && files.length > 0) {
                const relativePaths = files.map(file => path.relative(projectPath, file));
                const topLevelItems = Array.from(new Set(
                    relativePaths.map(rPath => rPath.split(path.sep)[0])
                )).sort();

                if (topLevelItems.length > 1) {
                    const answer = await inquirer.prompt([
                        {
                            type: 'checkbox',
                            name: 'selected',
                            message: 'Select files/folders to include in the analysis (Space to deselect/select, Enter to confirm):',
                            choices: topLevelItems.map(item => ({
                                name: item,
                                value: item,
                                checked: true
                            }))
                        }
                    ]);

                    const selectedSet = new Set(answer.selected);
                    files = files.filter(file => {
                        const rel = path.relative(projectPath, file);
                        const topLevel = rel.split(path.sep)[0];
                        return selectedSet.has(topLevel);
                    });

                    console.log(chalk.green(`filtered to ${files.length} files.`));

                    if (files.length === 0) {
                        console.log(chalk.red('No files selected for analysis. Exiting.'));
                        process.exit(0);
                    }
                }
            }

            // 2. Analyze
            console.log(chalk.yellow('parsing codebase...'));
            const analysis = await analyzeFiles(files);

            // 3. Git Analysis
            console.log(chalk.yellow('analyzing git history...'));
            const gitService = new GitService(projectPath);
            const gitStats = await gitService.getAnalysis();
            if (gitStats) {
                console.log(chalk.green(`git history found: ${gitStats.totalCommits} commits, ${gitStats.authroStats.length} authors.`));
            } else {
                console.log(chalk.gray('no git repository found or git error.'));
            }

            // 4. Build Graph
            console.log(chalk.yellow('building dependency graph...'));
            const graph = new DependencyGraph(analysis);
            const topRisks = graph.getTopBlastRadius(5);

            console.log(chalk.bold.underline('\n🔥 Top Blast Radius Risks:'));
            topRisks.forEach(node => {
                console.log(
                    `${chalk.cyan(path.basename(node.id))} : ${chalk.red(node.blastRadius.toFixed(1) + '%')} impact (${node.affectedFiles} files)`
                );
            });

            // 5. AI Analysis
            let ai: CodeIntelligence | null = null;
            let projectSummary = '';
            let gitInsight = '';

            if (options.ai) {
                let providerType = options.provider as AiProviderType;

                // Interactive Provider Selection
                if (!providerType) {
                    const answer = await inquirer.prompt([
                        {
                            type: 'list',
                            name: 'provider',
                            message: 'Select AI Provider for analysis:',
                            choices: ['openai', 'gemini', 'ollama']
                        }
                    ]);
                    providerType = answer.provider;
                }

                // Interactive Model Selection
                if (!options.model) {
                    let modelChoices: string[] = [];
                    if (providerType === 'openai') {
                        modelChoices = ['gpt-4o', 'gpt-5.2', 'gpt-4.1'];
                    } else if (providerType === 'gemini') {
                        modelChoices = ['gemini-3-pro-preview', 'gemini-3-flash-preview'];
                    }

                    if (modelChoices.length > 0) {
                        const answer = await inquirer.prompt([
                            {
                                type: 'list',
                                name: 'model',
                                message: `Select ${providerType} Model:`,
                                choices: modelChoices
                            }
                        ]);
                        options.model = answer.model;
                    } else if (providerType === 'ollama') {
                        const answer = await inquirer.prompt([
                            {
                                type: 'input',
                                name: 'model',
                                message: 'Enter Ollama Model Name (e.g., llama3):',
                                default: 'llama3'
                            }
                        ]);
                        options.model = answer.model;
                    }
                }

                let apiKey = '';

                if (providerType === 'openai') {
                    apiKey = process.env.OPENAI_API_KEY || '';
                    if (!apiKey) {
                        const answer = await inquirer.prompt([
                            {
                                type: 'password',
                                name: 'apiKey',
                                message: 'Enter OpenAI API Key:',
                                mask: '*'
                            }
                        ]);
                        apiKey = answer.apiKey;
                    }
                } else if (providerType === 'gemini') {
                    apiKey = process.env.GEMINI_API_KEY || '';
                    if (!apiKey) {
                        const answer = await inquirer.prompt([
                            {
                                type: 'password',
                                name: 'apiKey',
                                message: 'Enter Gemini API Key:',
                                mask: '*'
                            }
                        ]);
                        apiKey = answer.apiKey;
                    }
                }

                if (!apiKey && providerType !== 'ollama') {
                    console.log(chalk.red('\  API Key is required for this provider.'));
                }

                if ((providerType === 'ollama') || apiKey) {
                    try {
                        console.log(chalk.blue(`\n🧠 Initializing AI (${providerType})...`));
                        ai = new CodeIntelligence(providerType, apiKey, options.model);

                        // Analyze the highest risk file
                        if (topRisks.length > 0) {
                            const riskiest = topRisks[0];
                            console.log(chalk.gray(`Analyzing ${path.basename(riskiest.id)}...`));
                            const insight = await ai.analyzeBlastRadius(riskiest);
                            console.log(chalk.white(insight));
                        }

                        // Detailed Project Summary
                        console.log(chalk.blue('\n🧠 Generating Project Summary...'));
                        const fileList = Object.keys(analysis.files);
                        projectSummary = await ai.generateProjectSummary(analysis.fileCount, topRisks, fileList);
                        console.log(chalk.white(chalk.bold('\nProject Overview:\n') + projectSummary));

                        // Git Evolution Insight
                        if (gitStats) {
                            console.log(chalk.blue('\n🧠 Analyzing Project Evolution...'));
                            gitInsight = await ai.analyzeGitHistory(gitStats);
                            console.log(chalk.white(chalk.bold('\nGit Insights:\n') + gitInsight));
                        }

                    } catch (e: any) {
                        console.error(chalk.red(`AI Initialization failed: ${e.message}`));
                    }
                }
            }

            // 6. Save Report
            const reportPath = path.resolve('analysis-report.json');
            await fs.writeJSON(reportPath, {
                timestamp: new Date(),
                files: analysis.fileCount,
                topRisks,
                gitAnalysis: gitStats,
                aiInsights: {
                    projectSummary,
                    gitInsight
                },
                fullAnalysis: analysis
            }, { spaces: 2 });
            console.log(chalk.green(`\n✅ JSON Report saved to ${reportPath}`));

            const htmlPath = path.resolve('analysis-report.html');
            const { generateHtmlReport } = require('./report/htmlGenerator');
            await generateHtmlReport(projectPath, analysis, graph, htmlPath, gitStats);
            console.log(chalk.green(`✅ HTML Graph saved to ${htmlPath}`));

            // Save AI Context Report
            const aiContextPath = path.resolve('ai-context.md');
            const { generateAiContext } = require('./report/aiContextGenerator');
            await generateAiContext(graph, analysis, aiContextPath);
            console.log(chalk.green(`✅ AI Context Report saved to ${aiContextPath}`));

            // Save Summary MD
            if (projectSummary || gitInsight) {
                const summaryPath = path.resolve('project-summary.md');
                const content = `# Project Summary\n\n${projectSummary || 'No summary generated.'}\n\n## Evolution Insights\n\n${gitInsight || 'No git composition analysis available.'}`;
                await fs.writeFile(summaryPath, content);
                console.log(chalk.green(`✅ Summary saved to ${summaryPath}`));
            }

            // Ensure generated files are in .gitignore
            await ensureGitignore(projectPath);

        } catch (error) {
            console.error(chalk.red('Analysis failed:'), error);
            process.exit(1);
        }
    });

async function ensureGitignore(projectPath: string) {
    try {
        const gitignorePath = path.join(path.resolve(projectPath), '.gitignore');
        const patternsToIgnore = [
            'analysis-report.json',
            'analysis-report.html',
            'ai-context.md',
            'project-summary.md'
        ];

        let content = '';
        if (await fs.pathExists(gitignorePath)) {
            content = await fs.readFile(gitignorePath, 'utf-8');
        }

        const lines = content.split(/\r?\n/).map(line => line.trim());
        const missingPatterns = patternsToIgnore.filter(pattern => {
            return !lines.some(line => {
                if (line.startsWith('#')) return false;
                const cleanLine = line.replace(/^\//, '').replace(/\/$/, '').replace(/^\*\*\//, '');
                return cleanLine === pattern;
            });
        });

        if (missingPatterns.length > 0) {
            let newContent = content;
            if (newContent && !newContent.endsWith('\n')) {
                newContent += '\n';
            }
            newContent += '\n# Projectify reports\n';
            missingPatterns.forEach(pattern => {
                newContent += `${pattern}\n`;
            });
            await fs.writeFile(gitignorePath, newContent, 'utf-8');
            console.log(chalk.green(`✅ Added reports to ${gitignorePath}`));
        }
    } catch (e) {
        console.warn(`⚠️  Failed to update .gitignore: ${e}`);
    }
}

program.parse();
