// Cube Buddy 3D - Three.js cube view module
// Version: 2.11.2
// Integrates with RubiksCube class from cube.js
// Provides 3D rendering + swipe/tap gestures

(function() {
'use strict';

class CubeBuddy3D {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('cube-3d-container');
    this.cube = options.cube || null;
    this.onTurn = options.onTurn || null; // callback(move)
    this.onMovesChange = options.onMovesChange || null;
    this._moves = 0;
    this._animating = false;

    this._initThree();
    this._initInput();
  }

  _initThree() {
    const container = this.container;
    const w = container.clientWidth || 400;
    const h = container.clientHeight || 400;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    this.camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
    this.camera.position.set(4.18, 3.14, 5.23);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x1a1a2e, 0);
    container.appendChild(this.renderer.domElement);

    // Ambient-only lighting — consistent colors from any angle, no shadow variation
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambient);

    // Very subtle hemisphere for slight depth — top is slightly brighter
    const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 0.4);
    this.scene.add(hemi);

    // Cube group
    this.cubieSize = 0.7;
    this.gap = 0.78;
    this.faceGeo = new THREE.BoxGeometry(this.cubieSize, this.cubieSize, 0.04);
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

    this.cubeGroup = new THREE.Group();
    this.scene.add(this.cubeGroup);
    this.stickerMeshes = [];
    this.cubieCores = [];

    // Orbit
    this.orbitInverted = false;
    this._lastPointer = { x: 0, y: 0 };
    this._pointerDown = { x: 0, y: 0 };
    this._isDragging = false;
    this._swipeFace = null;
    this._swipeSticker = null;
    this._lastTapTime = 0;
    this._lastTapTimer = null;

    // Resize
    this._onResize = () => {
      const r = container.getBoundingClientRect();
      const cw = r.width || 400;
      const ch = r.height || 400;
      this.camera.aspect = cw / ch;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(cw, ch);
    };
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', () => setTimeout(this._onResize, 300));

    // Start render loop
    this._running = true;
    this._animate();
  }

  _initInput() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    el.addEventListener('pointermove', (e) => this._onPointerMove(e));
    el.addEventListener('pointerup', (e) => this._onPointerUp(e));
  }

  _getStickerAtPoint(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    // Pre-compute projection matrix once
    const proj = new THREE.Matrix4().multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    const vec = new THREE.Vector3();
    const screen = new THREE.Vector3();

    let best = null;
    let bestDist = 30; // max pixel radius for sticker hit (generous for small 3D stickers)

    for (const mesh of this.stickerMeshes) {
      mesh.getWorldPosition(vec);
      vec.project(this.camera);

      // Skip stickers behind the camera
      if (vec.z >= 1) continue;

      // NDC → pixel coords
      screen.x = (vec.x * 0.5 + 0.5) * w;
      screen.y = (-vec.y * 0.5 + 0.5) * h;

      const dx = screen.x - px;
      const dy = screen.y - py;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist < bestDist || (Math.abs(dist - bestDist) < 3 && vec.z < (best?.depth ?? 99))) {
        // Depth tiebreaker for overlapping stickers
        if (dist < bestDist || vec.z < (best?.depth ?? 99)) {
          bestDist = dist;
          best = { mesh, depth: vec.z };
        }
      }
    }

    return best ? best.mesh : null;
  }

  _onPointerDown(e) {
    this._lastPointer = { x: e.clientX, y: e.clientY };
    this._pointerDown = { x: e.clientX, y: e.clientY };
    this._isDragging = false;
    this._swipeFace = null;
    this._swipeSticker = null;

    if (!this.cube || this._animating) return;

    const hitMesh = this._getStickerAtPoint(e.clientX, e.clientY);
    if (hitMesh) {
      const ud = hitMesh.userData;
      this._swipeFace = FACE_LETTERS[ud.faceIdx] || '';
      this._swipeSticker = { faceIdx: ud.faceIdx, row: ud.row, col: ud.col };
      if (this._debugLog) this._debugLog(`HIT: ${['U','D','F','B','L','R'][ud.faceIdx]}(${ud.row},${ud.col}) ext=${ud.isExternal}`);
    } else {
      // Check if near cube core for orbit
      const rect = this.renderer.domElement.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(mx, my), this.camera);
      const coreHits = ray.intersectObjects(this.cubieCores, false);
      this._swipeFace = coreHits.length > 0 ? {} : null;
      if (this._debugLog) this._debugLog(coreHits.length > 0 ? 'HIT: core only' : 'MISS: no hit');
    }
  }

  _onPointerMove(e) {
    if (e.buttons !== 1) return;
    const dx = e.clientX - this._lastPointer.x;
    const dy = e.clientY - this._lastPointer.y;

    if (!this._isDragging) {
      if (Math.sqrt(dx*dx + dy*dy) < 10) return;
      this._isDragging = true;
    }

    if (this._swipeFace) { this._lastPointer = { x: e.clientX, y: e.clientY }; return; }

    const inv = this.orbitInverted ? -1 : 1;
    const worldUp = new THREE.Vector3(0, 1, 0);
    const camPos = this.camera.position.clone();
    const camForward = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), camPos).normalize();
    const camRight = new THREE.Vector3().crossVectors(camForward, worldUp).normalize();
    const camUp = new THREE.Vector3().crossVectors(camRight, camForward).normalize();

    const SCALE = 0.012;
    const angleH = dx * SCALE * inv;
    const angleV = dy * SCALE * inv;
    const qH = new THREE.Quaternion().setFromAxisAngle(camUp, angleH);
    const qV = new THREE.Quaternion().setFromAxisAngle(camRight, angleV);

    this.cubeGroup.quaternion.premultiply(qH);
    this.cubeGroup.quaternion.premultiply(qV);
    this.cubeGroup.rotation.setFromQuaternion(this.cubeGroup.quaternion);

    this._lastPointer = { x: e.clientX, y: e.clientY };
  }

  _onPointerUp(e) {
    if (typeof this._swipeFace !== 'string') {
      this._isDragging = false;
      this._swipeFace = null;
      this._swipeSticker = null;
      return;
    }

    const now = Date.now();
    const tappedFace = this._swipeFace;
    const dx = e.clientX - this._pointerDown.x;
    const dy = e.clientY - this._pointerDown.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const SWIPE_THRESHOLD = 15;

    // Edge swipe
    if (this._swipeSticker && dist > SWIPE_THRESHOLD) {
      const { faceIdx, row, col } = this._swipeSticker;
      const adj = this.edgeAdjacency[faceIdx];
      if (adj) {
        let edgeEntry = null;
        let edgeName = null;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const isHoriz = absDx > absDy;
        const isCorner = (row === 0 || row === 2) && (col === 0 || col === 2);

        // MID-ROW (1,0) or (1,2)
        if (row === 1 && col !== 1) {
          if (isHoriz) {
            if (col === 0) {
              if (dx > 0) { edgeEntry = adj.midLeft; edgeName = 'midLeft'; }
              else { edgeEntry = adj.left; edgeName = 'left'; }
            } else {
              if (dx < 0) { edgeEntry = adj.midRight; edgeName = 'midRight'; }
              else { edgeEntry = adj.right; edgeName = 'right'; }
            }
          } else { edgeEntry = { consumed: true }; }
        }
        // MID-COL (0,1) or (2,1)
        else if (col === 1 && row !== 1) {
          if (!isHoriz) {
            if (row === 0) {
              if (dy > 0) { edgeEntry = adj.midTop; edgeName = 'midTop'; }
              else { edgeEntry = adj.top; edgeName = 'top'; }
            } else {
              if (dy < 0) { edgeEntry = adj.midBottom; edgeName = 'midBottom'; }
              else { edgeEntry = adj.bottom; edgeName = 'bottom'; }
            }
          } else { edgeEntry = { consumed: true }; }
        }
        // CORNER
        else if (isCorner) {
          if (isHoriz) {
            edgeName = row === 0 ? 'top' : 'bottom';
          } else {
            edgeName = col === 0 ? 'left' : 'right';
          }
          edgeEntry = adj[edgeName];
        }

        if (this._debugLog) {
          const dirLabel = isHoriz ? (dx > 0 ? '→' : '←') : (dy > 0 ? '↓' : '↑');
          this._debugLog(`SWIPE: ${['U','D','F','B','L','R'][faceIdx]}(${row},${col}) ${dirLabel} dist=${dist.toFixed(0)}`);
        }

        if (edgeEntry) {
          if (edgeEntry.consumed) {
            if (this._debugLog) this._debugLog('→ CONSUMED');
            this._isDragging = false; this._swipeFace = null; this._swipeSticker = null;
            return;
          }
          const adjFace = edgeEntry.face;
          if (this._debugLog && edgeName) this._debugLog(`→ ${edgeName} adj=${adjFace}`);
          if (edgeEntry.isSlice) {
            const sliceInv = edgeEntry.invert ? 1 : 0;
            const dir = edgeEntry.dir;
            let prime;
            if (dir === 'right') prime = 1 ^ sliceInv;
            else if (dir === 'left') prime = 0 ^ sliceInv;
            else if (dir === 'down') prime = 0 ^ sliceInv;
            else prime = 1 ^ sliceInv;
            if (this._debugLog) this._debugLog(`→ SLICE: ${adjFace} ${prime ? 'CCW' : 'CW'}`);
            this._doTurn(adjFace, prime);
          } else {
            const inv = edgeEntry.invert ? 1 : 0;
            // Determine prime based on edge + swipe direction
            let prime = 0;
            if (edgeName === 'top' || edgeName === 'bottom') {
              if (edgeName === 'top') {
                prime = isHoriz
                  ? (dx > 0 ? (inv ? 0 : 1) : (inv ? 1 : 0))
                  : (dy > 0 ? (inv ? 1 : 0) : (inv ? 0 : 1));
              } else {
                prime = isHoriz
                  ? (dx > 0 ? (inv ? 1 : 0) : (inv ? 0 : 1))
                  : (dy > 0 ? (inv ? 0 : 1) : (inv ? 1 : 0));
              }
            } else if (edgeName === 'left') {
              prime = dy > 0 ? (inv ? 1 : 0) : (inv ? 0 : 1);
            } else {
              prime = dy > 0 ? (inv ? 0 : 1) : (inv ? 1 : 0);
            }
            if (this._debugLog) this._debugLog(`→ TURN: ${adjFace} ${prime ? 'CCW' : 'CW'}`);
            this._doTurn(adjFace, prime);
          }
          this._isDragging = false; this._swipeFace = null; this._swipeSticker = null;
          return;
        }
      }
    }

    // Tap — only center sticker
    if (this._swipeSticker && dist <= SWIPE_THRESHOLD) {
      const { faceIdx, row, col } = this._swipeSticker;
      const adj = this.edgeAdjacency[faceIdx];
      if (adj && (row !== 1 || col !== 1)) {
        if (this._debugLog) this._debugLog(`TAP blocked: not center (${row},${col})`);
        this._isDragging = false; this._swipeFace = null; this._swipeSticker = null;
        return;
      }
    }

    // Double-tap handling
    if (now - this._lastTapTime < 350) {
      if (this._lastTapTimer) clearTimeout(this._lastTapTimer);
      this._lastTapTime = 0;
      this._doTurn(tappedFace, 1);
    } else {
      this._lastTapTime = now;
      if (this._lastTapTimer) clearTimeout(this._lastTapTimer);
      this._lastTapTimer = setTimeout(() => {
        if (this._lastTapTime !== 0) {
          this._doTurn(tappedFace, 0);
          this._lastTapTime = 0;
          this._lastTapTimer = null;
        }
      }, 350);
    }

    this._isDragging = false;
    this._swipeFace = null;
    this._swipeSticker = null;
  }

  _doTurn(face, prime) {
    if (!this.cube || this._animating) return;
    const move = prime ? face + "'" : face;

    // Snapshot state before move for color-change debug
    const stateBefore = this.cube.state.slice();

    this.cube.doMove(move);
    this._moves++;
    this.rebuild();
    if (this.onMovesChange) this.onMovesChange(this._moves);
    if (this.onTurn) this.onTurn(move);

    // Show color changes in bottom debug
    if (typeof this._debugLogBottom === 'function') {
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
  }

  // Edge adjacency data (from verified debugging)
  get edgeAdjacency() {
    return {
      2: { // F
        top: { face: 'U', isSlice: false },
        bottom: { face: 'D', isSlice: false },
        left: { face: 'L', isSlice: false },
        right: { face: 'R', isSlice: false },
        midLeft: { face: 'E', isSlice: true, dir: 'right' },
        midRight: { face: 'E', isSlice: true, dir: 'left' },
        midTop: { face: 'M', isSlice: true, dir: 'down' },
        midBottom: { face: 'M', isSlice: true, dir: 'up' },
      },
      3: { // B
        top: { face: 'U', isSlice: false },
        bottom: { face: 'D', isSlice: false },
        left: { face: 'R', isSlice: false },
        right: { face: 'L', isSlice: false },
        midLeft: { face: 'E', isSlice: true, dir: 'right' },
        midRight: { face: 'E', isSlice: true, dir: 'left' },
        midTop: { face: 'M', isSlice: true, dir: 'down', invert: true },
        midBottom: { face: 'M', isSlice: true, dir: 'up', invert: true },
      },
      0: { // U
        top: { face: 'B', isSlice: false },
        bottom: { face: 'F', isSlice: false },
        left: { face: 'L', isSlice: false },
        right: { face: 'R', isSlice: false },
        midLeft: { face: 'S', isSlice: true, dir: 'right' },
        midRight: { face: 'S', isSlice: true, dir: 'left' },
        midTop: { face: 'M', isSlice: true, dir: 'down' },
        midBottom: { face: 'M', isSlice: true, dir: 'up' },
      },
      1: { // D
        top: { face: 'F', isSlice: false },
        bottom: { face: 'B', isSlice: false },
        left: { face: 'L', isSlice: false },
        right: { face: 'R', isSlice: false },
        midLeft: { face: 'S', isSlice: true, dir: 'left' },
        midRight: { face: 'S', isSlice: true, dir: 'right' },
        midTop: { face: 'M', isSlice: true, dir: 'down' },
        midBottom: { face: 'M', isSlice: true, dir: 'up' },
      },
      4: { // L
        top: { face: 'U', isSlice: false },
        bottom: { face: 'D', isSlice: false },
        left: { face: 'B', isSlice: false },
        right: { face: 'F', isSlice: false },
        midLeft: { face: 'E', isSlice: true, dir: 'right' },
        midRight: { face: 'E', isSlice: true, dir: 'left' },
        midTop: { face: 'S', isSlice: true, dir: 'down' },
        midBottom: { face: 'S', isSlice: true, dir: 'up' },
      },
      5: { // R
        top: { face: 'U', isSlice: false },
        bottom: { face: 'D', isSlice: false },
        left: { face: 'F', isSlice: false },
        right: { face: 'B', isSlice: false },
        midLeft: { face: 'E', isSlice: true, dir: 'right' },
        midRight: { face: 'E', isSlice: true, dir: 'left' },
        midTop: { face: 'S', isSlice: true, dir: 'down', invert: true },
        midBottom: { face: 'S', isSlice: true, dir: 'up', invert: true },
      },
    };
  }

  rebuild() {
    const g = this.cubeGroup;
    while (g.children.length) g.remove(g.children[0]);
    this.stickerMeshes.length = 0;
    this.cubieCores.length = 0;

    if (!this.cube) return;

    const state = this.cube.state;
    const get = (r, c, f) => state[f * 9 + r * 3 + c];

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const cubie = new THREE.Group();
          cubie.position.set(x * this.gap, y * this.gap, z * this.gap);

          const core = new THREE.Mesh(
            new THREE.BoxGeometry(this.cubieSize, this.cubieSize, this.cubieSize),
            this.coreMat
          );
          core.castShadow = true;
          core.userData = { isCore: true };
          cubie.add(core);
          this.cubieCores.push(core);

          const facelets = {
            'px': { f: 5, r: 1-y, c: 1-z, dir: [ 1, 0, 0], ext: x === 1 },
            'nx': { f: 4, r: 1-y, c: z+1, dir: [-1, 0, 0], ext: x === -1 },
            'py': { f: 0, r: z+1, c: x+1, dir: [ 0, 1, 0], ext: y === 1 },
            'ny': { f: 1, r: 1-z, c: x+1, dir: [ 0,-1, 0], ext: y === -1 },
            'pz': { f: 2, r: 1-y, c: x+1, dir: [ 0, 0, 1], ext: z === 1 },
            'nz': { f: 3, r: 1-y, c: 1-x, dir: [ 0, 0,-1], ext: z === -1 },
          };

          for (const [dir, fl] of Object.entries(facelets)) {
            const ci = get(fl.r, fl.c, fl.f);
            const sticker = new THREE.Mesh(this.faceGeo, new THREE.MeshStandardMaterial({
              color: fl.ext ? FACE_COLORS_HEX[ci] : 0x111111,
              roughness: fl.ext ? 0.2 : 0.9,
              metalness: fl.ext ? 0.1 : 0,
            }));

            const [dx, dy, dz] = fl.dir;
            const halfSize = this.cubieSize / 2 + 0.015;
            sticker.position.set(dx * halfSize, dy * halfSize, dz * halfSize);

            if (dx === 1) sticker.rotation.y = Math.PI / 2;
            else if (dx === -1) sticker.rotation.y = -Math.PI / 2;
            else if (dy === 1) sticker.rotation.x = -Math.PI / 2;
            else if (dy === -1) sticker.rotation.x = Math.PI / 2;
            else if (dz === -1) sticker.rotation.y = Math.PI;

            sticker.castShadow = true;
            sticker.userData = { faceIdx: fl.f, row: fl.r, col: fl.c, isSticker: true, isExternal: fl.ext };
            cubie.add(sticker);
            if (fl.ext) this.stickerMeshes.push(sticker);
          }

          g.add(cubie);
        }
      }
    }

    // Thin black outer border around each face (6 frames)
    const faceBorderDefs = [
      { dir: [ 0, 1, 0], rotX: -Math.PI / 2 }, // U
      { dir: [ 0,-1, 0], rotX:  Math.PI / 2 }, // D
      { dir: [ 0, 0, 1], rotY: 0 },            // F
      { dir: [ 0, 0,-1], rotY: Math.PI },       // B
      { dir: [-1, 0, 0], rotY: -Math.PI / 2 },  // L
      { dir: [ 1, 0, 0], rotY:  Math.PI / 2 },  // R
    ];
    const halfSpan = this.gap + this.cubieSize / 2;
    const fw = halfSpan * 2 + 0.06;
    const fh = halfSpan * 2 + 0.06;
    const frameGeo = new THREE.BoxGeometry(fw, fh, 0.01);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0 });
    for (const fd of faceBorderDefs) {
      const [dx, dy, dz] = fd.dir;
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.set(dx * halfSpan, dy * halfSpan, dz * halfSpan);
      if (fd.rotX !== undefined) frame.rotation.x = fd.rotX;
      if (fd.rotY !== undefined) frame.rotation.y = fd.rotY;
      frame.userData = { isFaceBorder: true };
      this.cubeGroup.add(frame);
    }
  }

  // Snap cube face toward camera
  snapToFace(face) {
    const camDir = new THREE.Vector3(4.4, 3.3, 5.5).normalize();
    const camRight = new THREE.Vector3(0, 1, 0).cross(camDir).normalize();
    const camUp = new THREE.Vector3().crossVectors(camRight, camDir).normalize();

    const faceUp = {
      'U': new THREE.Vector3(0, 0, -1),
      'D': new THREE.Vector3(0, 0, -1),
      'F': new THREE.Vector3(0, 1, 0),
      'B': new THREE.Vector3(0, 1, 0),
      'L': new THREE.Vector3(0, 1, 0),
      'R': new THREE.Vector3(0, 1, 0),
    };

    const faceNormals = {
      'U': new THREE.Vector3(0, 1, 0),
      'D': new THREE.Vector3(0, -1, 0),
      'F': new THREE.Vector3(0, 0, 1),
      'B': new THREE.Vector3(0, 0, -1),
      'L': new THREE.Vector3(-1, 0, 0),
      'R': new THREE.Vector3(1, 0, 0),
    };

    const fn = faceNormals[face].clone();
    const q1 = new THREE.Quaternion().setFromUnitVectors(fn, camDir);

    const fu = faceUp[face].clone().applyQuaternion(q1);
    const projLen = fu.dot(camDir);
    const proj = new THREE.Vector3().copy(fu).addScaledVector(camDir, -projLen);

    let q2;
    if (proj.length() < 0.001) {
      const faceRight = { 'U': new THREE.Vector3(1, 0, 0), 'D': new THREE.Vector3(-1, 0, 0) };
      const fr = faceRight[face].clone().applyQuaternion(q1);
      const projRight = new THREE.Vector3().copy(fr).addScaledVector(camDir, -fr.dot(camDir));
      q2 = new THREE.Quaternion().setFromUnitVectors(projRight.normalize(), camRight);
    } else {
      q2 = new THREE.Quaternion().setFromUnitVectors(proj.normalize(), camUp.clone().negate());
    }

    let finalQ = q2.clone().multiply(q1);
    if (face === 'D' || face === 'B') {
      const nf = faceNormals[face].clone().applyQuaternion(finalQ);
      const spin180 = new THREE.Quaternion().setFromAxisAngle(nf, Math.PI);
      this.cubeGroup.quaternion.copy(spin180.multiply(finalQ));
    } else {
      this.cubeGroup.quaternion.copy(finalQ);
    }
    this.cubeGroup.rotation.setFromQuaternion(this.cubeGroup.quaternion);
  }

  toggleOrbitDir() {
    this.orbitInverted = !this.orbitInverted;
  }

  get moves() { return this._moves; }
  set moves(v) { this._moves = v; }

  _animate() {
    if (!this._running) return;
    requestAnimationFrame(() => this._animate());
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this._running = false;
    window.removeEventListener('resize', this._onResize);
    this.renderer.domElement.remove();
    this.renderer.dispose();
    while (this.cubeGroup.children.length) {
      const c = this.cubeGroup.children[0];
      c.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.cubeGroup.remove(c);
    }
  }

  resetMoves() {
    this._moves = 0;
  }
}

window.CubeBuddy3D = CubeBuddy3D;

})();
