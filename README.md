# Projectify

> **Autonomous Code Analysis & Visualization Engine**

Projectify is a powerful, standalone Node.js tool designed to analyze codebase architectures, calculate dependency impacts ("Blast Radius"), and generate stunning, interactive visualizations. Built with TypeScript and powered by AI.

![Projectify HTML Report](https://github.com/GreenHacker420/project-analyzer/raw/main/graph.png)
![Projectify HTML Report](https://github.com/GreenHacker420/project-analyzer/raw/main/functions.png)

## Features

- **AI-Powered Insights**: Uses OpenAI (LangChain) to summarize architecture and explain high-risk components.
- **Blast Radius Calculation**: Instantly identify the most critical files in your project based on dependency impact.
- **Interactive Visualization**: Generates a premium, Shadcn-style HTML report with physics-based graphs and search.
- **Multi-Language Support**:
  - JavaScript / TypeScript (AST-based)
  - Python (Regex/Heuristic-based)
- **Fast & Standalone**: optimized for speed, zero external Python dependencies.

## Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/projectify.git

# Install dependencies
cd projectify-cli
npm install

# Build the project
npm run build
```

## Usage

### 1. Interactive Mode (Recommended)
Simply run the CLI without arguments to launch the interactive setup wizard. It will guide you through provider selection (OpenAI, Gemini, Ollama) and API key entry.

```bash
# Using npx
npx projectify-cli

# Or if installed globally
projectify
```

### 2. Manual / CI Mode
Run non-interactively by passing arguments:

```bash
# Basic Analysis (No AI)
projectify . --no-ai

# With auto-detected environment variables
export GEMINI_API_KEY=...
projectify . --provider gemini

# Force specific provider
projectify . --provider ollama --model llama3
```

### CLI Options
- `path`: (Optional) Path to the project to analyze. Defaults to current directory.
- `--summary`: Enable AI-powered project summarization.
- `--no-ai`: Disable individual file AI analysis.

## Output

All reports are generated in the `projectify-cli` directory:

| File | Description |
|------|-------------|
| `analysis-report.html` | **Interactive Dashboard**. View dependency graphs, search nodes, and see detailed stats. |
| `analysis-report.json` | **Raw Data**. Complete dependency graph and metrics in JSON format. |
| `project-summary.md` | **AI Report**. High-level architecture overview and risk assessment. |

## Architecture

- **Scanner**: Fast-glob based file traversal.
- **Analyzer**: Babel-based AST parsing for JS/TS; Custom regex parser for Python.
- **Graph Engine**: Directed graph construction with cycle detection and impact scoring.
- **UI**: Customized `vis-network` with Tailwind CSS (Shadcn/Zinc theme).

## Developer

Developed by **GreenHacker**.


