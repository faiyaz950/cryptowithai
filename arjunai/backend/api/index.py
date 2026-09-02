"""Vercel entrypoint for the FastAPI backend.

Vercel's Python runtime serves the module-level ASGI ``app`` it finds here.
The application itself lives in ``main.py`` one directory up, so that directory
is put on sys.path before importing it. ``vercel.json`` uses ``includeFiles``
so those sibling modules are bundled into the function too.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app  # noqa: E402

__all__ = ["app"]
