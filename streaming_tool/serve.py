import os
import queue
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

import requests
import tkinter as tk
from tkinter import filedialog, messagebox, ttk


APP_TITLE = "HLS Streamer (FFmpeg + VLC)"
DEFAULT_LOCAL_PORT = 8777
DEFAULT_RETAIN_SEGMENTS = 18
UPLOAD_POLL_INTERVAL_SECONDS = 0.75


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

    if video_codec in {"libx265", "hevc_nvenc", "hevc_qsv", "hevc_videotoolbox"}:
        codecs.append("hvc1")
    elif video_codec in {"libx264", "h264_nvenc", "h264_qsv", "h264_videotoolbox"}:
        codecs.append("avc1")

    if audio_codec == "aac":
        codecs.append("mp4a.40.2")
    elif audio_codec == "mp3":
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
        self.last_uploaded: Dict[Path, float] = {}
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

        if parts[-1] == "master.m3u8":
            return f"{self.api_base}/master.m3u8"

        if parts[-1] == "video.m3u8":
            return f"{self.api_base}/video.m3u8"

        if len(parts) >= 2 and parts[0] == "segments":
            return f"{self.api_base}/segments/{parts[-1]}"

        return f"{self.api_base}/segments/{parts[-1]}"

    def upload_file(self, file_path: Path) -> None:
        url = self.remote_url_for_path(file_path)
        headers = self.build_ingest_headers()
        headers["Content-Type"] = self.mime_type_for_path(file_path)

        with file_path.open("rb") as handle:
            response = self.session.put(url, data=handle, headers=headers, timeout=30)

        raise_for_status_with_body(response)
        self.last_uploaded[file_path] = file_path.stat().st_mtime
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
        previous_mtime = self.last_uploaded.get(file_path)
        return previous_mtime is None or stats.st_mtime > previous_mtime

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
        candidates: List[Path] = []

        segments_dir = self.config.remote_dir / "segments"
        if segments_dir.exists():
            candidates.extend(sorted(p for p in segments_dir.iterdir() if p.is_file()))

        media_playlist = self.config.remote_dir / "video.m3u8"
        if media_playlist.exists():
            candidates.append(media_playlist)

        master_playlist = self.config.remote_dir / "master.m3u8"
        if master_playlist.exists():
            candidates.append(master_playlist)

        return candidates

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

    def log(self, message: str) -> None:
        self.log_queue.put(message)

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

    def _consume_output(self, stream, prefix: str) -> None:
        try:
            for line in iter(stream.readline, ""):
                line = line.strip()
                if line:
                    self.log(f"{prefix}: {line}")
        finally:
            try:
                stream.close()
            except Exception:
                pass

    def _spawn_logged_process(self, cmd: List[str], cwd: Optional[str], prefix: str) -> subprocess.Popen:
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
            thread = threading.Thread(target=self._consume_output, args=(process.stdout, prefix), daemon=True)
            thread.start()
            self.stdout_threads.append(thread)
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

        local_segments_dir = config.local_dir / "segments"
        local_segments_dir.mkdir(parents=True, exist_ok=True)
        media_path = config.local_dir / "video.m3u8"

        cmd = [config.ffmpeg_path, "-y", "-re", "-i", config.video_path]
        cmd += ["-map", "0:v:0", "-map", "0:a?"]
        cmd += ["-c:v", "copy", "-c:a", "copy"]
        cmd += ["-f", "hls"]
        cmd += ["-hls_time", "2", "-hls_list_size", "6"]
        cmd += ["-hls_flags", "delete_segments+append_list+independent_segments+temp_file"]
        cmd += ["-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "segments/init.mp4"]
        cmd += ["-master_pl_name", "master.m3u8"]
        cmd += ["-hls_segment_filename", str(local_segments_dir / "seg_%06d.m4s")]
        cmd += [str(media_path)]
        return cmd

    def build_remote_ffmpeg_cmd(self, config: StreamConfig) -> List[str]:
        remote_segments_dir = config.remote_dir / "segments"
        remote_segments_dir.mkdir(parents=True, exist_ok=True)

        media_playlist_path = config.remote_dir / "video.m3u8"

        cmd = [config.ffmpeg_path, "-y", "-re", "-i", config.video_path]
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

        cmd += ["-c:v", config.output_video_codec]
        if config.output_video_codec in {"libx265", "hevc_nvenc", "hevc_qsv", "hevc_videotoolbox"}:
            cmd += ["-tag:v", "hvc1"]
        if config.output_video_codec == "libx265":
            cmd += ["-x265-params", "repeat-headers=1:keyint=48:min-keyint=48:scenecut=0"]
        else:
            cmd += ["-g", "48", "-keyint_min", "48", "-sc_threshold", "0"]

        cmd += ["-b:v", config.video_bitrate]
        cmd += ["-maxrate", config.video_bitrate]
        cmd += ["-bufsize", str(parse_bitrate_to_bps(config.video_bitrate) * 2)]

        if config.output_video_codec.startswith("libx"):
            cmd += ["-preset", "medium"]

        cmd += ["-c:a", config.output_audio_codec, "-b:a", config.audio_bitrate]
        if config.output_audio_codec == "aac":
            cmd += ["-ac", "2", "-ar", "48000"]

        cmd += ["-f", "hls"]
        cmd += ["-hls_time", "2", "-hls_list_size", "6"]
        cmd += ["-hls_flags", "delete_segments+append_list+independent_segments+temp_file"]
        cmd += ["-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "segments/init.mp4"]
        cmd += ["-master_pl_name", "master.m3u8"]
        cmd += ["-hls_segment_filename", str(remote_segments_dir / "seg_%06d.m4s")]
        cmd += [str(media_playlist_path)]
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

        remote_cmd = self.build_remote_ffmpeg_cmd(config)
        self.ffmpeg_process = self._spawn_logged_process(remote_cmd, cwd=str(config.remote_dir), prefix="remote-ffmpeg")
        self.active_config = config
        self.log("Streaming started")

    def stop(self) -> None:
        self.log("Stopping stream...")

        if self.uploader:
            self.uploader.stop()
            self.uploader.join(timeout=5)
            self.uploader = None

        for process in [self.ffmpeg_process, self.local_preview_process, self.local_vlc_process]:
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()

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
        self.video_codec_var = tk.StringVar(value="libx265")
        self.audio_codec_var = tk.StringVar(value="aac")
        self.width_var = tk.StringVar(value="3840")
        self.height_var = tk.StringVar(value="2160")
        self.video_bitrate_var = tk.StringVar(value="18M")
        self.audio_bitrate_var = tk.StringVar(value="192k")
        self.fps_var = tk.StringVar(value="24")
        self.local_port_var = tk.StringVar(value=str(DEFAULT_LOCAL_PORT))
        self.ffmpeg_path_var = tk.StringVar(value="ffmpeg")
        self.vlc_path_var = tk.StringVar(value=self.default_vlc_path())
        self.convert_stream_to_sdr_var = tk.BooleanVar(value=False)
        self.open_local_vlc_var = tk.BooleanVar(value=True)
        self.open_local_browser_preview_var = tk.BooleanVar(value=False)
        self.use_alt_audio_var = tk.BooleanVar(value=False)

        self._build_ui()
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
        self._entry_row(codecs, 0, "Video codec", self.video_codec_var)
        self._entry_row(codecs, 1, "Audio codec", self.audio_codec_var)
        self._entry_row(codecs, 2, "Width", self.width_var)
        self._entry_row(codecs, 3, "Height", self.height_var)
        self._entry_row(codecs, 4, "Video bitrate", self.video_bitrate_var)
        self._entry_row(codecs, 5, "Audio bitrate", self.audio_bitrate_var)
        self._entry_row(codecs, 6, "FPS", self.fps_var)

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

    def _file_row(self, parent, row: int, label: str, variable: tk.StringVar, command) -> None:
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky="w", padx=8, pady=4)
        ttk.Entry(parent, textvariable=variable, width=78).grid(row=row, column=1, sticky="ew", padx=8, pady=4)
        ttk.Button(parent, text="Browse", command=command).grid(row=row, column=2, sticky="ew", padx=8, pady=4)
        parent.grid_columnconfigure(1, weight=1)

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

        return StreamConfig(
            video_path=video_path,
            alt_audio_path=alt_audio_path,
            website_base_url=base_url,
            live_create_token=live_create_token,
            session_label=self.session_label_var.get().strip(),
            retain_segment_count=retain_segments,
            output_video_codec=self.video_codec_var.get().strip(),
            output_audio_codec=self.audio_codec_var.get().strip(),
            output_width=self._parse_optional_int(self.width_var.get()),
            output_height=self._parse_optional_int(self.height_var.get()),
            video_bitrate=self.video_bitrate_var.get().strip(),
            audio_bitrate=self.audio_bitrate_var.get().strip(),
            fps=self._parse_optional_int(self.fps_var.get()),
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
