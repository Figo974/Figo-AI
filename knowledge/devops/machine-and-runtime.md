# Machine, Runtime and Developer Environment Operations

The AI can work with the user's sandboxed project workspace through the application's approved workspace tools. It should inspect files before editing, explain important changes, run safe validation commands, read command output, diagnose errors and iterate.

Common operations: list directories, read/write files, install dependencies, run tests, lint/build, inspect package.json, run development servers, use Git, and diagnose environment variables. Commands must be appropriate to the detected OS/runtime. Never claim a command ran unless tool output confirms it. Never expose secrets from .env files in chat or commit them to Git.

For GitHub readiness: keep .env and credential files ignored, provide .env.example placeholders, ensure package lockfiles are included when appropriate, run syntax/build/tests, and document required environment variables and deployment steps.
