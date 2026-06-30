/**
 * Civil Estimates — Frontend Application
 * Detects doors, windows, and walls from floor plans.
 * Three separate popups: Detection, Confidence, Cost Estimation
 * Per-detection dropdowns for door size and window material.
 * Professor's fixed rates for cost calculations.
 * Zoom functionality on detection images.
 */

// ── DOM Elements ────────────────────────────────────────────────────────────
const uploadArea      = document.getElementById('uploadArea');
const uploadContent   = document.getElementById('uploadContent');
const uploadPreview   = document.getElementById('uploadPreview');
const previewImage    = document.getElementById('previewImage');
const fileInput       = document.getElementById('fileInput');
const uploadBrowse    = document.getElementById('uploadBrowse');
const changeFileBtn   = document.getElementById('changeFileBtn');
const analyzeBtn      = document.getElementById('analyzeBtn');

const panelEmpty      = document.getElementById('panelEmpty');
const panelLoading    = document.getElementById('panelLoading');
const panelResults    = document.getElementById('panelResults');
const progressFill    = document.getElementById('progressFill');
const loadingText     = document.getElementById('loadingText');
const summaryCards    = document.getElementById('summaryCards');

const viewDetectionsBtn = document.getElementById('viewDetectionsBtn');
const newAnalysisBtn  = document.getElementById('newAnalysisBtn');
const navbarStatus    = document.getElementById('navbarStatus');

// Modal 1 — Detection
const modalOverlay        = document.getElementById('modalOverlay');
const modalCloseBtn       = document.getElementById('modalCloseBtn');
const modalAnnotatedImage = document.getElementById('modalAnnotatedImage');
const modalLoading        = document.getElementById('modalLoading');
const filterBtns          = document.querySelectorAll('.filter-btn');
const openConfidenceBtn   = document.getElementById('openConfidenceBtn');
const openCostBtn         = document.getElementById('openCostBtn');

// Modal 2 — Confidence
const confidenceOverlay   = document.getElementById('confidenceOverlay');
const confidenceCloseBtn  = document.getElementById('confidenceCloseBtn');
const confidenceTableBody = document.getElementById('confidenceTableBody');

// Modal 3 — Cost
const costOverlay         = document.getElementById('costOverlay');
const costCloseBtn        = document.getElementById('costCloseBtn');
const scaleFactorInput    = document.getElementById('scaleFactorInput');
const scaleFactorHint     = document.getElementById('scaleFactorHint');
const wallHeightInput     = document.getElementById('wallHeightInput');
const costTableBody       = document.getElementById('costTableBody');
const materialTableBody   = document.getElementById('materialTableBody');
const grandTotalResult    = document.getElementById('grandTotalResult');

// Wall & Floor area elements
const wallAreaSection     = document.getElementById('wallAreaSection');
const areaStats           = document.getElementById('areaStats');
const wallAreaFt          = document.getElementById('wallAreaFt');
const floorAreaFt         = document.getElementById('floorAreaFt');
const wallCountStat       = document.getElementById('wallCountStat');
const materialSection     = document.getElementById('materialSection');
const materialCosts       = document.getElementById('materialCosts');
const doorWindowSection   = document.getElementById('doorWindowSection');

// Zoom elements
const modalImageContainer = document.getElementById('modalImageContainer');
const modalImageWrapper   = document.getElementById('modalImageWrapper');
const zoomInBtn           = document.getElementById('zoomInBtn');
const zoomOutBtn          = document.getElementById('zoomOutBtn');
const zoomResetBtn        = document.getElementById('zoomResetBtn');

// Legend elements
const legendItems         = document.getElementById('legendItems');
const zoomLevelEl         = document.getElementById('zoomLevel');

// ── State ───────────────────────────────────────────────────────────────────
let selectedFile = null;
let resultsData  = null;
let progressTimeout = null;

// ── API Base ────────────────────────────────────────────────────────────────
const API_BASE = '';

// ── Realistic Pakistan Market Rates (2024–2025) ────────────────────────────
const RATES = {
    paint_wall:     25,      // Rs per sq ft (standard emulsion — Berger/Diamond)
    paint_ceiling:  20,      // Rs per sq ft (white distemper)
    cement:         35,      // Rs per sq ft (plaster + material for 1:4 mix)
    gray_structure: 2200,    // Rs per sq ft (Lahore/Karachi range)
    brick_price:    18,      // Rs per brick (standard 9" × 4.5" × 3")
    // Brick calculation: standard 9" wall with mortar joints
    // ~7 bricks per sq ft for 9" thick wall
    bricks_per_sqft: 7,
    // Window options
    window_aluminium: 850,   // Rs per sq ft
    window_pvc:       650,   // Rs per sq ft
    // Door options (flat per-door pricing)
    door_large:  25000,      // Rs per door (7 ft height)
    door_small:  18000,      // Rs per door (6 ft height)
    // Door default heights
    door_large_height: 7,    // feet
    door_small_height: 6,    // feet
};


// ═══════════════════════════════════════════════════════════════════════════
//  FILE UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

['dragenter', 'dragover'].forEach(evt => {
    uploadArea.addEventListener(evt, e => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
});

['dragleave', 'drop'].forEach(evt => {
    uploadArea.addEventListener(evt, e => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
    });
});

uploadArea.addEventListener('drop', e => {
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
        handleFile(file);
    }
});

uploadArea.addEventListener('click', e => {
    if (e.target === changeFileBtn || e.target.closest('#changeFileBtn')) return;
    fileInput.click();
});

uploadBrowse.addEventListener('click', e => {
    e.stopPropagation();
    fileInput.click();
});

fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

changeFileBtn.addEventListener('click', e => {
    e.stopPropagation();
    resetUpload();
});

