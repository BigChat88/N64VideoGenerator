// Simple framework-less UI: it just gathers the form options 1:1 with the
// fields of ConvertOptions (see src/main/types.ts) and calls the API exposed
// by the preload.

const $ = (id) => document.getElementById(id);

// The precompiled player (src/main.c) initializes audio at this fixed rate
// (AUDIO_HZ) and the libdragon mixer refuses (hard assert on real hardware)
// to play a wav64 encoded above that. It is not negotiable per conversion:
// the .elf is already compiled, so the UI must not allow asking for more.
const MAX_AUDIO_SAMPLE_RATE = 32000;

let inputPath = null;

// "C:\videos\My Trip.final.mp4" -> "My Trip.final"
function baseNameWithoutExt(p) {
  const base = p.split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

$("btnPickInput").addEventListener("click", async () => {
  const path = await window.api.selectInputFile();
  if (path) {
    inputPath = path;
    $("inputPath").value = path;
    // Prefill the ROM title from the file name (n64tool caps it at 20 chars).
    const title = baseNameWithoutExt(path).slice(0, 20);
    if (title) $("romTitle").value = title;
  }
});

$("quality").addEventListener("input", () => {
  $("qualityValue").textContent = $("quality").value;
});

// Opus always forces 48000 Hz (see conv_wav64.cpp: OPUS_SAMPLE_RATE), no
// matter what is requested here: the player already knows how to raise the
// mixer limit to accept it (see src/main.c), but the field itself has no
// effect with Opus, so we disable it to avoid confusion.
function updateAudioRateFieldForCodec() {
  const isOpus = $("audioCompress").value === "opus";
  $("audioSampleRate").disabled = isOpus;
  $("opusRateNote").hidden = !isOpus;
}
$("audioCompress").addEventListener("change", updateAudioRateFieldForCodec);
updateAudioRateFieldForCodec();

function collectOptions(outputPath) {
  return {
    inputPath,
    outputPath,
    romTitle: $("romTitle").value || "My Video",
    codec: $("codec").value,
    quality: Number($("quality").value),
    speed: $("quick").checked ? "quick" : "quality",
    seekIntervalSec: $("seekIntervalSec").value ? Number($("seekIntervalSec").value) : undefined,
    audioCompress: $("audioCompress").value,
    audioSampleRate: Number($("audioSampleRate").value),
    audioChannels: Number($("audioChannels").value),
    profile: $("profile").value,
    quantMatrix: $("quantMatrix").value,
  };
}

function appendLog(line) {
  const log = $("log");
  log.textContent += line + "\n";
  log.scrollTop = log.scrollHeight;
}

// The bar is driven by two signals: the discrete pipeline stages (see
// convert.ts), which set a floor as each one starts, and the per-frame
// percentage that videoconv64 prints on stderr during the longest stage, which
// we map into that stage's span so the bar actually moves while encoding.
const STAGE_FLOOR = {
  videoconv64: 3,
  mkdfs: 91,
  n64tool: 95,
  romconfig: 98,
  done: 100,
};

// Sub-spans within the videoconv64 stage: it sweeps 0..100% once for the video
// encode (the bulk of the time), then again for the audio bridge.
const VIDEO_SPAN = [3, 78];
const AUDIO_SPAN = [78, 88];

let currentStage = null;
let shownPct = 0; // the bar never moves backwards during a run

function setProgress(pct) {
  const clamped = Math.max(0, Math.min(100, pct));
  if (clamped < shownPct) return;
  shownPct = clamped;
  $("progressFill").style.width = `${clamped}%`;
  $("progressPct").textContent = `${Math.round(clamped)}%`;
}

function resetProgress() {
  shownPct = 0;
  $("progressFill").style.width = "0%";
  $("progressPct").textContent = "0%";
}

// videoconv64 redraws its progress bar with a bare "\r" (no newline), so a
// single captured chunk can hold several updates, e.g.
//   "\rVideo [##------]  17.0%\rVideo [####----]  42.3% ETA 01:12"
// Take the last percentage in the chunk.
function progressFromLogLine(line) {
  const re = /(Video\/Audio|Video|Audio)\s*\[[#-]*\]\s*([\d.]+)\s*%/g;
  let m;
  let last = null;
  while ((m = re.exec(line)) !== null) last = m;
  if (!last) return null;
  const pct = parseFloat(last[2]);
  if (!isFinite(pct)) return null;
  const [lo, hi] = last[1] === "Audio" ? AUDIO_SPAN : VIDEO_SPAN;
  return lo + (pct / 100) * (hi - lo);
}

function openConvertModal() {
  $("log").textContent = "";
  $("stageLabel").textContent = "Starting...";
  $("progressBar").classList.remove("error");
  $("progressBar").classList.add("working");
  currentStage = null;
  resetProgress();
  $("btnCloseModal").disabled = true;
  $("convertModal").hidden = false;
}

function finishConvertModal() {
  $("progressBar").classList.remove("working");
  $("btnCloseModal").disabled = false;
  $("btnConvert").disabled = false;
}

$("btnCloseModal").addEventListener("click", () => {
  $("convertModal").hidden = true;
});

window.api.onProgress((event) => {
  if (event.kind === "stage") {
    currentStage = event.stage;
    $("stageLabel").textContent = event.label;
    appendLog(`\n=== ${event.label} ===`);
    if (STAGE_FLOOR[event.stage] != null) setProgress(STAGE_FLOOR[event.stage]);
  } else if (event.kind === "log") {
    appendLog(event.line);
    if (currentStage === "videoconv64") {
      const p = progressFromLogLine(event.line);
      if (p != null) setProgress(p);
    }
  } else if (event.kind === "error") {
    $("stageLabel").textContent = `Error: ${event.message}`;
    appendLog(`ERROR: ${event.message}`);
    $("progressBar").classList.add("error");
    finishConvertModal();
  } else if (event.kind === "success") {
    $("stageLabel").textContent = `Done — saved to ${event.outputPath}`;
    setProgress(100);
    finishConvertModal();
  }
});

$("btnConvert").addEventListener("click", async () => {
  if (!inputPath) {
    alert("Pick an input video first.");
    return;
  }
  const sampleRate = Number($("audioSampleRate").value);
  if (sampleRate > MAX_AUDIO_SAMPLE_RATE) {
    alert(
      `The audio sample rate (${sampleRate} Hz) exceeds the maximum the ` +
        `player supports (${MAX_AUDIO_SAMPLE_RATE} Hz). Lower it before converting: ` +
        `anything higher crashes the console on playback.`
    );
    return;
  }
  const suggested = ($("romTitle").value || "video").replace(/[^a-z0-9_-]+/gi, "_") + ".z64";
  const outputPath = await window.api.selectOutputFile(suggested);
  if (!outputPath) return;

  $("btnConvert").disabled = true;
  openConvertModal();

  await window.api.startConversion(collectOptions(outputPath));
});
