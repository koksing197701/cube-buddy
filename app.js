// Cube Buddy - App Logic
// Pure JS: rendering, game state, tutorials, animations

const CHARACTERS = [
  { id: 'bobby', name: 'Bobby', emoji: '🧸', color: '#6c63ff' },
  { id: 'kitty', name: 'Kitty', emoji: '🐱', color: '#ff6b81' },
  { id: 'felix', name: 'Felix', emoji: '🦊', color: '#ffa502' },
  { id: 'panda', name: 'Panda', emoji: '🐼', color: '#2ed573' },
];

// Face layout: cross net with 4 B cards
// Grid: 5 rows x 4 cols
// Row -1: [B top]
// Row  0: [U]
// Row  1: [L] [F] [R]
// Row  2: [D]
// Row  3: [B real]
// Col -1: [B left] (row 1)
// Col  3: [B right] (row 1)

// Face definitions: {faceIdx, row, col, mirror, swapRows}
const FACE_SPECS_CLASSIC = [
  // Standard faces
  { faceIdx: 0, row: 0, col: 1, mirror: false, swapRows: false }, // U
  { faceIdx: 4, row: 1, col: 0, mirror: false, swapRows: false }, // L
  { faceIdx: 2, row: 1, col: 1, mirror: false, swapRows: false }, // F
  { faceIdx: 5, row: 1, col: 2, mirror: false, swapRows: false }, // R
  { faceIdx: 1, row: 2, col: 1, mirror: false, swapRows: false }, // D
  // B cards - same face data (3), different visual mappings
  { faceIdx: 3, row: 3, col: 1, mirror: true,  swapRows: true  }, // B real (180° rot)
  { faceIdx: 3, row: -1, col: 1, mirror: true,  swapRows: true  }, // B top (180° rot)
  { faceIdx: 3, row: 1, col: -1, mirror: false, swapRows: false }, // B left (identity)
  { faceIdx: 3, row: 1, col: 3, mirror: false, swapRows: false }, // B right (identity)
];

// Focus view: only the 5 visible faces (no B cards) — bigger stickers, less clutter
const FACE_SPECS_FOCUS = [
  { faceIdx: 0, row: 0, col: 1, mirror: false, swapRows: false }, // U
  { faceIdx: 4, row: 1, col: 0, mirror: false, swapRows: false }, // L
  { faceIdx: 2, row: 1, col: 1, mirror: false, swapRows: false }, // F
  { faceIdx: 5, row: 1, col: 2, mirror: false, swapRows: false }, // R
  { faceIdx: 1, row: 2, col: 1, mirror: false, swapRows: false }, // D
];

const FACE_BORDER_COLORS = ['#FAFAFA', '#FFD500', '#4CAF50', '#2196F3', '#FF6600', '#F44336'];

class CubeBuddyApp {
  constructor() {
    this.cube = new RubiksCube();
    this.selectedChar = 'bobby';
    this.moves = 0;
    this.stars = 0;
    this.tutorialStep = 0;
    this.showTutorial = false;
    this.showCelebration = false;
    this.showColorGuide = true;
    this._viewMode = '2d'; // '2d' = 9-face classic, '3d' = 3D
    this._cube3d = null; // CubeBuddy3D instance
    this._focusMode = false; // false = classic 9-face, true = focus 5-face

    // Undo history: array of {state, moves} snapshots, max 5
    this._history = [];
    // Snapshots: array of {name, state, moves}, max 3
    this._snapshots = [];

    this._init();
  }

  _init() {
    this._cacheDom();
    this._setupHome();
    this._setupPlay();
    // Restore persisted state after DOM setup is complete
    this._loadFromLocalStorage();
    this._loadSnapshotsFromStorage();
    this._renderHome();
  }

  _cacheDom() {
    this.homeScreen = document.getElementById('home-screen');
    this.playScreen = document.getElementById('play-screen');
    this.cubeContainer = document.getElementById('cube-container');
    this.cube3dContainer = document.getElementById('cube-3d-container');
    this.characterScroll = document.getElementById('character-scroll');
    this.stageList = document.getElementById('stage-list');
    this.homeStars = document.getElementById('home-stars');

    // Play screen
    this.charNameEl = document.getElementById('play-char-name');
    this.playStars = document.getElementById('play-stars');
    this.moveCount = document.getElementById('move-count');
    this.mixBtn = document.getElementById('mix-btn');
    this.undoBtn = document.getElementById('undo-btn');
    this.backBtn = document.getElementById('back-btn');
    this.solvedBadge = document.getElementById('solved-badge');
    this.snapshotContainer = document.getElementById('snapshot-container');

    // Overlays
    this.tutorialOverlay = document.getElementById('tutorial-overlay');
    this.tutTitle = document.getElementById('tut-title');
    this.tutDesc = document.getElementById('tut-desc');
    this.tutDots = document.getElementById('tut-dots');
    this.skipBtn = document.getElementById('skip-btn');
    this.nextBtn = document.getElementById('next-btn');

    this.celebrationOverlay = document.getElementById('celebration-overlay');
    this.celebMsg = document.getElementById('celeb-msg');
    this.okBtn = document.getElementById('ok-btn');
    this.confettiContainer = document.getElementById('confetti-container');

    // Zoom & focus
    this.fullBtn = document.getElementById('full-btn');
    this.focusBtn = document.getElementById('focus-btn');
    this.controls2d = document.getElementById('controls-2d');
    this.cubeArea = document.getElementById('cube-area');
  }

  // ==================== HOME ====================

