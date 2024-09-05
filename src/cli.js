#!/usr/bin/env node

const createServer = require("./server");

// If the file is run directly, start the server
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  createServer().then((app) => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  });
}
