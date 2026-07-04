# LocalMaster

Copyright (c) 2026 Molly Shelestak. MIT License (see LICENSE).

LocalMaster performs **deterministic, analysis-driven digital signal
processing**. It is not "AI mastering": no machine-learning model decides your
sound, and identical input with identical settings always produces the
identical output file.

**Privacy:** 100% local. LocalMaster performs no uploads, makes no remote
calls, has no accounts, and collects no telemetry or analytics of any kind.
The internal engine API binds to 127.0.0.1 only and is never exposed to the
network. A test in the repository proves a full analyze→master→export run
performs zero outbound connections.

Third-party components and licenses: see THIRD_PARTY_NOTICES.md.

This project is a clean-room implementation. It contains no code from, and no
reverse engineering of, LANDR, Suno, or any other proprietary mastering
service. "Suno" is referenced only to describe a user workflow (mastering WAV
files you exported from your own Suno projects).
