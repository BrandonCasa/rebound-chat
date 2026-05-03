import os
import queue
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import quote
import signal

import requests
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

MAX_ENCODER_AHEAD_SECONDS = 0.75
ENCODER_RESUME_AHEAD_SECONDS = 0.35
PACER_POLL_INTERVAL_SECONDS = 0.05
APP_TITLE = "HLS Streamer (FFmpeg + VLC)"
DEFAULT_LOCAL_PORT = 8777
DEFAULT_RETAIN_SEGMENTS = 5
DEFAULT_TARGET_SPEED = 1.2
DEFAULT_NVENC_PRESET = "p6"
READRATE_HEADROOM = 0.05
UPLOAD_POLL_INTERVAL_SECONDS = 0.75
SEGMENT_EXTENSIONS = {".aac", ".m4a", ".m4s", ".mp3", ".mp4", ".ts"}
NVENC_CODECS = {"h264_nvenc", "hevc_nvenc", "av1_nvenc"}
SOFTWARE_VIDEO_CODECS = {"libx264", "libx265", "libaom-av1", "libsvtav1"}
QSV_VIDEO_CODECS = {"h264_qsv", "hevc_qsv", "av1_qsv"}
VIDEOTOOLBOX_VIDEO_CODECS = {"h264_videotoolbox", "hevc_videotoolbox"}
HEVC_VIDEO_CODECS = {"libx265", "hevc_nvenc", "hevc_qsv", "hevc_videotoolbox"}
H264_VIDEO_CODECS = {"libx264", "h264_nvenc", "h264_qsv", "h264_videotoolbox"}
AV1_VIDEO_CODECS = {"av1_nvenc", "av1_qsv", "libaom-av1", "libsvtav1"}
VIDEO_CODEC_OPTIONS = [
    "av1_nvenc",
    "hevc_nvenc",
    "h264_nvenc",
    "av1_qsv",
    "hevc_qsv",
    "h264_qsv",
    "libsvtav1",
    "libaom-av1",
    "libx265",
    "libx264",
    "hevc_videotoolbox",
    "h264_videotoolbox",
]
AUDIO_CODEC_OPTIONS = ["aac", "libmp3lame"]
NVENC_PRESET_LADDER = ["p7", "p6", "p5", "p4", "p3", "p2", "p1"]
NVENC_TUNE_OPTIONS = ["hq", "ll", "ull", "lossless"]
NVENC_MULTIPASS_OPTIONS = ["disabled", "qres", "fullres"]
NVENC_PRESET_ALIASES = {
    "slowest": "p7",
    "slower": "p7",
    "slow": "p6",
    "medium": "p5",
    "fast": "p4",
    "faster": "p3",
    "fastest": "p1",
    "hq": "p6",
    "ll": "p4",
    "ull": "p3",
    "lossless": "p7",
}
SOFTWARE_PRESETS = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow", "placebo"]
SVT_AV1_PRESETS = [str(value) for value in range(13)]
LIBAOM_AV1_PRESETS = [str(value) for value in range(9)]
QSV_PRESETS = ["veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"]
VIDEOTOOLBOX_PRESETS = ["realtime"]
ENCODER_PRESETS = {
    "nvenc": NVENC_PRESET_LADDER,
    "software": SOFTWARE_PRESETS,
    "svt_av1": SVT_AV1_PRESETS,
    "libaom_av1": LIBAOM_AV1_PRESETS,
    "qsv": QSV_PRESETS,
    "videotoolbox": VIDEOTOOLBOX_PRESETS,
}
DEFAULT_ENCODER_PRESETS = {
    "nvenc": DEFAULT_NVENC_PRESET,
    "software": "medium",
    "svt_av1": "8",
    "libaom_av1": "6",
    "qsv": "medium",
    "videotoolbox": "realtime",
}
CODEC_SETTING_NOTES = {
    "nvenc": "NVENC uses p7..p1 presets. AV1 NVENC also uses tune/multipass defaults in this tool: tune=hq and multipass=fullres.",
    "software": "Software x264/x265 uses FFmpeg's encoder preset ladder. Slower presets improve efficiency but can fall behind live playback.",
    "svt_av1": "SVT-AV1 uses numeric presets 0..12 where lower is slower/better and higher is faster.",
    "libaom_av1": "libaom-av1 uses cpu-used 0..8 where lower is slower/better and higher is faster.",
    "qsv": "Intel QSV uses its own preset ladder with the same bitrate and keyframe settings as the other live encoders.",
    "videotoolbox": "VideoToolbox runs in realtime mode and does not expose an FFmpeg preset in this tool.",
}
FFMPEG_TIME_RE = re.compile(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)")
FFMPEG_SPEED_RE = re.compile(r"speed=\s*([0-9.]+)x")
FFMPEG_HLS_SEGMENT_RE = re.compile(r"Opening '.*?segment-(\d+)\.[^']*' for writing")
HLS_SEGMENT_FILE_RE = re.compile(r"segment-(\d+)\.")


def is_nvenc_codec(video_codec: str) -> bool:
    return video_codec.strip().lower() in NVENC_CODECS


def is_software_codec(video_codec: str) -> bool:
    return video_codec.strip().lower() in SOFTWARE_VIDEO_CODECS


def is_qsv_codec(video_codec: str) -> bool:
    return video_codec.strip().lower() in QSV_VIDEO_CODECS


def is_videotoolbox_codec(video_codec: str) -> bool:
    return video_codec.strip().lower() in VIDEOTOOLBOX_VIDEO_CODECS


def is_hevc_codec(video_codec: str) -> bool:
    return video_codec.strip().lower() in HEVC_VIDEO_CODECS


def is_av1_codec(video_codec: str) -> bool:
    return video_codec.strip().lower() in AV1_VIDEO_CODECS


def codec_family(video_codec: str) -> str:
    codec = video_codec.strip().lower()
    if codec in NVENC_CODECS:
        return "nvenc"
    if codec == "libsvtav1":
        return "svt_av1"
    if codec == "libaom-av1":
        return "libaom_av1"
    if codec in SOFTWARE_VIDEO_CODECS:
        return "software"
    if codec in QSV_VIDEO_CODECS:
        return "qsv"
    if codec in VIDEOTOOLBOX_VIDEO_CODECS:
        return "videotoolbox"
    raise ValueError(f"Video codec must be one of {', '.join(VIDEO_CODEC_OPTIONS)}")


def normalize_nvenc_preset(value: str) -> str:
    text = (value or DEFAULT_NVENC_PRESET).strip().lower()
    text = NVENC_PRESET_ALIASES.get(text, text)
    if text not in NVENC_PRESET_LADDER:
        raise ValueError(f"NVENC preset must be one of {', '.join(NVENC_PRESET_LADDER)}")
    return text