  _setupHome() {
    // Render characters
    this.characterScroll.innerHTML = CHARACTERS.map(c => `
      <div class="character-card ${c.id === this.selectedChar ? 'selected' : ''}"
           style="--char-color: ${c.color}"
           data-char="${c.id}"
           onclick="app.selectCharacter('${c.id}')">
        <div class="char-bg" style="background: ${c.id === this.selectedChar ? c.color + '40' : 'rgba(255,255,255,0.1)'}">
          <div class="char-emoji">${c.emoji}</div>
        </div>
        <div class="char-name">${c.name}</div>
      </div>
    `).join('');

    // Render stages
    const stages = [
      { title: 'Free Play', subtitle: 'Spin & explore!', icon: '🎮', index: 0 },
      { title: 'Stage 1', subtitle: 'Make a white cross', icon: '1️⃣', index: 1 },
      { title: 'Stage 2', subtitle: 'Complete white face', icon: '2️⃣', index: 2 },
      { title: 'Stage 3', subtitle: 'Middle layer', icon: '3️⃣', index: 3 },
    ];

    this.stageList.innerHTML = stages.map((s, i) => `
      <div class="stage-card" onclick="app.startStage(${s.index})">
        <div class="stage-icon" style="background: ${CHARACTERS[i % CHARACTERS.length].color}20; color: ${CHARACTERS[i % CHARACTERS.length].color}">
          ${s.icon}
        </div>
        <div class="stage-info">
          <div class="stage-title">${s.title}</div>
          <div class="stage-subtitle">${s.subtitle}</div>
        </div>
        <button class="play-btn" style="background: linear-gradient(135deg, ${CHARACTERS[i % CHARACTERS.length].color}, ${CHARACTERS[i % CHARACTERS.length].color}cc)">
          Play
        </button>
      </div>
    `).join('');
  }

  selectCharacter(id) {
    this.selectedChar = id;
    this._renderHome();
  }

  startStage(index) {
    this.moves = 0;
    this.cube = new RubiksCube();
    this._history = [];
    this.showTutorial = index === 0;
    this.showColorGuide = true;
    this.solvedBadge.style.display = 'none';

    // Scramble based on stage
    const scrambleCount = [12, 4, 6, 8][Math.min(index, 3)];
    this.cube.scramble(scrambleCount);

    this._enterPlay();
  }

  _renderHome() {
    // Update character cards
    document.querySelectorAll('.character-card').forEach(el => {
      const id = el.dataset.char;
      const isSel = id === this.selectedChar;
      el.classList.toggle('selected', isSel);
      el.querySelector('.char-bg').style.background = isSel
        ? el.style.getPropertyValue('--char-color') + '40'
        : 'rgba(255,255,255,0.1)';
    });

    this.homeStars.textContent = this.stars;
  }

  // ==================== PLAY ====================

  _enterPlay() {
    this.homeScreen.style.display = 'none';
    this.playScreen.classList.add('active');
    this.charNameEl.textContent = this.selectedChar;
    this.playStars.textContent = this.stars;
    this.moveCount.textContent = this.moves;

    this._renderCube();
    this._updateControls();
    this._renderSnapshotSlots();
    this._updateUndoBtn();
    // Set initial view tab (2d) without re-rendering
    this._viewMode = '2d';
    this.cubeContainer.style.display = 'flex';
    this.cube3dContainer.style.display = 'none';
    this.faceButtons.style.display = 'none';
    if (this.controls2d) this.controls2d.style.display = 'flex';
    this._update3DFaceButtons();
    if (this.viewBtns) {
      for (const [id, btn] of Object.entries(this.viewBtns)) {
        btn.classList.toggle('active', id === '2d');
      }
    }

    if (this.showTutorial) {
      this.tutorialStep = 0;
      this._showTutorialOverlay();
    }

    // Set up touch handling once
    if (!this._touchSetup) {
      this._setupCubeTouch();
      this._touchSetup = true;
    }
  }

  _setupPlay() {
    this.backBtn.addEventListener('click', () => this._exitPlay());
    this.mixBtn.addEventListener('click', () => this._scramble());
    this.undoBtn.addEventListener('click', () => this._undo());
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', () => this.resetCube());
    const debugBtn = document.getElementById('debug-btn');
    if (debugBtn) debugBtn.addEventListener('click', () => this._toggleDebug());
    this.viewBtns = {
      '3d': document.getElementById('view-3d'),
      '2d': document.getElementById('view-2d'),
    };
    this.viewBtns['3d'].addEventListener('click', () => this._setView('3d'));
    this.viewBtns['2d'].addEventListener('click', () => this._setView('2d'));
    this.faceButtons = document.getElementById('face-buttons');
    this.okBtn.addEventListener('click', () => this._dismissCelebration());
    this.skipBtn.addEventListener('click', () => this._dismissTutorial());
    this.nextBtn.addEventListener('click', () => this._nextTutorialStep());
    this.rememberCheck = document.getElementById('tut-remember');

    // Full / Focus buttons (2D mode selection)
    this.fullBtn.addEventListener('click', () => {
      if (this._focusMode) {
        this._focusMode = false;
        this.fullBtn.classList.add('active');
        this.focusBtn.classList.remove('active');
        this._renderCube();
      }
    });
    this.focusBtn.addEventListener('click', () => {
      if (!this._focusMode) {
        this._focusMode = true;
        this.focusBtn.classList.add('active');
        this.fullBtn.classList.remove('active');
        this._renderCube();
      }
    });
  }

  _exitPlay() {
    this.playScreen.classList.remove('active');
    this.homeScreen.style.display = 'flex';
    this._destroy3D();
    this._viewMode = '2d';
    this.cubeContainer.style.display = 'flex';
    this.cube3dContainer.style.display = 'none';
    this.faceButtons.style.display = 'none';
    if (this.controls2d) this.controls2d.style.display = 'flex';
    this._update3DFaceButtons();
    this._saveToLocalStorage();
    this._saveSnapshotsToStorage();
    this._renderHome();
  }

  _scramble() {
    this.cube.scramble(8);
    this.moves = 0;
    this.showCelebration = false;
    this.showColorGuide = false;
    this.solvedBadge.style.display = 'none';
    this._history = [];
    this._renderCube();
    this._updateControls();
    this._sync3D();
    this._saveToLocalStorage();
  }

