/**
 * Clone Stamp Tool Logic with Zoom and Pan
 */

// DOM Elements
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const downloadBtn = document.getElementById('downloadBtn');
const undoBtn = document.getElementById('undoBtn');
const resetBtn = document.getElementById('resetBtn');
const canvasWrapper = document.getElementById('canvasWrapper');
const workspace = document.querySelector('.workspace');
const imageCanvas = document.getElementById('imageCanvas');
const cursorCanvas = document.getElementById('cursorCanvas');
const ctx = imageCanvas.getContext('2d', { willReadFrequently: true });
const cCtx = cursorCanvas.getContext('2d');

// Zoom Controls
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const zoomFitBtn = document.getElementById('zoomFit');
const zoomDisplay = document.getElementById('zoomDisplay');

// Inputs
const brushSizeInput = document.getElementById('brushSize');
const brushOpacityInput = document.getElementById('brushOpacity');
const brushHardnessInput = document.getElementById('brushHardness');
const sizeVal = document.getElementById('sizeVal');
const opacityVal = document.getElementById('opacityVal');
const hardnessVal = document.getElementById('hardnessVal');

// State Variables
let isDrawing = false;
let isAltPressed = false;
let isShiftPressed = false;
let isPanning = false;
let hasImage = false;
let history = [];
let historyStep = -1;
const maxHistory = 20;

// Clone Tool Specifics
let sourcePoint = { x: 0, y: 0 };
let dragStartPoint = { x: 0, y: 0 };
let isSourceSet = false;

// Brush settings
let brushSize = 30;
let brushOpacity = 1.0;
let brushHardness = 0.8;

// Zoom and Pan State
let zoom = 1.0;
let pan = { x: 0, y: 0 };
let baseScale = 1.0; // The scale needed to fit image initially
let minZoom = 0.1;
let maxZoom = 20.0;
let panStart = { x: 0, y: 0 }; // For panning drag

// --- Initialization ---

function init() {
    canvasWrapper.style.display = 'none';
    
    // File Listeners
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleImageUpload);
    downloadBtn.addEventListener('click', downloadImage);
    undoBtn.addEventListener('click', undo);
    resetBtn.addEventListener('click', resetImage);

    // Brush Listeners
    brushSizeInput.addEventListener('input', (e) => {
        brushSize = parseInt(e.target.value);
        sizeVal.textContent = brushSize + 'px';
        drawCursorOverlay();
    });
    brushOpacityInput.addEventListener('input', (e) => {
        brushOpacity = parseInt(e.target.value) / 100;
        opacityVal.textContent = e.target.value + '%';
    });
    brushHardnessInput.addEventListener('input', (e) => {
        brushHardness = parseInt(e.target.value) / 100;
        hardnessVal.textContent = e.target.value + '%';
    });

    // Zoom Listeners
    zoomInBtn.addEventListener('click', () => adjustZoom(1.2));
    zoomOutBtn.addEventListener('click', () => adjustZoom(0.8));
    zoomFitBtn.addEventListener('click', fitToScreen);

    // Keyboard Interaction
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Mouse/Touch Interaction
    window.addEventListener('mousemove', onMouseMove); 
    window.addEventListener('mouseup', onMouseUp);
    
    // Wheel Zoom
    workspace.addEventListener('wheel', handleWheel, { passive: false });

    // Initial Cursor Canvas setup
    cursorCanvas.width = 100;
    cursorCanvas.height = 100;
}

// --- Image Handling ---

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            setupCanvas(img);
        }
        img.src = event.target.result;
    }
    reader.readAsDataURL(file);
}

function setupCanvas(img) {
    // Hide welcome message
    const welcome = document.getElementById('welcomeMessage');
    if (welcome) welcome.style.display = 'none';

    imageCanvas.width = img.width;
    imageCanvas.height = img.height;
    cursorCanvas.width = img.width;
    cursorCanvas.height = img.height;

    ctx.drawImage(img, 0, 0);

    hasImage = true;
    canvasWrapper.style.display = 'block';
    isSourceSet = false;
    downloadBtn.disabled = false;
    resetBtn.disabled = false;
    
    history = [];
    historyStep = -1;
    saveState();

    fitToScreen();
}

function fitToScreen() {
    if (!hasImage) return;
    
    const wsWidth = workspace.clientWidth;
    const wsHeight = workspace.clientHeight;
    const imgWidth = imageCanvas.width;
    const imgHeight = imageCanvas.height;

    // Calculate scale to fit with some padding
    const scaleX = (wsWidth - 40) / imgWidth;
    const scaleY = (wsHeight - 40) / imgHeight;
    baseScale = Math.min(scaleX, scaleY);
    
    // Don't zoom in if image is tiny
    baseScale = Math.min(baseScale, 1.0); 

    zoom = 1.0; // Reset relative zoom
    pan = { x: 0, y: 0 };
    
    updateTransform();
}

function adjustZoom(factor) {
    if (!hasImage) return;
    const newZoom = Math.min(Math.max(minZoom, zoom * factor), maxZoom);
    if (newZoom === zoom) return;
    zoom = newZoom;
    updateTransform();
}