def normalize_encoder_preset(video_codec: str, value: str) -> str:
    family = codec_family(video_codec)
    if family == "nvenc":
        return normalize_nvenc_preset(value)

    presets = ENCODER_PRESETS[family]
    default_preset = DEFAULT_ENCODER_PRESETS[family]
    text = (value or default_preset).strip().lower()
    if text not in presets:
        raise ValueError(f"{video_codec} preset must be one of {', '.join(presets)}")
    return text


def normalize_audio_codec(value: str) -> str:
    text = (value or "").strip().lower()
    if text == "mp3":
        text = "libmp3lame"
    if text not in AUDIO_CODEC_OPTIONS:
        raise ValueError(f"Audio codec must be one of {', '.join(AUDIO_CODEC_OPTIONS)}")
    return text


def format_ffmpeg_seconds(seconds: float) -> str:
    return f"{max(0.0, seconds):.3f}"


def ffmpeg_readrate_for_target(target_speed: float) -> float:
    # -re caps reported speed near 1.0x, so use readrate with a small margin above the watchdog target.
    return max(1.0, target_speed + READRATE_HEADROOM)


def parse_ffmpeg_time_seconds(line: str) -> Optional[float]:
    match = FFMPEG_TIME_RE.search(line)
    if not match:
        return None
    hours = int(match.group(1))
    minutes = int(match.group(2))
    seconds = float(match.group(3))
    return hours * 3600 + minutes * 60 + seconds


def parse_ffmpeg_speed(line: str) -> Optional[float]:
    match = FFMPEG_SPEED_RE.search(line)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def parse_hls_segment_number(line: str) -> Optional[int]:
    match = FFMPEG_HLS_SEGMENT_RE.search(line)
    if not match:
        return None
    return int(match.group(1))


def parse_hls_segment_file_number(filename: str) -> Optional[int]:
    match = HLS_SEGMENT_FILE_RE.search(filename)
    if not match:
        return None
    return int(match.group(1))


def parse_bitrate_to_bps(value: str) -> int:
    text = value.strip().lower()
    if text.endswith("k"):
        return int(float(text[:-1]) * 1000)
    if text.endswith("m"):
        return int(float(text[:-1]) * 1_000_000)
    return int(text)


def codec_string(video_codec: str, audio_codec: str) -> str:
    codecs: List[str] = []

    video_codec = video_codec.strip().lower()
    audio_codec = audio_codec.strip().lower()

    if video_codec in HEVC_VIDEO_CODECS:
        codecs.append("hvc1")
    elif video_codec in H264_VIDEO_CODECS:
        codecs.append("avc1")
    elif video_codec in AV1_VIDEO_CODECS:
        codecs.append("av01")

    if audio_codec == "aac":
        codecs.append("mp4a.40.2")
    elif audio_codec in {"mp3", "libmp3lame"}:
        codecs.append("mp4a.40.34")

    return ",".join(codecs)


def raise_for_status_with_body(response: requests.Response) -> None:
    if response.ok:
        return

    detail = response.text.strip()
    try:
        payload = response.json()
        if isinstance(payload, dict):
            detail = payload.get("error") or payload.get("message") or detail
    except Exception:
        pass

    raise RuntimeError(f"{response.status_code} {response.request.method} {response.url}: {detail or response.reason}")


@dataclass
class SessionInfo:
    session_id: str
    public_token: str
    ingest_secret: str
    playback_url: str
    share_url: str
    heartbeat_interval_seconds: int


@dataclass
class StreamConfig:
    video_path: str
    alt_audio_path: Optional[str]
    website_base_url: str
    live_create_token: str
    session_label: str
    retain_segment_count: int
    output_video_codec: str
    output_audio_codec: str
    output_width: Optional[int]
    output_height: Optional[int]
    video_bitrate: str
    audio_bitrate: str
    fps: Optional[int]
    encoder_preset: str
    target_speed: float
    adaptive_nvenc: bool
    convert_stream_to_sdr: bool
    open_local_vlc: bool
    open_local_browser_preview: bool
    local_preview_port: int
    local_vlc_path: str
    ffmpeg_path: str
    use_separate_audio_for_stream: bool
    session_info: Optional[SessionInfo] = None
    remote_dir: Path = field(default_factory=lambda: Path(tempfile.mkdtemp(prefix="hls_remote_")))
    local_dir: Path = field(default_factory=lambda: Path(tempfile.mkdtemp(prefix="hls_local_")))


