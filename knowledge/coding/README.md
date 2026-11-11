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


## Professional programming expansion

The knowledge base now includes dedicated references for:
- SQL and database engines: PostgreSQL, MySQL, MariaDB, SQLite, SQL Server/T-SQL, Oracle/PLSQL, and other common SQL systems
- Windows CMD, PowerShell, Bash/Linux, Git, package-manager CLIs, Docker and developer tooling
- HTML, CSS, JavaScript, TypeScript, Python, Java, C, C++, C#, Go, Rust, PHP, Ruby, Kotlin and Swift
- React, Next.js, Vue, Angular, Node.js, Express, Django, Flask and FastAPI
- Full-stack APIs, security, testing, debugging, deployment and database engineering

These references are retrieval context, not a claim that the underlying model weights were retrained.
