// input.js - Keyboard & mouse input handling

export class Input {
    constructor(canvas) {
        this.keys = {};
        this.justPressed = {};
        this.mouse = { x: 0, y: 0, down: false, clicked: false, wheel: 0 };
        this.canvas = canvas;

        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (!this.keys[key]) {
                this.justPressed[key] = true;
            }
            this.keys[key] = true;
            e.preventDefault();
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
        canvas.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.mouse.down = true;
                this.mouse.clicked = true;
            }
        });
        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.down = false;
        });
        window.addEventListener('wheel', (e) => {
            this.mouse.wheel = e.deltaY;
            // Prevent scrolling page if canvas is targeted
            if (e.target === canvas) e.preventDefault();
        }, { passive: false });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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