class HttpHlsUploader(threading.Thread):
    def __init__(self, config: StreamConfig, log_queue: queue.Queue):
        super().__init__(daemon=True)
        self.config = config
        self.log_queue = log_queue
        self.stop_event = threading.Event()
        self.last_uploaded: Dict[Path, str] = {}
        self.session = requests.Session()

    def log(self, message: str) -> None:
        self.log_queue.put(message)

    @property
    def api_base(self) -> str:
        assert self.config.session_info is not None
        base = self.config.website_base_url.rstrip("/")
        return f"{base}/live/api/{self.config.session_info.session_id}"

    def build_ingest_headers(self) -> Dict[str, str]:
        assert self.config.session_info is not None
        return {
            "X-Live-Ingest-Secret": self.config.session_info.ingest_secret,
        }

    def mime_type_for_path(self, file_path: Path) -> str:
        suffix = file_path.suffix.lower()
        if suffix == ".m3u8":
            return "application/vnd.apple.mpegurl"
        if suffix == ".m4s":
            return "video/iso.segment"
        if suffix == ".mp4":
            return "video/mp4"
        if suffix == ".ts":
            return "video/mp2t"
        if suffix == ".aac":
            return "audio/aac"
        return "application/octet-stream"

    def remote_url_for_path(self, file_path: Path) -> str:
        rel = file_path.relative_to(self.config.remote_dir)
        parts = rel.parts
        filename = parts[-1]

        if filename == "master.m3u8":
            return f"{self.api_base}/master.m3u8"

        if filename == "video.m3u8":
            return f"{self.api_base}/video.m3u8"

        return f"{self.api_base}/segments/{quote(filename, safe='')}"

    def upload_file(self, file_path: Path) -> None:
        url = self.remote_url_for_path(file_path)
        headers = self.build_ingest_headers()
        headers["Content-Type"] = self.mime_type_for_path(file_path)
        is_playlist = file_path.suffix.lower() == ".m3u8"
        signature = self.file_signature(file_path)

        if is_playlist:
            body = file_path.read_text(encoding="utf-8")
            response = self.session.put(url, data=body, headers=headers, timeout=30)
        else:
            with file_path.open("rb") as handle:
                response = self.session.put(url, data=handle, headers=headers, timeout=30)

        raise_for_status_with_body(response)
        self.last_uploaded[file_path] = signature
        self.log(f"Uploaded: {file_path.name}")

    def send_heartbeat(self) -> None:
        url = f"{self.api_base}/heartbeat"
        response = self.session.post(url, headers=self.build_ingest_headers(), timeout=15)
        raise_for_status_with_body(response)

    def end_session(self) -> None:
        try:
            url = f"{self.api_base}/end"
            response = self.session.post(url, headers=self.build_ingest_headers(), timeout=15)
            if response.status_code not in (200, 204, 404, 410):
                raise_for_status_with_body(response)
        except Exception as exc:
            self.log(f"Session end request failed: {exc}")

    def should_upload(self, file_path: Path) -> bool:
        if not file_path.is_file():
            return False
        stats = file_path.stat()
        if stats.st_size <= 0:
            return False
        return self.last_uploaded.get(file_path) != self.file_signature(file_path, stats)

    def file_signature(self, file_path: Path, stats: Optional[os.stat_result] = None) -> str:
        stats = stats or file_path.stat()
        return f"{stats.st_size}:{stats.st_mtime_ns}"

    def ensure_fallback_master_playlist(self) -> None:
        master_path = self.config.remote_dir / "master.m3u8"
        media_path = self.config.remote_dir / "video.m3u8"

        if master_path.exists() or not media_path.exists():
            return

        bandwidth = parse_bitrate_to_bps(self.config.video_bitrate) + parse_bitrate_to_bps(self.config.audio_bitrate)
        resolution = ""
        if self.config.output_width and self.config.output_height:
            resolution = f",RESOLUTION={self.config.output_width}x{self.config.output_height}"

        codecs = codec_string(self.config.output_video_codec, self.config.output_audio_codec)
        codecs_part = f',CODECS="{codecs}"' if codecs else ""

        master_text = (
            "#EXTM3U\n"
            "#EXT-X-VERSION:7\n"
            f"#EXT-X-STREAM-INF:BANDWIDTH={bandwidth}{codecs_part}{resolution}\n"
            "video.m3u8\n"
        )
        master_path.write_text(master_text, encoding="utf-8")
        self.log("Generated fallback master.m3u8")

    def iter_candidate_files(self) -> List[Path]:
        def priority(file_path: Path) -> int:
            if file_path.name == "master.m3u8":
                return 2
            if file_path.name == "video.m3u8":
                return 1
            return 0

        return sorted(
            (
                file_path
                for file_path in self.config.remote_dir.iterdir()
                if file_path.is_file()
                and (
                    file_path.name in {"master.m3u8", "video.m3u8"}
                    or file_path.suffix.lower() in SEGMENT_EXTENSIONS
                )
            ),
            key=lambda file_path: (priority(file_path), file_path.name),
        )

    def run(self) -> None:
        self.log("Uploader started")
        last_heartbeat = 0.0
        heartbeat_every = 10

        if self.config.session_info:
            heartbeat_every = max(5, self.config.session_info.heartbeat_interval_seconds)

        while not self.stop_event.is_set():
            try:
                self.ensure_fallback_master_playlist()

                for file_path in self.iter_candidate_files():
                    if self.should_upload(file_path):
                        self.upload_file(file_path)

                now = time.time()
                if now - last_heartbeat >= heartbeat_every:
                    self.send_heartbeat()
                    last_heartbeat = now
                    self.log("Heartbeat sent")
            except Exception as exc:
                self.log(f"Uploader error: {exc}")
                time.sleep(2)

            time.sleep(UPLOAD_POLL_INTERVAL_SECONDS)

        self.end_session()
        self.log("Uploader stopped")

    def stop(self) -> None:
        self.stop_event.set()


