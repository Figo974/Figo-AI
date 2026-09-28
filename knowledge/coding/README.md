# FigoAI Coding Knowledge Base

FigoAI uses retrieval-augmented generation (RAG) for coding questions. Put coding reference material in this folder and restart the server; the server will index Markdown, TXT, PDF, and DOCX files automatically.

Supported subject areas include:

- HTML and accessibility
- CSS, responsive design, animations, and modern layout
- JavaScript and TypeScript
- Vue.js and React.js
- Node.js and backend development
- Python
- C and C++
- Java
- SQL and databases
- PHP, Go, Rust, Kotlin, and Swift
- Algorithms and data structures
- Machine learning and AI engineering
- APIs, HTTP, authentication, security, testing, debugging
- Git, Linux, Docker, CI/CD, deployment, and cloud fundamentals

## Adding books and documentation

Place material you are legally allowed to use in `knowledge/coding/books/`. FigoAI does not require retraining for every book: it retrieves relevant passages and supplies them to the model when a coding question matches.

Do not redistribute copyrighted books unless you have the necessary rights or the material is licensed for redistribution. Official documentation, open educational resources, public-domain material, and your own notes are suitable sources.

The model remains the reasoning engine; the knowledge base supplies reference context. This is more maintainable than trying to train every book directly into the model.