  _setView(mode) {
    // Destroy 3D if leaving
    if (this._viewMode === '3d' && mode !== '3d') {
      this._destroy3D();
    }

    this._viewMode = mode;

    // Update tab buttons
    for (const [id, btn] of Object.entries(this.viewBtns)) {
      btn.classList.toggle('active', id === mode);
    }

    if (mode === '3d') {
      this.cubeContainer.style.display = 'none';
      this.cube3dContainer.style.display = 'flex';
      this.faceButtons.style.display = 'flex';
      this.controls2d.style.display = 'none';
      this._update3DFaceButtons();
      this._init3D();
    } else {
      this.cubeContainer.style.display = 'flex';
      this.cube3dContainer.style.display = 'none';
      this.faceButtons.style.display = 'none';
      this.controls2d.style.display = 'flex';
      this._renderCube();
    }
    this._updateControls();
  }

  // ==================== CUBE RENDERER ====================

  _init3D() {
    if (this._cube3d) { this._destroy3D(); }
    // Check THREE is globally available from CDN script
    if (typeof THREE === 'undefined') {
      console.error('THREE not loaded');
      return;
    }
    this._cube3d = new CubeBuddy3D({
      container: this.cube3dContainer,
      cube: this.cube,
      onTurn: (move) => {
        this.moves++;
        this.moveCount.textContent = this.moves;
        if (this.cube.isSolved) {
          this.stars++;
          this._showCelebration();
        }
      },
      onMovesChange: (m) => {
        this.moveCount.textContent = m;
        if (this.cube.isSolved) {
          this.stars++;
          this._showCelebration();
        }
      },
    });
    this._cube3d.rebuild();
    this._cube3d.moves = this.moves;
    // Connect debug if ON
    this._ensure3DDebug();
    // Set up face button snapshots for 3D
    this._update3DFaceButtons();
  }

  _destroy3D() {
    if (this._cube3d) {
      this._cube3d.destroy();
      this._cube3d = null;
    }
  }

  _update3DFaceButtons() {
    const centerIndices = [4, 13, 22, 31, 40, 49];
    const colorNames = ['U','D','F','B','L','R'];
    const self = this;
    const update = () => {
      if (!self.cube) return;
      const state = self.cube.state;
      const colorToFace = {};
      for (let fi = 0; fi < 6; fi++) {
        colorToFace[state[centerIndices[fi]]] = fi;
      }
      for (let ci = 0; ci < 6; ci++) {
        const btn = document.querySelector(`.b${colorNames[ci]}`);
        if (btn) {
          const target = FACE_LETTERS[colorToFace[ci]];
          btn.dataset.snapTarget = target;
          btn.onclick = () => {
            if (self._cube3d) {
              self._cube3d.snapToFace(target);
            } else {
              // 2D mode: highlight the corresponding face
              const faces = self.cubeContainer.querySelectorAll('.cube-face');
              faces.forEach(f => f.classList.remove('highlighted'));
              // Find face with matching faceIdx from FACE_LETTERS
              const targetIdx = FACE_LETTERS.indexOf(target);
              faces.forEach(f => {
                if (parseInt(f.dataset.faceIdx) === targetIdx) {
                  f.classList.add('highlighted');
                }
              });
            }
          };
        }
      }
    };
    update();
    // Override doMove in cube to call update after each move
    const origDoMove = this.cube.doMove.bind(this.cube);
    this.cube.doMove = (move) => {
      origDoMove(move);
      if (this._cube3d) {
        this._cube3d.rebuild();
        this._cube3d.moves = this.moves;
      }
      update();
    };
  }

  _sync3D() {
    if (this._cube3d) {
      this._cube3d.rebuild();
      this._cube3d.moves = this.moves;
      this._update3DFaceButtons();
    }
  }

  _renderCube() {
    const container = this.cubeContainer;
    const rect = container.getBoundingClientRect();
    const availW = rect.width;
    const availH = rect.height;

    if (availW <= 0 || availH <= 0) return;

    // Compute sticker size that fits the full 9-face cross net — bigger faces, less breathing room
    const faceSpecs = this._focusMode ? FACE_SPECS_FOCUS : FACE_SPECS_CLASSIC;
    const widthDivisor = this._focusMode ? 10.5 : 17;
    const rawSize = Math.min(availW / widthDivisor, availH / 5.5);
    const stickerSize = Math.floor(Math.min(rawSize, 110));
    if (stickerSize < 10) return;

    const gap = Math.max(1, Math.floor(stickerSize * 0.05));    // thin border between stickers
    const faceMargin = Math.floor(stickerSize * 0.4);          // space between faces — restored
    const borderExtra = Math.floor(stickerSize * 0.35);         // thicker border wrapping each face
    const stickerPitch = stickerSize + gap;
    const faceWidth = 2 * stickerPitch + stickerSize;
    const facePitch = faceWidth + faceMargin;

    // Clear previous
    container.innerHTML = '';

    // Wrap everything in a container
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.position = 'relative';

    const cx = availW / 2;
    const cy = availH / 2;

    const pos = (row, col) => ({
      x: cx + (col - 1) * facePitch,
      y: cy + (row - 1) * facePitch,
    });

    // Render each face
    faceSpecs.forEach(spec => {
      const center = pos(spec.row, spec.col);
      this._drawFace(container, center.x, center.y, spec, stickerSize, stickerPitch, faceWidth, borderExtra);
    });

    // Center the net
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
  }

