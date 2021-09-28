const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

const runCommand = async (command, fullPath) => {
    return new Promise((resolve, reject) => {
        exec(command, { cwd: fullPath }, (e) => { 
            if (e) {
                console.error(e);
                process.exit(1);
            }
            resolve();
        });
    });
}

const run = async() => {
    console.log(`Cleaning any old tests`);
    fs.rmdirSync(path.join(__dirname, './.bookshop-tmp-test-dir'), { recursive: true });
    console.log(`Pre-installing Jekyll Gemfile(s)`);
    await runCommand('bundle install', path.join(__dirname, "./support/starters/jekyll"));
    await runCommand('BUNDLE_GEMFILE="Gemfile.cloudcannon" bundle install', path.join(__dirname, "./support/starters/jekyll"));
    console.log(`Eleventy is pre-installed in the integration-tests folder`);
}

run();