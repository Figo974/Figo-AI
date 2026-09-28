# FigoAI — Own Model Setup

FigoAI no longer requires Groq for normal chat. It calls the model configured by `AI_BASE_URL` using the OpenAI-compatible Chat Completions format.

## Local Ollama example

1. Install Ollama and download a coding-capable model.
2. Make sure Ollama is running.
3. Set:

```env
AI_PROVIDER=custom
AI_BASE_URL=http://127.0.0.1:11434/v1/chat/completions
AI_API_KEY=ollama
AI_MODEL=<your-ollama-model>
AI_ALLOWED_MODELS=<your-ollama-model>
AI_SUPPORTS_TOOLS=true
```

For a model you trained yourself, replace `<your-ollama-model>` with the name of your model after importing/registering it in your model server.

## vLLM / llama.cpp / LM Studio / custom server

Set `AI_BASE_URL` to that server's OpenAI-compatible `/v1/chat/completions` endpoint and set `AI_MODEL` to the model identifier accepted by that server. If authentication is required, set `AI_API_KEY`.

## Coding books and documentation

Put legally usable coding references in:

`knowledge/coding/books/`

Supported files: `.md`, `.txt`, `.pdf`, `.docx`.

FigoAI retrieves relevant passages for coding questions instead of trying to place entire books into every prompt. This is the RAG layer. Restart the server after adding or replacing reference files so the index is rebuilt.

Do not package copyrighted books unless you have permission or the material is licensed for redistribution. Official documentation, open educational resources, public-domain material, and your own notes are appropriate.

## Important distinction

A model and a knowledge base are different:

- The **model** provides reasoning, generation, code completion, and language understanding.
- The **coding knowledge base** supplies reference material from your documents.
- **Fine-tuning/training** changes model behavior and weights and is a separate process.

The FigoAI architecture supports all three without requiring the application to be rewritten.
