const fs = require('fs');
const path = require('path');
const readline = require('readline');
const bcrypt = require('bcryptjs');

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('Create .env by copying .env.example first.');
  process.exit(1);
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Choose an admin password (12+ characters recommended): ', async (password) => {
  if (!password || password.length < 10) {
    console.error('Use a password of at least 10 characters.');
    rl.close();
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  let env = fs.readFileSync(envPath, 'utf8');
  if (/^ADMIN_PASSWORD_HASH=.*/m.test(env)) {
    env = env.replace(/^ADMIN_PASSWORD_HASH=.*/m, `ADMIN_PASSWORD_HASH=${hash}`);
  } else {
    env += `\nADMIN_PASSWORD_HASH=${hash}\n`;
  }
  fs.writeFileSync(envPath, env);
  console.log('Admin password hash saved to .env. Keep .env private.');
  rl.close();
});
