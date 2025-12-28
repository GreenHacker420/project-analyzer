import { Command } from 'commander';
import inquirer = require('inquirer');
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { scanProject } from './scanner';
import { analyzeFiles } from './analyzer';
import { DependencyGraph } from './graph';
import { CodeIntelligence, AiProviderType } from './ai';
import { GitService } from './utils/gitUtils';

const program = new Command();

program
    .name('projectify')
    .description('Projectify - Autonomous Code Analysis & Visualization')
    .version('2.0.1');

program
    .argument('[path]', 'Project path to analyze', '.')
    .option('--no-ai', 'Skip AI analysis')
    .option('--summary', 'Generate full project summary')
    .option('--provider <type>', 'AI Provider (openai, gemini, ollama)')
    .option('--model <name>', 'Model name (optional)')
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
                    console.log(chalk.red('\n⚠️  API Key is required for this provider.'));
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
                        if (options.summary) {
                            console.log(chalk.blue('\n🧠 Generating Project Summary...'));
                            const fileList = Object.keys(analysis.files);
                            projectSummary = await ai.generateProjectSummary(analysis.fileCount, topRisks, fileList);
                            console.log(chalk.white(chalk.bold('\nProject Overview:\n') + projectSummary));
                        }

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
            // Check if we need to pass new data to html generator. 
            // For now, we just pass the same args, assuming HTML generator might need updates later 
            // but the JSON report is the source of truth for raw data.
            await generateHtmlReport(projectPath, analysis, graph, htmlPath, gitStats);
            console.log(chalk.green(`✅ HTML Graph saved to ${htmlPath}`));

            // Save Summary MD
            if (projectSummary) {
                const summaryPath = path.resolve('project-summary.md');
                const content = `# Project Summary\n\n${projectSummary}\n\n## Evolution Insights\n\n${gitInsight}`;
                await fs.writeFile(summaryPath, content);
                console.log(chalk.green(`✅ Summary saved to ${summaryPath}`));
            }

        } catch (error) {
            console.error(chalk.red('Analysis failed:'), error);
            process.exit(1);
        }
    });

program.parse();
