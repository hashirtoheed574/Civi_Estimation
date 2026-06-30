"""
Wall Detection Module — headless, server-side adaptation of floor_area.py

Uses region-growing + distance-transform wall analysis to detect walls in
floor plan images.  Returns base64-encoded annotated images and pixel-area
metrics.

No matplotlib, no file I/O, no print statements — safe for FastAPI workers.
"""

import io
import base64
import random

import cv2
import numpy as np
from PIL import Image

# ==============================================================================
# CONFIGURATION — module-level constants (importable / patchable)
# ==============================================================================

# Region-growing parameters
THRESHOLD = 15          # Color similarity threshold (LAB space)
STEP = 20               # Grid step for automatic seeding (pixels)
MIN_REGION_SIZE = 300   # Ignore regions smaller than this (pixels)

# Wall thickness criteria  (target px, tolerance px, display name)
WALL_THICKNESS_CRITERIA = [
    {"target": 12, "tolerance": 2, "name": "THIN"},
    {"target": 20, "tolerance": 3, "name": "MEDIUM"},
    {"target": 36, "tolerance": 3, "name": "THICK"},
]

# Fraction of total detected-wall area subtracted as a "mortar / overlap" buffer
WALL_AREA_OVERLAP_CORRECTION_FACTOR = 0.05   # 5 %




