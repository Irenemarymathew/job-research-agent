# Job Research Agent

An AI-powered Chrome Extension that acts as your personal job research assistant. It automatically extracts company information from job postings and uses AI to research the company, helping you decide whether to apply.

## Features

- **Side Panel Interface**: Unobtrusive sidebar that injects into any web page.
- **Auto-Detection**: Automatically detects the company name when browsing job boards (LinkedIn, Indeed, Glassdoor, etc.).
- **Step-by-Step Reasoning**: Watch the AI agent's thought process in real-time as it researches the company using various tools.
- **Actionable Verdict**: Get a final recommendation on whether to `APPLY`, `SKIP`, or `RESEARCH MORE`.
- **Exportable Logs**: Easily copy or download the full conversation history, including system prompts and raw tool outputs, for further review.

## Architecture

This extension is built with Vanilla JavaScript (Manifest V3) and uses a custom implementation of the ReAct (Reasoning and Acting) agent architecture running entirely in the background service worker.

### Tools the Agent Can Use:
- **Web Search API (GNews/Wikipedia)**: For general company research and recent news.
- **Adzuna API**: To pull job market data and salary estimates.
- **LLM Engine**: Powered by Google's Gemini API for reasoning and analysis.

(*This project requires users to enter their own API keys (Gemini, GNews) via the extension UI. No keys are stored in the repository.*)

### Code Structure

The repository has a clean, standard Chrome Extension structure:
- `manifest.json`: Configuration and permissions.
- `background.js`: Service worker containing the ReAct agent logic and API integrations.
- `content.js`: Injects the side panel UI and handles real-time message passing.
- `panel.css`: Styles for the custom injected side panel.
- `popup.html` & `popup.js`: Simple extension popup to manually trigger the side panel.

## Installation (Developer Mode)

1. Clone this repository or download the source code.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the directory containing this project.
5. The Job Research Agent icon will appear in your Chrome toolbar!

## Usage

1. Navigate to a job posting on any supported site.
2. Click the extension icon to open the side panel.
3. The agent will auto-detect the company name. You can also manually type a query.
4. Click "Research This Company" to start the AI agent.
5. Watch the reasoning chain unfold and review the final verdict.

## Privacy & Security

This extension runs locally in your browser. API requests are made directly from the extension's background script. No personal data is collected or sent to third-party servers aside from the queries made to the necessary APIs.

## License

MIT License
