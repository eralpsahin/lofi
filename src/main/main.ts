import { app, BrowserWindow, ipcMain, screen, shell, ipcRenderer, Menu, Tray } from 'electron';
import * as path from 'path';
import * as url from 'url';
import '../../build/release/black-magic.node';
import { spawn } from 'child_process';
import { chmodSync } from 'fs';
import { fixPathForAsarUnpack }  from 'electron-util';
import { register } from 'electron-localshortcut';
import { HEIGHT, WIDTH_RATIO, MACOS, MACOS_MOJAVE, WINDOWS, CONTAINER, WIDTH } from '../constants'
import { nextVisualization, prevVisualization } from '../visualizations/visualizations.js';

// Visualizations look snappier on 60Hz refresh rate screens if we disable vsync
app.commandLine.appendSwitch("disable-gpu-vsync");
app.commandLine.appendArgument("disable-gpu-vsync");

if (MACOS) {
  // FIXME: Probably a better way of doing this
  chmodSync(fixPathForAsarUnpack(__dirname + "/volume-capture-daemon"), '555');
  spawn(fixPathForAsarUnpack(__dirname + "/volume-capture-daemon"));
}

let mainWindow: Electron.BrowserWindow;
let mousePoller: NodeJS.Timeout;
let tray: Electron.Tray;

register('A', () => {
  mainWindow.webContents.send('prev-visualization');
});

register('D', () => {
  mainWindow.webContents.send('next-visualization');
});

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    x: 0 - CONTAINER.HORIZONTAL / 2 + screen.getPrimaryDisplay().size.width / 2,
    y: 0 - CONTAINER.VERTICAL / 2 + screen.getPrimaryDisplay().size.height / 2,
    height: CONTAINER.VERTICAL,
    width: CONTAINER.HORIZONTAL,
    frame: false,
    resizable: false,
    maximizable: false,
    transparent: true,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      allowRunningInsecureContent: false,
      nodeIntegration: true,
      nativeWindowOpen: true
    }
  });

  mainWindow.setAlwaysOnTop(true, "floating", 1);
  mainWindow.setVisibleOnAllWorkspaces(true);

  // And load the index.html of the app
  mainWindow.loadURL(
    url.format({
      pathname: path.join(__dirname, './index.html'),
      protocol: 'file:',
      slashes: true,
    })
  );

  // Every 10 milliseconds, poll to see if we should ignore mouse events or not
  mousePoller = setInterval(() => {
    try {
      let p = screen.getCursorScreenPoint();
      let b = mainWindow.getBounds();
      // Bounding box for the area that's "clickable" -- e.g. main player square
      let bb = {
        ix: b.x + (CONTAINER.HORIZONTAL - WIDTH) / 2,
        iy: b.y + (CONTAINER.VERTICAL - HEIGHT) / 2,
        ax: b.x + WIDTH + (CONTAINER.HORIZONTAL - WIDTH) / 2,
        ay: b.y + HEIGHT + (CONTAINER.VERTICAL - HEIGHT) / 2
      }

      if (bb.ix <= p.x && p.x <= bb.ax && bb.iy <= p.y && p.y <= bb.ay) {
        mainWindow.setIgnoreMouseEvents(false);
      } else {
        mainWindow.setIgnoreMouseEvents(true);
      }
    } catch (e) {
      // FIXME: Sometimes the visualization window gets destroyed before the main window
      //        This causes an error to briefly pop up, so suppress it here. How should this be fixed?
      //        Only happens when using OS-y ways of closing windows (e.g. OSX "File->Quit" menu)
    }
    
  }, 10);

  // Open the DevTools.
  // mainWindow.webContents.openDevTools({mode:"detach"});

  ipcMain.on('windowMoving', (e: Event, { mouseX, mouseY }: { mouseX: number, mouseY: number }) => {
    const { x, y } = screen.getCursorScreenPoint();

    // Use setBounds instead of setPosition
    // See: https://github.com/electron/electron/issues/9477#issuecomment-406833003
    mainWindow.setBounds({
      height: CONTAINER.VERTICAL,
      width: CONTAINER.HORIZONTAL,
      x: x - mouseX,
      y: y - mouseY
    });

    // Ugly black transparency fix when dragging transparent window past screen edges
    // From what I understand, setting opacity forces a re-draw
    // TODO: only happens on Windows?
    if (WINDOWS) {
      mainWindow.setOpacity(1);
    }
  });

  ipcMain.on('windowMoved', () => {
    // Do somehting when dragging stop
  });

  ipcMain.on('windowIgnoreMouseEvents', () => {
    mainWindow.setIgnoreMouseEvents(true);
  });

  ipcMain.on('windowDontIgnoreMouseEvents', () => {
    mainWindow.setIgnoreMouseEvents(false);
  });

  // Open external URLs in default OS browser
  mainWindow.webContents.on('new-window', function (event: Electron.Event, url: string) {
    event.preventDefault();
    shell.openExternal(url);
  });
}

function createTray() {
  // Create the tray
  tray = new Tray(path.join(__dirname, '../', 'trayicon.png'));

  // Build the tray menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Quit',
      accelerator: 'Command+Q',
      click: function() {
        mainWindow.destroy();
        app.quit();
      }
    }
  ]);
  tray.on('right-click', () => tray.popUpContextMenu(contextMenu));

  // Add Hide - Show functionality on tray icon click
  tray.on('click', () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
  
  // Remove the app from the dock
  app.dock.hide();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  createWindow();
  // Use the tray only on macOS
  if (MACOS) {
    createTray();
  }
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  clearTimeout(mousePoller);
  app.quit();
});

app.on('activate', () => {
  // On OS X it"s common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (MACOS && mainWindow === null) {
    createWindow();
  }
});