  _drawFace(container, cx, cy, spec, stickerSize, stickerPitch, faceWidth, borderExtra) {
    const { faceIdx, mirror, swapRows } = spec;

    // Face wrapper
    const faceEl = document.createElement('div');
    faceEl.className = 'cube-face';
    faceEl.style.left = `${cx - (faceWidth + borderExtra) / 2}px`;
    faceEl.style.top = `${cy - (faceWidth + borderExtra) / 2}px`;
    faceEl.style.width = `${faceWidth + borderExtra}px`;
    faceEl.style.height = `${faceWidth + borderExtra}px`;
    faceEl.style.gridGap = `${stickerPitch - stickerSize}px`;
    const borderWidth = Math.max(2, Math.floor(stickerSize * 0.08));
    faceEl.style.border = `${borderWidth}px solid ${FACE_BORDER_COLORS[faceIdx]}`;
    // Padding accounts for border inside border-box: pad = borderExtra/2 - borderWidth
    const padPx = Math.max(0, Math.floor(borderExtra / 2 - borderWidth));
    faceEl.style.padding = `${padPx}px`;
    faceEl.style.borderRadius = `${Math.floor(stickerSize * 0.28)}px`;
    faceEl.style.background = 'transparent';

    // Store face data for hit testing
    faceEl.dataset.faceIdx = faceIdx;
    faceEl.dataset.cx = cx;
    faceEl.dataset.cy = cy;
    const facePitch = faceWidth + (stickerSize * 0.5); // faceWidth + faceMargin
    faceEl.dataset.facePitch = facePitch;
    faceEl.style.position = 'absolute';

    // 3x3 sticker grid
    faceEl.style.display = 'grid';
    faceEl.style.gridTemplateColumns = 'repeat(3, 1fr)';
    faceEl.style.gridTemplateRows = 'repeat(3, 1fr)';
    faceEl.style.placeItems = 'center';

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const drawRow = swapRows ? (2 - row) : row;
        const drawCol = mirror ? (2 - col) : col;
        // Always use face's own color for center sticker (slice moves move centers, but 2D stays fixed)
        const colorIdx = (row === 1 && col === 1)
          ? faceIdx
          : this.cube.getFaceletColor(faceIdx, drawRow, drawCol);

        const sticker = document.createElement('div');
        sticker.className = 'sticker';
        sticker.style.width = `${stickerSize}px`;
        sticker.style.height = `${stickerSize}px`;
        sticker.style.borderRadius = `${Math.floor(stickerSize * 0.15)}px`;

        // Inner with background color
        const inner = document.createElement('div');
        inner.className = 'sticker-inner';
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.style.background = FACE_COLORS[colorIdx];
        inner.style.borderRadius = `${Math.floor(stickerSize * 0.12)}px`;
        inner.style.boxShadow = 'inset 0 1px 2px rgba(255,255,255,0.2), 0 1px 2px rgba(0,0,0,0.3)';
        inner.style.display = 'flex';
        inner.style.alignItems = 'center';
        inner.style.justifyContent = 'center';

        // Center letter (only on center sticker)
        if (row === 1 && col === 1) {
          const label = document.createElement('div');
          label.className = 'sticker-label';
          const isLight = faceIdx === 0 || faceIdx === 1;
          label.style.color = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)';
          label.style.fontSize = `${Math.floor(stickerSize * 0.44)}px`;
          label.textContent = FACE_LETTERS[faceIdx];
          inner.appendChild(label);
        }

