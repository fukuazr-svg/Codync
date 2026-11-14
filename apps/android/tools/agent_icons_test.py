"""Self-check for agent_icons.py: python3 tools/agent_icons_test.py"""

import base64
import contextlib
import importlib.util
import io
import pathlib
import shutil
import struct
import tempfile
import uuid
import zlib

spec = importlib.util.spec_from_file_location("agent_icons", pathlib.Path(__file__).with_name("agent_icons.py"))
icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(icons)

rounding = {
    # A decimal that rounds to a whole number keeps the next `.05` a number of its own.
    "M3.392-7.003.05": "M3.39-7 0.05",
    "M1.5.5": "M1.5 0.5",
    # Arc flags are single digits that may touch the next number.
    "a.306.306 0 01.415-.287": "a0.31 0.31 0 0 1 0.41-0.29",
    "A1 1 0 1112 13a1 1 0 0 0 2 3": "A1 1 0 1 1 12 13a1 1 0 0 0 2 3",
    # Exponents, repeated commands and closing paths.
    "L3.3e-05 5zM0 0h24v24H0z": "L0 5zM0 0h24v24H0z",
}
for path, expected in rounding.items():
    assert icons.compact(path, 24) == expected, (path, icons.compact(path, 24))


def png(width: int, height: int) -> bytes:
    """An RGBA PNG: colour type 6, so it carries the alpha an agent mark needs."""

    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    rows = b"".join(b"\x00" + bytes([42, 197, 116, 128]) * width for _ in range(height))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


mark = png(2, 2)
assert mark[25] == 6, mark[25]  # the fixture is what it claims to be
embedded = "data:image/png;base64," + base64.b64encode(mark).decode()

# A directory of our own: tempfile's is mode 0700, which Windows then refuses to write in.
root = pathlib.Path(tempfile.gettempdir(), f"agent_icons_test_{uuid.uuid4().hex[:8]}")
root.mkdir()
try:
    icons.ASSETS, icons.DRAWABLES = root / "assets", root / "drawable"
    icons.PNG_DRAWABLES, icons.KOTLIN = root / "drawable-nodpi", root / "kotlin"
    agents = icons.ASSETS / "agents"
    for folder in (agents, icons.DRAWABLES, icons.KOTLIN):
        folder.mkdir(parents=True)

    path_only = agents / "claude.svg"
    path_only.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>')
    raster_mark = agents / "trae.svg"
    raster_mark.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'
                           f'<image href="{embedded}" width="48" height="48"/></svg>')
    unsupported = agents / "broken.svg"
    unsupported.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24"/></svg>')
    stale = [icons.DRAWABLES / "agent_old.xml", icons.PNG_DRAWABLES / "agent_old.png"]

    # A logo of paths becomes a vector, a raster mark keeps its own pixels, anything else is skipped.
    assert "android:pathData" in icons.convert(path_only)
    assert icons.convert(raster_mark) is None
    assert icons.raster(raster_mark) == mark
    assert icons.convert(unsupported) is None and icons.raster(unsupported) is None

    icons.PNG_DRAWABLES.mkdir()
    for old in stale:
        old.write_bytes(b"stale")

    printed = io.StringIO()
    with contextlib.redirect_stdout(printed):
        icons.generate(folder="agents", prefix="agent_", logos="agent logos", kotlin="AgentIcons.kt",
                       fn="agentIconRes", param="registry", doc="The logo for an agent.")
    assert printed.getvalue().strip() == "2 of 3 agent logos", printed.getvalue()

    # The PNG branch writes the embedded pixels untouched, so alpha survives the trip.
    assert (icons.PNG_DRAWABLES / "agent_trae.png").read_bytes() == mark
    assert (icons.DRAWABLES / "agent_claude.xml").exists()
    assert not (icons.DRAWABLES / "agent_broken.xml").exists()
    assert not any(old.exists() for old in stale), "a logo that is gone leaves nothing behind"

    lookup = (icons.KOTLIN / "AgentIcons.kt").read_text()
    assert '"claude" -> R.drawable.agent_claude' in lookup, lookup
    assert '"trae" -> R.drawable.agent_trae' in lookup, lookup
    assert "broken" not in lookup, lookup
finally:
    shutil.rmtree(root, ignore_errors=True)

print("agent_icons: ok")
