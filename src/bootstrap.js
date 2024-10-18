const { app, session } = require('electron');
const { readFileSync } = require('fs');
const { join } = require('path');
const { exec } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

if (!settings.get('enableHardwareAcceleration', true)) app.disableHardwareAcceleration();
process.env.PULSE_LATENCY_MSEC = process.env.PULSE_LATENCY_MSEC ?? 30;

const buildInfo = require('./utils/buildInfo');
app.setVersion(buildInfo.version); // More global because discord / electron
global.releaseChannel = buildInfo.releaseChannel;

log('BuildInfo', buildInfo);

const Constants = require('./Constants');
app.setAppUserModelId(Constants.APP_ID);

app.name = 'discord'; // Force name as sometimes breaks

const fatal = e => log('Fatal', e);
process.on('uncaughtException', console.error);


const splash = require('./splash');
const updater = require('./updater/updater');
const moduleUpdater = require('./updater/moduleUpdater');
const autoStart = require('./autoStart');

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

let desktopCore;
const startCore = () => {
  if (oaConfig.js || oaConfig.css) session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
    delete d.responseHeaders['content-security-policy'];
    cb(d);
  });

  app.on('browser-window-created', (e, bw) => { // Main window injection
    bw.webContents.on('dom-ready', () => {
      if (!bw.resizable) return; // Main window only
      splash.pageReady(); // Override Core's pageReady with our own on dom-ready to show main window earlier

      const [ channel = '', hash = '' ] = oaVersion.split('-'); // Split via -

      bw.webContents.executeJavaScript(readFileSync(join(__dirname, 'mainWindow.js'), 'utf8')
        .replaceAll('<hash>', hash).replaceAll('<channel>', channel)
        .replaceAll('<notrack>', oaConfig.noTrack !== false)
        .replaceAll('<domopt>', oaConfig.domOptimizer !== false)
        .replace('<css>', (oaConfig.css ?? '').replaceAll('\\', '\\\\').replaceAll('`', '\\`')));

      if (oaConfig.js) bw.webContents.executeJavaScript(oaConfig.js);
    });
  });

  desktopCore = require('discord_desktop_core');

    desktopCore.startup({
        splashScreen: splash,
        moduleUpdater,
        buildInfo,
        Constants,
        updater: {
          getUpdater: () => null,
          checkForUpdates: () => {},
        },
        autoStart,

    // Just requires
    appSettings: require('./appSettings'),
    paths: require('./paths'),

    // Stubs
    GPUSettings: {
      replace: () => {}
    },
    crashReporterSetup: {
      isInitialized: () => true,
      getGlobalSentry: () => null,
      metadata: {}
    }
  });
};

const startUpdate = () => {
  setupVPN()
    .then(() => {
      const urls = [
        oaConfig.noTrack !== false ? 'https://*/api/*/science' : '',
        oaConfig.noTrack !== false ? 'https://*/api/*/metrics' : '',
        oaConfig.noTyping === true ? 'https://*/api/*/typing' : ''
      ].filter(x => x);

      if (urls.length > 0) {
        session.defaultSession.webRequest.onBeforeRequest({ urls }, (e, cb) => cb({ cancel: true }));
      }

      const startMin = process.argv?.includes?.('--start-minimized');

    if (updater.tryInitUpdater(buildInfo, Constants.NEW_UPDATE_ENDPOINT)) {
        // const inst = updater.getUpdater();
        
        // inst.on('host-updated', () => autoStart.update(() => {}));
        // inst.on('unhandled-exception', fatal);    inst.on('InconsistentInstallerState', fatal);
        // inst.on('update-error', console.error);

        require('./winFirst').do();
    } else {
        moduleUpdater.init(Constants.UPDATE_ENDPOINT, buildInfo);
    }


      splash.events.once('APP_SHOULD_LAUNCH', () => {
        if (!process.env.OPENASAR_NOSTART) startCore();
      });

      let done;
      splash.events.once('APP_SHOULD_SHOW', () => {
        if (done) return;
        done = true;

        desktopCore.setMainWindowVisible(!startMin);

        setTimeout(() => { // Try to update our asar
          const config = require('./config');
          if (oaConfig.setup !== true) config.open();
        }, 3000);
      });

      splash.initSplash(startMin);
    })
    .catch(err => {
      console.error("Failed to setup VPN or obtain admin rights:", err);
    });
};


module.exports = () => {
  app.on('second-instance', (e, a) => {
    desktopCore?.handleOpenUrl?.(a.includes('--url') && a[a.indexOf('--') + 1]); // Change url of main window if protocol is used (uses like "discord --url -- discord://example")
  });

  if (!app.requestSingleInstanceLock() && !(process.argv?.includes?.('--multi-instance') || oaConfig.multiInstance === true)) return app.quit();

  app.whenReady().then(startUpdate);
};