        sticker.appendChild(inner);
        faceEl.appendChild(sticker);
      }
    }

    container.appendChild(faceEl);
  }

  // ==================== TOUCH HANDLING ====================

  _setupCubeTouch() {
    // ResizeObserver re-renders cube on container resize / browser zoom
    this._resizeObserver = new ResizeObserver(() => {
      if (this.playScreen && this.playScreen.classList.contains('active')) {
        this._renderCube();
      }
    });
    this._resizeObserver.observe(this.cubeContainer);

    let touchStartX, touchStartY;
    let touchStartFace = null; // face index where touch started
    let lastTapTime = 0;
    let tapPending = false;

    const handleTap = (x, y, isDoubleTap) => {
      const face = this._hitTestFace(x, y);
      if (face !== null) {
        const move = ['U', 'D', 'F', 'B', 'L', 'R'][face];
        this._doMove(move, isDoubleTap);
      }
    };

    const onPointerDown = (x, y) => {
      touchStartX = x;
      touchStartY = y;
      touchStartFace = this._hitTestFace(x, y); // which face the touch started on
      if (touchStartFace !== null) {
        // Resolve which cell (row,col) was touched within the face
        const cell = this._resolveCell(x, y, touchStartFace);
        if (cell) {
          this._debugLog(`2D DOWN: ${['U','D','F','B','L','R'][touchStartFace]}(${cell.row},${cell.col})`);
        } else {
          this._debugLog(`2D DOWN: ${['U','D','F','B','L','R'][touchStartFace]} at (${x.toFixed(0)},${y.toFixed(0)})`);
        }
      }
    };

    const onPointerUp = (x, y) => {
      if (touchStartX === undefined) return;

      const dx = x - touchStartX;
      const dy = y - touchStartY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist >= 10 && touchStartFace !== null) {
        const dirLabel = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? '→' : '←') : (dy > 0 ? '↓' : '↑');
        this._debugLog(`2D SWIPE: ${['U','D','F','B','L','R'][touchStartFace]} ${dirLabel} dist=${dist.toFixed(0)}`);
      }

      if (dist < 10) {
        // It's a tap — check for double tap
        const now = Date.now();
        if (now - lastTapTime < 350) {
          // Double tap! Cancel the pending single tap
          if (tapPending) {
            clearTimeout(tapPending);
            tapPending = false;
          }
          handleTap(x, y, true);
          lastTapTime = 0;
        } else {
          // First tap — wait to see if it's a double tap
          lastTapTime = now;
          tapPending = setTimeout(() => {
            handleTap(x, y, false);
            tapPending = false;
            lastTapTime = 0;
          }, 400);
        }
      } else if (dist >= 10) {
        // B face: no swipe — only tap + button controls
        if (touchStartFace === 3) {
          touchStartX = undefined;
          touchStartY = undefined;
          touchStartFace = null;
          return;
        }
        // Try row/column swipe on the starting face first
        const swipedFace = this._resolveSwipeOnFace(
          touchStartX, touchStartY,
          dx, dy, touchStartFace
        );
        if (swipedFace) {
          this._debugLog(`2D → resolved: ${swipedFace}`);
          // Swipe direction determines CW vs CCW.
          // Each adjacent-face edge has a specific swipe direction that
          // turns the target face CW (based on physical cube geometry).
          const SWIPE_CW_DIR = {
            // F center → U/D/L/R
            2: { row0: 'left', row2: 'right', col0: 'down', col2: 'up' },
            // U → B/F/L/R
            0: { row0: 'left', row2: 'right', col0: 'down', col2: 'up' },
            // D → F/L/R/B
            1: { row0: 'left', row2: 'right', col0: 'down', col2: 'up' },
            // L → U/D/B/F
            4: { row0: 'left', row2: 'right', col0: 'down', col2: 'up' },
            // R → U/D/F/B
            5: { row0: 'left', row2: 'right', col0: 'down', col2: 'up' },
            // B → U/D/R/L (mirrored: col0=R, col2=L)
            3: { row0: 'left', row2: 'right', col0: 'down', col2: 'up' },
          };
          const isHorizontal = Math.abs(dx) >= Math.abs(dy);
          const swipeDir = isHorizontal
            ? (dx > 0 ? 'right' : 'left')
            : (dy > 0 ? 'down' : 'up');
          // Determine which edge was used on the start face
          // Priority: for horizontal swipes → check row edges first
          //           for vertical swipes → check col edges first
          const rect = this.cubeContainer.querySelectorAll('.cube-face');
          let targetEl = null;
          rect.forEach(el => {
            if (parseInt(el.dataset.faceIdx) === touchStartFace) targetEl = el;
          });
          let edgeKey = null;
          if (targetEl) {
            const r = targetEl.getBoundingClientRect();
            const style = getComputedStyle(targetEl);
            const padLeft = parseFloat(style.paddingLeft) || 0;
            const padTop = parseFloat(style.paddingTop) || 0;
            const borderLeft = parseFloat(style.borderLeftWidth) || 0;
            const borderTop = parseFloat(style.borderTopWidth) || 0;
            const insetX = padLeft + borderLeft;
            const insetY = padTop + borderTop;
            const innerW = Math.max(1, r.width - 2 * insetX);
            const innerH = Math.max(1, r.height - 2 * insetY);
            const localX = touchStartX - r.left - insetX;
            const localY = touchStartY - r.top - insetY;
            const cellW = innerW / 3;
            const cellH = innerH / 3;
            const col = Math.max(0, Math.min(2, Math.floor(localX / cellW)));
            const row = Math.max(0, Math.min(2, Math.floor(localY / cellH)));
            if (isHorizontal) {
              // Horizontal swipe → row edges matter most
              if (row === 0) edgeKey = 'row0';
              else if (row === 2) edgeKey = 'row2';
              else if (col === 0) edgeKey = 'col0';
              else if (col === 2) edgeKey = 'col2';
            } else {
              // Vertical swipe → col edges matter most
              if (col === 0) edgeKey = 'col0';
              else if (col === 2) edgeKey = 'col2';
              else if (row === 0) edgeKey = 'row0';
              else if (row === 2) edgeKey = 'row2';
            }
            // Middle → turning the start face itself, use base rule
          }
          let isCcw;
          if (edgeKey && SWIPE_CW_DIR[touchStartFace]?.[edgeKey]) {
            // Adjacent face: CW = matching the lookup direction
            isCcw = swipeDir !== SWIPE_CW_DIR[touchStartFace][edgeKey];
          } else {
            // Same face (middle row/col): base rule
            // left→right = CCW, right→left = CW
            // top→bottom = CW, bottom→top = CCW
            isCcw = isHorizontal ? swipeDir === 'right' : swipeDir !== 'down';
          }
          this._doMove(swipedFace, isCcw); // true = 3 CW turns = 1 CCW
        }
      }

      touchStartX = undefined;
      touchStartY = undefined;
      touchStartFace = null;
    };

    // Touch — set flag so we can ignore synthetic mouse events
    let fromTouch = false;
    let touchResetTimer = null;
    this.cubeContainer.addEventListener('touchstart', e => {
      fromTouch = true;
      clearTimeout(touchResetTimer);
      const t = e.touches[0];
      onPointerDown(t.clientX, t.clientY);
    }, { passive: true });

    this.cubeContainer.addEventListener('touchmove', e => {
      // Prevent default scrolling so vertical swipes aren't stolen by browser scroll
      if (e.touches.length === 1 && touchStartX !== undefined) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        if (Math.abs(dy) > 10 || Math.abs(dx) > 10) {
          e.preventDefault();
        }
      }
    }, { passive: false });

    this.cubeContainer.addEventListener('touchend', e => {
      const t = e.changedTouches[0];
      onPointerUp(t.clientX, t.clientY);
      clearTimeout(touchResetTimer);
      touchResetTimer = setTimeout(() => { fromTouch = false; }, 500);
    }, { passive: true });

    this.cubeContainer.addEventListener('touchcancel', e => {
      touchStartX = undefined;
      touchStartY = undefined;
      touchStartFace = null;
      if (tapPending) {
        clearTimeout(tapPending);
        tapPending = false;
        lastTapTime = 0;
      }
    }, { passive: true });

    // Mouse — ignore if a touch event just fired (avoids double-fire on mobile)
    this.cubeContainer.addEventListener('mousedown', e => {
      if (fromTouch) return;
      onPointerDown(e.clientX, e.clientY);
    });
    this.cubeContainer.addEventListener('mouseup', e => {
      if (fromTouch) {
        fromTouch = false;
        return;
      }
      onPointerUp(e.clientX, e.clientY);
    });
  }

  // Resolve a swipe gesture on a face into an adjacent face turn.
  // Returns the move letter (e.g. 'U', 'R') or null.
  // Face adjacency in cross-net Focus layout:
  //   U is above F, D below F, L left of F, R right of F
  //   U connects to L/R at its sides
  //   D connects to L/R at its sides
  //   L connects to U/D at its top/bottom
  //   R connects to U/D at its top/bottom
  _resolveSwipeOnFace(startX, startY, dx, dy, startFace) {
    if (startFace === null || startFace === 3) return null;

    // Get the face's DOM element
    const faceEls = this.cubeContainer.querySelectorAll('.cube-face');
    let targetEl = null;
    faceEls.forEach(el => {
      if (parseInt(el.dataset.faceIdx) === startFace) {
        targetEl = el;
      }
    });
    if (!targetEl) return null;

    const rect = targetEl.getBoundingClientRect();
    const isHorizontal = Math.abs(dx) >= Math.abs(dy);

    // Determine which row/column within the face the touch started on
    // Account for border/padding (border-box) so 3x3 grid aligns with stickers
    const style = getComputedStyle(targetEl);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padTop = parseFloat(style.paddingTop) || 0;
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const insetX = padLeft + borderLeft;
    const insetY = padTop + borderTop;
    const innerW = Math.max(1, rect.width - 2 * insetX);
    const innerH = Math.max(1, rect.height - 2 * insetY);
    const localX = startX - rect.left - insetX;
    const localY = startY - rect.top - insetY;
    const cellW = innerW / 3;
    const cellH = innerH / 3;
    const touchCol = Math.floor(localX / cellW);
    const touchRow = Math.floor(localY / cellH);
    const col = Math.max(0, Math.min(2, touchCol));
    const row = Math.max(0, Math.min(2, touchRow));

    // Adjacency mapping for Focus view cross net layout:
    //          U (r0,c1)
    //     L(r1,c0) F(r1,c1) R(r1,c2)
    //          D (r2,c1)
    // Face indices: 0=U, 1=D, 2=F, 3=B, 4=L, 5=R
    const ADJACENT = {
      2: { // F center
        row0: 0, // top row → U
        row2: 1, // bottom row → D
        col0: 4, // left col → L
        col2: 5, // right col → R
      },
      0: { // U (top of net)
        row0: 3, // top row → B
        row2: 2, // bottom row → F
        col0: 4, // left col → L
        col2: 5, // right col → R
      },
      1: { // D (bottom of net)
        row0: 2, // top row → F
        row2: 3, // bottom row → B
        col0: 4, // left col → L
        col2: 5, // right col → R
      },
      4: { // L (left of net)
        row0: 0, // top row → U
        row2: 1, // bottom row → D
        col0: 3, // left col → B
        col2: 2, // right col → F
      },
      5: { // R (right of net)
        row0: 0, // top row → U
        row2: 1, // bottom row → D
        col0: 2, // left col → F
        col2: 3, // right col → B
      },
      3: { // B (back face) — no edge adjacencies, always falls through to self-turn
      },
    };

    const adj = ADJACENT[startFace];
    if (!adj) return ['U', 'D', 'F', 'B', 'L', 'R'][startFace];

    // LOGIC: The row/column of the touch tells us WHICH EDGE.
    // For horizontal swipes, the ROW matters (top/bottom edge).
    // For vertical swipes, the COLUMN matters (left/right edge).
    let targetFace = null;

    // B face position-specific adjacency — REMOVED, too complex with 4 B card positions
    // B face swipes fall through to standard ADJACENT (self-turn = B face turns)

    if (targetFace === null) {
      if (isHorizontal) {
        // Horizontal swipe: direction determines target
        if (dx > 0) {
          // Swiping right: if any edge on right side, turn right-face
          if (col === 2 && adj.col2 !== null) {
            targetFace = adj.col2;
          } else if (row === 0 && adj.row0 !== null) {
            targetFace = adj.row0;
          } else if (row === 2 && adj.row2 !== null) {
            targetFace = adj.row2;
          }
        } else {
          // Swiping left: if any edge on left side, turn left-face
          if (col === 0 && adj.col0 !== null) {
            targetFace = adj.col0;
          } else if (row === 0 && adj.row0 !== null) {
            targetFace = adj.row0;
          } else if (row === 2 && adj.row2 !== null) {
            targetFace = adj.row2;
          }
        }
      } else {
        // Vertical swipe: direction determines target
        if (dy > 0) {
          // Swiping down: if any edge on bottom, turn bottom-face
          if (row === 2 && adj.row2 !== null) {
            targetFace = adj.row2;
          } else if (col === 0 && adj.col0 !== null) {
            targetFace = adj.col0;
          } else if (col === 2 && adj.col2 !== null) {
            targetFace = adj.col2;
          }
        } else {
          // Swiping up: if any edge on top, turn top-face
          if (row === 0 && adj.row0 !== null) {
            targetFace = adj.row0;
          } else if (col === 0 && adj.col0 !== null) {
            targetFace = adj.col0;
          } else if (col === 2 && adj.col2 !== null) {
            targetFace = adj.col2;
          }
        }
      }
    }

    // Fallback: middle row/col → turn the face itself
    if (targetFace === null) {
      targetFace = startFace;
    }

    return ['U', 'D', 'F', 'B', 'L', 'R'][targetFace];
  }

  _hitTestFace(clientX, clientY) {
    const rect = this.cubeContainer.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Find nearest face center
    const faces = this.cubeContainer.querySelectorAll('.cube-face');
    let bestDist = Infinity;
    let bestFace = null;

    faces.forEach(el => {
      const cx = parseFloat(el.dataset.cx);
      const cy = parseFloat(el.dataset.cy);
      const pitch = parseFloat(el.dataset.facePitch);
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist < pitch * 0.55 && dist < bestDist) {
        bestDist = dist;
        bestFace = parseInt(el.dataset.faceIdx);
      }
    });

    return bestFace;
  }

  _resolveCell(clientX, clientY, faceIdx) {
    const faceEls = this.cubeContainer.querySelectorAll('.cube-face');
    let targetEl = null;
    faceEls.forEach(el => {
      if (parseInt(el.dataset.faceIdx) === faceIdx) {
        targetEl = el;
      }
    });
    if (!targetEl) return null;
    const rect = targetEl.getBoundingClientRect();
    const style = getComputedStyle(targetEl);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padTop = parseFloat(style.paddingTop) || 0;
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const insetX = padLeft + borderLeft;
    const insetY = padTop + borderTop;
    const innerW = Math.max(1, rect.width - 2 * insetX);
    const innerH = Math.max(1, rect.height - 2 * insetY);
    const localX = clientX - rect.left - insetX;
    const localY = clientY - rect.top - insetY;
    const col = Math.max(0, Math.min(2, Math.floor(localX / (innerW / 3))));
    const row = Math.max(0, Math.min(2, Math.floor(localY / (innerH / 3))));
    return { row, col };
  }

  _doMove(move, isDoubleTap = false) {
    // Save current state to undo history before applying move
    this._pushHistory();

    // Snapshot state before move for color-change debug
    const stateBefore = this.cube.state.slice();

    if (isDoubleTap) {
      this.cube.turnFace(move);
      this.cube.turnFace(move);
      this.cube.turnFace(move);
    } else {
      this.cube.turnFace(move);
    }

    this.moves++;
    this.showColorGuide = false;
    this._renderCube();
    this._updateControls();
    this._sync3D();
    this._saveToLocalStorage();

    // Show color changes in bottom debug
    if (this._debugVisible) {
      const stateAfter = this.cube.state;
      const faceNames = ['U','D','F','B','L','R'];
      const colorNames = ['W','Y','G','B','O','R'];
      const changes = [];
      for (let i = 0; i < 54; i++) {
        if (stateBefore[i] !== stateAfter[i]) {
          const f = Math.floor(i / 9);
          const r = Math.floor((i % 9) / 3);
          const c = i % 3;
          const fromC = colorNames[stateBefore[i]] || '?';
          const toC = colorNames[stateAfter[i]] || '?';
          changes.push(`${faceNames[f]}(${r},${c}):${fromC}→${toC}`);
        }
      }
      if (changes.length > 0) {
        this._debugLogBottom(`[${move}] ${changes.join(' ')}`);
      } else {
        this._debugLogBottom(`[${move}] no change`);
      }
    }

    // Advance tutorial
    if (this.showTutorial && this.tutorialStep === 0) {
      this.tutorialStep = 1;
      this._showTutorialOverlay();
    }

    // Check win
    if (this.cube.isSolved) {
      this.stars++;
      this._showCelebration();
    }
  }

  _updateControls() {
    this.moveCount.textContent = this.moves;
    this.playStars.textContent = this.stars;

    // View button styling is handled by _setView

    if (this.cube.isSolved) {
      this.solvedBadge.style.display = 'inline-block';
    }

  }

  // ==================== TUTORIAL ====================

  _showTutorialOverlay() {
    // Check if user has dismissed forever
    if (localStorage.getItem('cubebuddy_no_tutorial')) {
      this.showTutorial = false;
      return;
    }

    const steps = [
      { title: '🎨 Tap the cube!', desc: "Tap a colorful side to spin it! Double-tap to spin backwards!" },
      { title: '🏆 Match all colors!', desc: 'Make every side all one color to win the star! ⭐' },
    ];

    const step = steps[this.tutorialStep];
    this.tutTitle.textContent = step.title;
    this.tutDesc.innerHTML = step.desc;

    this.tutDots.innerHTML = steps.map((_, i) =>
      `<div class="tutorial-dot ${i === this.tutorialStep ? 'active' : ''}" style="width: ${i === this.tutorialStep ? '24px' : '8px'}"></div>`
    ).join('');

    this.nextBtn.textContent = this.tutorialStep < steps.length - 1 ? 'Next →' : 'Got it! 🎉';
    this.tutorialOverlay.classList.add('active');
  }

  _dismissTutorial() {
    if (this.rememberCheck && this.rememberCheck.checked) {
      localStorage.setItem('cubebuddy_no_tutorial', 'true');
    }
    this.tutorialOverlay.classList.remove('active');
    this.showTutorial = false;
  }

  _nextTutorialStep() {
    const steps = [
      { title: '🎨 Tap the cube!', desc: "Tap a colorful side to spin it! Double-tap to spin backwards!" },
      { title: '🏆 Match all colors!', desc: 'Make every side all one color to win the star! ⭐' },
    ];

    if (this.tutorialStep < steps.length - 1) {
      this.tutorialStep++;
      this._showTutorialOverlay();
    } else {
      this._dismissTutorial();
    }
  }

  // ==================== CELEBRATION ====================

  _showCelebration() {
    this.celebMsg.textContent = '🎉🌟🎊🎈🎀✨🎇';
    this.celebrationOverlay.classList.add('active');
    this._spawnConfetti();
  }

  _dismissCelebration() {
    this.celebrationOverlay.classList.remove('active');
    this.confettiContainer.innerHTML = '';
  }

  _spawnConfetti() {
    const colors = ['#FF6B81', '#FFA502', '#2ED573', '#6C63FF', '#FFEB3B', '#FF4757', '#1E90FF', '#FF69B4'];
    const container = this.confettiContainer;
    container.innerHTML = '';

    for (let i = 0; i < 80; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.width = `${6 + Math.random() * 8}px`;
      piece.style.height = `${6 + Math.random() * 8}px`;
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      piece.style.animationDuration = `${2 + Math.random() * 3}s`;
      piece.style.animationDelay = `${Math.random() * 2}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      container.appendChild(piece);
    }
  }

  // ==================== UNDO HISTORY ====================

  _pushHistory() {
    this._history.push({
      state: [...this.cube._state],
      moves: this.moves,
    });
    // Keep max 10
    if (this._history.length > 10) {
      this._history.shift();
    }
    // Update undo button state
    this._updateUndoBtn();
  }

  _undo() {
    if (this._history.length === 0) return;
    const prev = this._history.pop();
    this.cube._state = [...prev.state];
    this.moves = prev.moves;
    this.showCelebration = false;
    this.solvedBadge.style.display = 'none';
    this._renderCube();
    this._updateControls();
    this._updateUndoBtn();
    this._sync3D();
  }

  _updateUndoBtn() {
    if (this.undoBtn) {
      this.undoBtn.disabled = this._history.length === 0;
      this.undoBtn.style.opacity = this._history.length === 0 ? '0.3' : '1';
    }
  }

  resetCube() {
    this.cube.reset();
    this.moves = 0;
    this._history = [];
    this.showCelebration = false;
    this.solvedBadge.style.display = 'none';
    this._renderCube();
    this._updateControls();
    this._sync3D();
    this._saveToLocalStorage();
  }

  _toggleDebug() {
    if (typeof this._debugVisible === 'undefined') this._debugVisible = false;
    this._debugVisible = !this._debugVisible;
    const el = document.getElementById('debug-overlay');
    const el2 = document.getElementById('debug-overlay-bottom');
    if (el) {
      el.style.display = this._debugVisible ? 'block' : 'none';
      if (this._debugVisible) el.textContent = '🐛 Debug ON';
    }
    if (el2) {
      el2.style.display = this._debugVisible ? 'block' : 'none';
      if (this._debugVisible) el2.textContent = '';
    }
    const btn = document.getElementById('debug-btn');
    if (btn) btn.textContent = this._debugVisible ? '🐛ON' : '🐛';
    // Always try to connect debug to 3D cube whenever toggled
    this._setup3DDebug();
    // Clear logs on toggle
    if (!this._debugVisible) {
      if (el) el.textContent = '';
      if (el2) el2.textContent = '';
    }
  }

  _debugLog(msg) {
    if (!this._debugVisible) return;
    const el = document.getElementById('debug-overlay');
    if (el) {
      const lines = (el.textContent || '').split('\n');
      lines.push(msg);
      el.textContent = lines.slice(-5).join('\n');
    }
  }

  _debugLogBottom(msg) {
    if (!this._debugVisible) return;
    const el = document.getElementById('debug-overlay-bottom');
    if (el) {
      const lines = (el.textContent || '').split('\n');
      lines.push(msg);
      el.textContent = lines.slice(-6).join('\n');
    }
  }

  // Expose debug in 3D CubeBuddy3D instance
  _setup3DDebug() {
    if (!this._cube3d) return;
    const self = this;
    this._cube3d._debugLog = (msg) => self._debugLog(msg);
    this._cube3d._debugLogBottom = (msg) => self._debugLogBottom(msg);
  }

  // Also called when 3D view is first created
  _ensure3DDebug() {
    if (this._debugVisible && this._cube3d) {
      this._setup3DDebug();
    }
  }

  // ==================== SNAPSHOTS ====================

  _saveSnapshot(slotIndex) {
    if (slotIndex < 0 || slotIndex > 2) return;
    const name = prompt(`Name for snapshot ${slotIndex + 1}:`, `Snapshot ${slotIndex + 1}`);
    if (!name) return; // cancelled
    this._snapshots[slotIndex] = {
      name: name.substring(0, 16),
      state: [...this.cube._state],
      moves: this.moves,
    };
    this._renderSnapshotSlots();
    this._saveSnapshotsToStorage();
  }

  _loadSnapshot(slotIndex) {
    const snap = this._snapshots[slotIndex];
    if (!snap) return;
    this.cube._state = [...snap.state];
    this.moves = snap.moves;
    this.showCelebration = false;
    this.solvedBadge.style.display = 'none';
    this._renderCube();
    this._updateControls();
    this._sync3D();
  }

  _renderSnapshotSlots() {
    if (!this.snapshotContainer) return;
    this.snapshotContainer.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const snap = this._snapshots[i];
      const btn = document.createElement('button');
      btn.className = 'snapshot-btn';
      btn.innerHTML = snap
        ? `<span class="snap-name">${snap.name}</span><span class="snap-moves">${snap.moves}m</span>`
        : `<span class="snap-name">Slot ${i + 1}</span>`;
      btn.onclick = () => this._loadSnapshot(i);
      btn.oncontextmenu = (e) => { e.preventDefault(); this._saveSnapshot(i); };
      // Long press (touch) → save
      let pressTimer = null;
      btn.addEventListener('touchstart', () => {
        pressTimer = setTimeout(() => {
          this._saveSnapshot(i);
          pressTimer = null;
        }, 500);
      });
      btn.addEventListener('touchend', () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      });
      btn.addEventListener('touchmove', () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      });
      this.snapshotContainer.appendChild(btn);
    }
  }

  // ==================== LOCAL STORAGE ====================

  _saveToLocalStorage() {
    try {
      localStorage.setItem('cubebuddy_state', JSON.stringify(this.cube._state));
      localStorage.setItem('cubebuddy_moves', String(this.moves));
      localStorage.setItem('cubebuddy_stars', String(this.stars));
      localStorage.setItem('cubebuddy_selected_char', this.selectedChar);
    } catch (e) {
      // localStorage might be full or unavailable, silently ignore
    }
  }

  _loadFromLocalStorage() {
    try {
      const stateStr = localStorage.getItem('cubebuddy_state');
      const movesStr = localStorage.getItem('cubebuddy_moves');
      const starsStr = localStorage.getItem('cubebuddy_stars');
      const charStr = localStorage.getItem('cubebuddy_selected_char');
      if (stateStr) {
        const state = JSON.parse(stateStr);
        if (Array.isArray(state) && state.length === 54) {
          this.cube._state = [...state];
          this.moves = movesStr ? parseInt(movesStr) || 0 : 0;
          this.stars = starsStr ? parseInt(starsStr) || 0 : 0;
          if (charStr) this.selectedChar = charStr;
          return true;
        }
      }
    } catch (e) {
      // Ignore parse errors — just start fresh
    }
    return false;
  }

  _loadSnapshotsFromStorage() {
    try {
      const data = localStorage.getItem('cubebuddy_snapshots');
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          this._snapshots = parsed.slice(0, 3);
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  _saveSnapshotsToStorage() {
    try {
      localStorage.setItem('cubebuddy_snapshots', JSON.stringify(this._snapshots));
    } catch (e) {
      // Ignore
    }
  }
}

// Start app — use direct creation so it works even if DOMContentLoaded already fired
let app;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { app = new CubeBuddyApp(); });
} else {
  app = new CubeBuddyApp();
}