function updateTransform() {
    if (!hasImage) return;
    const totalScale = baseScale * zoom;
    
    // Apply CSS transform
    canvasWrapper.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${totalScale})`;
    
    // Update UI
    zoomDisplay.textContent = Math.round(zoom * 100) + '%';
    
    // Redraw cursor to adjust line width/size based on new zoom
    drawCursorOverlay();
}

function handleWheel(e) {
    if (!hasImage) return;
    if (e.ctrlKey) {
        e.preventDefault(); // Prevent browser zoom
    }
    
    // Check if hovering over canvas (or workspace)
    if(e.target.closest('.workspace')) {
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const oldZoom = zoom;
        let newZoom = zoom * delta;
        newZoom = Math.min(Math.max(minZoom, newZoom), maxZoom);
        
        if (newZoom !== oldZoom) {
            // Zoom towards mouse pointer logic
            // 1. Get mouse pos relative to workspace center
            const rect = workspace.getBoundingClientRect();
            const mouseX = e.clientX - rect.left - rect.width/2;
            const mouseY = e.clientY - rect.top - rect.height/2;

            // 2. Adjust pan so the point under mouse remains static
            // formula: newOffset = mouse - (mouse - oldOffset) * (newScale / oldScale)
            const scaleRatio = (newZoom / oldZoom);
            
            pan.x = mouseX - (mouseX - pan.x) * scaleRatio;
            pan.y = mouseY - (mouseY - pan.y) * scaleRatio;
            
            zoom = newZoom;
            updateTransform();
        }
    }
}

// --- Interaction Logic ---

function handleKeyDown(e) {
    if (e.key === 'Shift' && !isShiftPressed) {
        isShiftPressed = true;
        if (hasImage) canvasWrapper.classList.add('panning');
    }
    if (e.key === 'Alt') {
        isAltPressed = true;
        drawCursorOverlay();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
    }
    // Zoom shortcuts
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        adjustZoom(1.2);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        adjustZoom(0.8);
    }
}

function handleKeyUp(e) {
    if (e.key === 'Shift') {
        isShiftPressed = false;
        isPanning = false;
        if (hasImage) canvasWrapper.classList.remove('panning');
    }
    if (e.key === 'Alt') {
        isAltPressed = false;
        drawCursorOverlay();
    }
}

// Attach mousedown to canvas wrapper to capture events
canvasWrapper.addEventListener('mousedown', onMouseDown);

function getMousePos(e) {
    // We rely on getBoundingClientRect which respects CSS transforms
    // This makes the math trivial: (screenX - canvasScreenLeft) * (canvasWidth / canvasScreenWidth)
    const rect = imageCanvas.getBoundingClientRect();
    
    // Handle case where canvas is off screen
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };

    return {
        x: (e.clientX - rect.left) * (imageCanvas.width / rect.width),
        y: (e.clientY - rect.top) * (imageCanvas.height / rect.height)
    };
}

function onMouseDown(e) {
    if (!hasImage) return;
    
    // Panning Logic (Shift + Drag)
    if (isShiftPressed) {
        isPanning = true;
        panStart = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        return;
    }

    const pos = getMousePos(e);

    // Source Selection Logic (Alt + Click)
    if (e.altKey || isAltPressed) {
        sourcePoint = { x: pos.x, y: pos.y };
        isSourceSet = true;
        drawCursorOverlay();
        showToast('Source point set', 1000);
        return;
    }

    // Drawing Logic
    if (!isSourceSet) {
        showToast('Alt+Click first to set source!');
        return;
    }

    isDrawing = true;
    dragStartPoint = { x: pos.x, y: pos.y };
    saveState();
    performClone(pos.x, pos.y);
}

function onMouseMove(e) {
    if (!hasImage) return;

    // Panning
    if (isPanning && isShiftPressed) {
        pan.x = e.clientX - panStart.x;
        pan.y = e.clientY - panStart.y;
        updateTransform(); // This updates visual position
        return; // Don't draw cursor while panning
    }

    // Calculate if over canvas
    const rect = imageCanvas.getBoundingClientRect();
    const isInBounds = e.clientX >= rect.left && e.clientX <= rect.right && 
                       e.clientY >= rect.top && e.clientY <= rect.bottom;

    if (!isInBounds && !isDrawing) {
        cCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
        return;
    }

    const pos = getMousePos(e);

    if (isDrawing) {
        performClone(pos.x, pos.y);
    }

    drawCursorOverlay(pos.x, pos.y);
}

function onMouseUp(e) {
    isDrawing = false;
    isPanning = false;
}

// --- Core Clone Stamp Logic ---

const tempCanvas = document.createElement('canvas');
const tCtx = tempCanvas.getContext('2d');

function performClone(targetX, targetY) {
    const dx = targetX - dragStartPoint.x;
    const dy = targetY - dragStartPoint.y;

    const sourceX = sourcePoint.x + dx;
    const sourceY = sourcePoint.y + dy;

    const r = brushSize / 2;

    tempCanvas.width = brushSize;
    tempCanvas.height = brushSize;
    tCtx.clearRect(0, 0, brushSize, brushSize);

    // 1. Copy pixels from source
    tCtx.drawImage(
        imageCanvas, 
        sourceX - r, sourceY - r, brushSize, brushSize, 
        0, 0, brushSize, brushSize
    );

    // 2. Create Mask
    tCtx.globalCompositeOperation = 'destination-in';
    
    if (brushHardness >= 0.99) {
        tCtx.fillStyle = '#000';
        tCtx.beginPath();
        tCtx.arc(r, r, r, 0, Math.PI * 2);
        tCtx.fill();
    } else {
        const gradient = tCtx.createRadialGradient(r, r, r * (1 - brushHardness), r, r, r);
        gradient.addColorStop(0, 'rgba(0,0,0,1)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        tCtx.fillStyle = gradient;
        tCtx.fillRect(0, 0, brushSize, brushSize);
    }

    // 3. Apply to canvas
    ctx.globalAlpha = brushOpacity;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(
        tempCanvas, 
        0, 0, brushSize, brushSize, 
        targetX - r, targetY - r, brushSize, brushSize
    );
    
    ctx.globalAlpha = 1.0;
}

// --- Cursor Overlay Logic (Zoom Aware) ---

function drawCursorOverlay(mouseX, mouseY) {
    cCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

    // Calculate Current Visual Scale
    // We need this to keep the cursor looking consistent on screen
    const rect = imageCanvas.getBoundingClientRect();
    // How many screen pixels is one image pixel?
    const pixelRatio = rect.width / imageCanvas.width; 

    if (isSourceSet) {
        const s = sourcePoint;
        // Draw Source Marker
        // The source marker should also scale, but we want lines to remain 1px on screen
        // So we divide line width by pixelRatio
        const lw = 1 / pixelRatio;
        
        cCtx.strokeStyle = '#fff';
        cCtx.lineWidth = lw;
        cCtx.beginPath();
        cCtx.moveTo(s.x - 10/pixelRatio, s.y);
        cCtx.lineTo(s.x + 10/pixelRatio, s.y);
        cCtx.moveTo(s.x, s.y - 10/pixelRatio);
        cCtx.lineTo(s.x, s.y + 10/pixelRatio);
        cCtx.stroke();

        cCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        cCtx.beginPath();
        cCtx.arc(s.x, s.y, (brushSize / 2), 0, Math.PI * 2);
        cCtx.stroke();
    }

    if (mouseX !== undefined && mouseY !== undefined) {
        // Draw Brush Cursor
        // We want the brush circle to represent the actual brush size in image pixels.
        // So we just draw at brushSize.
        // BUT, the border width needs to be 1px on screen.
        
        const lw = 1 / pixelRatio;
        
        cCtx.strokeStyle = '#000';
        cCtx.lineWidth = lw + 1/pixelRatio; // slightly thicker for visibility
        cCtx.beginPath();
        cCtx.arc(mouseX, mouseY, brushSize / 2, 0, Math.PI * 2);
        cCtx.stroke();

        cCtx.strokeStyle = '#fff';
        cCtx.lineWidth = lw;
        cCtx.setLineDash([5/pixelRatio, 5/pixelRatio]); // Dashed pattern scales too
        cCtx.stroke();
        cCtx.setLineDash([]);

        if (isAltPressed) {
            cCtx.fillStyle = '#fff';
            // Font size should be constant on screen
            const fontSize = 12 / pixelRatio; 
            cCtx.font = `${fontSize}px sans-serif`;
            cCtx.fillText("Set Source", mouseX + 10/pixelRatio, mouseY - 10/pixelRatio);
        }
    }
}

// --- History ---

function saveState() {
    if (historyStep < history.length - 1) {
        history = history.slice(0, historyStep + 1);
    }
    history.push(ctx.getImageData(0, 0, imageCanvas.width, imageCanvas.height));
    historyStep++;
    if (history.length > maxHistory) {
        history.shift();
        historyStep--;
    }
    updateUndoButton();
}

function undo() {
    if (historyStep > 0) {
        historyStep--;
        ctx.putImageData(history[historyStep], 0, 0);
        updateUndoButton();
    } else if (historyStep === 0) {
        resetImage();
    }
}

function updateUndoButton() {
    undoBtn.disabled = historyStep <= 0;
}

function resetImage() {
    if (history.length > 0) {
        ctx.putImageData(history[0], 0, 0);
        history = [history[0]];
        historyStep = 0;
        updateUndoButton();
        isSourceSet = false;
        drawCursorOverlay();
    }
}

// --- Download ---

function downloadImage() {
    if (!hasImage) return;
    const link = document.createElement('a');
    link.download = 'edited-image.png';
    link.href = imageCanvas.toDataURL('image/png');
    link.click();
    showToast('Image downloaded successfully!');
}

// --- Utilities ---

function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

init();
