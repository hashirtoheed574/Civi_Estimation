"""
Generate Confusion Matrices from Detection_Record.xlsx

For Single Doors, Double Doors, and Windows:
  - We have per-image "Detected" and "Actual" counts.
  - TP = min(detected, actual)          # correctly detected items
  - FP = max(detected - actual, 0)      # over-detections (false positives)
  - FN = max(actual - detected, 0)      # missed items (false negatives)
  - TN is not meaningful for object detection (we don't count "correctly not detected" regions),
    so we leave it as N/A in the matrix but set it to 0 for plotting.

For Walls:
  - TP, FP, FN are already recorded in the spreadsheet columns (S, T, U).
  - TN is marked '-' in the sheet; we treat it as 0.

Output:
  - A single PNG image with 4 confusion-matrix heatmaps saved next to this script.
"""

import openpyxl
import matplotlib
matplotlib.use("Agg")  # non-interactive backend
import matplotlib.pyplot as plt
import numpy as np
import os

# ── 1. Load workbook ────────────────────────────────────────────────
XLSX_PATH = os.path.join(os.path.dirname(__file__), "Detection_Record.xlsx")
wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
ws = wb.active

# ── 2. Parse rows (skip header) ────────────────────────────────────
single_door_detected, single_door_actual = [], []
double_door_detected, double_door_actual = [], []
window_detected, window_actual = [], []
walls_tp, walls_fp, walls_fn = [], [], []

for row in ws.iter_rows(min_row=2, values_only=True):
    # Columns: D=3, E=4 (Single Door Det/Act)
    #          G=6, H=7 (Double Door Det/Act)
    #          J=9, K=10 (Window Det/Act)
    #          S=18, T=19, U=20 (Walls TP, FP, FN)
    sd_det, sd_act = row[3], row[4]
    dd_det, dd_act = row[6], row[7]
    w_det,  w_act  = row[9], row[10]
    w_tp,   w_fp,  w_fn = row[18], row[19], row[20]

    if sd_det is not None and sd_act is not None:
        single_door_detected.append(int(sd_det))
        single_door_actual.append(int(sd_act))

    if dd_det is not None and dd_act is not None:
        double_door_detected.append(int(dd_det))
        double_door_actual.append(int(dd_act))

    if w_det is not None and w_act is not None:
        window_detected.append(int(w_det))
        window_actual.append(int(w_act))

    # Walls TP column may contain a formula string like "=Q2-T2";
    # data_only=True should resolve it, but fall back if needed.
    def safe_int(v):
        if v is None or v == '-' or v == '':
            return 0
        try:
            return int(v)
        except (ValueError, TypeError):
            return 0

    walls_tp.append(safe_int(w_tp))
    walls_fp.append(safe_int(w_fp))
    walls_fn.append(safe_int(w_fn))


# ── 3. Compute confusion-matrix values ─────────────────────────────
def compute_cm_from_counts(detected_list, actual_list):
    """Derive TP, FP, FN from per-image detected vs actual counts."""
    tp = sum(min(d, a) for d, a in zip(detected_list, actual_list))
    fp = sum(max(d - a, 0) for d, a in zip(detected_list, actual_list))
    fn = sum(max(a - d, 0) for d, a in zip(detected_list, actual_list))
    return tp, fp, fn


sd_tp, sd_fp, sd_fn = compute_cm_from_counts(single_door_detected, single_door_actual)
dd_tp, dd_fp, dd_fn = compute_cm_from_counts(double_door_detected, double_door_actual)
wi_tp, wi_fp, wi_fn = compute_cm_from_counts(window_detected, window_actual)
wa_tp = sum(walls_tp)
wa_fp = sum(walls_fp)
wa_fn = sum(walls_fn)


# ── 4. Plot ─────────────────────────────────────────────────────────
categories = [
    ("Single Door", sd_tp, sd_fp, sd_fn),
    ("Double Door", dd_tp, dd_fp, dd_fn),
    ("Window",      wi_tp, wi_fp, wi_fn),
    ("Wall",        wa_tp, wa_fp, wa_fn),
]

fig, axes = plt.subplots(2, 2, figsize=(14, 12))
fig.suptitle("Detection Confusion Matrices", fontsize=20, fontweight="bold", y=0.98)

for ax, (name, tp, fp, fn) in zip(axes.flat, categories):
    # Standard 2×2 layout:
    #                 Predicted Positive | Predicted Negative
    # Actual Positive       TP           |       FN
    # Actual Negative       FP           |       TN (N/A → 0)
    tn = 0  # not applicable for object detection
    matrix = np.array([[tp, fn],
                       [fp, tn]])

    # Color map
    im = ax.imshow(matrix, cmap="Blues", aspect="equal",
                   vmin=0, vmax=max(tp, fp, fn, 1))

    # Annotations
    labels = [[f"TP\n{tp}", f"FN\n{fn}"],
              [f"FP\n{fp}", f"TN\nN/A"]]

    for i in range(2):
        for j in range(2):
            color = "white" if matrix[i, j] > matrix.max() * 0.5 else "black"
            ax.text(j, i, labels[i][j], ha="center", va="center",
                    fontsize=16, fontweight="bold", color=color)

    ax.set_xticks([0, 1])
    ax.set_xticklabels(["Predicted\nPositive", "Predicted\nNegative"], fontsize=11)
    ax.set_yticks([0, 1])
    ax.set_yticklabels(["Actual\nPositive", "Actual\nNegative"], fontsize=11)
    ax.set_title(name, fontsize=16, fontweight="bold", pad=10)

    # Metrics
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1        = (2 * precision * recall / (precision + recall)
                 if (precision + recall) > 0 else 0)
    ax.set_xlabel(
        f"Precision: {precision:.1%}  |  Recall: {recall:.1%}  |  F1: {f1:.1%}",
        fontsize=11, labelpad=12,
    )

plt.tight_layout(rect=[0, 0, 1, 0.94])

OUT_PATH = os.path.join(os.path.dirname(__file__), "confusion_matrices.png")
fig.savefig(OUT_PATH, dpi=150, bbox_inches="tight")
plt.close(fig)

# ── 5. Print summary ───────────────────────────────────────────────
print("=" * 60)
print("CONFUSION MATRIX SUMMARY")
print("=" * 60)
for name, tp, fp, fn in categories:
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1        = (2 * precision * recall / (precision + recall)
                 if (precision + recall) > 0 else 0)
    print(f"\n  {name}:")
    print(f"    TP={tp:>4}   FP={fp:>4}   FN={fn:>4}")
    print(f"    Precision={precision:.1%}   Recall={recall:.1%}   F1={f1:.1%}")
print(f"\nImage saved -> {OUT_PATH}")
