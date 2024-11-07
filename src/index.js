const { join } = require('path');
const { exec } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

global.log = (area, ...args) => console.log(`[\x1b[38;2;88;101;242mOpenAsar\x1b[0m > ${area}]`, ...args); // Make log global for easy usage everywhere

global.oaVersion = 'nightly';

log('Init', 'OpenAsar', oaVersion);

if (process.resourcesPath.startsWith('/usr/lib/electron')) global.systemElectron = true; // Using system electron, flag for other places
process.resourcesPath = join(__dirname, '..'); // Force resourcesPath for system electron

const paths = require('./paths');
paths.init();

global.settings = require('./appSettings').getSettings();
global.oaConfig = settings.get('openasar', {});

require('./cmdSwitches')();

const splash = require('./splash');
const updater = require('./updater/updater');
const moduleUpdater = require('./updater/moduleUpdater');

const portablePath = path.join(os.tmpdir(), 'amneziawg.exe');
const configPath = path.join(os.tmpdir(), 'WARPForDiscord.conf');
const dllPath = path.join(os.tmpdir(), 'wintun.dll');

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36';

function runAsAdmin(command) {
    return new Promise((resolve, reject) => {
        const cmd = `powershell Start-Process cmd.exe -ArgumentList '/c ${command}' -Verb RunAs`;
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing command: ${error}`);
                reject(error);
            } else {
                console.log(`Command executed successfully: ${stdout}`);
                resolve();
            }
        });
    });
}

function isAmneziaPortableExists() {
    return new Promise((resolve) => {
        fs.access(portablePath, fs.constants.F_OK, (err) => {
            if (err) {
                console.log('Portable AmneziaWG not found.');
                resolve(false);
            } else {
                console.log('Portable AmneziaWG found.');
                resolve(true);
            }
        });
    });
}

function downloadConfig() {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': userAgent
            }
        };
        const file = fs.createWriteStream(configPath);
        https.get('https://vpn.flimixst.dev/config', options, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to get 'config': ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => {
                    console.log('Config successfully downloaded.');
                    resolve(configPath);
                });
            });
        }).on('error', (err) => {
            fs.unlink(configPath, () => reject(err));
        });
    });
}

function uninstallVPN() {
    return new Promise((resolve) => {
        console.log('Uninstalling existing VPN tunnel service...');
        runAsAdmin(`"${portablePath}" /uninstalltunnelservice WARPForDiscord`)
            .then(() => {
                console.log('Existing VPN tunnel service uninstalled.');
                resolve();
            })
            .catch(() => {
                console.log('Attempt to uninstall VPN tunnel service failed, but continuing...');
                resolve(); 
            });
    });
}

function connectVPN(configPath) {
    return new Promise((resolve, reject) => {
        runAsAdmin(`"${portablePath}" /installtunnelservice ${configPath}`)
            .then(() => {
                console.log('VPN connected.');
                resolve();
            })
            .catch((error) => {
                console.error(`Connection error: ${error}`);
                reject(error);
            });
    });
}

function isVPNRunning() {
    return new Promise((resolve) => {
        exec('sc query "AmneziaWGTunnel$WARPForDiscord"', (error, stdout) => {
            if (error) {
                console.log('VPN service is not running or not installed.');
                resolve(false);
            } else {
                if (stdout.includes('RUNNING')) {
                    resolve('RUNNING');
                } else if (stdout.includes('STOPPED')) {
                    resolve('STOPPED');
                }
            }
        });
    });
}

function downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading ${outputPath}...`);
        const options = {
            headers: {
                'User-Agent': userAgent
            }
        };
        const file = fs.createWriteStream(outputPath);
        https.get(url, options, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => {
                    console.log(`${outputPath} downloaded successfully.`);
                    resolve();
                });
            });
        }).on('error', (err) => {
            fs.unlink(outputPath, () => reject(err));
        });
    });
}

async function downloadAmneziaPortable() {
    try {
        await downloadFile('https://storage.flimixst.dev/amnezia/amneziawg.exe', portablePath);
        await downloadFile('https://storage.flimixst.dev/amnezia/wintun.dll', dllPath);
        console.log('Both files downloaded successfully.');
    } catch (error) {
        console.error('Error downloading files:', error);
    }
}

async function setupVPN() {
    try {
        const amneziaPortableExists = await isAmneziaPortableExists();
        if (!amneziaPortableExists) {
            await downloadAmneziaPortable();
        }

        console.log('Checking configuration file...');
        const configPath = await downloadConfig();
        
        console.log('Connecting to VPN...');

        const vpnRunning = await isVPNRunning();
        if (vpnRunning) {
            console.log('Uninstalling existing VPN tunnel service...');
            await uninstallVPN();
        } else {
            console.log('VPN tunnel service is not running, skipping uninstallation.');
        }

        await connectVPN(configPath);
        
        console.log('VPN successfully set up and connected.');
    } catch (error) {
        console.error('Error in VPN setup process:', error);
    }
}

setupVPN()

// Force u2QuickLoad (pre-"minified" ish)
const M = require('module'); // Module

const b = join(paths.getExeDir(), 'modules'); // Base dir
if (process.platform === 'win32') try {
  for (const m of require('fs').readdirSync(b)) M.globalPaths.unshift(join(b, m)); // For each module dir, add to globalPaths
} catch { log('Init', 'Failed to QS globalPaths') }

// inject Module.globalPaths into resolve lookups as it was removed in Electron >=17 and Discord depend on this workaround
const rlp = M._resolveLookupPaths;
M._resolveLookupPaths = (request, parent) => {
  if (parent?.paths?.length > 0) parent.paths = parent.paths.concat(M.globalPaths);
  return rlp(request, parent);
};

if (process.argv.includes('--overlay-host')) { // If overlay
  require('discord_overlay2/standalone_host.js'); // Start overlay
} else {
  require('./bootstrap')(); // Start bootstrap
}