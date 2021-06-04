const shell = require("shelljs");

// The environment variables are loaded in hardhat.config.ts
let mnemonic = process.env.MNEMONIC;
if (!mnemonic) {
  mnemonic = "testtesttesttest"
}

module.exports = {
  istanbulReporter: ["html", "lcov"],
  onCompileComplete: async function (_config) {
    await run("typechain");
  },
  onIstanbulComplete: async function (_config) {
    // We need to do this because solcover generates bespoke artifacts.
    shell.rm("-rf", "./artifacts");
    shell.rm("-rf", "./typechain");
  },
  providerOptions: {
    mnemonic,
  },
  skipFiles: ["mocks", "test"],
};
