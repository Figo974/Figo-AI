// Vercel serverless entry point. Vercel's Node.js runtime accepts an Express
// app directly as a request handler — server.js exports it (and skips
// app.listen()) specifically for this case; see the require.main check at
// the bottom of server.js.
module.exports = require("../server.js");
