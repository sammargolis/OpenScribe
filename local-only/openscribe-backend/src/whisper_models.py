"""
Whisper (ggml) model cache resolution and download.

Two problems this module exists to solve:

1. The model cache must live in a *writable* directory. When the backend runs
   from inside a signed macOS ``.app`` bundle, anything derived from
   ``__file__`` points at read-only ``Contents/Resources``, so a download that
   targets it fails with EACCES/EROFS and surfaces as the useless
   "Failed to download Whisper model".
2. ``pywhispercpp.utils.download_model`` issues ``requests.get`` with no
   timeout, so a hung connection blocks the whisper server forever and the
   Electron health check reports WHISPER_UNHEALTHY with no explanation.

Downloads here are resumable-safe (temp file + atomic replace), time-bounded,
and raise :class:`WhisperModelError` with a machine-readable ``cause`` so the
Electron layer can tell the user what to actually do.
"""

import os
import shutil
import sys
from pathlib import Path
from typing import Callable, List, Optional

DEFAULT_MODEL = "tiny.en"
MODELS_BASE_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main"
MODELS_DIR_ENV = "OPENSCRIBE_WHISPER_MODELS_DIR"

# Connect timeout / read timeout in seconds. A stalled read must fail loudly
# rather than pin the whisper server in a permanent "starting" state.
CONNECT_TIMEOUT = 15
READ_TIMEOUT = 120

# ggml tiny.en is ~75MB; keep some headroom for the temp file plus atomic move.
MIN_FREE_BYTES = 250 * 1024 * 1024


class WhisperModelError(RuntimeError):
    """A Whisper model could not be resolved or downloaded."""

    def __init__(self, message: str, cause: str = "unknown", path: Optional[Path] = None):
        super().__init__(message)
        self.cause = cause
        self.path = str(path) if path else ""


def model_filename(model: str) -> str:
    return f"ggml-{model}.bin"


def model_url(model: str) -> str:
    return f"{MODELS_BASE_URL}/{model_filename(model)}"


def _home() -> Path:
    return Path.home()


def _pywhispercpp_models_dir() -> Path:
    """Where pywhispercpp would look by itself (platformdirs based)."""
    try:
        from pywhispercpp.constants import MODELS_DIR  # type: ignore

        return Path(MODELS_DIR)
    except Exception:
        home = _home()
        if sys.platform == "darwin":
            return home / "Library" / "Application Support" / "pywhispercpp" / "models"
        if os.name == "nt":
            base = os.environ.get("LOCALAPPDATA") or str(home / "AppData" / "Local")
            return Path(base) / "pywhispercpp" / "models"
        base = os.environ.get("XDG_DATA_HOME") or str(home / ".local" / "share")
        return Path(base) / "pywhispercpp" / "models"


def candidate_models_dirs() -> List[Path]:
    """Every directory that may already hold a downloaded ggml model."""
    candidates: List[Path] = []

    def push(path: Optional[Path]) -> None:
        if path is None:
            return
        resolved = Path(path)
        if resolved not in candidates:
            candidates.append(resolved)

    override = os.environ.get(MODELS_DIR_ENV, "").strip()
    if override:
        push(Path(override))

    push(_pywhispercpp_models_dir())

    home = _home()
    push(home / "Library" / "Application Support" / "pywhispercpp" / "models")
    push(home / ".local" / "share" / "pywhispercpp" / "models")
    push(home / ".cache" / "pywhispercpp" / "models")
    push(home / ".cache" / "whisper")
    return candidates


def _is_writable_dir(path: Path) -> bool:
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError:
        return False
    return os.access(str(path), os.W_OK | os.X_OK)


def resolve_models_dir(create: bool = True) -> Path:
    """
    Return the writable directory the model cache should use.

    ``OPENSCRIBE_WHISPER_MODELS_DIR`` (set by the Electron shell to a path under
    ``app.getPath('userData')``) always wins. Falls back to the pywhispercpp
    default so a standalone CLI run keeps working.
    """
    override = os.environ.get(MODELS_DIR_ENV, "").strip()
    if override:
        target = Path(override)
        if not create:
            return target
        if _is_writable_dir(target):
            return target
        raise WhisperModelError(
            f"Whisper model directory is not writable: {target}",
            cause="permission_denied",
            path=target,
        )

    fallback = _pywhispercpp_models_dir()
    if not create:
        return fallback
    if _is_writable_dir(fallback):
        return fallback
    raise WhisperModelError(
        f"Whisper model directory is not writable: {fallback}",
        cause="permission_denied",
        path=fallback,
    )


def find_model(model: str = DEFAULT_MODEL) -> Optional[Path]:
    """Return the path of an already-downloaded model, if any."""
    filename = model_filename(model)
    for directory in candidate_models_dirs():
        candidate = directory / filename
        try:
            if candidate.is_file() and candidate.stat().st_size > 0:
                return candidate
        except OSError:
            continue
    return None


def _check_free_space(directory: Path) -> None:
    try:
        usage = shutil.disk_usage(str(directory))
    except OSError:
        return
    if usage.free < MIN_FREE_BYTES:
        raise WhisperModelError(
            f"Not enough free disk space for the Whisper model: {usage.free} bytes available in {directory}",
            cause="disk_full",
            path=directory,
        )


