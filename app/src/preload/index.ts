import { contextBridge, ipcRenderer } from "electron";
import type { ConvertOptions, ProgressEvent } from "../main/types";

contextBridge.exposeInMainWorld("api", {
  selectInputFile: (): Promise<string | null> => ipcRenderer.invoke("dialog:selectInput"),
  selectOutputFile: (suggestedName: string): Promise<string | null> =>
    ipcRenderer.invoke("dialog:selectOutput", suggestedName),
  startConversion: (options: ConvertOptions): Promise<void> => ipcRenderer.invoke("convert:start", options),
  onProgress: (callback: (event: ProgressEvent) => void): void => {
    ipcRenderer.on("convert:progress", (_evt, event: ProgressEvent) => callback(event));
  },
});
