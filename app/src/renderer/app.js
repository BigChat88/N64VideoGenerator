const $ = (id) => document.getElementById(id);
const MAX_AUDIO_SAMPLE_RATE = 32000;

let inputPath = null;

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
    const title = baseNameWithoutExt(path).slice(0, 20);
    if (title) $("romTitle").value = title;
  }
});

$("quality").addEventListener("input", () => {
  $("qualityValue").textContent = $("quality").value;
});

function updateAudioFieldsState() {
  const noAudio = !$("audioEnabled").checked;
  const isOpus = $("audioCompress").value === "opus";
  $("audioCompress").disabled = noAudio;
  $("audioChannels").disabled = noAudio;
  $("audioSampleRate").disabled = noAudio || isOpus;
  $("opusRateNote").hidden = noAudio || !isOpus;
}
$("audioEnabled").addEventListener("change", updateAudioFieldsState);
$("audioCompress").addEventListener("change", updateAudioFieldsState);
updateAudioFieldsState();

function collectOptions(outputPath) {
  return {
    inputPath,
    outputPath,
    romTitle: $("romTitle").value || "My Video",
    codec: $("codec").value,
    quality: Number($("quality").value),
    speed: $("quick").checked ? "quick" : "quality",
    seekIntervalSec: $("seekIntervalSec").value ? Number($("seekIntervalSec").value) : undefined,
    audioMode: $("audioEnabled").checked ? "source" : "none",
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

const STAGE_FLOOR = {
  probe: 1,
  videoconv64: 3,
  mkdfs: 91,
  n64tool: 95,
  romconfig: 98,
  done: 100,
};

const VIDEO_SPAN = [3, 78];
const AUDIO_SPAN = [78, 88];

let currentStage = null;
let shownPct = 0; 

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
  if ($("audioEnabled").checked && sampleRate > MAX_AUDIO_SAMPLE_RATE) {
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