def _classify_download_exception(exc: BaseException) -> str:
    name = type(exc).__name__.lower()
    text = str(exc).lower()
    if isinstance(exc, PermissionError) or "permission denied" in text or "read-only file system" in text:
        return "permission_denied"
    if isinstance(exc, OSError) and getattr(exc, "errno", None) == 28:
        return "disk_full"
    if "no space left" in text:
        return "disk_full"
    if "certificate" in text or "ssl" in name or "ssl" in text:
        return "tls_error"
    if "timeout" in name or "timed out" in text:
        return "network_unavailable"
    if any(token in text for token in ("getaddrinfo", "name or service not known", "nodename nor servname",
                                       "connection refused", "connection reset", "network is unreachable",
                                       "max retries exceeded", "temporary failure in name resolution")):
        return "network_unavailable"
    if "httperror" in name or "http error" in text or "status" in text:
        return "http_error"
    return "unknown"


def _download_with_requests(url: str, destination: Path, progress: Optional[Callable[[int, int], None]]) -> bool:
    try:
        import requests  # type: ignore
    except Exception:
        return False

    with requests.get(url, stream=True, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT)) as response:
        if response.status_code != 200:
            raise WhisperModelError(
                f"Whisper model download failed with HTTP {response.status_code} for {url}",
                cause="http_error",
            )
        total = int(response.headers.get("content-length") or 0)
        written = 0
        with open(destination, "wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 256):
                if not chunk:
                    continue
                written += handle.write(chunk)
                if progress:
                    progress(written, total)
    return True


def _download_with_urllib(url: str, destination: Path, progress: Optional[Callable[[int, int], None]]) -> None:
    import urllib.request

    request = urllib.request.Request(url, headers={"User-Agent": "OpenScribe"})
    with urllib.request.urlopen(request, timeout=READ_TIMEOUT) as response:  # noqa: S310 - fixed https host
        total = int(response.headers.get("content-length") or 0)
        written = 0
        with open(destination, "wb") as handle:
            while True:
                chunk = response.read(1024 * 256)
                if not chunk:
                    break
                written += handle.write(chunk)
                if progress:
                    progress(written, total)


def ensure_model(
    model: str = DEFAULT_MODEL,
    progress: Optional[Callable[[int, int], None]] = None,
    models_dir: Optional[Path] = None,
) -> Path:
    """
    Return a local path to the ggml model, downloading it if needed.

    Raises :class:`WhisperModelError` with a ``cause`` of ``permission_denied``,
    ``disk_full``, ``tls_error``, ``network_unavailable``, ``http_error`` or
    ``unknown``.
    """
    existing = find_model(model)
    if existing is not None:
        return existing

    directory = Path(models_dir) if models_dir else resolve_models_dir(create=True)
    if not _is_writable_dir(directory):
        raise WhisperModelError(
            f"Whisper model directory is not writable: {directory}",
            cause="permission_denied",
            path=directory,
        )
    _check_free_space(directory)

    final_path = directory / model_filename(model)
    temp_path = directory / f"{model_filename(model)}.part"
    url = model_url(model)

    try:
        if temp_path.exists():
            temp_path.unlink()
        if not _download_with_requests(url, temp_path, progress):
            _download_with_urllib(url, temp_path, progress)
        if not temp_path.is_file() or temp_path.stat().st_size == 0:
            raise WhisperModelError(
                f"Whisper model download produced an empty file for {url}",
                cause="http_error",
                path=temp_path,
            )
        os.replace(str(temp_path), str(final_path))
    except WhisperModelError:
        _safe_unlink(temp_path)
        raise
    except BaseException as exc:  # noqa: BLE001 - re-raised as WhisperModelError
        _safe_unlink(temp_path)
        raise WhisperModelError(
            f"Whisper model download failed for {url}: {exc}",
            cause=_classify_download_exception(exc),
            path=directory,
        ) from exc

    return final_path


def _safe_unlink(path: Path) -> None:
    try:
        if path.exists():
            path.unlink()
    except OSError:
        pass


def describe(model: str = DEFAULT_MODEL) -> dict:
    """Diagnostics payload for the `whisper-doctor` CLI command."""
    try:
        resolved_dir = str(resolve_models_dir(create=False))
    except WhisperModelError as exc:
        resolved_dir = exc.path

    writable = False
    write_error = ""
    try:
        writable = _is_writable_dir(Path(resolved_dir))
    except OSError as exc:
        write_error = str(exc)

    found = find_model(model)

    backends = {}
    try:
        import pywhispercpp  # type: ignore

        backends["pywhispercpp"] = getattr(pywhispercpp, "__version__", "installed")
    except Exception as exc:
        backends["pywhispercpp"] = f"unavailable: {exc}"
    try:
        import fastapi  # type: ignore

        backends["fastapi"] = getattr(fastapi, "__version__", "installed")
    except Exception as exc:
        backends["fastapi"] = f"unavailable: {exc}"
    try:
        import uvicorn  # type: ignore

        backends["uvicorn"] = getattr(uvicorn, "__version__", "installed")
    except Exception as exc:
        backends["uvicorn"] = f"unavailable: {exc}"

    return {
        "model": model,
        "models_dir": resolved_dir,
        "models_dir_source": "env" if os.environ.get(MODELS_DIR_ENV, "").strip() else "default",
        "models_dir_writable": writable,
        "models_dir_error": write_error,
        "model_present": found is not None,
        "model_path": str(found) if found else "",
        "model_url": model_url(model),
        "frozen": bool(getattr(sys, "frozen", False)),
        "executable": sys.executable,
        "candidates": [str(path) for path in candidate_models_dirs()],
        "backends": backends,
    }
