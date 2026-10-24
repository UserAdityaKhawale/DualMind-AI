# DualMind AI

DualMind AI is a no-signup, bring-your-own-key workspace for comparing language-model responses. Selected models answer the same prompt independently, review other models' successful answers, and contribute to a final synthesis. The workspace keeps answers, review coverage, and uncertainty visible so you can inspect the available evidence.

**Model agreement is not proof that a claim is correct.** Verify important claims independently, especially for current or high-impact decisions.

The landing page and debate workspace are at **/**. The beginner guide is at **/how-to-use**.

## Contents

- [Features](#features)
- [Debate workflow](#debate-workflow)
- [Architecture](#architecture)
- [Supported models](#supported-models)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Provider keys](#provider-keys)
- [Environment configuration](#environment-configuration)
- [Provider usage and cost](#provider-usage-and-cost)
- [History and privacy](#history-and-privacy)
- [HTTP API](#http-api)
- [Database status](#database-status)
- [Development commands](#development-commands)
- [Testing and build](#testing-and-build)
- [Deployment notes](#deployment-notes)
- [Repository layout](#repository-layout)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)

## Features

- Independent first responses from OpenAI, Google Gemini, and Anthropic Claude.
- Directed peer reviews of successful answers. A model is not asked to review its own answer.
- A synthesis stage based on the answers and reviews available to it.
- Streaming text for independent answers, with per-operation status and elapsed time.
- Provider-reported token usage when supplied.
- Per-model answer retry and separate synthesis retry controls.
- Configurable selected-model and parallel-operation limits, and a preferred synthesizer.
- Browser-local history, reopening/deletion/clear actions, and Markdown export.
- Responsive marketing page and navigation, plus the beginner guide at **/how-to-use**.
- Request validation, prompt and output limits, provider timeouts, API rate limits, and sanitized provider errors.

## Debate workflow

1. Add keys for providers you plan to use, choose models, and enter a prompt.
2. Each selected model receives the original prompt independently. It does not see other models' first answers.
3. For each successful answer, the app may ask every other selected model to review it. Reviews look for gaps, assumptions, and possible errors; they remain model-generated output.
4. An eligible selected model synthesizes the available answers and reviews. If an attempt fails, the app can try another eligible configured model.
5. The workspace shows each response, review, synthesis, status, and provider-reported usage when available. A failure in one operation does not erase successful results from other operations.

Single-model runs are supported and skip cross-review. For **N** selected models with all answers available, a complete run may use up to **N answer calls + N × (N - 1) directed review calls + 1 synthesis call**. Retries and provider connection tests add calls. This is a call count, not a price estimate.

## Architecture

~~~mermaid
flowchart LR
  Browser[React and Vite workspace]
  Keys[Provider keys in current-tab memory]
  History[IndexedDB history in this browser]
  Proxy[Vite development API proxy]
  API[Express API with Zod validation and rate limits]
  Adapters[Provider adapters]
  OpenAI[OpenAI API]
  Gemini[Google Gemini API]
  Claude[Anthropic API]

  Browser --> Keys
  Browser --> History
  Browser --> Proxy --> API --> Adapters
  Adapters --> OpenAI
  Adapters --> Gemini
  Adapters --> Claude
~~~

The client is React, Vite, and Tailwind CSS. The server is Node.js and Express. In local development, Vite forwards **/api** requests to Express. The API validates each operation, selects an adapter for a registered model, and forwards the supplied provider key to that provider.

The active workflow does not use PostgreSQL for conversation storage. Browser history is stored in IndexedDB. See [Database status](#database-status) before using the retained SQL files.

## Supported models

The model registry is explicit in **server/src/providers/registry.js**. Models are not discovered dynamically.

| Provider | Current model ID | Capabilities |
| --- | --- | --- |
| OpenAI | **gpt-5.5** | Generation, review, synthesis, streaming |
| Google Gemini | **gemini-3.8-flash** | Generation, review, synthesis, streaming |
| Anthropic Claude | **claude-sonnet-4-6** | Generation, review, synthesis, streaming |

Provider access, permissions, quotas, billing, and model availability are controlled by each provider account. Update the registry and adapter to add or change an integration.

## Requirements

- Node.js 22 or newer.
- npm 10 or newer. This repository uses npm workspaces and includes a lockfile.
- An API account and usable key for each provider/model you plan to call.

## Quick start

From the project root, install dependencies from the lockfile and start the API and web client together:

~~~powershell
npm.cmd ci
npm.cmd run dev
~~~

Open **http://localhost:5173**. The API health endpoint is **http://localhost:3000/api/health**. A healthy Express process returns JSON status **ok**; this check does not test provider keys or PostgreSQL.

To start the API and client separately, use two terminals:

~~~powershell
# Terminal 1: API
npm.cmd run dev --workspace=server

# Terminal 2: Vite client
npm.cmd run dev --workspace=client
~~~

The client needs the API for model discovery and debate requests. **npm.cmd run start** starts only the API; it does not start Vite.

### If port 3000 is already in use

Choose an available API port and point the Vite proxy to the same port in the PowerShell terminal where you start the app:

~~~powershell
$env:PORT = '3001'
$env:API_ORIGIN = 'http://localhost:3001'
npm.cmd run dev
~~~

Then open **http://localhost:5173** and check **http://localhost:3001/api/health**. Use another port if 3001 is occupied.

## Provider keys

1. Open the workspace and find **Provider setup**.
2. Paste a key in the card for the matching provider.
3. Optionally select **Test connection** to send a short provider request.
4. Select the models, enter your prompt, and run the debate.

A connection test is a real provider request and may consume quota or incur a charge. Keys are held in React memory in the current tab and are cleared when the tab reloads or closes. The client does not save keys to browser storage.

For an operation, the key is sent to the Express server and used for the provider request. The server does not write keys to debate history or logs. The root **.env** file is for app settings only; never put provider keys in it, source files, or client build variables.

Use HTTPS for remote deployments. This project does not include user authentication. Do not expose a development server publicly or provide a shared provider key for anonymous visitors.

## Environment configuration

The root **.env** file is optional; the server supplies defaults. To create a local copy of the safe template:

~~~powershell
Copy-Item .env.example .env
~~~

**.env** and other **.env.*** files are ignored by Git. **.env.example** is intentionally included and contains app settings, not provider secrets.

| Variable | Default | Purpose |
| --- | --- | --- |
| **PORT** | 3000 | Express API listening port. |
| **CLIENT_ORIGIN** | http://localhost:5173 | Browser origin allowed by API CORS. |
| **REQUEST_TIMEOUT_MS** | 45000 | Provider request timeout in milliseconds. |
| **MAX_PROMPT_CHARS** | 12000 | Maximum accepted prompt length. |
| **MAX_OUTPUT_TOKENS** | 2048 | Output-token limit requested from a provider. |
| **MAX_SELECTED_MODELS** | 4 | Default selected-model limit; server accepts configured values up to 6. |
| **MAX_PARALLEL_REQUESTS** | 4 | Default parallel-operation limit exposed to the client. |

Settings are validated at server startup; an invalid value prevents startup. **API_ORIGIN** is a Vite development setting for routing **/api** to a non-default API port. It is not a provider key.

## Provider usage and cost

DualMind AI does not charge for model inference. Providers may charge the account associated with each key for answer generation, reviews, synthesis, and connection tests according to their current pricing and account terms.

The workspace shows the planned operation count and provider-reported token usage when available. It does not currently estimate monetary prices. Check each provider's usage and billing dashboard for charges. Lower the parallel-operation setting if you prefer fewer requests to run simultaneously.

## History and privacy

- **Provider keys:** held in current-tab memory, sent to the app server only with operations that use them, and excluded from history.
- **Debates:** stored in IndexedDB in the current browser profile. Records include prompts, selected models, answers, reviews, synthesis, statuses, timestamps, and usage metadata.
- **Server storage:** the active API does not save debates in PostgreSQL.
- **Markdown exports:** include the prompt, answers, available reviews, and synthesis. Review an export before sharing it.
- **Deletion:** the workspace can delete a record or clear local history. This does not remove provider-side records, browser backups, or copies and exports already made.

History is not synced across accounts or devices. Browser settings can remove local data; private or restricted browsing can prevent local storage.

## HTTP API

In local development, same-origin **/api** requests are forwarded by Vite to Express.

| Method and route | Purpose | Main request fields |
| --- | --- | --- |
| **GET /api/health** | Confirms the Express process responds; does not check providers or PostgreSQL. | None |
| **GET /api/models** | Lists the registered providers/models and workflow limits. | None |
| **POST /api/provider-test** | Sends a short test generation. | modelId, apiKey |
| **POST /api/generate** | Generates one independent response. | prompt, modelId, apiKey |
| **POST /api/generate/stream** | Streams an independent response with server-sent events: delta, done, or error. | prompt, modelId, apiKey |
| **POST /api/review** | Reviews a target answer and rejects self-review. | prompt, answer, reviewer modelId, targetModel, apiKey |
| **POST /api/synthesize** | Synthesizes supplied answers and available reviews. | prompt, modelId, apiKey, results, reviews |

Operation payloads are validated with Zod. JSON bodies are limited to 768 KB; prompt, model, and answer inputs have length checks, and model IDs must exist in the registry. Operation routes are rate-limited to **80 requests per IP per 15 minutes**. Responses disable caching. Public provider errors are sanitized; failure logs include provider and error-code context, not request credentials.

## Database status

PostgreSQL is **not required** to run the current app. The active client stores history in IndexedDB, and Express does not connect to PostgreSQL or expose server-side conversation-history routes.

The repository retains **server/migrations/001_initial_schema.sql**, **server/migrations/002_workflow_history.sql**, and database helper files from an earlier persistence design. They are not used by the active workflow and should not be applied as part of the current setup. Automated tests check migration-file formatting; they do not run migrations or verify database connectivity.

## Development commands

Run these from the project root unless a workspace is specified.

| Command | Description |
| --- | --- |
| **npm.cmd ci** | Installs dependencies from package-lock.json. |
| **npm.cmd run dev** | Starts Express and Vite together. |
| **npm.cmd run build** | Builds the client into client/dist/. |
| **npm.cmd test** | Runs Vitest in the server workspace. |
| **npm.cmd run start** | Starts only Express. |
| **npm.cmd run dev --workspace=server** | Starts the API in watch mode. |
| **npm.cmd run dev --workspace=client** | Starts only the Vite client. |
| **npm.cmd run preview --workspace=client** | Previews the built client; does not start the API. |

## Testing and build

Run the current test suite and production build:

~~~powershell
npm.cmd test
npm.cmd run build
~~~

Vitest covers API validation and error handling, workflow behavior, provider adapters, database helper behavior, migration-file formatting, and server-rendered client views. Provider adapters are mocked in automated tests. Passing tests do not verify live credentials, account quotas, billing, or external provider availability.

The production build writes static assets to **client/dist/**. A deployed site must route API requests to an Express server.

## Deployment notes

1. Build the client with **npm run build** and deploy **client/dist/** to a static host or serve it from a production web server.
2. Route **/api/** requests to the Express API.
3. Set **CLIENT_ORIGIN** to the exact deployed web origin and configure server settings in the hosting platform.
4. Use HTTPS between the browser and app server because operation requests contain the user's provider key.
5. Add access controls, monitoring, and abuse protections appropriate for the intended audience.

The Vite proxy is for development only. The API has no user authentication and its built-in rate limit is per IP. Do not publish the development server as a production service without appropriate protections.

## Repository layout

~~~text
.
├── client/
│   ├── public/duamind-logo.png        # Supplied DualMind AI wordmark
│   ├── src/
│   │   ├── AppV2.jsx                  # Active landing page and debate workspace
│   │   ├── HowToUse.jsx               # Beginner guide route
│   │   ├── SiteHeader.jsx             # Shared responsive header and wordmark
│   │   ├── debate.js                  # Client workflow helpers
│   │   ├── history.js                 # Browser IndexedDB history
│   │   ├── index.css                  # Tailwind import and app styles
│   │   └── main.jsx                   # React entry point
│   └── vite.config.js                 # React, Tailwind, development API proxy
├── server/
│   ├── migrations/                    # Retained SQL; not used by active app
│   └── src/
│       ├── debate-app.js              # Express API routes and validation
│       ├── config.js                  # Validated server settings
│       ├── providers/                 # Registry, adapters, safe provider errors
│       ├── db/                        # Retained, inactive PostgreSQL helpers
│       └── *.test.js                  # Vitest tests
├── .env.example                       # Safe server configuration template
├── package.json                       # npm workspaces and root commands
└── package-lock.json                  # Locked dependency graph
~~~

**client/src/main.jsx** loads **AppV2.jsx**. **client/src/App.jsx** is retained but is not the active entry point.

## Troubleshooting

### Browser shows a directory listing or blank page

Open the Vite address, normally **http://localhost:5173**, rather than the API on port 3000. Express returns JSON under **/api**; it does not serve the development client.

### Port 3000 is already in use

Select another available port and set both **PORT** and **API_ORIGIN** as described in [Quick start](#quick-start), then restart the root development command.

### No models appear

Confirm Express is running and **/api/health** responds. If the client uses a different origin, set **CLIENT_ORIGIN** to that exact origin and restart the API. In local development, the client should use the Vite **/api** proxy.

### Provider rejects a key or model

Check the key in the provider's dashboard, verify API access and account status, and confirm the model is available to that account. Provider access, billing, quotas, and availability are independent of this app.

### A request times out, is rate-limited, or fails

Wait, check provider availability and quota, and lower parallel operations if many requests are in flight. A retry may create another billable request. Successful results from other stages remain available.

### Local history is missing

History belongs to the browser profile where the debate ran. Use the same profile and make sure browser storage is enabled. Private browsing, cleared site data, or storage restrictions may remove or prevent local history.

## Known limitations

- Model discovery is not dynamic; the code registry must be updated when providers change model IDs.
- Monetary estimates, optional web research, and citation gathering are not implemented.
- Independent answers stream; reviews and synthesis return when each operation completes.
- Provider request cancellation is not implemented.
- Advanced settings expose workflow concurrency and synthesizer preference, not every provider-specific generation parameter.
- History is local to one browser profile and device; there are no user accounts or cross-device sync.
- Retained PostgreSQL files are not connected to the active conversation workflow.
- Model agreement and model-generated reviews can still be wrong; neither replaces independent verification.