function handleFile(file) {
    selectedFile = file;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
        previewImage.src = 'data:image/svg+xml,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
                <rect width="400" height="300" fill="#f1f5f9" rx="12"/>
                <rect x="140" y="40" width="120" height="150" fill="#dbeafe" rx="8" stroke="#3b82f6" stroke-width="2"/>
                <path d="M160 80h80M160 100h80M160 120h60M160 140h70M160 160h40" stroke="#93c5fd" stroke-width="3" stroke-linecap="round"/>
                <text x="200" y="230" font-family="Inter,sans-serif" font-size="16" fill="#475569" text-anchor="middle" font-weight="600">${file.name}</text>
                <text x="200" y="255" font-family="Inter,sans-serif" font-size="12" fill="#94a3b8" text-anchor="middle">PDF → image for analysis</text>
            </svg>
        `);
    } else {
        const reader = new FileReader();
        reader.onload = e => { previewImage.src = e.target.result; };
        reader.readAsDataURL(file);
    }

    uploadContent.style.display = 'none';
    uploadPreview.style.display = 'block';
    analyzeBtn.disabled = false;
}

function resetUpload() {
    selectedFile = null;
    fileInput.value = '';
    previewImage.src = '';
    uploadContent.style.display = '';
    uploadPreview.style.display = 'none';
    analyzeBtn.disabled = true;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ANALYZE
// ═══════════════════════════════════════════════════════════════════════════

analyzeBtn.addEventListener('click', startAnalysis);

async function startAnalysis() {
    if (!selectedFile) return;

    panelEmpty.style.display   = 'none';
    panelResults.style.display = 'none';
    panelLoading.style.display = '';
    animateProgress();

    navbarStatus.innerHTML = '<span class="status-dot" style="background:var(--accent-500);animation:pulse-dot 1s ease infinite"></span><span>Analyzing...</span>';
    navbarStatus.style.color = 'var(--accent-400)';
    navbarStatus.style.background = 'rgba(6,182,212,0.08)';

    try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        const response = await fetch(`${API_BASE}/api/detect`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        resultsData = await response.json();

        // Use default scale of 20 (server sends default)
        if (resultsData.scale && resultsData.scale.pixels_per_foot) {
            scaleFactorInput.value = resultsData.scale.pixels_per_foot;
            scaleFactorHint.textContent = `Default: ${resultsData.scale.pixels_per_foot} pixels per foot (adjustable)`;
            scaleFactorHint.style.color = '';
        }

        markAllStepsDone();
        await sleep(600);

        showResults();

    } catch (err) {
        console.error(err);
        loadingText.textContent = `Error: ${err.message}`;
        navbarStatus.innerHTML = '<span class="status-dot" style="background:var(--danger)"></span><span>Error</span>';
        navbarStatus.style.color = 'var(--danger)';
        navbarStatus.style.background = 'rgba(239,68,68,0.08)';

        setTimeout(() => {
            panelLoading.style.display = 'none';
            panelEmpty.style.display   = '';
        }, 2500);
    }
}

function animateProgress() {
    progressFill.style.width = '0%';

    // Reset all steps
    document.querySelectorAll('.loading-step').forEach(s => {
        s.classList.remove('active', 'done');
    });

    const steps = [
        { id: 'step0', text: 'Processing floor plan...', pct: 10 },
        { id: 'step1', text: 'Running YOLO detection...', pct: 30 },
        { id: 'step2', text: 'Analyzing walls (region growing)...', pct: 55 },
        { id: 'step3', text: 'Computing floor area...', pct: 78 },
        { id: 'step4', text: 'Compiling results...', pct: 90 },
    ];

    let current = 0;

    function advanceStep() {
        if (current >= steps.length) return;

        // Mark previous step as done
        if (current > 0) {
            const prev = document.getElementById(steps[current - 1].id);
            if (prev) {
                prev.classList.remove('active');
                prev.classList.add('done');
            }
        }

        // Activate current step
        const el = document.getElementById(steps[current].id);
        if (el) el.classList.add('active');

        loadingText.textContent = steps[current].text;
        progressFill.style.width = `${steps[current].pct}%`;

        current++;

        if (current < steps.length) {
            // Wall detection (step 2) takes the longest — give it more time
            const delay = current === 3 ? 6000 : current === 4 ? 3000 : 1500;
            progressTimeout = setTimeout(advanceStep, delay);
        }
    }

    if (progressTimeout) clearTimeout(progressTimeout);
    advanceStep();
}

function markAllStepsDone() {
    if (progressTimeout) {
        clearTimeout(progressTimeout);
        progressTimeout = null;
    }
    document.querySelectorAll('.loading-step').forEach(s => {
        s.classList.remove('active');
        s.classList.add('done');
    });
    progressFill.style.width = '100%';
    loadingText.textContent = 'Complete!';
}

// ═══════════════════════════════════════════════════════════════════════════
//  RESULTS (inline summary cards)
// ═══════════════════════════════════════════════════════════════════════════

function showResults() {
    panelLoading.style.display = 'none';
    panelResults.style.display = '';

    navbarStatus.innerHTML = '<span class="status-dot"></span><span>Analysis Complete</span>';
    navbarStatus.style.color = 'var(--success)';
    navbarStatus.style.background = 'rgba(16,185,129,0.08)';

    renderSummaryCards();
}

function renderSummaryCards() {
    const summary = resultsData.summary;
    const icons = { 'single door': '🚪', 'double door': '🚪', 'window': '🪟' };
    const cssClass = { 'single door': 'door', 'double door': 'door', 'window': 'window' };

    let html = '';
    for (const [label, count] of Object.entries(summary)) {
        const key = label.toLowerCase();
        html += `
            <div class="summary-card">
                <div class="card-icon ${cssClass[key] || 'total'}">${icons[key] || '📦'}</div>
                <div class="card-info">
                    <span class="card-count">${count}</span>
                    <span class="card-label">${label}${count > 1 ? 's' : ''}</span>
                </div>
            </div>`;
    }

    html += `
        <div class="summary-card">
            <div class="card-icon total">📊</div>
            <div class="card-info">
                <span class="card-count">${resultsData.total_objects}</span>
                <span class="card-label">Total Objects</span>
            </div>
        </div>`;

    // Wall detection results
    if (resultsData.wall_count !== undefined) {
        html += `
            <div class="summary-card">
                <div class="card-icon wall">🧱</div>
                <div class="card-info">
                    <span class="card-count">${resultsData.wall_count}</span>
                    <span class="card-label">Walls</span>
                </div>
            </div>`;
        html += `
            <div class="summary-card">
                <div class="card-icon floor">📐</div>
                <div class="card-info">
                    <span class="card-count">${resultsData.floor_coverage_pct?.toFixed(1) || '0'}%</span>
                    <span class="card-label">Floor Coverage</span>
                </div>
            </div>`;
    }

    summaryCards.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODAL 1 — DETECTED OBJECTS (Image + Filters + Action Buttons + Zoom)
// ═══════════════════════════════════════════════════════════════════════════

viewDetectionsBtn.addEventListener('click', () => openDetectionModal());
modalCloseBtn.addEventListener('click', () => { modalOverlay.style.display = 'none'; resetZoom(); });
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) { modalOverlay.style.display = 'none'; resetZoom(); } });

function openDetectionModal() {
    filterBtns.forEach(btn => btn.classList.remove('active'));
    document.getElementById('filterAll').classList.add('active');
    modalAnnotatedImage.src = `data:image/png;base64,${resultsData.annotated_image}`;
    modalOverlay.style.display = '';
    resetZoom();
    renderDetectionLegend(resultsData.detections);

    // Reset scroll positions to top so all content is visible from the start
    const modalBody = document.querySelector('#detectionModal .modal-body');
    if (modalBody) modalBody.scrollTop = 0;
    if (legendItems) legendItems.scrollTop = 0;
}

/**
 * Render the detection legend panel (HTML) next to the annotated image.
 * Shows numbered items matching the numbered tags drawn on the image.
 */
function renderDetectionLegend(detections) {
    if (!detections || detections.length === 0) {
        legendItems.innerHTML = '<p class="legend-empty">No detections</p>';
        return;
    }

    const icons = { 'single door': '🚪', 'double door': '🚪', 'window': '🪟' };
    const colorMap = {
        'single door': 'var(--accent-300)',
        'double door': '#a78bfa',
        'window': 'var(--success)',
    };

    let html = '';
    detections.forEach(det => {
        const key = det.label.toLowerCase();
        const icon = icons[key] || '📦';
        const color = colorMap[key] || 'var(--gray-300)';
        const conf = (det.confidence * 100).toFixed(1);
        const confClass = det.confidence >= 0.7 ? 'high' : det.confidence >= 0.4 ? 'mid' : 'low';

        html += `
            <div class="legend-item" style="animation-delay: ${(det.id - 1) * 0.04}s">
                <span class="legend-num" style="background: ${color}">${det.id}</span>
                <span class="legend-label">${icon} ${det.label}</span>
                <span class="legend-conf legend-conf--${confClass}">${conf}%</span>
            </div>`;
    });

    legendItems.innerHTML = html;

    // Always scroll legend to top after re-rendering
    legendItems.scrollTop = 0;
}

// ── Filter Buttons ──────────────────────────────────────────────────────────
filterBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filterValue = btn.dataset.filter;

        resetZoom();

        if (filterValue === 'all') {
            modalAnnotatedImage.src = `data:image/png;base64,${resultsData.annotated_image}`;
            renderDetectionLegend(resultsData.detections);
            return;
        }

        // Wall filter uses pre-computed image
        if (filterValue === 'Wall') {
            if (resultsData.walls_image) {
                modalAnnotatedImage.src = `data:image/png;base64,${resultsData.walls_image}`;
            } else {
                modalAnnotatedImage.src = `data:image/png;base64,${resultsData.annotated_image}`;
            }
            renderDetectionLegend([]);  // No individual detections for wall view
            return;
        }

        // Door/Window filters hit the API
        modalLoading.style.display = '';
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            const response = await fetch(
                `${API_BASE}/api/detect?object_type=${encodeURIComponent(filterValue)}`,
                { method: 'POST', body: formData }
            );
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            const data = await response.json();
            modalAnnotatedImage.src = `data:image/png;base64,${data.annotated_image}`;
            renderDetectionLegend(data.detections || []);
        } catch (err) {
            console.error('Filter error:', err);
        } finally {
            modalLoading.style.display = 'none';
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ZOOM FUNCTIONALITY (TASK 5)
// ═══════════════════════════════════════════════════════════════════════════

let zoomScale = 1;
let panX = 0, panY = 0;
let isPanning = false;
let panStartX = 0, panStartY = 0;
const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.25;

function applyTransform() {
    modalAnnotatedImage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
    zoomLevelEl.textContent = `${Math.round(zoomScale * 100)}%`;

    // Update cursor based on zoom state
    if (zoomScale > 1) {
        modalImageContainer.style.cursor = isPanning ? 'grabbing' : 'grab';
    } else {
        modalImageContainer.style.cursor = 'default';
        panX = 0;
        panY = 0;
    }
}

function resetZoom() {
    zoomScale = 1;
    panX = 0;
    panY = 0;
    applyTransform();
}

function zoomIn() {
    zoomScale = Math.min(ZOOM_MAX, zoomScale + ZOOM_STEP);
    applyTransform();
}

function zoomOut() {
    zoomScale = Math.max(ZOOM_MIN, zoomScale - ZOOM_STEP);
    if (zoomScale <= 1) { panX = 0; panY = 0; }
    applyTransform();
}

// Zoom buttons
zoomInBtn.addEventListener('click', zoomIn);
zoomOutBtn.addEventListener('click', zoomOut);
zoomResetBtn.addEventListener('click', resetZoom);

// Mouse wheel zoom
modalImageContainer.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.deltaY < 0) {
        zoomIn();
    } else {
        zoomOut();
    }
}, { passive: false });

// Double-click to reset
modalImageContainer.addEventListener('dblclick', e => {
    e.preventDefault();
    resetZoom();
});

// Pan with mouse drag
modalImageContainer.addEventListener('mousedown', e => {
    if (zoomScale <= 1) return;
    isPanning = true;
    panStartX = e.clientX - panX;
    panStartY = e.clientY - panY;
    modalImageContainer.style.cursor = 'grabbing';
    e.preventDefault();
});

document.addEventListener('mousemove', e => {
    if (!isPanning) return;
    panX = e.clientX - panStartX;
    panY = e.clientY - panStartY;
    applyTransform();
});

document.addEventListener('mouseup', () => {
    if (isPanning) {
        isPanning = false;
        if (zoomScale > 1) {
            modalImageContainer.style.cursor = 'grab';
        }
    }
});

// Touch / pinch-to-zoom support
let lastTouchDist = 0;
let lastTouchX = 0, lastTouchY = 0;

modalImageContainer.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
        // Pinch start
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.hypot(dx, dy);
        e.preventDefault();
    } else if (e.touches.length === 1 && zoomScale > 1) {
        // Pan start
        isPanning = true;
        panStartX = e.touches[0].clientX - panX;
        panStartY = e.touches[0].clientY - panY;
        e.preventDefault();
    }
}, { passive: false });

modalImageContainer.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
        // Pinch zoom
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const delta = dist - lastTouchDist;
        lastTouchDist = dist;

        zoomScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomScale + delta * 0.005));
        applyTransform();
        e.preventDefault();
    } else if (e.touches.length === 1 && isPanning) {
        panX = e.touches[0].clientX - panStartX;
        panY = e.touches[0].clientY - panStartY;
        applyTransform();
        e.preventDefault();
    }
}, { passive: false });

modalImageContainer.addEventListener('touchend', () => {
    isPanning = false;
    lastTouchDist = 0;
});


// ═══════════════════════════════════════════════════════════════════════════
//  MODAL 2 — CONFIDENCE DETAILS
// ═══════════════════════════════════════════════════════════════════════════

openConfidenceBtn.addEventListener('click', () => openConfidenceModal());
confidenceCloseBtn.addEventListener('click', () => { confidenceOverlay.style.display = 'none'; });
confidenceOverlay.addEventListener('click', e => { if (e.target === confidenceOverlay) confidenceOverlay.style.display = 'none'; });

function openConfidenceModal() {
    const detections = resultsData.detections;
    let html = '';

    detections.forEach((det, index) => {
        const accuracy = (det.confidence * 100).toFixed(1);
        const accuracyClass = det.confidence >= 0.7 ? 'high' : det.confidence >= 0.4 ? 'mid' : 'low';
        html += `
            <tr class="detection-row" style="animation-delay: ${index * 0.03}s">
                <td class="det-id">${det.id}</td>
                <td class="det-type">
                    <span class="det-badge det-badge--${det.label.toLowerCase().replace(/\s/g, '-')}">${det.label}</span>
                </td>
                <td class="det-accuracy">
                    <div class="accuracy-bar-wrapper">
                        <div class="accuracy-bar accuracy-${accuracyClass}" style="width: ${accuracy}%"></div>
                    </div>
                    <span class="accuracy-value">${accuracy}%</span>
                </td>
                <td class="det-dim">${det.width}</td>
                <td class="det-dim">${det.height}</td>
            </tr>`;
    });

    if (detections.length === 0) {
        html = '<tr><td colspan="5" class="det-empty">No detections found</td></tr>';
    }

    confidenceTableBody.innerHTML = html;
    confidenceOverlay.style.display = '';
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODAL 4 — EXCEL REPORT (Detected vs Actual Counts)
// ═══════════════════════════════════════════════════════════════════════════

const excelOverlay     = document.getElementById('excelOverlay');
const excelCloseBtn    = document.getElementById('excelCloseBtn');
const excelTableBody   = document.getElementById('excelTableBody');
const downloadExcelBtn = document.getElementById('downloadExcelBtn');
const openExcelBtn     = document.getElementById('openExcelBtn');

openExcelBtn.addEventListener('click', () => openExcelModal());
excelCloseBtn.addEventListener('click', () => { excelOverlay.style.display = 'none'; });
excelOverlay.addEventListener('click', e => { if (e.target === excelOverlay) excelOverlay.style.display = 'none'; });
downloadExcelBtn.addEventListener('click', () => downloadExcelReport());

function openExcelModal() {
    renderExcelTable();
    excelOverlay.style.display = '';
}

/**
 * Render the detected vs actual counts table.
 * Shows: Single Doors, Double Doors, Windows with detected count and editable actual input.
 */
function renderExcelTable() {
    const summary = resultsData.summary || {};

    // Categories to display
    const categories = [
        { label: 'Single Door',  icon: '🚶', key: 'Single Door' },
        { label: 'Double Door',  icon: '🚪', key: 'Double Door' },
        { label: 'Window',       icon: '🪟', key: 'Window' },
    ];

    let html = '';
    categories.forEach((cat, idx) => {
        const detected = summary[cat.key] || 0;
        html += `
            <tr class="detection-row excel-row" style="animation-delay: ${idx * 0.05}s">
                <td class="det-type">
                    <span class="det-badge det-badge--${cat.key.toLowerCase().replace(/\s/g, '-')}">${cat.icon} ${cat.label}</span>
                </td>
                <td class="cost-val excel-detected">${detected}</td>
                <td>
                    <input type="number" class="cost-input excel-actual-input" 
                           data-category="${cat.key}" 
                           value="${detected}" min="0" step="1">
                </td>
                <td class="cost-val excel-diff" data-detected="${detected}">0</td>
            </tr>`;
    });

    excelTableBody.innerHTML = html;

    // Attach live diff calculation
    excelTableBody.querySelectorAll('.excel-actual-input').forEach(input => {
        input.addEventListener('input', () => {
            const row = input.closest('tr');
            const detected = parseInt(row.querySelector('.excel-detected').textContent) || 0;
            const actual = parseInt(input.value) || 0;
            const diff = actual - detected;
            const diffCell = row.querySelector('.excel-diff');
            diffCell.textContent = diff > 0 ? `+${diff}` : `${diff}`;
            diffCell.style.color = diff === 0 ? 'var(--success)' : diff > 0 ? 'var(--warning)' : 'var(--danger)';
        });
    });
}

/**
 * Export detection record to the persistent Detection_Record.xlsx on the server.
 * Each click appends a new row to the same file.
 */
async function downloadExcelReport() {
    const summary = resultsData.summary || {};
    const categories = [
        { label: 'Single Door', key: 'Single Door', detKey: 'single_door_detected', actKey: 'single_door_actual' },
        { label: 'Double Door', key: 'Double Door', detKey: 'double_door_detected', actKey: 'double_door_actual' },
        { label: 'Window',      key: 'Window',      detKey: 'window_detected',      actKey: 'window_actual' },
    ];

    // Build payload from modal inputs
    const payload = {
        file_name: selectedFile ? selectedFile.name : 'Unknown',
        wall_count: resultsData.wall_count || '',
        floor_coverage_pct: resultsData.floor_coverage_pct || '',
    };

    categories.forEach(cat => {
        const detected = summary[cat.key] || 0;
        const inputEl = excelTableBody.querySelector(`[data-category="${cat.key}"]`);
        const actual = inputEl ? (parseInt(inputEl.value) || 0) : detected;
        payload[cat.detKey] = detected;
        payload[cat.actKey] = actual;
    });

    // Disable button and show loading state
    const btnText = document.getElementById('excelBtnText');
    const feedback = document.getElementById('excelFeedback');
    downloadExcelBtn.disabled = true;
    btnText.textContent = 'Saving...';

    try {
        const response = await fetch('/api/export-excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (result.status === 'ok') {
            feedback.style.display = '';
            feedback.className = 'excel-feedback excel-feedback--success';
            feedback.innerHTML = `✅ ${result.message}`;
            btnText.textContent = 'Export Result to Excel';
        } else {
            throw new Error(result.detail || 'Unknown error');
        }
    } catch (err) {
        feedback.style.display = '';
        feedback.className = 'excel-feedback excel-feedback--error';
        feedback.innerHTML = `❌ Error: ${err.message}`;
        btnText.textContent = 'Export Result to Excel';
    } finally {
        downloadExcelBtn.disabled = false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODAL 5 — MATERIAL COST BREAKDOWN (Individual Cards)
// ═══════════════════════════════════════════════════════════════════════════

const materialBreakdownOverlay  = document.getElementById('materialBreakdownOverlay');
const materialBreakdownCloseBtn = document.getElementById('materialBreakdownCloseBtn');
const breakdownBody             = document.getElementById('breakdownBody');
const openMaterialBreakdownBtn  = document.getElementById('openMaterialBreakdownBtn');

if (openMaterialBreakdownBtn) {
    openMaterialBreakdownBtn.addEventListener('click', () => openMaterialBreakdown());
}
materialBreakdownCloseBtn.addEventListener('click', () => { materialBreakdownOverlay.style.display = 'none'; });
materialBreakdownOverlay.addEventListener('click', e => { if (e.target === materialBreakdownOverlay) materialBreakdownOverlay.style.display = 'none'; });

function openMaterialBreakdown() {
    renderMaterialBreakdown();
    materialBreakdownOverlay.style.display = '';
}

/**
 * Render individual material cost cards showing per-unit and total costs
 * for Paint, Cement, and Bricks.
 */
function renderMaterialBreakdown() {
    const scale = parseFloat(scaleFactorInput.value) || 20;
    const pxPerSqFt = scale * scale;
    const wallAreaSqFt = (resultsData.total_wall_area_px || 0) / pxPerSqFt;
    const floorAreaSqFt = (resultsData.floor_area_px || 0) / pxPerSqFt;
    const ceilingAreaSqFt = floorAreaSqFt;
    const totalPaintableArea = wallAreaSqFt + ceilingAreaSqFt;

    // Read current rates from the cost modal inputs (if user changed them)
    const getRate = (material) => {
        const input = document.querySelector(`.material-rate-input[data-material="${material}"]`);
        return input ? parseFloat(input.value) || RATES[material] : RATES[material];
    };

    const paintWallRate   = getRate('paint_wall');
    const paintCeilRate   = getRate('paint_ceiling');
    const cementRate      = getRate('cement');
    const brickRate       = getRate('brick_price');
    const bricksPerSqft   = RATES.bricks_per_sqft;

    const wallPaintCost   = wallAreaSqFt * paintWallRate;
    const ceilPaintCost   = ceilingAreaSqFt * paintCeilRate;
    const totalPaintCost  = wallPaintCost + ceilPaintCost;

    const cementCost      = wallAreaSqFt * cementRate;
    const cementPerSqFt   = cementRate;

    const totalBricks     = Math.ceil(wallAreaSqFt * bricksPerSqft);
    const totalBrickCost  = totalBricks * brickRate;
    const brickCostPerSqFt = bricksPerSqft * brickRate;

    breakdownBody.innerHTML = `
        <!-- Paint Card -->
        <div class="breakdown-card breakdown-card--paint">
            <div class="breakdown-card-header">
                <span class="breakdown-icon">🎨</span>
                <h4 class="breakdown-title">Paint Estimation</h4>
            </div>
            <div class="breakdown-details">
                <div class="breakdown-line">
                    <span class="breakdown-label">Wall Paint Area</span>
                    <span class="breakdown-value">${wallAreaSqFt.toFixed(1)} sq ft</span>
                </div>
                <div class="breakdown-line">
                    <span class="breakdown-label">Wall Paint Rate</span>
                    <span class="breakdown-value">Rs ${paintWallRate}/sq ft</span>
                </div>
                <div class="breakdown-line">
                    <span class="breakdown-label">Wall Paint Cost</span>
                    <span class="breakdown-value breakdown-value--highlight">Rs ${wallPaintCost.toLocaleString('en-PK')}</span>
                </div>
                <div class="breakdown-divider"></div>
                <div class="breakdown-line">
                    <span class="breakdown-label">Ceiling Paint Area</span>
                    <span class="breakdown-value">${ceilingAreaSqFt.toFixed(1)} sq ft</span>
                </div>
                <div class="breakdown-line">
                    <span class="breakdown-label">Ceiling Paint Rate</span>
                    <span class="breakdown-value">Rs ${paintCeilRate}/sq ft</span>
                </div>
                <div class="breakdown-line">
                    <span class="breakdown-label">Ceiling Paint Cost</span>
                    <span class="breakdown-value breakdown-value--highlight">Rs ${ceilPaintCost.toLocaleString('en-PK')}</span>
                </div>
                <div class="breakdown-divider"></div>
                <div class="breakdown-line breakdown-total">
                    <span class="breakdown-label">Total Paint Cost</span>
                    <span class="breakdown-value breakdown-value--total">Rs ${totalPaintCost.toLocaleString('en-PK')}</span>
                </div>
            </div>
        </div>

        <!-- Cement Card -->
        <div class="breakdown-card breakdown-card--cement">
            <div class="breakdown-card-header">
                <span class="breakdown-icon">🏗️</span>
                <h4 class="breakdown-title">Cement Estimation</h4>
            </div>
            <div class="breakdown-details">
                <div class="breakdown-line">
                    <span class="breakdown-label">Plastering Area</span>
                    <span class="breakdown-value">${wallAreaSqFt.toFixed(1)} sq ft</span>
                </div>
                <div class="breakdown-line">
                    <span class="breakdown-label">Rate (Plaster + Material)</span>
                    <span class="breakdown-value">Rs ${cementPerSqFt}/sq ft</span>
                </div>
                <div class="breakdown-line">
                    <span class="breakdown-label">Cost per sq ft</span>
                    <span class="breakdown-value breakdown-value--highlight">Rs ${cementPerSqFt}</span>
                </div>
                <div class="breakdown-divider"></div>
                <div class="breakdown-line breakdown-total">
                    <span class="breakdown-label">Total Cement Cost</span>
                    <span class="breakdown-value breakdown-value--total">Rs ${cementCost.toLocaleString('en-PK')}</span>
                </div>
            </div>
        </div>

        <!-- Bricks Card -->
        <div class="breakdown-card breakdown-card--bricks">
            <div class="breakdown-card-header">
                <span class="breakdown-icon">🧱</span>
                <h4 class="breakdown-title">Brick Estimation</h4>
            </div>
            <div class="breakdown-details">
                <div class="breakdown-line">
                    <span class="breakdown-label">Wall Area</span>
                    <span class="breakdown-value">${wallAreaSqFt.toFixed(1)} sq ft</span>
                </div>
                <div class="breakdown-line">
                    <span class="breakdown-label">Bricks per sq ft</span>
                    <span class="breakdown-value">${bricksPerSqft} bricks</span>
                </div>
                <div class="breakdown-line">
                    <span class="breakdown-label">Total Bricks Required</span>
                    <span class="breakdown-value breakdown-value--highlight">${totalBricks.toLocaleString('en-PK')} bricks</span>
                </div>
                <div class="breakdown-divider"></div>
                <div class="breakdown-line">
                    <span class="breakdown-label">Cost per Brick</span>
                    <span class="breakdown-value">Rs ${brickRate}</span>
                </div>
                <div class="breakdown-line">
                    <span class="breakdown-label">Cost per sq ft (bricks only)</span>
                    <span class="breakdown-value">Rs ${brickCostPerSqFt}</span>
                </div>
                <div class="breakdown-divider"></div>
                <div class="breakdown-line breakdown-total">
                    <span class="breakdown-label">Total Brick Cost</span>
                    <span class="breakdown-value breakdown-value--total">Rs ${totalBrickCost.toLocaleString('en-PK')}</span>
                </div>
            </div>
        </div>

        <!-- Combined Total -->
        <div class="breakdown-grand-total">
            <span class="breakdown-grand-label">Total Material Cost (Paint + Cement + Bricks)</span>
            <span class="breakdown-grand-value">Rs ${(totalPaintCost + cementCost + totalBrickCost).toLocaleString('en-PK')}</span>
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODAL 3 — COST ESTIMATION (Per-Detection + Professor's Rates)
// ═══════════════════════════════════════════════════════════════════════════

openCostBtn.addEventListener('click', () => openCostModal());
costCloseBtn.addEventListener('click', () => { costOverlay.style.display = 'none'; });
costOverlay.addEventListener('click', e => { if (e.target === costOverlay) costOverlay.style.display = 'none'; });

// Listen to scale factor and wall height changes
scaleFactorInput.addEventListener('input', recalcAllCosts);
wallHeightInput.addEventListener('input', recalcAllCosts);

function openCostModal() {
    renderCostTable();
    renderMaterialCosts();
    costOverlay.style.display = '';
}

/**
 * Render per-detection cost table with dropdowns.
 * - Windows get material dropdown (Aluminium / PVC)
 * - Doors auto-classified: Single Door = Small (6ft), Double Door = Large (7ft)
 *   with override dropdown
 */
function renderCostTable() {
    const detections = resultsData.detections;
    const scaleFactor = parseFloat(scaleFactorInput.value) || 25;

    let html = '';
    let rowIndex = 0;

    detections.forEach((det, idx) => {
        const labelLower = det.label.toLowerCase();
        const widthFt = (det.width / scaleFactor).toFixed(2);

        if (labelLower === 'window') {
            // Window: dropdown for Aluminium vs PVC
            const heightFt = 4;
            const defaultRate = RATES.window_aluminium;
            const area = (widthFt * heightFt).toFixed(2);
            const cost = Math.round(area * defaultRate);

            html += `
                <tr class="cost-row cost-row--window"
                    data-det-idx="${idx}" data-type="window"
                    data-width-px="${det.width}" data-height-px="${det.height}"
                    style="animation-delay: ${rowIndex * 0.04}s">
                    <td class="det-id">${idx + 1}</td>
                    <td class="det-type">
                        <span class="det-badge det-badge--window">🪟 Window</span>
                    </td>
                    <td>
                        <select class="cost-select window-material-select">
                            <option value="aluminium" selected>Aluminium (Rs ${RATES.window_aluminium}/sqft)</option>
                            <option value="pvc">PVC (Rs ${RATES.window_pvc}/sqft)</option>
                        </select>
                    </td>
                    <td>
                        <input type="number" class="cost-input det-height-input" value="${heightFt}" min="1" step="0.5">
                    </td>
                    <td class="cost-val cost-amount">Rs ${cost.toLocaleString('en-PK')}</td>
                </tr>`;

        } else if (labelLower.includes('door')) {
            // Door: auto-classify by YOLO class
            // Single Door (d1) = Small (6ft, 16K), Double Door (d2) = Large (7ft, 20K)
            const isDouble = labelLower === 'double door';
            const defaultSize = isDouble ? 'large' : 'small';
            const defaultHeight = isDouble ? RATES.door_large_height : RATES.door_small_height;
            const defaultPrice = isDouble ? RATES.door_large : RATES.door_small;

            html += `
                <tr class="cost-row cost-row--door"
                    data-det-idx="${idx}" data-type="door"
                    data-width-px="${det.width}" data-height-px="${det.height}"
                    style="animation-delay: ${rowIndex * 0.04}s">
                    <td class="det-id">${idx + 1}</td>
                    <td class="det-type">
                        <span class="det-badge det-badge--${det.label.toLowerCase().replace(/\s/g, '-')}">🚪 ${det.label}</span>
                    </td>
                    <td>
                        <select class="cost-select door-size-select">
                            <option value="large" ${defaultSize === 'large' ? 'selected' : ''}>Large Panel (Rs ${RATES.door_large.toLocaleString('en-PK')}/door, ${RATES.door_large_height}ft)</option>
                            <option value="small" ${defaultSize === 'small' ? 'selected' : ''}>Small Panel (Rs ${RATES.door_small.toLocaleString('en-PK')}/door, ${RATES.door_small_height}ft)</option>
                        </select>
                    </td>
                    <td class="cost-val det-height-ft">${defaultHeight}</td>
                    <td class="cost-val cost-amount">Rs ${defaultPrice.toLocaleString('en-PK')}</td>
                </tr>`;
        }

        rowIndex++;
    });

    if (rowIndex === 0) {
        // No doors/windows detected — hide the entire section
        doorWindowSection.style.display = 'none';
    } else {
        doorWindowSection.style.display = '';
    }

    costTableBody.innerHTML = html;

    // Attach per-row listeners
    costTableBody.querySelectorAll('.window-material-select').forEach(sel => {
        sel.addEventListener('change', () => recalcWindowRow(sel.closest('tr')));
    });
    costTableBody.querySelectorAll('.door-size-select').forEach(sel => {
        sel.addEventListener('change', () => recalcDoorRow(sel.closest('tr')));
    });
    costTableBody.querySelectorAll('.det-height-input').forEach(input => {
        input.addEventListener('input', () => recalcWindowRow(input.closest('tr')));
    });

    recalcGrandTotal();
}

function recalcWindowRow(row) {
    const scaleFactor = parseFloat(scaleFactorInput.value) || 25;
    const widthPx = parseFloat(row.dataset.widthPx) || 0;
    const widthFt = widthPx / scaleFactor;
    const heightFt = parseFloat(row.querySelector('.det-height-input').value) || 4;
    const material = row.querySelector('.window-material-select').value;
    const rate = material === 'pvc' ? RATES.window_pvc : RATES.window_aluminium;
    const area = widthFt * heightFt;
    const cost = Math.round(area * rate);

    row.querySelector('.cost-amount').textContent = `Rs ${cost.toLocaleString('en-PK')}`;
    recalcGrandTotal();
}

function recalcDoorRow(row) {
    const size = row.querySelector('.door-size-select').value;
    const price = size === 'large' ? RATES.door_large : RATES.door_small;
    const height = size === 'large' ? RATES.door_large_height : RATES.door_small_height;

    row.querySelector('.det-height-ft').textContent = height;
    row.querySelector('.cost-amount').textContent = `Rs ${price.toLocaleString('en-PK')}`;
    recalcGrandTotal();
}

/**
 * Render material & construction costs using realistic Pakistan market rates.
 * Enhanced with detailed breakdowns for Paint, Cement, and Bricks.
 */
function renderMaterialCosts() {
    const hasWalls = resultsData.wall_count !== undefined && resultsData.wall_count > 0;

    // Show/hide wall sections
    wallAreaSection.style.display = hasWalls ? '' : 'none';
    areaStats.style.display = hasWalls ? '' : 'none';
    materialSection.style.display = hasWalls ? '' : 'none';
    materialCosts.style.display = hasWalls ? '' : 'none';

    if (!hasWalls) return;

    const scaleFactor = parseFloat(scaleFactorInput.value) || 20;
    const wallHeight = parseFloat(wallHeightInput.value) || 10;

    // Convert pixel areas to sq ft
    const pxPerSqFt = scaleFactor * scaleFactor;
    const wallAreaSqFt = (resultsData.total_wall_area_px || 0) / pxPerSqFt;
    const floorAreaSqFt = (resultsData.floor_area_px || 0) / pxPerSqFt;

    const wallSurfaceArea = wallAreaSqFt * wallHeight;
    const paintableArea = wallSurfaceArea * 2;  // both sides

    // Update area stats
    wallAreaFt.textContent = `${wallAreaSqFt.toFixed(1)} sq ft`;
    floorAreaFt.textContent = `${floorAreaSqFt.toFixed(1)} sq ft`;
    wallCountStat.textContent = resultsData.wall_count;

    // Calculate quantities
    const brickCount = Math.round(wallSurfaceArea * RATES.bricks_per_sqft);
    const paintWallCost = Math.round(paintableArea * RATES.paint_wall);
    const paintCeilingCost = Math.round(floorAreaSqFt * RATES.paint_ceiling);
    const totalPaintCost = paintWallCost + paintCeilingCost;
    const cementCost = Math.round(wallSurfaceArea * RATES.cement);
    const cementPerSqFt = RATES.cement;
    const grayStructureCost = Math.round(floorAreaSqFt * RATES.gray_structure);
    const brickCost = Math.round(brickCount * RATES.brick_price);

    let html = '';

    // ═══════════════════════════════════════════════════════════════
    // PAINT ESTIMATION SECTION
    // ═══════════════════════════════════════════════════════════════
    html += `<tr class="cost-section-row"><td colspan="5"><div class="material-section-title">🎨 Paint Estimation</div></td></tr>`;

    // Wall Paint
    html += `
        <tr class="cost-row material-row" style="animation-delay: 0.02s">
            <td class="det-type"><span class="det-badge det-badge--paint">🎨 Wall Paint</span></td>
            <td class="cost-val material-qty">${paintableArea.toFixed(1)}</td>
            <td class="cost-val">sq ft</td>
            <td>
                <input type="number" class="cost-input material-rate-input" data-material="paint_wall" value="${RATES.paint_wall}" min="1" step="1">
            </td>
            <td class="cost-val cost-amount material-cost">Rs ${paintWallCost.toLocaleString('en-PK')}</td>
        </tr>`;

    // Ceiling Paint
    html += `
        <tr class="cost-row material-row" style="animation-delay: 0.04s">
            <td class="det-type"><span class="det-badge det-badge--paint">🖌️ Ceiling Paint</span></td>
            <td class="cost-val material-qty">${floorAreaSqFt.toFixed(1)}</td>
            <td class="cost-val">sq ft</td>
            <td>
                <input type="number" class="cost-input material-rate-input" data-material="paint_ceiling" value="${RATES.paint_ceiling}" min="1" step="1">
            </td>
            <td class="cost-val cost-amount material-cost">Rs ${paintCeilingCost.toLocaleString('en-PK')}</td>
        </tr>`;

    // Paint Sub-total
    html += `
        <tr class="cost-row material-subtotal-row">
            <td class="det-type" colspan="2"><strong>Total Paint Cost</strong></td>
            <td class="cost-val"></td>
            <td class="cost-val"></td>
            <td class="cost-val cost-amount material-subtotal paint-subtotal"><strong>Rs ${totalPaintCost.toLocaleString('en-PK')}</strong></td>
        </tr>`;

    // ═══════════════════════════════════════════════════════════════
    // CEMENT ESTIMATION SECTION
    // ═══════════════════════════════════════════════════════════════
    html += `<tr class="cost-section-row"><td colspan="5"><div class="material-section-title">🏗️ Cement Estimation</div></td></tr>`;

    // Cement
    html += `
        <tr class="cost-row material-row" style="animation-delay: 0.06s">
            <td class="det-type"><span class="det-badge det-badge--cement">🏗️ Cement (Plastering)</span></td>
            <td class="cost-val material-qty">${wallSurfaceArea.toFixed(1)}</td>
            <td class="cost-val">sq ft</td>
            <td>
                <input type="number" class="cost-input material-rate-input" data-material="cement" value="${RATES.cement}" min="1" step="1">
            </td>
            <td class="cost-val cost-amount material-cost">Rs ${cementCost.toLocaleString('en-PK')}</td>
        </tr>`;

    // Cement per sq ft info
    html += `
        <tr class="cost-row material-info-row">
            <td class="det-type" colspan="2"><span class="material-info-label">📊 Cost per Sq Ft</span></td>
            <td class="cost-val"></td>
            <td class="cost-val"></td>
            <td class="cost-val cost-amount material-info-val cement-per-sqft">Rs ${cementPerSqFt}/sq ft</td>
        </tr>`;

    // ═══════════════════════════════════════════════════════════════
    // BRICK ESTIMATION SECTION
    // ═══════════════════════════════════════════════════════════════
    html += `<tr class="cost-section-row"><td colspan="5"><div class="material-section-title">🧱 Brick Estimation</div></td></tr>`;

    // Bricks Required
    html += `
        <tr class="cost-row material-row" style="animation-delay: 0.08s">
            <td class="det-type"><span class="det-badge det-badge--bricks">🧱 Bricks Required</span></td>
            <td class="cost-val material-qty">${brickCount.toLocaleString('en-PK')}</td>
            <td class="cost-val">bricks</td>
            <td>
                <input type="number" class="cost-input material-rate-input" data-material="bricks" value="${RATES.brick_price}" min="1" step="1">
            </td>
            <td class="cost-val cost-amount material-cost">Rs ${brickCost.toLocaleString('en-PK')}</td>
        </tr>`;

    // Cost per brick info
    html += `
        <tr class="cost-row material-info-row">
            <td class="det-type" colspan="2"><span class="material-info-label">🧱 Cost per Brick</span></td>
            <td class="cost-val"></td>
            <td class="cost-val"></td>
            <td class="cost-val cost-amount material-info-val">Rs ${RATES.brick_price}/brick</td>
        </tr>`;

    // Bricks required info
    html += `
        <tr class="cost-row material-info-row">
            <td class="det-type" colspan="2"><span class="material-info-label">📦 Total Bricks Needed</span></td>
            <td class="cost-val"></td>
            <td class="cost-val"></td>
            <td class="cost-val cost-amount material-info-val brick-count-display">${brickCount.toLocaleString('en-PK')} bricks</td>
        </tr>`;

    // Brick total
    html += `
        <tr class="cost-row material-subtotal-row">
            <td class="det-type" colspan="2"><strong>Total Brick Cost</strong></td>
            <td class="cost-val"></td>
            <td class="cost-val"></td>
            <td class="cost-val cost-amount material-subtotal brick-subtotal"><strong>Rs ${brickCost.toLocaleString('en-PK')}</strong></td>
        </tr>`;

    // ═══════════════════════════════════════════════════════════════
    // GRAY STRUCTURE SECTION
    // ═══════════════════════════════════════════════════════════════
    html += `<tr class="cost-section-row"><td colspan="5"><div class="material-section-title">🏠 Gray Structure</div></td></tr>`;

    // Gray Structure
    html += `
        <tr class="cost-row material-row" style="animation-delay: 0.10s">
            <td class="det-type"><span class="det-badge det-badge--gray-structure">🏠 Gray Structure</span></td>
            <td class="cost-val material-qty">${floorAreaSqFt.toFixed(1)}</td>
            <td class="cost-val">sq ft</td>
            <td>
                <input type="number" class="cost-input material-rate-input" data-material="gray_structure" value="${RATES.gray_structure}" min="1" step="100">
            </td>
            <td class="cost-val cost-amount material-cost">Rs ${grayStructureCost.toLocaleString('en-PK')}</td>
        </tr>`;

    materialTableBody.innerHTML = html;

    // Attach material rate change listeners
    materialTableBody.querySelectorAll('.material-rate-input').forEach(input => {
        input.addEventListener('input', () => recalcMaterialRow(input));
    });

    recalcGrandTotal();
}

function recalcMaterialRow(input) {
    const row = input.closest('tr');
    const material = input.dataset.material;
    const rate = parseFloat(input.value) || 0;

    const scaleFactor = parseFloat(scaleFactorInput.value) || 20;
    const wallHeight = parseFloat(wallHeightInput.value) || 10;
    const pxPerSqFt = scaleFactor * scaleFactor;
    const wallAreaSqFt = (resultsData.total_wall_area_px || 0) / pxPerSqFt;
    const floorAreaSqFt = (resultsData.floor_area_px || 0) / pxPerSqFt;
    const wallSurfaceArea = wallAreaSqFt * wallHeight;
    const paintableArea = wallSurfaceArea * 2;

    let qty = 0;
    if (material === 'paint_wall') {
        qty = paintableArea;
    } else if (material === 'paint_ceiling') {
        qty = floorAreaSqFt;
    } else if (material === 'cement') {
        qty = wallSurfaceArea;
    } else if (material === 'bricks') {
        qty = Math.round(wallSurfaceArea * RATES.bricks_per_sqft);
    } else if (material === 'gray_structure') {
        qty = floorAreaSqFt;
    }

    const cost = Math.round(qty * rate);
    row.querySelector('.material-cost').textContent = `Rs ${cost.toLocaleString('en-PK')}`;

    // Update sub-totals and info rows
    updateMaterialSubtotals();
    recalcGrandTotal();
}

function updateMaterialSubtotals() {
    const scaleFactor = parseFloat(scaleFactorInput.value) || 20;
    const wallHeight = parseFloat(wallHeightInput.value) || 10;
    const pxPerSqFt = scaleFactor * scaleFactor;
    const wallAreaSqFt = (resultsData.total_wall_area_px || 0) / pxPerSqFt;
    const floorAreaSqFt = (resultsData.floor_area_px || 0) / pxPerSqFt;
    const wallSurfaceArea = wallAreaSqFt * wallHeight;
    const paintableArea = wallSurfaceArea * 2;

    // Get current rates from inputs
    const paintWallRate = parseFloat(document.querySelector('[data-material="paint_wall"]')?.value) || RATES.paint_wall;
    const paintCeilingRate = parseFloat(document.querySelector('[data-material="paint_ceiling"]')?.value) || RATES.paint_ceiling;
    const cementRate = parseFloat(document.querySelector('[data-material="cement"]')?.value) || RATES.cement;
    const brickRate = parseFloat(document.querySelector('[data-material="bricks"]')?.value) || RATES.brick_price;

    const paintWallCost = Math.round(paintableArea * paintWallRate);
    const paintCeilingCost = Math.round(floorAreaSqFt * paintCeilingRate);
    const totalPaintCost = paintWallCost + paintCeilingCost;

    const brickCount = Math.round(wallSurfaceArea * RATES.bricks_per_sqft);
    const brickCost = Math.round(brickCount * brickRate);

    // Update paint subtotal
    const paintSub = materialTableBody.querySelector('.paint-subtotal');
    if (paintSub) paintSub.innerHTML = `<strong>Rs ${totalPaintCost.toLocaleString('en-PK')}</strong>`;

    // Update cement per sqft
    const cementInfo = materialTableBody.querySelector('.cement-per-sqft');
    if (cementInfo) cementInfo.textContent = `Rs ${cementRate}/sq ft`;

    // Update brick count display
    const brickCountEl = materialTableBody.querySelector('.brick-count-display');
    if (brickCountEl) brickCountEl.textContent = `${brickCount.toLocaleString('en-PK')} bricks`;

    // Update brick subtotal
    const brickSub = materialTableBody.querySelector('.brick-subtotal');
    if (brickSub) brickSub.innerHTML = `<strong>Rs ${brickCost.toLocaleString('en-PK')}</strong>`;
}

function recalcAllCosts() {
    const scaleFactor = parseFloat(scaleFactorInput.value) || 20;

    // Recalc all window rows
    costTableBody.querySelectorAll('.cost-row--window').forEach(row => {
        recalcWindowRow(row);
    });

    // Recalc door width display (cost is flat per door, doesn't change)
    costTableBody.querySelectorAll('.cost-row--door').forEach(row => {
        // Flat price per door, nothing to recalculate on scale change
    });

    // Re-render material costs when scale factor or wall height changes
    renderMaterialCosts();
}

function recalcGrandTotal() {
    let total = 0;

    // Sum door/window category costs
    costTableBody.querySelectorAll('.cost-amount').forEach(cell => {
        const num = parseInt(cell.textContent.replace(/[^0-9]/g, '')) || 0;
        total += num;
    });

    // Sum material costs
    materialTableBody.querySelectorAll('.material-cost').forEach(cell => {
        const num = parseInt(cell.textContent.replace(/[^0-9]/g, '')) || 0;
        total += num;
    });

    grandTotalResult.textContent = `Rs ${total.toLocaleString('en-PK')}`;

    // Flash animation
    grandTotalResult.classList.remove('price-flash');
    void grandTotalResult.offsetWidth;
    grandTotalResult.classList.add('price-flash');
}

// ── New Analysis ────────────────────────────────────────────────────────────
newAnalysisBtn.addEventListener('click', () => {
    panelResults.style.display = 'none';
    panelEmpty.style.display   = '';
    resetUpload();
    resultsData = null;
    if (progressTimeout) {
        clearTimeout(progressTimeout);
        progressTimeout = null;
    }
    progressFill.style.width = '0%';

    // Reset scale factor hint
    scaleFactorInput.value = 20;
    scaleFactorHint.textContent = 'Default: 20 pixels per foot (adjustable)';
    scaleFactorHint.style.color = '';

    navbarStatus.innerHTML = '<span class="status-dot"></span><span>Model Ready</span>';
    navbarStatus.style.color = 'var(--success)';
    navbarStatus.style.background = 'rgba(16,185,129,0.08)';
});

// Close any modal on Escape
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        modalOverlay.style.display = 'none';
        confidenceOverlay.style.display = 'none';
        costOverlay.style.display = 'none';
        excelOverlay.style.display = 'none';
        materialBreakdownOverlay.style.display = 'none';
        resetZoom();
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
