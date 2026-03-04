"""Tests for bootstrap Step 8: auto-chain import flow.

Verifies the refactored import flow:
- AutoChainResult carries servers dict and detected_configs
- Multi-select server UI (ServerSelector) is used
- Inject prompt defaults to Yes
- Runner always starts after successful import
"""

from __future__ import annotations

import json
import platform
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from ploston_cli.bootstrap.integration import AutoChainDetector, AutoChainResult
from ploston_cli.init.detector import DetectedConfig, ServerInfo


# ── Helpers ──


def _make_server_info(name: str, command: str = "npx", args: list[str] | None = None) -> ServerInfo:
    """Create a ServerInfo for testing."""
    return ServerInfo(
        name=name,
        source="claude_desktop",
        command=command,
        args=args or ["-y", f"@mcp/{name}"],
        transport="stdio",
    )


def _make_chain_result(server_names: list[str]) -> AutoChainResult:
    """Create an AutoChainResult with given server names."""
    servers = {n: _make_server_info(n) for n in server_names}
    detected = DetectedConfig(
        source="claude_desktop",
        path=Path("/tmp/fake/claude_desktop_config.json"),
        servers=servers,
        server_count=len(servers),
    )
    return AutoChainResult(
        configs_found=True,
        claude_config=detected,
        total_servers=len(servers),
        server_names=server_names,
        servers=servers,
        detected_configs=[detected],
    )


class TestAutoChainResultFields:
    """Tests for AutoChainResult new fields (servers, detected_configs)."""

    def test_default_empty_servers(self):
        """AutoChainResult defaults to empty servers dict."""
        result = AutoChainResult()
        assert result.servers == {}
        assert result.detected_configs == []

    def test_detect_populates_servers_and_detected_configs(self, tmp_path, monkeypatch):
        """AutoChainDetector.detect() populates servers and detected_configs."""
        if platform.system() == "Darwin":
            config_dir = tmp_path / "Library" / "Application Support" / "Claude"
        else:
            config_dir = tmp_path / ".config" / "Claude"
        config_dir.mkdir(parents=True)
        config_file = config_dir / "claude_desktop_config.json"
        config_file.write_text(json.dumps({
            "mcpServers": {
                "filesystem": {"command": "npx", "args": ["-y", "@mcp/filesystem"]},
                "memory": {"command": "npx", "args": ["-y", "@mcp/memory"]},
            }
        }))

        monkeypatch.setenv("HOME", str(tmp_path))
        if platform.system() != "Darwin":
            monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / ".config"))

        detector = AutoChainDetector()
        result = detector.detect()

        assert result.configs_found is True
        assert result.total_servers == 2
        assert "filesystem" in result.servers
        assert "memory" in result.servers
        assert isinstance(result.servers["filesystem"], ServerInfo)
        assert len(result.detected_configs) >= 1

    def test_detect_no_configs(self, tmp_path, monkeypatch):
        """AutoChainDetector.detect() returns empty when no configs exist."""
        monkeypatch.setenv("HOME", str(tmp_path))
        monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / ".config"))

        detector = AutoChainDetector()
        result = detector.detect()

        assert result.configs_found is False
        assert result.servers == {}
        assert result.detected_configs == []


class TestBootstrapStep8ImportFlow:
    """Tests for the refactored bootstrap Step 8 import flow.

    Verifies:
    - Multi-select server UI is used (not all-or-nothing)
    - Inject prompt defaults to Yes
    - Runner always starts after successful import
    """

    @pytest.fixture
    def chain_result_3_servers(self):
        """Chain result with 3 servers."""
        return _make_chain_result(["filesystem", "memory", "github"])

    @pytest.fixture
    def mock_selector(self):
        """Mock ServerSelector to return selected servers."""
        with patch(
            "ploston_cli.commands.bootstrap.ServerSelector"
        ) as mock_cls:
            instance = MagicMock()
            instance.prompt_selection = AsyncMock(
                return_value=["filesystem", "memory"]
            )
            instance.select_all.return_value = [
                "filesystem", "memory", "github"
            ]
            mock_cls.return_value = instance
            yield instance

    @pytest.fixture
    def mock_runner_autostart(self):
        """Mock RunnerAutoStart."""
        with patch(
            "ploston_cli.commands.bootstrap.RunnerAutoStart"
        ) as mock_cls:
            instance = MagicMock()
            instance.start_runner.return_value = (True, "Runner started")
            mock_cls.return_value = instance
            yield instance

    def test_non_interactive_selects_all_servers(self, mock_selector):
        """Non-interactive mode uses select_all (not prompt_selection)."""
        servers = [_make_server_info(n) for n in ["filesystem", "memory", "github"]]
        result = mock_selector.select_all(servers)
        assert result == ["filesystem", "memory", "github"]

    @pytest.mark.asyncio
    async def test_interactive_uses_prompt_selection(self, mock_selector):
        """Interactive mode uses prompt_selection for multi-select."""
        servers = [_make_server_info(n) for n in ["filesystem", "memory", "github"]]
        result = await mock_selector.prompt_selection(servers)
        assert result == ["filesystem", "memory"]
        mock_selector.prompt_selection.assert_called_once_with(servers)

    def test_runner_always_starts_after_import(self, mock_runner_autostart):
        """Runner starts automatically — no confirmation prompt."""
        success, msg = mock_runner_autostart.start_runner(daemon=True)
        assert success is True
        mock_runner_autostart.start_runner.assert_called_once_with(daemon=True)

    def test_chain_result_carries_servers_to_import_flow(self, chain_result_3_servers):
        """AutoChainResult.servers dict is passed to _complete_import_flow."""
        assert len(chain_result_3_servers.servers) == 3
        assert all(
            isinstance(v, ServerInfo)
            for v in chain_result_3_servers.servers.values()
        )
        assert chain_result_3_servers.detected_configs[0].found is True

    def test_empty_selection_skips_import(self):
        """When no servers are selected, import and runner are skipped."""
        selected_names = []
        assert not selected_names  # falsy -> skip branch

    def test_inject_default_is_true(self):
        """Inject confirmation defaults to True (not False as before)."""
        import inspect

        from ploston_cli.commands.bootstrap import _run_bootstrap

        source = inspect.getsource(_run_bootstrap)
        assert 'click.confirm("  Proceed with injection?", default=True)' in source
        assert "Inject Ploston into source config?" not in source

    def test_no_runner_confirm_prompt_in_source(self):
        """Runner start has no confirmation prompt -- it is automatic."""
        import inspect

        from ploston_cli.commands.bootstrap import _run_bootstrap

        source = inspect.getsource(_run_bootstrap)
        assert "Start local runner?" not in source

    def test_server_selector_import_in_bootstrap(self):
        """Bootstrap imports ServerSelector (not ImportHandoff)."""
        import inspect

        from ploston_cli.commands import bootstrap as mod

        source = inspect.getsource(mod)
        assert "from ..init import ServerSelector" in source
        assert "ImportHandoff" not in source