class LocalPreviewServer(threading.Thread):
    def __init__(self, directory: Path, port: int, log_queue: queue.Queue):
        super().__init__(daemon=True)
        self.directory = directory
        self.port = port
        self.log_queue = log_queue
        self.process: Optional[subprocess.Popen] = None

    def run(self) -> None:
        cmd = [sys.executable, "-m", "http.server", str(self.port), "--bind", "127.0.0.1"]
        self.process = subprocess.Popen(
            cmd,
            cwd=str(self.directory),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        self.log_queue.put(f"Local preview server started on http://127.0.0.1:{self.port}/master.m3u8")

    def stop(self) -> None:
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()


class StreamController:
    def __init__(self, log_queue: queue.Queue):
        self.log_queue = log_queue
        self.ffmpeg_process: Optional[subprocess.Popen] = None
        self.local_preview_process: Optional[subprocess.Popen] = None
        self.local_vlc_process: Optional[subprocess.Popen] = None
        self.uploader: Optional[HttpHlsUploader] = None
        self.local_server: Optional[LocalPreviewServer] = None
        self.active_config: Optional[StreamConfig] = None
        self.stdout_threads: List[threading.Thread] = []
        self.state_lock = threading.RLock()
        self.stop_event = threading.Event()
        self.restart_event = threading.Event()
        self.adaptive_thread: Optional[threading.Thread] = None
        self.pending_nvenc_preset: Optional[str] = None
        self.current_nvenc_preset = DEFAULT_NVENC_PRESET
        self.ffmpeg_generation = 0
        self.input_start_offset_seconds = 0.0
        self.last_remote_output_seconds = 0.0
        self.next_segment_start_number = 0
        self.current_segment_min_speed: Optional[float] = None
        self.last_adapted_segment_number: Optional[int] = None
        self.adaptation_exhausted = False
        self.pacer_thread: Optional[threading.Thread] = None
        self.remote_wallclock_start = 0.0
        self.remote_media_start_offset = 0.0
        self.remote_pacer_paused = False

    def log(self, message: str) -> None:
        self.log_queue.put(message)

    def _set_process_paused(self, process: subprocess.Popen, paused: bool) -> None:
        if process.poll() is not None:
            return

        if os.name == "nt":
            # Requires psutil on Windows for clean suspend/resume.
            # pip install psutil
            import psutil

            proc = psutil.Process(process.pid)
            if paused:
                proc.suspend()
            else:
                proc.resume()
        else:
            process.send_signal(signal.SIGSTOP if paused else signal.SIGCONT)

    def _encoder_pacer_loop(self) -> None:
        while not self.stop_event.is_set():
            time.sleep(PACER_POLL_INTERVAL_SECONDS)

            with self.state_lock:
                config = self.active_config
                process = self.ffmpeg_process
                wallclock_start = self.remote_wallclock_start
                media_start_offset = self.remote_media_start_offset
                output_seconds = self.last_remote_output_seconds
                is_paused = self.remote_pacer_paused

            if not config or not process or process.poll() is not None or wallclock_start <= 0:
                continue

            wall_elapsed = time.monotonic() - wallclock_start
            encoded_media_elapsed = media_start_offset + output_seconds
            ahead_seconds = encoded_media_elapsed - wall_elapsed

            try:
                if not is_paused and ahead_seconds > MAX_ENCODER_AHEAD_SECONDS:
                    self._set_process_paused(process, True)
                    with self.state_lock:
                        self.remote_pacer_paused = True
                    self.log(f"Encoder paced: paused at {ahead_seconds:.2f}s ahead of realtime.")

                elif is_paused and ahead_seconds <= ENCODER_RESUME_AHEAD_SECONDS:
                    self._set_process_paused(process, False)
                    with self.state_lock:
                        self.remote_pacer_paused = False
                    self.log(f"Encoder paced: resumed at {ahead_seconds:.2f}s ahead of realtime.")

            except Exception as exc:
                self.log(f"Encoder pacer error: {exc}")

    def create_session(self, config: StreamConfig) -> SessionInfo:
        url = f"{config.website_base_url.rstrip('/')}/live/api/session"

        headers = {
            "Authorization": f"Bearer {config.live_create_token.strip()}",
            "X-Live-Create-Token": config.live_create_token.strip(),
            "Content-Type": "application/json",
        }

        label = config.session_label.strip() or Path(config.video_path).stem
        payload = {
            "label": label,
            "retainSegmentCount": config.retain_segment_count,
        }

        response = requests.post(url, json=payload, headers=headers, timeout=20)
        raise_for_status_with_body(response)
        data = response.json()

        session_id = data.get("sessionId")
        public_token = data.get("publicToken")
        ingest_secret = data.get("ingestSecret")
        playback_url = data.get("playbackUrl")
        share_url = data.get("shareUrl")
        heartbeat_interval_ms = data.get("heartbeatIntervalMs", 15000)

        if not all([session_id, public_token, ingest_secret, playback_url, share_url]):
            raise ValueError(f"Unexpected session response: {data}")

        return SessionInfo(
            session_id=session_id,
            public_token=public_token,
            ingest_secret=ingest_secret,
            playback_url=playback_url,
            share_url=share_url,
            heartbeat_interval_seconds=max(5, int(heartbeat_interval_ms / 1000)),
        )

    def _consume_output(self, stream, prefix: str, on_line=None) -> None:
        try:
            for line in iter(stream.readline, ""):
                line = line.strip()
                if line:
                    self.log(f"{prefix}: {line}")
                    if on_line:
                        try:
                            on_line(line)
                        except Exception as exc:
                            self.log(f"{prefix} monitor error: {exc}")
        finally:
            try:
                stream.close()
            except Exception:
                pass

    def _spawn_logged_process(self, cmd: List[str], cwd: Optional[str], prefix: str, on_line=None) -> subprocess.Popen:
        self.log(f"Running: {' '.join(cmd)}")
        process = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        if process.stdout is not None:
            thread = threading.Thread(target=self._consume_output, args=(process.stdout, prefix, on_line), daemon=True)
            thread.start()
            self.stdout_threads.append(thread)
        return process

    def _reset_adaptive_state(self, config: StreamConfig) -> None:
        with self.state_lock:
            self.stop_event.clear()
            self.restart_event.clear()
            self.pending_nvenc_preset = None
            self.current_nvenc_preset = normalize_nvenc_preset(config.encoder_preset) if is_nvenc_codec(config.output_video_codec) else DEFAULT_NVENC_PRESET
            self.ffmpeg_generation = 0
            self.input_start_offset_seconds = 0.0
            self.last_remote_output_seconds = 0.0
            self.next_segment_start_number = 0
            self.current_segment_min_speed = None
            self.last_adapted_segment_number = None
            self.adaptation_exhausted = False

    def _next_faster_nvenc_preset(self) -> Optional[str]:
        try:
            index = NVENC_PRESET_LADDER.index(self.current_nvenc_preset)
        except ValueError:
            return None
        next_index = index + 1
        if next_index >= len(NVENC_PRESET_LADDER):
            return None
        return NVENC_PRESET_LADDER[next_index]

    def _on_remote_ffmpeg_line(self, generation: int, line: str) -> None:
        output_seconds = parse_ffmpeg_time_seconds(line)
        speed = parse_ffmpeg_speed(line)
        segment_number = parse_hls_segment_number(line)

        with self.state_lock:
            if generation != self.ffmpeg_generation:
                return

            if output_seconds is not None:
                self.last_remote_output_seconds = output_seconds

            if speed is not None:
                if self.current_segment_min_speed is None:
                    self.current_segment_min_speed = speed
                else:
                    self.current_segment_min_speed = min(self.current_segment_min_speed, speed)

            if segment_number is None:
                return

            segment_min_speed = self.current_segment_min_speed
            self.next_segment_start_number = max(self.next_segment_start_number, segment_number + 1)
            self.current_segment_min_speed = None
            self._maybe_request_adaptive_restart(segment_number, segment_min_speed)

    def _maybe_request_adaptive_restart(self, segment_number: int, segment_min_speed: Optional[float]) -> None:
        config = self.active_config
        if (
            not config
            or not config.adaptive_nvenc
            or not is_nvenc_codec(config.output_video_codec)
            or segment_min_speed is None
            or self.stop_event.is_set()
            or self.restart_event.is_set()
        ):
            return

        if segment_min_speed >= config.target_speed:
            return

        if self.last_adapted_segment_number == segment_number:
            return

        next_preset = self._next_faster_nvenc_preset()
        if not next_preset:
            if not self.adaptation_exhausted:
                self.log(
                    f"Segment {segment_number:06d} minimum speed was {segment_min_speed:.2f}x, "
                    f"below target {config.target_speed:.2f}x, but NVENC is already at fastest preset {self.current_nvenc_preset}."
                )
                self.adaptation_exhausted = True
            return

        self.pending_nvenc_preset = next_preset
        self.last_adapted_segment_number = segment_number
        self.log(
            f"Segment {segment_number:06d} minimum speed was {segment_min_speed:.2f}x, "
            f"below target {config.target_speed:.2f}x; nudging NVENC preset "
            f"{self.current_nvenc_preset} -> {next_preset}."
        )
        self.restart_event.set()

    def _adaptive_restart_loop(self) -> None:
        while not self.stop_event.is_set():
            if not self.restart_event.wait(timeout=0.5):
                continue
            self.restart_event.clear()
            if self.stop_event.is_set():
                return
            try:
                self._restart_remote_ffmpeg_for_adaptation()
            except Exception as exc:
                self.log(f"Adaptive NVENC restart failed: {exc}")

    def _terminate_process(self, process: Optional[subprocess.Popen]) -> None:
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()

    def _next_segment_start_from_files(self, directory: Path) -> int:
        highest_segment_number = -1
        for file_path in directory.glob("segment-*"):
            segment_number = parse_hls_segment_file_number(file_path.name)
            if segment_number is not None:
                highest_segment_number = max(highest_segment_number, segment_number)
        return highest_segment_number + 1

    def _restart_remote_ffmpeg_for_adaptation(self) -> None:
        with self.state_lock:
            config = self.active_config
            process = self.ffmpeg_process
            next_preset = self.pending_nvenc_preset
            if not config or not process or not next_preset:
                return

            previous_preset = self.current_nvenc_preset
            restart_offset = self.input_start_offset_seconds + self.last_remote_output_seconds
            segment_start_number = self.next_segment_start_number
            self.ffmpeg_generation += 1

        self.log(f"Restarting FFmpeg at {format_ffmpeg_seconds(restart_offset)}s with NVENC preset {next_preset}.")
        self._terminate_process(process)

        with self.state_lock:
            if self.active_config is not config or self.stop_event.is_set():
                return

            segment_start_number = max(segment_start_number, self._next_segment_start_from_files(config.remote_dir))
            self.next_segment_start_number = segment_start_number
            self.current_nvenc_preset = next_preset
            self.pending_nvenc_preset = None
            self.input_start_offset_seconds = restart_offset
            self.last_remote_output_seconds = 0.0
            self.current_segment_min_speed = None
            generation = self.ffmpeg_generation

        self.log(f"Continuing HLS at segment start {segment_start_number}.")

        remote_cmd = self.build_remote_ffmpeg_cmd(
            config,
            input_offset_seconds=restart_offset,
            segment_start_number=segment_start_number,
            nvenc_preset=next_preset,
            discontinuity=segment_start_number > 0,
        )
        process = self._spawn_logged_process(
            remote_cmd,
            cwd=str(config.remote_dir),
            prefix="remote-ffmpeg",
            on_line=lambda line: self._on_remote_ffmpeg_line(generation, line),
        )
        with self.state_lock:
            self.remote_wallclock_start = time.monotonic()
            self.remote_media_start_offset = restart_offset
            self.remote_pacer_paused = False

        with self.state_lock:
            if self.active_config is config and not self.stop_event.is_set():
                self.ffmpeg_process = process
            else:
                self._terminate_process(process)

        self.log(f"Adaptive preset change applied: {previous_preset} -> {next_preset}")

    def _start_adaptive_thread(self) -> None:
        if self.adaptive_thread and self.adaptive_thread.is_alive():
            return
        self.adaptive_thread = threading.Thread(target=self._adaptive_restart_loop, daemon=True)
        self.adaptive_thread.start()
    def _start_pacer_thread(self) -> None:
        if self.pacer_thread and self.pacer_thread.is_alive():
            return
        self.pacer_thread = threading.Thread(target=self._encoder_pacer_loop, daemon=True)
        self.pacer_thread.start()

    def _spawn_remote_ffmpeg(self, config: StreamConfig, discontinuity: bool = False) -> subprocess.Popen:
        with self.state_lock:
            self.ffmpeg_generation += 1
            generation = self.ffmpeg_generation
            input_offset = self.input_start_offset_seconds
            segment_start_number = self.next_segment_start_number
            nvenc_preset = self.current_nvenc_preset

        remote_cmd = self.build_remote_ffmpeg_cmd(
            config,
            input_offset_seconds=input_offset,
            segment_start_number=segment_start_number,
            nvenc_preset=nvenc_preset,
            discontinuity=discontinuity,
        )
        process = self._spawn_logged_process(
            remote_cmd,
            cwd=str(config.remote_dir),
            prefix="remote-ffmpeg",
            on_line=lambda line: self._on_remote_ffmpeg_line(generation, line),
        )

        with self.state_lock:
            self.remote_wallclock_start = time.monotonic()
            self.remote_media_start_offset = self.input_start_offset_seconds
            self.remote_pacer_paused = False

        return process

    def build_stream_video_filter(self, config: StreamConfig) -> Optional[str]:
        filters: List[str] = []

        if config.convert_stream_to_sdr:
            filters.append(
                "zscale=t=linear:npl=100,format=gbrpf32le,"
                "zscale=p=bt709,tonemap=hable:desat=0,"
                "zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
            )

        if config.output_width and config.output_height:
            filters.append(f"scale={config.output_width}:{config.output_height}:force_original_aspect_ratio=decrease")

        if config.fps:
            filters.append(f"fps={config.fps}")

        return ",".join(filters) if filters else None

    def build_local_preview_cmd(self, config: StreamConfig) -> Optional[List[str]]:
        if not config.open_local_browser_preview:
            return None

        cmd = [config.ffmpeg_path, "-y", "-re", "-i", config.video_path]
        cmd += ["-map", "0:v:0", "-map", "0:a?"]
        cmd += ["-c:v", "copy", "-c:a", "copy"]
        cmd += ["-f", "hls"]
        cmd += ["-hls_time", "2", "-hls_list_size", "6"]
        cmd += ["-hls_flags", "delete_segments+independent_segments+temp_file"]
        cmd += ["-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4"]
        cmd += ["-master_pl_name", "master.m3u8"]
        cmd += ["-hls_segment_filename", "segment-%06d.m4s"]
        cmd += ["video.m3u8"]
        return cmd

    def build_remote_ffmpeg_cmd(
        self,
        config: StreamConfig,
        input_offset_seconds: float = 0.0,
        segment_start_number: int = 0,
        nvenc_preset: Optional[str] = None,
        discontinuity: bool = False,
    ) -> List[str]:
        cmd = [config.ffmpeg_path, "-y"]
        if input_offset_seconds > 0:
            cmd += ["-ss", format_ffmpeg_seconds(input_offset_seconds)]
        cmd += ["-readrate", f"{ffmpeg_readrate_for_target(config.target_speed):g}", "-i", config.video_path]
        if config.use_separate_audio_for_stream and config.alt_audio_path:
            cmd += ["-stream_loop", "-1", "-i", config.alt_audio_path]

        cmd += ["-map", "0:v:0"]
        if config.use_separate_audio_for_stream and config.alt_audio_path:
            cmd += ["-map", "1:a:0"]
        else:
            cmd += ["-map", "0:a?"]

        video_filter = self.build_stream_video_filter(config)
        if video_filter:
            cmd += ["-vf", video_filter]

        video_codec = config.output_video_codec
        encoder_preset = normalize_encoder_preset(video_codec, config.encoder_preset)

        cmd += ["-c:v", video_codec]
        if is_hevc_codec(video_codec):
            cmd += ["-tag:v", "hvc1"]
        elif is_av1_codec(video_codec):
            cmd += ["-tag:v", "av01"]

        if video_codec == "libx265":
            cmd += ["-x265-params", "repeat-headers=1:keyint=48:min-keyint=48:scenecut=0"]
        elif video_codec == "libx264":
            cmd += ["-x264-params", "keyint=48:min-keyint=48:scenecut=0"]
        elif video_codec == "libsvtav1":
            cmd += ["-g", "48", "-svtav1-params", "keyint=48:scd=0"]
        elif video_codec == "libaom-av1":
            cmd += ["-g", "48", "-keyint_min", "48", "-cpu-used", encoder_preset]
        else:
            cmd += ["-g", "48", "-keyint_min", "48", "-sc_threshold", "0"]

        cmd += ["-b:v", config.video_bitrate]
        cmd += ["-maxrate", config.video_bitrate]
        cmd += ["-bufsize", str(parse_bitrate_to_bps(config.video_bitrate) * 2)]

        if is_nvenc_codec(video_codec):
            cmd += ["-preset", normalize_nvenc_preset(nvenc_preset or encoder_preset)]
            cmd += ["-tune", "hq", "-multipass", "fullres"]
            cmd += ["-rc", "vbr", "-spatial_aq", "1", "-temporal_aq", "1"]
            if video_codec == "av1_nvenc":
                cmd += ["-cq", "23"]
        elif video_codec == "libsvtav1":
            cmd += ["-preset", encoder_preset]
        elif is_software_codec(video_codec) or is_qsv_codec(video_codec):
            cmd += ["-preset", encoder_preset]
        elif is_videotoolbox_codec(video_codec):
            cmd += ["-realtime", "1"]

        cmd += ["-c:a", config.output_audio_codec, "-b:a", config.audio_bitrate]
        if config.output_audio_codec == "aac":
            cmd += ["-ac", "2", "-ar", "48000"]

        cmd += ["-f", "hls"]
        cmd += ["-hls_time", "2", "-hls_list_size", "6"]
        hls_flags = "delete_segments+independent_segments+temp_file"
        if discontinuity:
            hls_flags += "+discont_start"
        cmd += ["-hls_flags", hls_flags]
        cmd += ["-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4"]
        cmd += ["-master_pl_name", "master.m3u8"]
        if segment_start_number > 0:
            cmd += ["-start_number", str(segment_start_number)]
        cmd += ["-hls_segment_filename", "segment-%06d.m4s"]
        cmd += ["video.m3u8"]
        return cmd

    def open_local_vlc(self, config: StreamConfig) -> None:
        if not config.open_local_vlc:
            return
        self.local_vlc_process = self._spawn_logged_process(
            [config.local_vlc_path, config.video_path],
            cwd=None,
            prefix="vlc",
        )
        self.log("Opened local VLC preview on the original source file.")

    def open_local_browser(self, config: StreamConfig) -> None:
        if not config.open_local_browser_preview:
            return
        url = f"http://127.0.0.1:{config.local_preview_port}/master.m3u8"
        webbrowser.open(url)
        self.log(f"Opened browser preview: {url}")

    def start(self, config: StreamConfig) -> None:
        if self.active_config is not None:
            raise RuntimeError("A stream is already active")

        self._reset_adaptive_state(config)
        config.remote_dir.mkdir(parents=True, exist_ok=True)
        config.local_dir.mkdir(parents=True, exist_ok=True)

        self.log("Creating live session...")
        config.session_info = self.create_session(config)
        self.log(f"Session created: {config.session_info.session_id}")
        self.log(f"Playback URL: {config.session_info.playback_url}")
        self.log(f"Share page: {config.session_info.share_url}")

        self.uploader = HttpHlsUploader(config, self.log_queue)
        self.uploader.start()

        if config.open_local_browser_preview:
            self.local_server = LocalPreviewServer(config.local_dir, config.local_preview_port, self.log_queue)
            self.local_server.start()
            local_cmd = self.build_local_preview_cmd(config)
            if local_cmd:
                self.local_preview_process = self._spawn_logged_process(local_cmd, cwd=str(config.local_dir), prefix="local-preview")
                time.sleep(1)
                self.open_local_browser(config)

        self.open_local_vlc(config)

        self.active_config = config
        if is_nvenc_codec(config.output_video_codec):
            self.log(
                f"NVENC enabled with preset {self.current_nvenc_preset}; "
                f"target segment speed is {config.target_speed:.2f}x."
            )
            if config.adaptive_nvenc:
                self._start_adaptive_thread()
        elif config.adaptive_nvenc:
            self.log("Adaptive NVENC is enabled, but the selected video codec is not an NVENC codec.")

        self._start_pacer_thread()
        self.ffmpeg_process = self._spawn_remote_ffmpeg(config)
        self.log("Streaming started")

    def stop(self) -> None:
        self.log("Stopping stream...")
        self.stop_event.set()
        self.restart_event.set()

        if self.adaptive_thread and self.adaptive_thread.is_alive() and threading.current_thread() is not self.adaptive_thread:
            self.adaptive_thread.join(timeout=5)
        self.adaptive_thread = None

        if self.uploader:
            self.uploader.stop()
            self.uploader.join(timeout=5)
            self.uploader = None

        for process in [self.ffmpeg_process, self.local_preview_process, self.local_vlc_process]:
            self._terminate_process(process)

        self.ffmpeg_process = None
        self.local_preview_process = None
        self.local_vlc_process = None

        if self.local_server:
            self.local_server.stop()
            self.local_server = None

        if self.active_config:
            for path in [self.active_config.remote_dir, self.active_config.local_dir]:
                try:
                    shutil.rmtree(path, ignore_errors=True)
                except Exception:
                    pass
        if self.pacer_thread and self.pacer_thread.is_alive() and threading.current_thread() is not self.pacer_thread:
            self.pacer_thread.join(timeout=5)
        self.pacer_thread = None

        self.active_config = None
        self.log("Stopped")


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("1080x780")

        self.log_queue: queue.Queue = queue.Queue()
        self.controller = StreamController(self.log_queue)

        self.video_path_var = tk.StringVar()
        self.alt_audio_path_var = tk.StringVar()
        self.website_base_url_var = tk.StringVar(value="https://your-domain.example")
        self.live_create_token_var = tk.StringVar()
        self.session_label_var = tk.StringVar()
        self.retain_segments_var = tk.StringVar(value=str(DEFAULT_RETAIN_SEGMENTS))
        self.video_codec_var = tk.StringVar(value="av1_nvenc")
        self.audio_codec_var = tk.StringVar(value="aac")
        self.width_var = tk.StringVar(value="3840")
        self.height_var = tk.StringVar(value="2160")
        self.video_bitrate_var = tk.StringVar(value="18M")
        self.audio_bitrate_var = tk.StringVar(value="192k")
        self.fps_var = tk.StringVar(value="24")
        self.encoder_preset_var = tk.StringVar(value=DEFAULT_NVENC_PRESET)
        self.codec_settings_note_var = tk.StringVar()
        self.target_speed_var = tk.StringVar(value=str(DEFAULT_TARGET_SPEED))
        self.local_port_var = tk.StringVar(value=str(DEFAULT_LOCAL_PORT))
        self.ffmpeg_path_var = tk.StringVar(value="ffmpeg")
        self.vlc_path_var = tk.StringVar(value=self.default_vlc_path())
        self.convert_stream_to_sdr_var = tk.BooleanVar(value=False)
        self.open_local_vlc_var = tk.BooleanVar(value=True)
        self.open_local_browser_preview_var = tk.BooleanVar(value=False)
        self.use_alt_audio_var = tk.BooleanVar(value=False)
        self.adaptive_nvenc_var = tk.BooleanVar(value=True)
        self.video_codec_combo: Optional[ttk.Combobox] = None
        self.audio_codec_combo: Optional[ttk.Combobox] = None
        self.encoder_preset_combo: Optional[ttk.Combobox] = None
        self.adaptive_nvenc_check: Optional[ttk.Checkbutton] = None

        self._build_ui()
        self._on_video_codec_change()
        self.after(250, self._drain_logs)
        self.protocol("WM_DELETE_WINDOW", self.on_close)

    def default_vlc_path(self) -> str:
        if sys.platform == "darwin":
            return "/Applications/VLC.app/Contents/MacOS/VLC"
        if os.name == "nt":
            return r"C:\Program Files\VideoLAN\VLC\vlc.exe"
        return "vlc"

    def _build_ui(self) -> None:
        main = ttk.Frame(self, padding=12)
        main.pack(fill="both", expand=True)

        form = ttk.Frame(main)
        form.pack(fill="x")

        row = 0
        self._file_row(form, row, "Video file", self.video_path_var, self.pick_video); row += 1
        self._file_row(form, row, "Alt audio file", self.alt_audio_path_var, self.pick_alt_audio); row += 1
        self._entry_row(form, row, "Website base URL", self.website_base_url_var); row += 1
        self._entry_row(form, row, "Live create token", self.live_create_token_var, show="*"); row += 1
        self._entry_row(form, row, "Session label", self.session_label_var); row += 1
        self._entry_row(form, row, "Retain segments", self.retain_segments_var); row += 1

        codecs = ttk.LabelFrame(main, text="Stream output")
        codecs.pack(fill="x", pady=(12, 0))
        self.video_codec_combo = self._combo_row(codecs, 0, "Video codec", self.video_codec_var, VIDEO_CODEC_OPTIONS)
        self.video_codec_combo.bind("<<ComboboxSelected>>", self._on_video_codec_change)
        self.audio_codec_combo = self._combo_row(codecs, 1, "Audio codec", self.audio_codec_var, AUDIO_CODEC_OPTIONS)
        self._entry_row(codecs, 2, "Width", self.width_var)
        self._entry_row(codecs, 3, "Height", self.height_var)
        self._entry_row(codecs, 4, "Video bitrate", self.video_bitrate_var)
        self._entry_row(codecs, 5, "Audio bitrate", self.audio_bitrate_var)
        self._entry_row(codecs, 6, "FPS", self.fps_var)
        self.encoder_preset_combo = self._combo_row(codecs, 7, "Encoder preset / mode", self.encoder_preset_var, NVENC_PRESET_LADDER)
        self._entry_row(codecs, 8, "Target encode speed", self.target_speed_var)
        ttk.Label(codecs, textvariable=self.codec_settings_note_var, wraplength=820).grid(row=9, column=1, sticky="w", padx=8, pady=(0, 4))

        tools = ttk.LabelFrame(main, text="Tools and preview")
        tools.pack(fill="x", pady=(12, 0))
        self._entry_row(tools, 0, "FFmpeg path", self.ffmpeg_path_var)
        self._entry_row(tools, 1, "VLC path", self.vlc_path_var)
        self._entry_row(tools, 2, "Local preview port", self.local_port_var)

        options = ttk.LabelFrame(main, text="Options")
        options.pack(fill="x", pady=(12, 0))
        ttk.Checkbutton(options, text="Convert streamed output from HDR to SDR", variable=self.convert_stream_to_sdr_var).grid(row=0, column=0, sticky="w", padx=8, pady=4)
        ttk.Checkbutton(options, text="Open local VLC preview on original source", variable=self.open_local_vlc_var).grid(row=1, column=0, sticky="w", padx=8, pady=4)
        ttk.Checkbutton(options, text="Open localhost browser HLS preview", variable=self.open_local_browser_preview_var).grid(row=2, column=0, sticky="w", padx=8, pady=4)
        ttk.Checkbutton(options, text="Use separate audio file for streamed output only", variable=self.use_alt_audio_var).grid(row=3, column=0, sticky="w", padx=8, pady=4)
        self.adaptive_nvenc_check = ttk.Checkbutton(options, text="Auto-nudge NVENC preset when a segment is below target speed", variable=self.adaptive_nvenc_var)
        self.adaptive_nvenc_check.grid(row=4, column=0, sticky="w", padx=8, pady=4)

        buttons = ttk.Frame(main)
        buttons.pack(fill="x", pady=(12, 0))
        ttk.Button(buttons, text="Start stream", command=self.start_stream).pack(side="left")
        ttk.Button(buttons, text="Stop stream", command=self.stop_stream).pack(side="left", padx=8)
        ttk.Button(buttons, text="Open playback URL", command=self.open_remote_playback_url).pack(side="left", padx=8)
        ttk.Button(buttons, text="Open share page", command=self.open_remote_share_url).pack(side="left")

        log_frame = ttk.LabelFrame(main, text="Logs")
        log_frame.pack(fill="both", expand=True, pady=(12, 0))
        self.log_text = tk.Text(log_frame, wrap="word", height=20)
        self.log_text.pack(fill="both", expand=True)

    def _entry_row(self, parent, row: int, label: str, variable: tk.StringVar, show: Optional[str] = None) -> None:
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky="w", padx=8, pady=4)
        entry = ttk.Entry(parent, textvariable=variable, width=90, show=show)
        entry.grid(row=row, column=1, sticky="ew", padx=8, pady=4)
        parent.grid_columnconfigure(1, weight=1)

    def _combo_row(self, parent, row: int, label: str, variable: tk.StringVar, values: List[str]) -> ttk.Combobox:
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky="w", padx=8, pady=4)
        combo = ttk.Combobox(parent, textvariable=variable, values=values, state="readonly", width=88)
        combo.grid(row=row, column=1, sticky="ew", padx=8, pady=4)
        parent.grid_columnconfigure(1, weight=1)
        return combo

    def _file_row(self, parent, row: int, label: str, variable: tk.StringVar, command) -> None:
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky="w", padx=8, pady=4)
        ttk.Entry(parent, textvariable=variable, width=78).grid(row=row, column=1, sticky="ew", padx=8, pady=4)
        ttk.Button(parent, text="Browse", command=command).grid(row=row, column=2, sticky="ew", padx=8, pady=4)
        parent.grid_columnconfigure(1, weight=1)

    def _on_video_codec_change(self, _event=None) -> None:
        try:
            family = codec_family(self.video_codec_var.get())
        except ValueError:
            family = "nvenc"

        preset_values = ENCODER_PRESETS[family]
        current_preset = self.encoder_preset_var.get().strip().lower()
        if current_preset not in preset_values:
            self.encoder_preset_var.set(DEFAULT_ENCODER_PRESETS[family])

        if self.encoder_preset_combo:
            self.encoder_preset_combo.configure(values=preset_values)
            self.encoder_preset_combo.configure(state="disabled" if family == "videotoolbox" else "readonly")

        if self.adaptive_nvenc_check:
            if family == "nvenc":
                self.adaptive_nvenc_check.state(["!disabled"])
            else:
                self.adaptive_nvenc_var.set(False)
                self.adaptive_nvenc_check.state(["disabled"])

        self.codec_settings_note_var.set(CODEC_SETTING_NOTES[family])

    def pick_video(self) -> None:
        path = filedialog.askopenfilename(title="Choose video file")
        if path:
            self.video_path_var.set(path)

    def pick_alt_audio(self) -> None:
        path = filedialog.askopenfilename(title="Choose alternate audio file")
        if path:
            self.alt_audio_path_var.set(path)

    def log(self, message: str) -> None:
        self.log_text.insert("end", message + "\n")
        self.log_text.see("end")

    def _drain_logs(self) -> None:
        while True:
            try:
                self.log(self.log_queue.get_nowait())
            except queue.Empty:
                break
        self.after(250, self._drain_logs)

    def _parse_optional_int(self, value: str) -> Optional[int]:
        text = value.strip()
        if not text:
            return None
        return int(text)

    def collect_config(self) -> StreamConfig:
        video_path = self.video_path_var.get().strip()
        if not video_path:
            raise ValueError("Video file is required")
        if not Path(video_path).exists():
            raise ValueError("Video file does not exist")

        alt_audio_path = self.alt_audio_path_var.get().strip() or None
        if self.use_alt_audio_var.get() and not alt_audio_path:
            raise ValueError("Alternate audio is enabled, but no audio file was selected")

        base_url = self.website_base_url_var.get().strip()
        if not base_url:
            raise ValueError("Website base URL is required")

        live_create_token = self.live_create_token_var.get().strip()
        if not live_create_token:
            raise ValueError("Live create token is required")

        retain_segments = int(self.retain_segments_var.get().strip())
        if retain_segments <= 0:
            raise ValueError("Retain segments must be greater than 0")

        target_speed = float(self.target_speed_var.get().strip())
        if target_speed <= 0:
            raise ValueError("Target encode speed must be greater than 0")

        video_codec = self.video_codec_var.get().strip().lower()
        codec_family(video_codec)
        audio_codec = normalize_audio_codec(self.audio_codec_var.get())
        encoder_preset = normalize_encoder_preset(video_codec, self.encoder_preset_var.get())

        return StreamConfig(
            video_path=video_path,
            alt_audio_path=alt_audio_path,
            website_base_url=base_url,
            live_create_token=live_create_token,
            session_label=self.session_label_var.get().strip(),
            retain_segment_count=retain_segments,
            output_video_codec=video_codec,
            output_audio_codec=audio_codec,
            output_width=self._parse_optional_int(self.width_var.get()),
            output_height=self._parse_optional_int(self.height_var.get()),
            video_bitrate=self.video_bitrate_var.get().strip(),
            audio_bitrate=self.audio_bitrate_var.get().strip(),
            fps=self._parse_optional_int(self.fps_var.get()),
            encoder_preset=encoder_preset,
            target_speed=target_speed,
            adaptive_nvenc=self.adaptive_nvenc_var.get() and is_nvenc_codec(video_codec),
            convert_stream_to_sdr=self.convert_stream_to_sdr_var.get(),
            open_local_vlc=self.open_local_vlc_var.get(),
            open_local_browser_preview=self.open_local_browser_preview_var.get(),
            local_preview_port=int(self.local_port_var.get().strip()),
            local_vlc_path=self.vlc_path_var.get().strip(),
            ffmpeg_path=self.ffmpeg_path_var.get().strip(),
            use_separate_audio_for_stream=self.use_alt_audio_var.get(),
        )

    def start_stream(self) -> None:
        try:
            self.controller.start(self.collect_config())
        except Exception as exc:
            messagebox.showerror("Start failed", str(exc))

    def stop_stream(self) -> None:
        try:
            self.controller.stop()
        except Exception as exc:
            messagebox.showerror("Stop failed", str(exc))

    def open_remote_playback_url(self) -> None:
        config = self.controller.active_config
        if not config or not config.session_info:
            messagebox.showinfo("No active session", "Start a stream first")
            return
        webbrowser.open(config.session_info.playback_url)
        self.log(f"Opened playback URL: {config.session_info.playback_url}")

    def open_remote_share_url(self) -> None:
        config = self.controller.active_config
        if not config or not config.session_info:
            messagebox.showinfo("No active session", "Start a stream first")
            return
        webbrowser.open(config.session_info.share_url)
        self.log(f"Opened share page: {config.session_info.share_url}")

    def on_close(self) -> None:
        try:
            self.controller.stop()
        finally:
            self.destroy()


if __name__ == "__main__":
    app = App()
    app.mainloop()
