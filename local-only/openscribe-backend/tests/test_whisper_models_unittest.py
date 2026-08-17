import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from src import whisper_models


class WhisperModelPathTests(unittest.TestCase):
    def test_model_filename_and_url(self):
        self.assertEqual(whisper_models.model_filename("tiny.en"), "ggml-tiny.en.bin")
        self.assertEqual(
            whisper_models.model_url("tiny.en"),
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
        )

    def test_env_override_wins_and_is_created(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "nested" / "whisper-models"
            with mock.patch.dict(os.environ, {whisper_models.MODELS_DIR_ENV: str(target)}):
                resolved = whisper_models.resolve_models_dir(create=True)
            self.assertEqual(resolved, target)
            self.assertTrue(target.is_dir())

    def test_non_writable_override_raises_permission_denied(self):
        with mock.patch.dict(os.environ, {whisper_models.MODELS_DIR_ENV: "/System/openscribe-not-writable"}):
            with self.assertRaises(whisper_models.WhisperModelError) as ctx:
                whisper_models.resolve_models_dir(create=True)
        self.assertEqual(ctx.exception.cause, "permission_denied")

    def test_candidate_dirs_include_override_first_and_are_unique(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.dict(os.environ, {whisper_models.MODELS_DIR_ENV: tmp}):
                candidates = whisper_models.candidate_models_dirs()
        self.assertEqual(candidates[0], Path(tmp))
        self.assertEqual(len(candidates), len(set(candidates)))

    def test_find_model_locates_existing_file_in_any_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            model_path = Path(tmp) / "ggml-tiny.en.bin"
            model_path.write_bytes(b"not a real model")
            with mock.patch.dict(os.environ, {whisper_models.MODELS_DIR_ENV: tmp}):
                self.assertEqual(whisper_models.find_model("tiny.en"), model_path)
                self.assertIsNone(whisper_models.find_model("large-v3"))

    def test_find_model_ignores_empty_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "ggml-tiny.en.bin").write_bytes(b"")
            with mock.patch.dict(os.environ, {whisper_models.MODELS_DIR_ENV: tmp}, clear=False):
                # An interrupted download must not be mistaken for a cached model.
                found = whisper_models.find_model("tiny.en")
                self.assertNotEqual(found, Path(tmp) / "ggml-tiny.en.bin")

    def test_ensure_model_returns_cached_file_without_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            model_path = Path(tmp) / "ggml-tiny.en.bin"
            model_path.write_bytes(b"cached")
            with mock.patch.dict(os.environ, {whisper_models.MODELS_DIR_ENV: tmp}):
                with mock.patch.object(whisper_models, "_download_with_requests") as download:
                    self.assertEqual(whisper_models.ensure_model("tiny.en"), model_path)
                    download.assert_not_called()

    def test_ensure_model_writes_atomically_and_cleans_partials(self):
        with tempfile.TemporaryDirectory() as tmp:
            def fake_download(url, destination, progress):
                destination.write_bytes(b"downloaded model")
                return True

            with mock.patch.dict(os.environ, {whisper_models.MODELS_DIR_ENV: tmp}):
                with mock.patch.object(whisper_models, "_download_with_requests", fake_download):
                    path = whisper_models.ensure_model("small.en")
            self.assertEqual(path, Path(tmp) / "ggml-small.en.bin")
            self.assertEqual(path.read_bytes(), b"downloaded model")
            self.assertFalse((Path(tmp) / "ggml-small.en.bin.part").exists())

    def test_ensure_model_classifies_network_failures(self):
        with tempfile.TemporaryDirectory() as tmp:
            def boom(url, destination, progress):
                raise OSError("getaddrinfo failed: nodename nor servname provided")

            with mock.patch.dict(os.environ, {whisper_models.MODELS_DIR_ENV: tmp}):
                with mock.patch.object(whisper_models, "_download_with_requests", boom):
                    with self.assertRaises(whisper_models.WhisperModelError) as ctx:
                        whisper_models.ensure_model("small.en")
            self.assertEqual(ctx.exception.cause, "network_unavailable")
            self.assertFalse((Path(tmp) / "ggml-small.en.bin.part").exists())

    def test_describe_reports_writability_and_presence(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "ggml-tiny.en.bin").write_bytes(b"cached")
            with mock.patch.dict(os.environ, {whisper_models.MODELS_DIR_ENV: tmp}):
                payload = whisper_models.describe("tiny.en")
        self.assertEqual(payload["models_dir"], tmp)
        self.assertEqual(payload["models_dir_source"], "env")
        self.assertTrue(payload["models_dir_writable"])
        self.assertTrue(payload["model_present"])


if __name__ == "__main__":
    unittest.main()
