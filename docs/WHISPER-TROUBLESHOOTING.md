# Troubleshooting Whisper: `WHISPER_UNHEALTHY` and model-download failures

Covers the desktop (Electron) app failing to start local transcription in **Mixed**
or **Local-only** mode. Tracking issue: [#56](https://github.com/sammargolis/OpenScribe/issues/56).

## How local transcription starts

1. OpenScribe spawns the bundled sidecar `openscribe-backend whisper-server` on
   `127.0.0.1:8002` (2.5s after launch, in the background).
2. The server binds the port immediately and reports progress on `GET /status`.
3. On a first-ever run it downloads a ggml Whisper model (`tiny.en`, ~75 MB) from
   huggingface.co into a writable cache directory, then loads it.
4. `GET /health` returns 200 only once the model is loaded. Everything before
   that is `503` with `{"stage": "downloading_model" | "loading_model"}`.

Model cache directory, in priority order:

| Priority | Location |
| --- | --- |
| 1 | `$OPENSCRIBE_WHISPER_MODELS_DIR` (the app sets this to its userData path) |
| 2 | `~/Library/Application Support/OpenScribe/whisper-models` (macOS) |
| 3 | `~/Library/Application Support/pywhispercpp/models` (legacy, still read) |

The cache is never inside the `.app` bundle: `Contents/Resources` is read-only on
a signed, hardened macOS app, so writing there fails with `EACCES`/`EROFS`.

## First: collect diagnostics

The app exposes a `whisper-diagnostics` IPC channel; the same data is available
from the CLI:

```bash
/Applications/OpenScribe.app/Contents/Resources/openscribe-backend/openscribe-backend whisper-doctor
```

It prints the resolved model directory, whether that directory is writable,
whether the model is already cached, and which Whisper/FastAPI/uvicorn backends
loaded. If the sidecar itself will not run, the command fails immediately — that
is the answer (see "Backend cannot run" below).

You can also check the service directly:

```bash
curl -s http://127.0.0.1:8002/status   # 200 while starting, includes stage
curl -s http://127.0.0.1:8002/health   # 200 only when ready
```

## Error codes and what to do

| Code | Meaning | Fix |
| --- | --- | --- |
| `WHISPER_STARTING` | Service is alive but the model is still downloading or loading. Retryable. | Wait and retry. A first run over a slow link can take several minutes. `/status` shows the stage. |
| `WHISPER_UNHEALTHY` | The service is not reachable and the process is not running. | Check the debug log for the sidecar's exit code, then run `whisper-doctor`. |
| `WHISPER_BACKEND_MISSING` | The bundled `openscribe-backend` executable is absent. | Reinstall from an official release; do not copy only the `.app`'s outer folder. |
| `WHISPER_BACKEND_NOT_EXECUTABLE` | The sidecar exists but macOS refused to launch it. | See "Backend cannot run". |
| `WHISPER_BACKEND_QUARANTINED` | `com.apple.quarantine` is still set on the sidecar. | See "Backend cannot run". |
| `WHISPER_BACKEND_ARCH_MISMATCH` | Intel build on Apple Silicon or vice versa. | Download the build matching your CPU. |
| `WHISPER_DOWNLOAD_FAILED` | The model download itself failed. The `details.cause` field says why: `NETWORK_UNAVAILABLE`, `TLS_ERROR`, `PERMISSION_DENIED`, `DISK_FULL`, `HTTP_ERROR`, `WHISPER_BACKEND_UNAVAILABLE`. | See "Model download fails". |

## Backend cannot run

If you bypassed Gatekeeper manually ("giving run permissions"), the outer app may
be approved while the nested sidecar binary is still quarantined. macOS then kills
it on `spawn`, which looks like an unhealthy Whisper service.

```bash
xattr -dr com.apple.quarantine /Applications/OpenScribe.app
```

Then reopen OpenScribe. Verify the sidecar runs on its own:

```bash
/Applications/OpenScribe.app/Contents/Resources/openscribe-backend/openscribe-backend whisper-doctor
```

## Model download fails

- `NETWORK_UNAVAILABLE` — the download cannot reach `huggingface.co`. Check VPN,
  proxy and firewall. The downloader uses a 15s connect / 120s read timeout, so a
  blocked route fails rather than hanging.
- `TLS_ERROR` — a proxy is intercepting HTTPS. Disable interception or install its
  CA, then retry.
- `PERMISSION_DENIED` — the cache directory is not writable. Run `whisper-doctor`
  and check `models_dir` / `models_dir_writable`. Move the app to `/Applications`
  and/or grant Full Disk Access.
- `DISK_FULL` — free at least 250 MB and retry.

## Manual model install (the workaround from issue #56)

If the in-app download keeps failing, fetch the model yourself. This is what
unblocked the reporter of #56.

```bash
MODEL_DIR="$HOME/Library/Application Support/OpenScribe/whisper-models"
mkdir -p "$MODEL_DIR"
curl -L -o "$MODEL_DIR/ggml-tiny.en.bin" \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin
```

`~/Library/Application Support/pywhispercpp/models` also works and is still
searched, so an existing pywhispercpp cache is reused rather than re-downloaded.
Restart OpenScribe afterwards; startup detects the cached model and skips the
download entirely.

For a different model size, replace `tiny.en` in both the filename and the URL
(for example `base.en`), and set `WHISPER_LOCAL_MODEL` to match.

## Development mode

In a checkout, the sidecar binary usually does not exist and OpenScribe falls back
to `local-only/openscribe-backend/.venv-backend` plus `scripts/whisper_server.py`.
Run the server standalone to see full logs:

```bash
pnpm whisper:server
curl -s http://127.0.0.1:8002/status
```

Point the cache somewhere specific with:

```bash
export OPENSCRIBE_WHISPER_MODELS_DIR=/tmp/whisper-models
```

Related: [WHISPER-LOCAL-SETUP.md](./WHISPER-LOCAL-SETUP.md),
[DOWNLOAD_AND_USE.md](./DOWNLOAD_AND_USE.md).
