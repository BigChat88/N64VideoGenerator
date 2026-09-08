import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { convertVideoToZ64 } from "./convert";
import { ConvertOptions, ProgressEvent } from "./types";

function getResourcesRoot(): string {
  return app.isPackaged ? join(process.resourcesPath, "resources") : join(__dirname, "..", "..", "resources");
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 860,
    height: 720,
    icon: join(__dirname, "..", "renderer", "icon.png"),
    webPreferences: {
      preload: join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(join(__dirname, "..", "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("dialog:selectInput", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "Pick a video",
    properties: ["openFile"],
    filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "avi", "webm"] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("dialog:selectOutput", async (_evt, suggestedName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: "Save ROM as",
    defaultPath: suggestedName,
    filters: [{ name: "N64 ROM", extensions: ["z64"] }],
  });
  return result.canceled ? null : result.filePath ?? null;
});

ipcMain.handle("convert:start", async (evt, options: ConvertOptions) => {
  const resourcesRoot = getResourcesRoot();
  const emit = (event: ProgressEvent) => {
    evt.sender.send("convert:progress", event);
  };
  try {
    await convertVideoToZ64(options, resourcesRoot, emit);
  } catch (err) {
    emit({ kind: "error", message: err instanceof Error ? err.message : String(err) });
  }
});
