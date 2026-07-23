# SQ — Static Quality: s3

- Reference calibration — `gc-decomp-harness`: **7.5/10** (on target; no CAL-DRIFT)
- Reference calibration — `intent-classification-2`: **7.0/10** (on target; no CAL-DRIFT)
- **Score: 6.5/10**

**Side-by-side delta:** Versus the nearer `intent-classification-2` reference, s3 shares wide corridors and semantic color but lacks its clean region grouping and exposes numerous connection-port circles plus long wraparound runs.

- **Frame use — PASS:** The central state row and peripheral states occupy nearly the full frame with balanced left/right and top/bottom anchors.
- **Corridors & air — PASS:** Transition chips have clear surrounding air, and the main states are spaced generously enough to scan at arm's length.
- **Grouping — FAIL:** No tinted regions or enclosures organize the suspend, degradation, migration, and reconnect families; structure is carried only by color and proximity.
- **Color — PASS:** State and transition colors are semantic and consistent, especially dashed red failure paths, green recovery/success, purple suspension, and orange migration.
- **Machinery leakage — FAIL:** Exposed circular connection ports ring most states, with conspicuous clusters around Connected and visible endpoint hardware at several arrow terminations.
- **Alignment & rhythm — PASS:** Idle–Connecting–Connected holds a strong horizontal register, while the surrounding states create a deliberate lifecycle rhythm.
- **Edge legibility — FAIL:** Several top and bottom perimeter-spanning routes dominate the composition, and dense convergences around Connected and Reconnecting are harder to trace than the reference wiring.

**Rank-order sanity:** Gut ranking agrees with the scores: `gc-decomp-harness` (7.5) > `intent-classification-2` (7.0) > s3 (6.5).