# ==============================================================================
def _analyze_wall(xs, ys, height, width, lab_img):
    """Determine whether a grown region is a wall.

    Returns
    -------
    is_wall : bool
    corners : ndarray | None
    bbox    : tuple | None   (min_x, min_y, max_x, max_y)
    num_corners     : int
    matching_pairs  : int
    criteria_msg    : str
    matched_criteria : dict | None
    """
    if len(xs) < 100:
        return False, None, None, 0, 0, "Region too small", None

    min_x, max_x = int(xs.min()), int(xs.max())
    min_y, max_y = int(ys.min()), int(ys.max())

    pad = 5
    crop_x1 = max(0, min_x - pad)
    crop_y1 = max(0, min_y - pad)
    crop_x2 = min(width, max_x + pad)
    crop_y2 = min(height, max_y + pad)

    crop_h = crop_y2 - crop_y1
    crop_w = crop_x2 - crop_x1

    mask_cropped = np.zeros((crop_h, crop_w), dtype=np.uint8)
    mask_cropped[ys - crop_y1, xs - crop_x1] = 255

    dist_transform = cv2.distanceTransform(mask_cropped, cv2.DIST_L2, 5)
    max_thickness_radius = np.max(dist_transform)

    matched_criteria = None
    for criteria in WALL_THICKNESS_CRITERIA:
        target_radius = criteria["target"] / 2.0
        tol = criteria["tolerance"] + 3
        if (target_radius - tol) <= max_thickness_radius <= (target_radius + tol):
            matched_criteria = criteria
            break

    if matched_criteria is None:
        return (False, None, None, 0, 0,
                f"Rejected: No thickness match (max r={max_thickness_radius:.1f})", None)

    contours, _ = cv2.findContours(mask_cropped, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return False, None, None, 0, 0, "No contours found", None

    cnt = contours[0]
    x_r, y_r, w_r, h_r = cv2.boundingRect(cnt)
    if max(w_r, h_r) < 40:
        return (False, None, None, 0, 0,
                f"Rejected: too short ({max(w_r, h_r)}px)", None)

    bbox = (min_x, min_y, max_x, max_y)

    approx = cv2.approxPolyDP(cnt, 1.5, True)
    corners_relative = approx.reshape(-1, 2)
    corners = corners_relative + [crop_x1, crop_y1]
    num_corners = len(corners)

    if num_corners > 80:
        return (False, corners, bbox, num_corners, 0,
                f"{num_corners} corners: >80 rejected", None)

    valid_pairs = set()
    wall_thickness_target = matched_criteria["target"]
    tolerance = matched_criteria["tolerance"]

    def group_coordinates(coords, tol=2):
        groups = []
        for val in sorted(np.unique(coords)):
            if not groups or val - groups[-1][-1] > tol:
                groups.append([val])
            else:
                groups[-1].append(val)
        return [int(np.mean(g)) for g in groups]

    for ux in group_coordinates(corners[:, 0]):
        idx = [i for i, (cx, cy) in enumerate(corners) if abs(cx - ux) <= 2]
        if len(idx) >= 2:
            ys_x = corners[idx][:, 1]
            for i in range(len(idx)):
                for j in range(i + 1, len(idx)):
                    diff = abs(int(ys_x[i]) - int(ys_x[j]))
                    if ((wall_thickness_target - tolerance - 2)
                            <= diff
                            <= (wall_thickness_target + tolerance + 2)):
                        valid_pairs.add(tuple(sorted([idx[i], idx[j]])))

    for uy in group_coordinates(corners[:, 1]):
        idx = [i for i, (cx, cy) in enumerate(corners) if abs(cy - uy) <= 2]
        if len(idx) >= 2:
            xs_y = corners[idx][:, 0]
            for i in range(len(idx)):
                for j in range(i + 1, len(idx)):
                    diff = abs(int(xs_y[i]) - int(xs_y[j]))
                    if ((wall_thickness_target - tolerance - 2)
                            <= diff
                            <= (wall_thickness_target + tolerance + 2)):
                        valid_pairs.add(tuple(sorted([idx[i], idx[j]])))

    matching_pairs = len(valid_pairs)
    is_wall = False

    if num_corners == 4:
        if matching_pairs >= 1:
            is_wall = True
            criteria_msg = (f"4 corners: {matching_pairs} pairs "
                            f"({matched_criteria['name']} "
                            f"{wall_thickness_target}±{tolerance}) ✓")
        else:
            criteria_msg = "4 corners: 0 pairs ✗"
    elif 5 <= num_corners <= 80:
        if 1 <= matching_pairs <= 50:
            is_wall = True
            criteria_msg = (f"{num_corners} corners: {matching_pairs} pairs "
                            f"({matched_criteria['name']} "
                            f"{wall_thickness_target}±{tolerance}) ✓")
        else:
            criteria_msg = f"{num_corners} corners: {matching_pairs} pairs ✗"
    else:
        criteria_msg = f"{num_corners} corners: outside valid range"

    return is_wall, corners, bbox, num_corners, matching_pairs, criteria_msg, matched_criteria


def _region_grow(seed_x, seed_y, lab, ff_mask, fill_val):
    """Grow a region from (seed_x, seed_y) using color similarity in LAB."""
    flags = 4 | cv2.FLOODFILL_FIXED_RANGE | (fill_val << 8)
    
    lo_diff = (THRESHOLD, THRESHOLD, THRESHOLD)
    up_diff = (THRESHOLD, THRESHOLD, THRESHOLD)
    
    # Use lab directly, avoids copying image thousands of times
    retval, _, ff_mask, rect = cv2.floodFill(
        lab, ff_mask, (seed_x, seed_y), (0, 0, 0),
        lo_diff, up_diff, flags
    )
    
    x_min, y_min, w_region, h_region = rect
    x_max = x_min + w_region
    y_max = y_min + h_region
    
    mask_cropped = ff_mask[y_min+1:y_max+1, x_min+1:x_max+1]
    ys_rel, xs_rel = np.where(mask_cropped == fill_val)
    xs = xs_rel + x_min
    ys = ys_rel + y_min
    return xs, ys


def _image_to_base64(cv2_img):
    """Encode a BGR numpy array as a base64 PNG string."""
    rgb = cv2.cvtColor(cv2_img, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(rgb)
    buf = io.BytesIO()
    pil_img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _tint_region(base, mask, bgr_colour, alpha=0.55):
    """Blend a solid colour over `base` wherever `mask` is non-zero."""
    overlay = base.copy()
    overlay[mask > 0] = bgr_colour
    base[mask > 0] = cv2.addWeighted(base, 1 - alpha, overlay, alpha, 0)[mask > 0]


# ==============================================================================
# PUBLIC API
# ==============================================================================

def detect_walls(image: Image.Image, window_boxes: list = None, door_boxes: list = None) -> dict:
    """Run region-growing wall detection on a floor plan image.

    Parameters
    ----------
    image : PIL.Image.Image
        The floor plan image (RGB).
    window_boxes : list of (x1, y1, x2, y2), optional
        Window bounding boxes from YOLO (pixel coords).
    door_boxes : list of (x1, y1, x2, y2), optional
        Door bounding boxes from YOLO (pixel coords).

    Returns
    -------
    dict with keys:
        walls_image, floor_area_image   – base64 PNGs
        wall_count, wall_breakdown      – wall statistics
        total_wall_area_px, floor_area_px, outer_area_px,
        window_area_px, total_image_px  – pixel areas
        floor_coverage_pct              – percentage
    """
    if window_boxes is None:
        window_boxes = []
    if door_boxes is None:
        door_boxes = []

    # ── Convert PIL → OpenCV BGR ─────────────────────────────────────────
    img = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    height, width, _ = lab.shape

    # Allocate single ff_mask for the entire image sweep
    ff_mask = np.zeros((height + 2, width + 2), dtype=np.uint8)
    ff_mask[0, :] = 1
    ff_mask[-1, :] = 1
    ff_mask[:, 0] = 1
    ff_mask[:, -1] = 1

    # NOTE: Doors and windows are NO LONGER masked out of the region grower.
    # The 5% WALL_AREA_OVERLAP_CORRECTION_FACTOR is the sole tolerance mechanism.
    # (Previously, door/window boxes were marked as boundaries in ff_mask.)

    walls_output = img.copy()

    region_count = 0
    wall_count = 0
    thin_count = 0
    medium_count = 0
    thick_count = 0

    # Accumulate data for floor-area calculation
    outer_region_mask = np.zeros((height, width), dtype=np.uint8)
    combined_wall_mask = np.zeros((height, width), dtype=np.uint8)
    first_region_done = False

    # ── Grid sweep: region growing ───────────────────────────────────────
    for y in range(0, height, STEP):
        for x in range(0, width, STEP):
            if ff_mask[y + 1, x + 1] == 0:
                region_count += 1
                fill_val = (region_count % 250) + 1
                xs, ys = _region_grow(x, y, lab, ff_mask, fill_val)
                if len(xs) < MIN_REGION_SIZE:
                    continue

                # --- Capture outer (background) region ---
                if not first_region_done:
                    first_region_done = True
                    outer_region_mask[ys, xs] = 255
                    walls_output[ys, xs] = [128, 128, 128]
                    continue

                # --- Analyse as potential wall ---
                (is_wall, corners, bbox, num_corners,
                 matching_pairs, criteria_msg, matched_criteria) = \
                    _analyze_wall(xs, ys, height, width, lab)

                if is_wall:
                    # Paint directly into the combined wall mask (no per-wall alloc)
                    combined_wall_mask[ys, xs] = 255

                    if matched_criteria["name"] == "THIN":
                        color = (0, 255, 128)
                        thin_count += 1
                    elif matched_criteria["name"] == "MEDIUM":
                        color = (0, 255, 0)
                        medium_count += 1
                    else:
                        color = (0, 180, 0)
                        thick_count += 1

                    wall_count += 1
                    label = f"WALL_{matched_criteria['name']}"

                    walls_output[ys, xs] = color
                    if bbox:
                        min_x, min_y, max_x, max_y = bbox
                        cv2.rectangle(walls_output,
                                      (min_x, min_y), (max_x, max_y), color, 2)
                        tp = ((min_x, min_y - 5) if min_y > 20
                              else (min_x, min_y + 20))
                        cv2.putText(walls_output, f"{label}_{wall_count}", tp,
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

    # ══════════════════════════════════════════════════════════════════════
    # FLOOR AREA CALCULATION
    # ══════════════════════════════════════════════════════════════════════
    total_pixels = height * width

    # A. Outer / background area
    outer_area_px = int(np.sum(outer_region_mask > 0))

    # B. Combined wall area (already accumulated during the sweep)
    raw_wall_area_px = int(np.sum(combined_wall_mask > 0))

    wall_overlap_correction_px = int(raw_wall_area_px * WALL_AREA_OVERLAP_CORRECTION_FACTOR)
    effective_wall_area_px = raw_wall_area_px - wall_overlap_correction_px

    # C. Window & Door area (union of YOLO bounding boxes)
    window_mask = np.zeros((height, width), dtype=np.uint8)
    for (x1, y1, x2, y2) in window_boxes:
        x1c, y1c = max(0, x1), max(0, y1)
        x2c, y2c = min(width, x2), min(height, y2)
        window_mask[y1c:y2c, x1c:x2c] = 255
    window_area_px = int(np.sum(window_mask > 0))

    door_mask = np.zeros((height, width), dtype=np.uint8)
    for (x1, y1, x2, y2) in door_boxes:
        x1c, y1c = max(0, x1), max(0, y1)
        x2c, y2c = min(width, x2), min(height, y2)
        door_mask[y1c:y2c, x1c:x2c] = 255
    door_area_px = int(np.sum(door_mask > 0))

    # D. Net floor area
    net_floor_area_px = (
        total_pixels
        - outer_area_px
        - effective_wall_area_px
        - window_area_px
        - door_area_px
    )
    net_floor_area_px = max(0, net_floor_area_px)
    coverage_pct = (net_floor_area_px / total_pixels) * 100 if total_pixels else 0.0

    # ══════════════════════════════════════════════════════════════════════
    # BUILD FLOOR-AREA VISUALISATION IMAGE
    # ══════════════════════════════════════════════════════════════════════
    floor_vis = img.copy()

    net_floor_mask = np.ones((height, width), dtype=np.uint8) * 255
    net_floor_mask[outer_region_mask > 0] = 0
    net_floor_mask[combined_wall_mask > 0] = 0
    net_floor_mask[window_mask > 0] = 0
    net_floor_mask[door_mask > 0] = 0

    # Combined doors and windows for visualization
    openings_mask = cv2.bitwise_or(window_mask, door_mask)

    # Order matters: background → walls → windows/doors → floor
    _tint_region(floor_vis, outer_region_mask,  [40,  40, 150])          # dark red
    _tint_region(floor_vis, combined_wall_mask, [30, 160,  30])          # green
    _tint_region(floor_vis, openings_mask,      [200,  80,  20])         # blue
    _tint_region(floor_vis, net_floor_mask,     [255, 230, 180], alpha=0.25)  # pale cyan

    # Legend burned into the image
    legend_lines = [
        ("Background (excluded)",                                (40,  40, 150)),
        ("Walls       (excluded)",                               (30, 160,  30)),
        ("Doors/Windows (excluded)",                             (200, 80,  20)),
        ("Net floor area (kept)",                                (180, 140,  60)),
        (f"Floor area: {net_floor_area_px:,} px  ({coverage_pct:.1f}%)", (255, 255, 255)),
    ]
    lx, ly = 10, 30
    for text, colour in legend_lines:
        cv2.putText(floor_vis, text, (lx, ly),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(floor_vis, text, (lx, ly),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, colour, 1, cv2.LINE_AA)
        ly += 26

    # ══════════════════════════════════════════════════════════════════════
    # ENCODE IMAGES TO BASE64
    # ══════════════════════════════════════════════════════════════════════
    walls_image_b64 = _image_to_base64(walls_output)
    floor_area_image_b64 = _image_to_base64(floor_vis)

    return {
        "walls_image":        walls_image_b64,
        "floor_area_image":   floor_area_image_b64,
        "wall_count":         wall_count,
        "wall_breakdown":     {
            "thin":   thin_count,
            "medium": medium_count,
            "thick":  thick_count,
        },
        "total_wall_area_px": raw_wall_area_px,
        "floor_area_px":      net_floor_area_px,
        "outer_area_px":      outer_area_px,
        "window_area_px":     window_area_px + door_area_px,
        "total_image_px":     total_pixels,
        "floor_coverage_pct": round(coverage_pct, 2),
    }


