// input.js - Keyboard & mouse input handling

export class Input {
    constructor(canvas) {
        this.keys = {};
        this.justPressed = {};
        this.mouse = { x: 0, y: 0, down: false, clicked: false, wheel: 0 };
        this.canvas = canvas;
        this.touchActive = false;
        
        // Virtual Joystick States
        this.joystick = { active: false, startX: 0, startY: 0, x: 0, y: 0, dx: 0, dy: 0, id: null };
        this.lookJoystick = { active: false, startX: 0, startY: 0, x: 0, y: 0, id: null };
        this.buttonStates = {};

        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (!this.keys[key]) {
                this.justPressed[key] = true;
            }
            this.keys[key] = true;
            const gameKeys = ['w','a','s','d','r','f','e','q','g','h','m','p','1','2','3','4','tab',' '];
            if (gameKeys.includes(key) || key.startsWith('arrow')) {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
        canvas.addEventListener('mousemove', (e) => {
            if (this.touchActive) return;
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        canvas.addEventListener('mousedown', (e) => {
            if (this.touchActive) return;
            if (e.button === 0) {
                this.mouse.down = true;
                this.mouse.clicked = true;
            }
        });
        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.down = false;
        });

        // --- Touch Support ---
        canvas.addEventListener('touchstart', (e) => {
            this.touchActive = true;
            for (const touch of e.changedTouches) {
                const tx = touch.clientX;
                const ty = touch.clientY;
                
                // Left half = Move Joystick
                if (tx < window.innerWidth / 2 && !this.joystick.active) {
                    this.joystick.active = true;
                    this.joystick.startX = tx;
                    this.joystick.startY = ty;
                    this.joystick.x = tx;
                    this.joystick.y = ty;
                    this.joystick.id = touch.identifier;
                } 
                // Right half = Look Joystick & Clicks
                else if (!this.lookJoystick.active) {
                    this.lookJoystick.active = true;
                    this.lookJoystick.id = touch.identifier;
                    this.mouse.x = tx;
                    this.mouse.y = ty;
                    this.mouse.clicked = true;
                    this.mouse.down = true;
                }
            }
            e.preventDefault();
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            for (const touch of e.changedTouches) {
                if (touch.identifier === this.joystick.id) {
                    this.joystick.x = touch.clientX;
                    this.joystick.y = touch.clientY;
                    const dxRaw = this.joystick.x - this.joystick.startX;
                    const dyRaw = this.joystick.y - this.joystick.startY;
                    const dist = Math.sqrt(dxRaw*dxRaw + dyRaw*dyRaw);
                    const max = 40;
                    this.joystick.dx = (dist > max) ? dxRaw / dist : dxRaw / max;
                    this.joystick.dy = (dist > max) ? dyRaw / dist : dyRaw / max;
                } else if (touch.identifier === this.lookJoystick.id) {
                    this.mouse.x = touch.clientX;
                    this.mouse.y = touch.clientY;
                }
            }
            e.preventDefault();
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            for (const touch of e.changedTouches) {
                if (touch.identifier === this.joystick.id) {
                    this.joystick.active = false;
                    this.joystick.id = null;
                    this.joystick.dx = 0;
                    this.joystick.dy = 0;
                } else if (touch.identifier === this.lookJoystick.id) {
                    this.lookJoystick.active = false;
                    this.lookJoystick.id = null;
                    this.mouse.down = false;
                }
            }
            e.preventDefault();
        }, { passive: false });

        window.addEventListener('wheel', (e) => {
            this.mouse.wheel = e.deltaY;
            if (e.target === canvas) e.preventDefault();
        }, { passive: false });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    isButtonPressed(btnId) {
        return !!this.buttonStates[btnId];
    }

    isKeyDown(key) {
        return !!this.keys[key];
    }

    wasPressed(key) {
        return !!this.justPressed[key];
    }

    getMouseWorld(camera) {
        return {
            x: this.mouse.x + camera.x,
            y: this.mouse.y + camera.y
        };
    }

    resetFrame() {
        this.mouse.clicked = false;
        this.justPressed = {};
    }
}
